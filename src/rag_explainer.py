import os
import sys
import json
import argparse
from typing import Dict, Any, List, Optional, Union, Tuple

# Ensure project root is in path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from src.rag_engine import ChargeShieldRAGRetriever, DEFAULT_INDEX_DIR, DEFAULT_MODEL_NAME, REPORT_DIR


# ============================================================
# ChargeShield - RAG Investigator Explanation Layer
# ============================================================

EXPLANATIONS_DIR = os.path.join(REPORT_DIR, "rag_explanations")


def generate_investigator_explanation(
    query_case: Dict[str, Any],
    retrieved_cases: List[Dict[str, Any]],
    top_k: int = 5
) -> Dict[str, Any]:
    """
    Synthesize model predictions, transaction evidence, and FAISS-retrieved historical cases
    into a structured investigator-facing explanation.
    """
    tx_id = query_case.get("transaction_id", "Unknown")
    risk_score = float(query_case.get("risk_score", 0.0))
    fraud_prob = float(query_case.get("fraud_probability", 0.0))
    risk_level = str(query_case.get("risk_level", "UNKNOWN")).upper()
    recommended_action = str(query_case.get("recommended_action", "MANUAL_INVESTIGATION"))
    evidence = query_case.get("transaction_evidence", {})
    key_features = query_case.get("model_important_features", [])

    # Filter out exact self-matches from historical comparisons so analysts see distinct precedent cases
    filtered_historical = []
    for c in retrieved_cases:
        c_tx_id = c.get("transaction_id")
        if str(c_tx_id) != str(tx_id):
            sim_score = float(c.get("similarity_score", 0.0))
            c_risk = float(c.get("risk_score", 0.0))
            c_prob = float(c.get("fraud_probability", 0.0))
            c_action = str(c.get("recommended_action", "UNKNOWN"))
            c_level = str(c.get("risk_level", "UNKNOWN"))

            filtered_historical.append({
                "case_id": c_tx_id,
                "similarity_score": round(sim_score, 4),
                "similarity_pct": f"{int(round(sim_score * 100))}%",
                "risk_score": c_risk,
                "fraud_probability": c_prob,
                "risk_level": c_level,
                "recommended_action": c_action,
                "model_important_features": c.get("model_important_features", [])
            })

    # Limit to top_k distinct historical cases
    historical_cases = filtered_historical[:top_k]

    # Generate Investigator Summary Narrative
    hist_count = len(historical_cases)
    if risk_level == "HIGH":
        summary_intro = (
            f"The current transaction has a very high model-estimated fraud "
            f"risk ({risk_score:.2f}/100, probability: {fraud_prob * 100:.2f}%)."
        )
    elif risk_level == "MEDIUM":
        summary_intro = (
            f"The current transaction exhibits moderate risk ({risk_score:.2f}/100, "
            f"probability: {fraud_prob * 100:.2f}%) requiring review."
        )
    else:
        summary_intro = (
            f"The current transaction is assessed as low risk ({risk_score:.2f}/100, "
            f"probability: {fraud_prob * 100:.2f}%)."
        )

    if hist_count > 0:
        common_actions = [h["recommended_action"] for h in historical_cases]
        most_common_action = max(set(common_actions), key=common_actions.count)
        summary_precedent = (
            f" Multiple historically similar transactions with matching behavioral "
            f"indicators also resulted in {most_common_action.lower().replace('_', ' ')}."
        )
    else:
        summary_precedent = " No prior matching cases were found in the historical index."

    investigator_summary = (
        f"{summary_intro}{summary_precedent}\n\n"
        f"The retrieved historical cases provide supporting precedent, "
        f"but they do NOT prove that this transaction is fraudulent."
    )

    # Generate Specific Investigator Recommendation & Verification Steps
    rec_lines = [recommended_action, ""]
    if recommended_action == "MANUAL_INVESTIGATION":
        rec_lines.append(
            "Review the transaction amount, card characteristics, email "
            "domain, and behavioral indicators before making a final decision."
        )
    elif recommended_action == "REVIEW":
        rec_lines.append(
            "Perform secondary validation on customer identity and payment "
            "details to verify transaction legitimacy."
        )
    else:
        rec_lines.append(
            "Transaction risk falls within standard thresholds. "
            "Proceed with standard processing unless external anomalies arise."
        )

    investigator_recommendation = "\n".join(rec_lines)

    # Confidence and Explanation Notes (Disclaimers & Methodology)
    confidence_notes = (
        "1. MODEL PREDICTION: Calculated from tree ensemble features and global SHAP importance.\n"
        "2. RETRIEVED HISTORICAL EVIDENCE: Dense vector similarity search (all-MiniLM-L6-v2) over historical dossiers.\n"
        "3. GENERATED EXPLANATION: Objective synthesis intended to assist human review. Historical similarity indicates pattern correlation, not definitive proof of fraud."
    )

    explanation_data = {
        "case_id": f"#{tx_id}" if str(tx_id).isdigit() else str(tx_id),
        "transaction_id": tx_id,
        "risk_score": risk_score,
        "fraud_probability": fraud_prob,
        "risk_level": risk_level,
        "recommended_action": recommended_action,
        "key_risk_factors": key_features,
        "evidence_summary": evidence,
        "historical_case_comparison": historical_cases,
        "investigator_summary": investigator_summary,
        "investigator_recommendation": investigator_recommendation,
        "confidence_notes": confidence_notes
    }

    return explanation_data


