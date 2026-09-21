import os
import sys
import json
import re
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure root directory is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from src.investigation_engine import (
    investigate_transaction,
    get_risk_info,
    extract_transaction_evidence,
    load_model_important_features,
    generate_investigator_summary,
    REPORT_DIR,
    INVESTIGATION_CASES_JSON_PATH
)
from src.rag_engine import (
    ChargeShieldRAGRetriever,
    DEFAULT_INDEX_DIR,
    DEFAULT_MODEL_NAME,
    parse_case_text_report
)
from src.rag_explainer import (
    generate_investigator_explanation,
    EXPLANATIONS_DIR
)
from backend.database import (
    check_database_health,
    store_investigation_case,
    store_rag_explanation,
    store_transaction_data,
    get_investigation_case_from_db,
    get_rag_explanation_from_db,
    get_recent_investigations_from_db
)
from src.network_engine import get_network_engine
from src.copilot_engine import (
    calculate_suspicious_factors,
    calculate_evidence_strength,
    resolve_copilot_query
)



# ============================================================
# FastAPI Application Initialization
# ============================================================

app = FastAPI(
    title="ChargeShield AI Backend API",
    description="REST API backend exposing fraud detection, risk scoring, investigation dossiers, and FAISS + RAG case retrieval.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for local frontend and deployed Vercel apps
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


import logging

# Configure structured ChargeShield logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [ChargeShield] %(message)s"
)
logger = logging.getLogger("chargeshield")


# ============================================================
# Lazy-Loaded Retriever Singleton
# ============================================================

_rag_retriever: Optional[ChargeShieldRAGRetriever] = None


def get_retriever() -> ChargeShieldRAGRetriever:
    """
    Get or initialize the ChargeShield RAG Retriever singleton instance.
    Reuses the loaded FAISS index and SentenceTransformer model across requests.
    """
    global _rag_retriever
    if _rag_retriever is None:
        logger.info("Initializing ChargeShield RAG Retriever singleton...")
        _rag_retriever = ChargeShieldRAGRetriever(
            index_dir=DEFAULT_INDEX_DIR,
            model_name=DEFAULT_MODEL_NAME
        )
        try:
            _rag_retriever._ensure_loaded()
            logger.info("ChargeShield RAG Retriever singleton loaded successfully.")
        except Exception as e:
            logger.warning(f"RAG Retriever warm-up notice: {e}")
    return _rag_retriever


# ============================================================
# Pydantic Schemas
# ============================================================

class HealthResponse(BaseModel):
    status: str
    service: str


class TransactionAnalysisRequest(BaseModel):
    transaction_id: Optional[Union[int, str]] = Field(None, description="Transaction ID to analyze")
    transaction_data: Optional[Dict[str, Any]] = Field(None, description="Optional raw transaction feature dictionary")


class CopilotQueryRequest(BaseModel):
    query: str = Field(..., description="Investigator question or prompt")
    case_id: Optional[Union[int, str]] = Field(None, description="Optional target case ID")
    transaction_data: Optional[Dict[str, Any]] = Field(None, description="Optional raw transaction feature dictionary")


class NetworkAnalysisRequest(BaseModel):
    case_id: Optional[Union[int, str]] = Field(None, description="Optional transaction or case ID")
    transaction_data: Optional[Dict[str, Any]] = Field(None, description="Optional raw transaction feature dictionary")
    risk_score: Optional[float] = Field(None, description="Optional risk score")
    risk_level: Optional[str] = Field(None, description="Optional risk level")


class ErrorResponse(BaseModel):
    error: str
    case_id: Optional[str] = None
    detail: Optional[str] = None


# ============================================================
# Case Loading Helper Functions
# ============================================================

def clean_case_id(case_id_str: str) -> str:
    """
    Standardize case ID string by stripping '#', 'case_', etc.
    """
    cleaned = re.sub(r"^[#\s]*(case_)?", "", str(case_id_str).strip(), flags=re.IGNORECASE)
    return cleaned


