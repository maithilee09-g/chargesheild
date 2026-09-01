import os
import sys
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Union

from dotenv import load_dotenv

# Ensure base dir and backend dir are checked for .env
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Load environment variables from backend/.env or root .env
env_paths = [
    os.path.join(BACKEND_DIR, ".env"),
    os.path.join(BASE_DIR, ".env")
]

for ep in env_paths:
    if os.path.exists(ep):
        load_dotenv(ep, override=False)

# Configuration from environment
MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "chargeshield").strip()

# ============================================================
# Lazy MongoDB Client Management
# ============================================================

_mongo_client = None
_mongo_db = None
_is_mock = False


def clean_case_id(case_id_val: Union[str, int]) -> str:
    """
    Standardize case/transaction ID by stripping '#', 'case_', whitespace.
    """
    return re.sub(r"^[#\s]*(case_)?", "", str(case_id_val).strip(), flags=re.IGNORECASE)


def clean_mongo_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Remove or format MongoDB ObjectId for JSON serialization.
    """
    if doc is None:
        return None
    cleaned = dict(doc)
    if "_id" in cleaned:
        cleaned["_id"] = str(cleaned["_id"])
    return cleaned


def is_placeholder_uri(uri: str) -> bool:
    """
    Check if the URI is empty or still the default placeholder.
    """
    if not uri:
        return True
    placeholder_patterns = [
        "YOUR_MONGODB_ATLAS_CONNECTION_STRING",
        "<username>",
        "<password>",
        "username:password@cluster"
    ]
    return any(pat.lower() in uri.lower() for pat in placeholder_patterns)


def get_mongo_client():
    """
    Initialize and return the MongoDB client singleton.
    Uses pymongo.MongoClient for live Atlas connections, with graceful fallback.
    """
    global _mongo_client, _mongo_db, _is_mock

    if _mongo_client is not None:
        return _mongo_client

    import pymongo

    uri = os.getenv("MONGODB_URI", MONGODB_URI).strip()

    if uri and not is_placeholder_uri(uri):
        try:
            # Live Atlas client with connection timeouts to avoid blocking
            client = pymongo.MongoClient(
                uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=5000
            )
            # Test ping
            client.admin.command('ping')
            _mongo_client = client
            _is_mock = False
            _setup_indexes(_mongo_client[MONGODB_DATABASE])
            return _mongo_client
        except Exception as e:
            # Log without exposing sensitive URI or credentials
            print(f"[ChargeShield DB] Warning: Could not connect to configured MongoDB URI ({type(e).__name__}). Using local mock fallback for persistence.")
            import mongomock
            _mongo_client = mongomock.MongoClient()
            _is_mock = True
            _setup_indexes(_mongo_client[MONGODB_DATABASE])
            return _mongo_client
    else:
        # Fallback to mongomock if no live URI is provided yet
        import mongomock
        _mongo_client = mongomock.MongoClient()
        _is_mock = True
        _setup_indexes(_mongo_client[MONGODB_DATABASE])
        return _mongo_client


def get_database():
    """
    Get the ChargeShield MongoDB database instance.
    """
    global _mongo_db
    client = get_mongo_client()
    db_name = os.getenv("MONGODB_DATABASE", MONGODB_DATABASE)
    _mongo_db = client[db_name]
    return _mongo_db


def get_collection(name: str):
    """
    Get a specific MongoDB collection by name.
    """
    db = get_database()
    return db[name]


def _setup_indexes(db):
    """
    Ensure appropriate indexes are present on collections.
    """
    try:
        db["investigations"].create_index("case_id", unique=True)
        db["investigations"].create_index("transaction_id")
        db["investigations"].create_index("created_at")

        db["rag_explanations"].create_index("case_id", unique=True)
        db["rag_explanations"].create_index("query_case_id")
        db["rag_explanations"].create_index("created_at")

        db["transactions"].create_index("transaction_id", unique=True)
        db["transactions"].create_index("case_id")
        db["transactions"].create_index("created_at")
    except Exception:
        pass


# ============================================================
# Health Check Helper
# ============================================================

def check_database_health() -> Dict[str, Any]:
    """
    Verify database connection status and return health dictionary.
    """
    try:
        db = get_database()
        # Trigger ping or command
        if not _is_mock:
            get_mongo_client().admin.command('ping')
        
        db_name = os.getenv("MONGODB_DATABASE", MONGODB_DATABASE)
        return {
            "status": "ok",
            "database": db_name,
            "connected": True,
            "mode": "live" if not _is_mock else "mock_in_memory"
        }
    except Exception as e:
        return {
            "status": "error",
            "database": os.getenv("MONGODB_DATABASE", MONGODB_DATABASE),
            "connected": False,
            "error": f"{type(e).__name__}: {str(e)}"
        }


# ============================================================
# Core Persistence Functions
# ============================================================

def store_transaction_data(
    transaction_id: Union[int, str],
    tx_data: Optional[Dict[str, Any]] = None,
    case_id: Optional[str] = None,
    risk_score: Optional[float] = None,
    fraud_probability: Optional[float] = None,
    risk_level: Optional[str] = None,
    recommended_action: Optional[str] = None,
    created_at: Optional[str] = None
) -> Dict[str, Any]:
    """
    Store or update original transaction information in the 'transactions' collection.
    """
    coll = get_collection("transactions")
    clean_tx_id = clean_case_id(transaction_id)
    clean_c_id = clean_case_id(case_id) if case_id is not None else clean_tx_id
    now_iso = created_at or datetime.now(timezone.utc).isoformat()

    doc: Dict[str, Any] = {
        "transaction_id": int(clean_tx_id) if clean_tx_id.isdigit() else clean_tx_id,
        "case_id": clean_c_id,
        "risk_score": float(risk_score) if risk_score is not None else None,
        "fraud_probability": float(fraud_probability) if fraud_probability is not None else None,
        "risk_level": str(risk_level).upper() if risk_level else None,
        "recommended_action": str(recommended_action).upper() if recommended_action else None,
        "created_at": now_iso
    }

    if tx_data and isinstance(tx_data, dict):
        doc["features"] = tx_data

    coll.update_one(
        {"transaction_id": doc["transaction_id"]},
        {"$set": doc},
        upsert=True
    )

    stored = coll.find_one({"transaction_id": doc["transaction_id"]})
    return clean_mongo_doc(stored) or doc


def store_investigation_case(case_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Store or update an investigation case dossier in the 'investigations' collection.
    Avoids duplicate entries by upserting on case_id.
    """
    coll = get_collection("investigations")
    raw_tx_id = case_data.get("transaction_id", "unknown")
    clean_c_id = clean_case_id(case_data.get("case_id", raw_tx_id))
    clean_tx_id = clean_case_id(raw_tx_id)

    risk_score = float(case_data.get("risk_score", 0.0))
    fraud_prob = float(case_data.get("fraud_probability", 0.0))
    risk_level = str(case_data.get("risk_level", "UNKNOWN")).upper()
    recommended_action = str(case_data.get("recommended_action", "MANUAL_INVESTIGATION")).upper()

    risk_factors = case_data.get("risk_factors") or case_data.get("model_important_features") or []
    transaction_evidence = case_data.get("transaction_evidence", {})
    investigator_summary = case_data.get("investigator_summary", "")

    now_iso = case_data.get("created_at") or datetime.now(timezone.utc).isoformat()

    doc: Dict[str, Any] = {
        "case_id": clean_c_id,
        "transaction_id": int(clean_tx_id) if clean_tx_id.isdigit() else clean_tx_id,
        "risk_score": risk_score,
        "fraud_probability": fraud_prob,
        "risk_level": risk_level,
        "recommended_action": recommended_action,
        "risk_factors": risk_factors,
        "transaction_evidence": transaction_evidence,
        "investigator_summary": investigator_summary,
        "created_at": now_iso
    }

    # Upsert into MongoDB
    coll.update_one(
        {"case_id": clean_c_id},
        {"$set": doc},
        upsert=True
    )

    # Also persist corresponding transaction record
    store_transaction_data(
        transaction_id=clean_tx_id,
        tx_data=transaction_evidence,
        case_id=clean_c_id,
        risk_score=risk_score,
        fraud_probability=fraud_prob,
        risk_level=risk_level,
        recommended_action=recommended_action,
        created_at=now_iso
    )

    stored = coll.find_one({"case_id": clean_c_id})
    return clean_mongo_doc(stored) or doc