def format_explanation_text(explanation: Dict[str, Any]) -> str:
    """
    Format structured explanation into standard ChargeShield investigator text dossier.
    """
    case_label = explanation.get("case_id", "Unknown")
    score_str = f"{explanation.get('risk_score', 0.0):.2f}/100"
    prob_str = f"{explanation.get('fraud_probability', 0.0) * 100:.2f}%"
    risk_level = explanation.get("risk_level", "UNKNOWN")
    action = explanation.get("recommended_action", "UNKNOWN")
    key_factors = explanation.get("key_risk_factors", [])
    hist_cases = explanation.get("historical_case_comparison", [])
    summary = explanation.get("investigator_summary", "")
    recommendation = explanation.get("investigator_recommendation", "")

    lines = [
        "=" * 60,
        "CHARGESHIELD AI INVESTIGATOR EXPLANATION",
        "========================================",
        "",
        f"CASE: {case_label}",
        "",
        f"RISK SCORE: {score_str}",
        f"FRAUD PROBABILITY: {prob_str}",
        f"RISK LEVEL: {risk_level}",
        f"RECOMMENDED ACTION: {action}",
        "",
        "## KEY RISK FACTORS",
        ""
    ]

    if key_factors:
        for idx, factor in enumerate(key_factors, start=1):
            lines.append(f"{idx}. {factor}")
    else:
        lines.append("No specific key risk factors listed.")

    lines.append("")
    lines.append("## HISTORICAL EVIDENCE")
    lines.append("")

    if hist_cases:
        lines.append(f"{len(hist_cases)} highly similar historical cases were identified.")
        lines.append("")
        for case in hist_cases:
            c_id = case.get("case_id", "Unknown")
            sim_pct = case.get("similarity_pct", f"{case.get('similarity_score', 0)*100:.0f}%")
            risk_pct = f"{case.get('risk_score', 0):.2f}%"
            c_action = case.get("recommended_action", "UNKNOWN")

            lines.append(f"Case #{c_id}")
            lines.append(f"Similarity: {sim_pct}")
            lines.append(f"Risk: {risk_pct}")
            lines.append(f"Action: {c_action}")
            lines.append("")
    else:
        lines.append("No similar historical cases identified in knowledge base.")
        lines.append("")

    lines.append("## INVESTIGATOR SUMMARY")
    lines.append("")
    lines.append(summary)
    lines.append("")
    lines.append("## INVESTIGATOR RECOMMENDATION")
    lines.append("")
    lines.append(recommendation)
    lines.append("")
    lines.append("=" * 60)

    return "\n".join(lines)


def save_explanation_outputs(
    explanation: Dict[str, Any],
    output_dir: str = EXPLANATIONS_DIR
) -> Tuple[str, str]:
    """
    Save explanation to reports/rag_explanations/case_<ID>.json and .txt.
    """
    os.makedirs(output_dir, exist_ok=True)
    tx_id = explanation.get("transaction_id", "unknown")

    json_filename = f"case_{tx_id}.json"
    txt_filename = f"case_{tx_id}.txt"

    json_path = os.path.join(output_dir, json_filename)
    txt_path = os.path.join(output_dir, txt_filename)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(explanation, f, indent=2)

    text_content = format_explanation_text(explanation)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(text_content)

    return json_path, txt_path


def explain_case(
    case_path: str,
    top_k: int = 5,
    index_dir: str = DEFAULT_INDEX_DIR,
    model_name: str = DEFAULT_MODEL_NAME,
    output_dir: str = EXPLANATIONS_DIR
) -> Tuple[Dict[str, Any], str, str]:
    """
    Execute full RAG explanation workflow for a case file:
    1. Load query case
    2. Retrieve top-k candidates using existing FAISS retriever
    3. Synthesize explanation
    4. Save JSON and TXT reports
    """
    retriever = ChargeShieldRAGRetriever(index_dir=index_dir, model_name=model_name)

    # Request extra candidates so that self-matches can be filtered without losing top_k count
    candidate_k = max(top_k + 2, 10)
    query_case, retrieved = retriever.retrieve_by_case(case_path, top_k=candidate_k)

    explanation = generate_investigator_explanation(query_case, retrieved, top_k=top_k)
    json_path, txt_path = save_explanation_outputs(explanation, output_dir=output_dir)

    return explanation, json_path, txt_path


def main():
    parser = argparse.ArgumentParser(
        description="ChargeShield RAG Investigator Explanation Layer"
    )
    parser.add_argument(
        "--case",
        type=str,
        required=True,
        help="Path to an investigation report (case_*.json or case_*.txt) to generate explanation for."
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=5,
        help="Number of most similar historical cases to compare (default: 5)."
    )
    parser.add_argument(
        "--index-dir",
        type=str,
        default=DEFAULT_INDEX_DIR,
        help="Directory containing the FAISS index and metadata (default: reports/faiss_index/)."
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=EXPLANATIONS_DIR,
        help="Directory to save generated explanations (default: reports/rag_explanations/)."
    )

    args = parser.parse_args()

    try:
        explanation, json_path, txt_path = explain_case(
            case_path=args.case,
            top_k=args.top_k,
            index_dir=args.index_dir,
            output_dir=args.output_dir
        )

        formatted_text = format_explanation_text(explanation)
        print(formatted_text)
        print(f"\nExplanation JSON saved to: {json_path}")
        print(f"Explanation TXT saved to : {txt_path}")

    except Exception as e:
        print(f"[ERROR] Investigator explanation generation failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