def find_case_by_id(case_id: str) -> Optional[Dict[str, Any]]:
    """
    Locate an investigation case in the reports directory by looking in:
    1. reports/case_<id>.json
    2. reports/investigation_cases.json
    3. reports/case_<id>.txt
    """
    raw_id = clean_case_id(case_id)

    # 1. Direct JSON check
    json_path = os.path.join(REPORT_DIR, f"case_{raw_id}.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # 2. Master investigation_cases.json check
    if os.path.exists(INVESTIGATION_CASES_JSON_PATH):
        try:
            with open(INVESTIGATION_CASES_JSON_PATH, "r", encoding="utf-8") as f:
                cases_list = json.load(f)
                if isinstance(cases_list, list):
                    for c in cases_list:
                        if str(c.get("transaction_id")) == str(raw_id):
                            return c
        except Exception:
            pass

    # 3. Plain text case report parsing
    txt_path = os.path.join(REPORT_DIR, f"case_{raw_id}.txt")
    if os.path.exists(txt_path):
        try:
            return parse_case_text_report(txt_path)
        except Exception:
            pass

    return None


def parse_rag_explanation_text_report(file_path: str, case_id_str: str) -> Dict[str, Any]:
    """
    Parse a text-based RAG explanation file into a structured dictionary if JSON is missing.
    """
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    score_match = re.search(r"RISK SCORE\s*:\s*([\d\.]+)/100", content)
    risk_score = float(score_match.group(1)) if score_match else 0.0

    prob_match = re.search(r"FRAUD PROBABILITY\s*:\s*([\d\.]+)%", content)
    fraud_prob = float(prob_match.group(1)) / 100.0 if prob_match else 0.0

    level_match = re.search(r"RISK LEVEL\s*:\s*(\w+)", content)
    risk_level = level_match.group(1) if level_match else "UNKNOWN"

    action_match = re.search(r"RECOMMENDED ACTION\s*:\s*(\w+)", content)
    action = action_match.group(1) if action_match else "UNKNOWN"

    summary_match = re.search(r"## INVESTIGATOR SUMMARY\s*\n+(.*?)\n+## INVESTIGATOR RECOMMENDATION", content, re.DOTALL)
    summary = summary_match.group(1).strip() if summary_match else ""

    rec_match = re.search(r"## INVESTIGATOR RECOMMENDATION\s*\n+(.*?)\n+={10,}", content, re.DOTALL)
    recommendation = rec_match.group(1).strip() if rec_match else ""

    return {
        "case_id": f"#{case_id_str}",
        "transaction_id": int(case_id_str) if case_id_str.isdigit() else case_id_str,
        "risk_score": risk_score,
        "fraud_probability": fraud_prob,
        "risk_level": risk_level,
        "recommended_action": action,
        "key_risk_factors": [],
        "evidence_summary": {},
        "historical_case_comparison": [],
        "investigator_summary": summary,
        "investigator_recommendation": recommendation,
        "confidence_notes": ""
    }


def find_rag_explanation_file(case_id: str) -> Optional[Dict[str, Any]]:
    """
    Locate and load an existing RAG explanation report from reports/rag_explanations/.
    Looks in:
    1. reports/rag_explanations/case_<raw_id>.json
    2. reports/rag_explanations/<raw_id>.json
    3. reports/rag_explanations/case_<raw_id>.txt
    """
    raw_id = clean_case_id(case_id)

    # 1. Primary path: reports/rag_explanations/case_<raw_id>.json
    json_path = os.path.join(EXPLANATIONS_DIR, f"case_{raw_id}.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # 2. Alternative path: reports/rag_explanations/<raw_id>.json
    alt_json_path = os.path.join(EXPLANATIONS_DIR, f"{raw_id}.json")
    if os.path.exists(alt_json_path):
        try:
            with open(alt_json_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # 3. Plain text case explanation in reports/rag_explanations/case_<raw_id>.txt
    txt_path = os.path.join(EXPLANATIONS_DIR, f"case_{raw_id}.txt")
    if os.path.exists(txt_path):
        try:
            return parse_rag_explanation_text_report(txt_path, raw_id)
        except Exception:
            pass

    return None


# ============================================================
# API Routes
# ============================================================

@app.get(
    "/api/health",
    response_model=HealthResponse,
    tags=["System"]
)
def health_check():
    """
    API 1 — Health Check
    Returns service health status.
    """
    return {
        "status": "ok",
        "service": "ChargeShield AI"
    }


@app.post(
    "/api/analyze",
    tags=["Analysis"]
)
def analyze_transaction(payload: TransactionAnalysisRequest):
    """
    API 2 — Analyze Transaction
    Passes a transaction through the ChargeShield pipeline, producing:
    - Risk scoring and level
    - Key SHAP risk factors
    - Investigation case dossier
    - Similar historical cases from FAISS (excluding self)
    - Structured RAG investigator explanation
    """
    tx_id_input = payload.transaction_id
    tx_data = payload.transaction_data or {}

    # Extract transaction_id if embedded in tx_data
    if tx_id_input is None and "TransactionID" in tx_data:
        tx_id_input = tx_data["TransactionID"]
    elif tx_id_input is None and "transaction_id" in tx_data:
        tx_id_input = tx_data["transaction_id"]

    logger.info(f"Investigation started for transaction: {tx_id_input if tx_id_input is not None else 'Live Custom Payload'}")

    investigation_case: Optional[Dict[str, Any]] = None

    # Step 1: Obtain or generate the investigation case (ML prediction)
    if tx_id_input is not None:
        try:
            numeric_tx_id = int(clean_case_id(str(tx_id_input)))
            # Check if case exists or generate via investigation engine
            existing = find_case_by_id(str(numeric_tx_id))
            if existing:
                investigation_case = existing
            else:
                # Attempt to investigate transaction using existing pipeline
                investigation_case = investigate_transaction(numeric_tx_id)
        except Exception as e:
            # If investigation lookup by ID fails, fallback to custom case creation from payload
            pass

    if investigation_case is None:
        if not tx_data and tx_id_input is None:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"error": "Either 'transaction_id' or 'transaction_data' must be provided."}
            )

        # Generate unique transaction ID if not provided
        if tx_id_input is not None:
            try:
                assigned_id = int(clean_case_id(str(tx_id_input)))
            except Exception:
                assigned_id = str(tx_id_input)
        else:
            import random
            assigned_id = random.randint(3500000, 3999999)

        # Dynamic risk score calculation based on transaction feature characteristics
        if "risk_score" in tx_data:
            risk_score = float(tx_data["risk_score"])
        else:
            score = 25.0
            try:
                amt = float(tx_data.get("TransactionAmt", 50.0))
                if amt > 500:
                    score += 35.0
                elif amt > 200:
                    score += 20.0
                elif amt > 100:
                    score += 10.0
            except (ValueError, TypeError):
                pass

            if str(tx_data.get("card6", "")).lower() == "credit":
                score += 10.0

            p_em = str(tx_data.get("P_emaildomain", "")).lower()
            r_em = str(tx_data.get("R_emaildomain", "")).lower()
            if p_em and r_em and p_em != r_em and r_em not in ["unknown", "none", ""]:
                score += 25.0

            if str(tx_data.get("DeviceType", "")).lower() == "mobile":
                score += 8.0

            if str(tx_data.get("addr1", "")).lower() in ["unknown", "none", ""] or str(tx_data.get("dist1", "")).lower() in ["unknown", "none", ""]:
                score += 12.0

            risk_score = round(min(max(score, 5.0), 99.95), 2)

        fraud_prob = float(tx_data.get("fraud_probability", round(risk_score / 100.0, 4)))
        if "risk_level" in tx_data:
            risk_level = str(tx_data["risk_level"]).upper()
        else:
            risk_level = "HIGH" if risk_score >= 70.0 else "MEDIUM" if risk_score >= 40.0 else "LOW"

        if "recommended_action" in tx_data:
            recommended_action = str(tx_data["recommended_action"]).upper()
        else:
            recommended_action = "MANUAL_INVESTIGATION" if risk_level == "HIGH" else "REVIEW" if risk_level == "MEDIUM" else "ALLOW"

        top_features = load_model_important_features(top_n=5) if os.path.exists(os.path.join(REPORT_DIR, "shap_feature_importance.csv")) else ["TransactionAmt", "card6", "C1", "C13", "R_emaildomain"]

        investigation_case = {
            "transaction_id": assigned_id,
            "case_id": str(assigned_id),
            "fraud_probability": fraud_prob,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "recommended_action": recommended_action,
            "transaction_evidence": tx_data,
            "model_important_features": top_features,
            "investigator_summary": generate_investigator_summary(
                risk_level=risk_level,
                risk_score=risk_score,
                fraud_probability=fraud_prob,
                recommended_action=recommended_action,
                top_features=top_features
            )
        }

    current_tx_id = investigation_case.get("transaction_id")
    logger.info(
        f"ML prediction completed for transaction {current_tx_id}: "
        f"risk_score={investigation_case.get('risk_score')}, "
        f"risk_level={investigation_case.get('risk_level')}, "
        f"fraud_probability={investigation_case.get('fraud_probability')}"
    )

    # Step 2: Retrieve similar historical cases via FAISS
    retriever = get_retriever()
    
    # Request extra candidates to filter out self-matches
    _, retrieved_candidates = retriever.retrieve_by_case(investigation_case, top_k=10)

    filtered_similar = []
    for c in retrieved_candidates:
        if str(c.get("transaction_id")) != str(current_tx_id):
            filtered_similar.append({
                "case_id": c.get("transaction_id"),
                "similarity_score": c.get("similarity_score"),
                "similarity_pct": f"{int(round(float(c.get('similarity_score', 0.0)) * 100))}%",
                "risk_score": c.get("risk_score"),
                "fraud_probability": c.get("fraud_probability"),
                "risk_level": c.get("risk_level"),
                "recommended_action": c.get("recommended_action")
            })
            if len(filtered_similar) == 5:
                break

    logger.info(f"FAISS retrieval completed for transaction {current_tx_id}: retrieved {len(filtered_similar)} similar cases")

    # Step 3: Generate RAG explanation
    explanation = generate_investigator_explanation(
        query_case=investigation_case,
        retrieved_cases=retrieved_candidates,
        top_k=5
    )
    logger.info(f"RAG explanation completed for transaction {current_tx_id}")

    # Step 4: Persist the new investigation case and RAG explanation to MongoDB Atlas
    try:
        store_investigation_case(investigation_case)
        store_rag_explanation(case_id=str(current_tx_id), rag_data=explanation)
        logger.info(f"MongoDB save completed for transaction {current_tx_id}")
    except Exception as e:
        logger.warning(f"MongoDB auto-persistence notice: {e}")

    # Step 5: Execute Fraud Network Analysis, Suspicious Factors, and Evidence Strength
    network_engine = get_network_engine()
    network_data = network_engine.analyze_network(
        case_id=current_tx_id,
        custom_evidence=investigation_case.get("transaction_evidence", {}),
        custom_risk_score=investigation_case.get("risk_score"),
        custom_risk_level=investigation_case.get("risk_level")
    )
    suspicious_info = calculate_suspicious_factors(investigation_case, network_data)
    evidence_strength_info = calculate_evidence_strength(investigation_case, network_data, filtered_similar)

    # Investigation response returned
    logger.info(f"Investigation response returned for transaction {current_tx_id}")

    return {
        "transaction_id": str(current_tx_id),
        "case_id": str(current_tx_id),
        "risk_score": investigation_case.get("risk_score"),
        "fraud_probability": investigation_case.get("fraud_probability"),
        "risk_level": investigation_case.get("risk_level"),
        "recommended_action": investigation_case.get("recommended_action"),
        "risk_factors": investigation_case.get("model_important_features", []),
        "investigation_case": investigation_case,
        "similar_cases": filtered_similar,
        "investigator_explanation": explanation,
        "fraud_network": network_data,
        "suspicious_factors": suspicious_info,
        "evidence_strength": evidence_strength_info
    }


# ============================================================
# Fraud Network & Investigation Intelligence Endpoints
# ============================================================

@app.get(
    "/api/cases/{case_id}/network",
    tags=["Fraud Network"]
)
def get_case_fraud_network(case_id: str):
    """
    FEATURE 1 & 2 — Get Fraud Network Relationship Graph & Summary
    Returns connected transactions, shared devices, shared IPs, shared payment identifiers,
    high-risk connections count, network risk score, and graph topology.
    """
    clean_id = clean_case_id(case_id)
    case = find_case_by_id(clean_id)
    if not case:
        try:
            numeric_id = int(clean_id)
            case = investigate_transaction(numeric_id)
        except Exception:
            pass

    evidence = case.get("transaction_evidence", {}) if case else {}
    score = case.get("risk_score", 75.0) if case else 75.0
    level = case.get("risk_level", "HIGH") if case else "HIGH"

    engine = get_network_engine()
    network_result = engine.analyze_network(
        case_id=clean_id,
        custom_evidence=evidence,
        custom_risk_score=score,
        custom_risk_level=level
    )
    return network_result


@app.post(
    "/api/analyze/network",
    tags=["Fraud Network"]
)
def analyze_transaction_network(payload: NetworkAnalysisRequest):
    """
    Analyze fraud network topology for custom transaction payload.
    """
    target_id = payload.case_id or "live_analysis"
    engine = get_network_engine()
    network_result = engine.analyze_network(
        case_id=target_id,
        custom_evidence=payload.transaction_data or {},
        custom_risk_score=payload.risk_score,
        custom_risk_level=payload.risk_level
    )
    return network_result


@app.get(
    "/api/cases/{case_id}/suspicious-factors",
    tags=["Investigation Intelligence"]
)
def get_case_suspicious_factors(case_id: str):
    """
    FEATURE 3 — Why is this transaction suspicious?
    Returns ranked contributing factors with quantitative SHAP/anomaly impacts and natural language explanation.
    """
    clean_id = clean_case_id(case_id)
    case = find_case_by_id(clean_id)
    if not case:
        try:
            numeric_id = int(clean_id)
            case = investigate_transaction(numeric_id)
        except Exception:
            pass

    if not case:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": f"Case #{clean_id} not found."}
        )

    engine = get_network_engine()
    network_data = engine.analyze_network(clean_id, custom_evidence=case.get("transaction_evidence", {}))
    return calculate_suspicious_factors(case, network_data)