def store_rag_explanation(case_id: Union[str, int], rag_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Store or update a RAG explanation in the 'rag_explanations' collection.
    Avoids duplicate entries by upserting on case_id.
    """
    coll = get_collection("rag_explanations")
    clean_c_id = clean_case_id(case_id)

    # Resolve query_transaction_id
    raw_tx_id = rag_data.get("transaction_id", rag_data.get("query_transaction_id", clean_c_id))
    clean_tx_id = clean_case_id(raw_tx_id)
    query_tx_id = int(clean_tx_id) if clean_tx_id.isdigit() else clean_tx_id

    # Extract similar_cases (support historical_case_comparison, similar_cases, historical_cases)
    similar_cases = (
        rag_data.get("historical_case_comparison") or
        rag_data.get("similar_cases") or
        rag_data.get("historical_cases") or
        []
    )

    # Extract individual lists from similar_cases
    sim_scores = []
    hist_risk_scores = []
    hist_fraud_probs = []
    hist_risk_levels = []
    rec_actions = []

    for item in similar_cases:
        if isinstance(item, dict):
            if "similarity_score" in item:
                try:
                    sim_scores.append(float(item["similarity_score"]))
                except (ValueError, TypeError):
                    pass
            if "risk_score" in item:
                try:
                    hist_risk_scores.append(float(item["risk_score"]))
                except (ValueError, TypeError):
                    pass
            if "fraud_probability" in item:
                try:
                    hist_fraud_probs.append(float(item["fraud_probability"]))
                except (ValueError, TypeError):
                    pass
            if "risk_level" in item:
                hist_risk_levels.append(str(item["risk_level"]).upper())
            if "recommended_action" in item:
                rec_actions.append(str(item["recommended_action"]).upper())

    # Fallback to direct lists if already provided in rag_data
    if not sim_scores and "similarity_scores" in rag_data and isinstance(rag_data["similarity_scores"], list):
        sim_scores = [float(s) for s in rag_data["similarity_scores"]]
    if not hist_risk_scores and "historical_risk_scores" in rag_data and isinstance(rag_data["historical_risk_scores"], list):
        hist_risk_scores = [float(s) for s in rag_data["historical_risk_scores"]]
    if not hist_fraud_probs and "historical_fraud_probabilities" in rag_data and isinstance(rag_data["historical_fraud_probabilities"], list):
        hist_fraud_probs = [float(s) for s in rag_data["historical_fraud_probabilities"]]
    if not hist_risk_levels and "historical_risk_levels" in rag_data and isinstance(rag_data["historical_risk_levels"], list):
        hist_risk_levels = [str(s).upper() for s in rag_data["historical_risk_levels"]]
    if not rec_actions and "recommended_actions" in rag_data and isinstance(rag_data["recommended_actions"], list):
        rec_actions = [str(s).upper() for s in rag_data["recommended_actions"]]

    top_k = rag_data.get("top_k", len(similar_cases))
    key_risk_factors = (
        rag_data.get("key_risk_factors") or
        rag_data.get("risk_factors") or
        rag_data.get("model_important_features") or
        []
    )
    investigator_summary = rag_data.get("investigator_summary", "")
    investigator_recommendation = (
        rag_data.get("investigator_recommendation") or
        rag_data.get("recommended_action") or
        "MANUAL_INVESTIGATION"
    )

    now_iso = rag_data.get("created_at") or datetime.now(timezone.utc).isoformat()

    doc: Dict[str, Any] = {
        "case_id": clean_c_id,
        "query_transaction_id": query_tx_id,
        "top_k": int(top_k),
        "similar_cases": similar_cases,
        "similarity_scores": sim_scores,
        "historical_risk_scores": hist_risk_scores,
        "historical_fraud_probabilities": hist_fraud_probs,
        "historical_risk_levels": hist_risk_levels,
        "recommended_actions": rec_actions,
        "key_risk_factors": key_risk_factors,
        "investigator_summary": investigator_summary,
        "investigator_recommendation": investigator_recommendation,
        "created_at": now_iso
    }

    # Additional query case context if present
    if "risk_score" in rag_data:
        doc["risk_score"] = float(rag_data["risk_score"])
    if "fraud_probability" in rag_data:
        doc["fraud_probability"] = float(rag_data["fraud_probability"])
    if "risk_level" in rag_data:
        doc["risk_level"] = str(rag_data["risk_level"]).upper()
    if "recommended_action" in rag_data:
        doc["recommended_action"] = str(rag_data["recommended_action"]).upper()
    if "evidence_summary" in rag_data:
        doc["evidence_summary"] = rag_data["evidence_summary"]
    if "confidence_notes" in rag_data:
        doc["confidence_notes"] = rag_data["confidence_notes"]

    # Historical cases aliases for backwards compatibility
    doc["historical_cases"] = similar_cases
    doc["historical_case_comparison"] = similar_cases

    # Upsert into MongoDB
    coll.update_one(
        {"case_id": clean_c_id},
        {"$set": doc},
        upsert=True
    )

    stored = coll.find_one({"case_id": clean_c_id})
    return clean_mongo_doc(stored) or doc


def get_investigation_case_from_db(case_id: Union[str, int]) -> Optional[Dict[str, Any]]:
    """
    Retrieve an investigation case from the 'investigations' collection.
    """
    coll = get_collection("investigations")
    clean_c_id = clean_case_id(case_id)
    doc = coll.find_one({"case_id": clean_c_id})
    if not doc and clean_c_id.isdigit():
        doc = coll.find_one({"transaction_id": int(clean_c_id)})
    return clean_mongo_doc(doc)


def get_rag_explanation_from_db(case_id: Union[str, int]) -> Optional[Dict[str, Any]]:
    """
    Retrieve a stored RAG explanation from the 'rag_explanations' collection.
    """
    coll = get_collection("rag_explanations")
    clean_c_id = clean_case_id(case_id)

    query: Dict[str, Any] = {
        "$or": [
            {"case_id": clean_c_id},
            {"case_id": f"#{clean_c_id}"}
        ]
    }
    if clean_c_id.isdigit():
        query["$or"].append({"query_transaction_id": int(clean_c_id)})
        query["$or"].append({"query_case_id": int(clean_c_id)})
        query["$or"].append({"transaction_id": int(clean_c_id)})
    else:
        query["$or"].append({"query_transaction_id": clean_c_id})

    doc = coll.find_one(query)
    return clean_mongo_doc(doc)


def get_recent_investigations_from_db(limit: int = 20) -> List[Dict[str, Any]]:
    """
    Retrieve recent investigation cases ordered by created_at descending.
    """
    coll = get_collection("investigations")
    cursor = coll.find().sort("created_at", -1).limit(max(1, min(limit, 100)))
    results = []
    for doc in cursor:
        results.append(clean_mongo_doc(doc))
    return results