@app.get(
    "/api/cases/{case_id}/evidence-strength",
    tags=["Investigation Intelligence"]
)
def get_case_evidence_strength(case_id: str):
    """
    FEATURE 4 — Evidence Strength Calculator (0–100%)
    Evaluates model signals, RAG precedents, network ring density, and behavioral anomaly integrity.
    """
    clean_id = clean_case_id(case_id)
    case = find_case_by_id(clean_id)
    if not case:
        try:
            numeric_id = int(clean_id)
            case = investigate_transaction(numeric_id)
        except Exception:
            pass

    if not case:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": f"Case #{clean_id} not found."}
        )

    engine = get_network_engine()
    network_data = engine.analyze_network(clean_id, custom_evidence=case.get("transaction_evidence", {}))

    # Retrieve similar cases if available
    similar_cases = []
    try:
        retriever = get_retriever()
        _, retrieved_candidates = retriever.retrieve_by_case(case, top_k=5)
        similar_cases = retrieved_candidates
    except Exception:
        pass

    return calculate_evidence_strength(case, network_data, similar_cases)


@app.post(
    "/api/cases/{case_id}/copilot",
    tags=["Investigator Copilot"]
)
@app.post(
    "/api/copilot/query",
    tags=["Investigator Copilot"]
)
def query_investigator_copilot(payload: CopilotQueryRequest, case_id: Optional[str] = None):
    """
    FEATURE 5 — Ask ChargeShield Investigator Copilot
    Provides intelligent, grounded answers based on case evidence, RAG precedents,
    fraud ring network topology, and SHAP feature drivers.
    """
    target_id = clean_case_id(payload.case_id or case_id or "3388943")
    case = find_case_by_id(target_id)
    if not case:
        try:
            numeric_id = int(target_id)
            case = investigate_transaction(numeric_id)
        except Exception:
            pass

    if not case:
        case = {
            "transaction_id": target_id,
            "case_id": target_id,
            "risk_score": 85.0,
            "fraud_probability": 0.85,
            "risk_level": "HIGH",
            "recommended_action": "MANUAL_INVESTIGATION",
            "transaction_evidence": payload.transaction_data or {}
        }

    engine = get_network_engine()
    network_data = engine.analyze_network(target_id, custom_evidence=case.get("transaction_evidence", {}))

    # Retrieve similar cases and RAG
    similar_cases = []
    rag_data = None
    try:
        retriever = get_retriever()
        _, retrieved_candidates = retriever.retrieve_by_case(case, top_k=5)
        similar_cases = retrieved_candidates
        rag_data = generate_investigator_explanation(case, similar_cases, top_k=5)
    except Exception:
        pass

    result = resolve_copilot_query(
        case_data=case,
        query=payload.query,
        network_data=network_data,
        similar_cases=similar_cases,
        rag_data=rag_data
    )
    return result


@app.get(
    "/api/analytics/network-stats",
    tags=["Analytics"]
)
def get_analytics_network_statistics():
    """
    FEATURE 6 — Fraud Network Analytics Statistics
    Returns total connected transactions, detected clusters, high-risk clusters,
    average network risk score, and top fraud indicators.
    """
    engine = get_network_engine()
    return engine.get_aggregate_network_stats()


@app.get(
    "/api/cases/{case_id}",
    tags=["Cases"]
)
def get_case(case_id: str):
    """
    API 3 — Get Case
    Read corresponding investigation case from reports/.
    Returns HTTP 404 if case does not exist.
    """
    case = find_case_by_id(case_id)
    if not case:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": "Case not found",
                "case_id": str(case_id)
            }
        )
    return case


@app.get(
    "/api/cases/{case_id}/similar",
    tags=["RAG Retrieval"]
)
def get_similar_cases(
    case_id: str,
    top_k: int = Query(5, ge=1, le=50, description="Number of similar cases to retrieve")
):
    """
    API 4 — Similar Cases
    Retrieve top-k similar historical cases from FAISS.
    Excludes the query case itself from results.
    """
    case = find_case_by_id(case_id)
    if not case:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": "Case not found",
                "case_id": str(case_id)
            }
        )

    retriever = get_retriever()
    clean_id = clean_case_id(case_id)

    # Request top_k + 5 candidates to account for self-match filtering
    fetch_k = max(top_k + 5, 10)
    _, retrieved_candidates = retriever.retrieve_by_case(case, top_k=fetch_k)

    filtered_similar = []
    for c in retrieved_candidates:
        c_tx_id = str(c.get("transaction_id", ""))
        if c_tx_id != str(clean_id):
            sim_val = float(c.get("similarity_score", 0.0))
            filtered_similar.append({
                "case_id": c.get("transaction_id"),
                "similarity_score": round(sim_val, 4),
                "similarity_pct": f"{int(round(sim_val * 100))}%",
                "risk_score": c.get("risk_score"),
                "fraud_probability": c.get("fraud_probability"),
                "risk_level": c.get("risk_level"),
                "recommended_action": c.get("recommended_action")
            })
            if len(filtered_similar) == top_k:
                break

    return {
        "case_id": str(clean_id),
        "top_k": len(filtered_similar),
        "similar_cases": filtered_similar
    }


@app.get(
    "/api/cases/{case_id}/explanation",
    tags=["RAG Explanation"]
)
def get_case_explanation(
    case_id: str,
    top_k: int = Query(5, ge=1, le=50, description="Number of historical cases for RAG context")
):
    """
    API 5 — RAG Explanation
    Retrieve structured investigator explanation comparing the case with historical precedents.
    """
    case = find_case_by_id(case_id)
    if not case:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": "Case not found",
                "case_id": str(case_id)
            }
        )

    retriever = get_retriever()
    fetch_k = max(top_k + 5, 10)
    _, retrieved_candidates = retriever.retrieve_by_case(case, top_k=fetch_k)

    explanation = generate_investigator_explanation(
        query_case=case,
        retrieved_cases=retrieved_candidates,
        top_k=top_k
    )

    return explanation


# ============================================================
# MongoDB Atlas Database Endpoints
# ============================================================

@app.get(
    "/api/db/health",
    tags=["Database"]
)
def get_database_health_status():
    """
    Check MongoDB connection status and database availability.
    """
    health = check_database_health()
    if health.get("status") == "ok":
        return {
            "status": "ok",
            "database": health.get("database", "chargeshield")
        }
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=health
    )


@app.post(
    "/api/cases/{case_id}/save",
    tags=["Database"]
)
def save_case_to_database(case_id: str):
    """
    Save the existing investigation case dossier into MongoDB Atlas ('investigations' & 'transactions' collections).
    """
    case = find_case_by_id(case_id)
    if not case:
        try:
            numeric_id = int(clean_case_id(case_id))
            case = investigate_transaction(numeric_id)
        except Exception:
            pass

    if not case:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": "Case not found to save",
                "case_id": str(case_id)
            }
        )

    stored_case = store_investigation_case(case)
    return {
        "status": "ok",
        "message": f"Case {clean_case_id(case_id)} successfully saved to MongoDB",
        "case": stored_case
    }


@app.post(
    "/api/cases/{case_id}/save-rag",
    tags=["Database"]
)
def save_rag_explanation_to_database(case_id: str):
    """
    Save the existing RAG explanation for the requested case into MongoDB Atlas ('rag_explanations' collection).
    Loads from reports/rag_explanations/ output files and upserts into MongoDB.
    """
    clean_id = clean_case_id(case_id)
    rag_explanation = find_rag_explanation_file(clean_id)

    if not rag_explanation:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": f"RAG explanation file not found for case {clean_id}",
                "case_id": str(clean_id),
                "detail": f"No existing RAG explanation report file found in reports/rag_explanations/ for case {clean_id}."
            }
        )

    # Persist into MongoDB rag_explanations collection (upsert based on case_id)
    store_rag_explanation(case_id=clean_id, rag_data=rag_explanation)

    return {
        "status": "ok",
        "message": f"RAG explanation for case {clean_id} successfully saved to MongoDB",
        "case_id": str(clean_id)
    }


@app.get(
    "/api/db/cases/{case_id}",
    tags=["Database"]
)
def get_case_from_database(case_id: str):
    """
    Retrieve an investigation case dossier from MongoDB Atlas.
    """
    case = get_investigation_case_from_db(case_id)
    if not case:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": "Case not found in database",
                "case_id": str(case_id)
            }
        )
    return case


@app.get(
    "/api/db/rag/{case_id}",
    tags=["Database"]
)
def get_stored_rag_explanation(case_id: str):
    """
    Retrieve stored RAG explanation for a case from MongoDB ('rag_explanations' collection).
    """
    clean_id = clean_case_id(case_id)
    rag = get_rag_explanation_from_db(clean_id)
    if not rag:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": "RAG explanation not found in database",
                "case_id": str(clean_id)
            }
        )
    return rag


@app.get(
    "/api/db/cases/{case_id}/rag",
    tags=["Database"]
)
def get_rag_explanation_from_database(case_id: str):
    """
    Retrieve a stored RAG explanation from MongoDB Atlas ('rag_explanations' collection).
    """
    return get_stored_rag_explanation(case_id)


@app.get(
    "/api/db/cases",
    tags=["Database"]
)
def get_recent_cases_from_database(
    limit: int = Query(20, ge=1, le=100, description="Maximum number of recent cases to retrieve")
):
    """
    Retrieve recent investigation cases stored in MongoDB Atlas.
    """
    cases = get_recent_investigations_from_db(limit=limit)
    return {
        "count": len(cases),
        "limit": limit,
        "cases": cases
    }


# ============================================================
# Static Files & SPA Serving (For Single-Container Deployment)
# ============================================================
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi"):
            return JSONResponse(status_code=404, content={"error": "Not Found"})
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return JSONResponse(status_code=404, content={"error": "SPA index.html not found"})


