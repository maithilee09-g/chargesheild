import os
import sys
import json
import argparse
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional


# ============================================================
# ChargeShield - Investigation & Evidence Engine
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "chargeshield_features.csv"
)

RISK_SCORES_PATH = os.path.join(
    BASE_DIR,
    "reports",
    "risk_scores.csv"
)

SHAP_IMPORTANCE_PATH = os.path.join(
    BASE_DIR,
    "reports",
    "shap_feature_importance.csv"
)

REPORT_DIR = os.path.join(
    BASE_DIR,
    "reports"
)

INVESTIGATION_CASES_JSON_PATH = os.path.join(
    REPORT_DIR,
    "investigation_cases.json"
)

EVIDENCE_FIELDS = [
    "TransactionAmt",
    "ProductCD",
    "card1",
    "card4",
    "card6",
    "P_emaildomain",
    "R_emaildomain",
    "DeviceType",
    "DeviceInfo",
    "addr1",
    "addr2",
    "dist1",
    "dist2",
    "Transaction_hour",
    "Transaction_day",
    "missing_count",
    "missing_ratio"
]


def validate_file_exists(file_path: str, description: str) -> None:
    """
    Ensure required input file is present, otherwise raise FileNotFoundError.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(
            f"Required {description} was not found at: '{file_path}'. "
            f"Please ensure prerequisite pipeline scripts have been executed."
        )


def load_model_important_features(shap_path: str = SHAP_IMPORTANCE_PATH, top_n: int = 5) -> List[str]:
    """
    Load SHAP feature importance rankings and return top globally important features.
    """
    validate_file_exists(shap_path, "SHAP feature importance report")
    shap_df = pd.read_csv(shap_path)

    if "MeanAbsSHAP" in shap_df.columns:
        shap_df = shap_df.sort_values(by="MeanAbsSHAP", ascending=False)

    return shap_df["Feature"].head(top_n).tolist()


def get_risk_info(transaction_id: int, risk_scores_path: str = RISK_SCORES_PATH) -> Optional[Dict[str, Any]]:
    """
    Retrieve risk score metrics for a given transaction from risk_scores.csv.
    """
    validate_file_exists(risk_scores_path, "Risk scores CSV")
    df_risk = pd.read_csv(risk_scores_path)

    matched = df_risk[df_risk["TransactionID"] == transaction_id]
    if matched.empty:
        return None

    row = matched.iloc[0]
    return {
        "transaction_id": int(row["TransactionID"]),
        "fraud_probability": float(row["fraud_probability"]),
        "risk_score": float(row["risk_score"]),
        "risk_level": str(row["risk_level"]),
        "recommended_action": str(row["recommended_action"])
    }


def extract_transaction_evidence(
    transaction_id: int,
    data_path: str = DATA_PATH,
    chunk_size: int = 50000
) -> Optional[Dict[str, Any]]:
    """
    Look up a transaction in the engineered dataset and extract relevant evidence fields.
    Processes data in chunks to optimize memory and search speed.
    """
    validate_file_exists(data_path, "Processed features dataset")

    found_row = None
    for chunk in pd.read_csv(data_path, chunksize=chunk_size):
        if "TransactionID" not in chunk.columns:
            continue
        matched = chunk[chunk["TransactionID"] == transaction_id]
        if not matched.empty:
            found_row = matched.iloc[0]
            break

    if found_row is None:
        return None

    evidence: Dict[str, Any] = {}
    for field in EVIDENCE_FIELDS:
        if field in found_row.index:
            val = found_row[field]
            if pd.isna(val) or val == "" or str(val).lower() == "nan":
                evidence[field] = "Unknown"
            elif isinstance(val, (np.integer, int)):
                evidence[field] = int(val)
            elif isinstance(val, (np.floating, float)):
                # Cast cleanly if it's an integer-like float (e.g. addr1, hour, day, count)
                if float(val).is_integer() and field in [
                    "card1", "addr1", "addr2", "Transaction_hour", "Transaction_day", "missing_count"
                ]:
                    evidence[field] = int(val)
                else:
                    evidence[field] = round(float(val), 4)
            else:
                evidence[field] = str(val)

    return evidence


def generate_investigator_summary(
    risk_level: str,
    risk_score: float,
    fraud_probability: float,
    recommended_action: str,
    top_features: List[str]
) -> str:
    """
    Generate an objective, factual investigator briefing based on model output and SHAP factors.
    """
    if len(top_features) > 1:
        features_str = ", ".join(top_features[:-1]) + f" and {top_features[-1]}"
    elif top_features:
        features_str = top_features[0]
    else:
        features_str = "None"

    fraud_pct = fraud_probability * 100.0

    summary = (
        f"This transaction has a {risk_level} ChargeShield risk score of {risk_score:.2f}/100 "
        f"with an estimated fraud probability of {fraud_pct:.2f}%.\n\n"
        f"The recommended action is {recommended_action}.\n\n"
        f"The model's globally important risk factors include:\n"
        f"{features_str}.\n\n"
        f"These factors indicate areas that should be reviewed by an investigator. "
        f"They do not by themselves prove fraudulent activity."
    )
    return summary


def format_case_text_report(case: Dict[str, Any]) -> str:
    """
    Format the complete investigation case as a human-readable text document.
    """
    tx_id = case["transaction_id"]
    fraud_prob_pct = f"{case['fraud_probability'] * 100:.2f}%"
    risk_score_str = f"{case['risk_score']:.2f}/100"
    risk_level = case["risk_level"]
    action = case["recommended_action"]
    evidence = case.get("transaction_evidence", {})
    features = case.get("model_important_features", [])
    summary = case.get("investigator_summary", "")

    lines = [
        "=" * 60,
        f"CHARGESHIELD INVESTIGATION CASE: {tx_id}",
        "=" * 60,
        "",
        "TRANSACTION ASSESSMENT:",
        "-" * 60,
        f"Transaction ID      : {tx_id}",
        f"Fraud Probability   : {fraud_prob_pct}",
        f"Risk Score          : {risk_score_str}",
        f"Risk Level          : {risk_level}",
        f"Recommended Action  : {action}",
        "",
        "TRANSACTION EVIDENCE:",
        "-" * 60
    ]

    for key, value in evidence.items():
        lines.append(f"{key:<20}: {value}")

    lines.append("")
    lines.append("MODEL-IMPORTANT RISK FACTORS:")
    lines.append("-" * 60)
    lines.append("Top Risk Factors:")
    for idx, feat in enumerate(features, start=1):
        lines.append(f"{idx}. {feat}")

    lines.append("")
    lines.append("INVESTIGATOR SUMMARY:")
    lines.append("-" * 60)
    lines.append(summary)
    lines.append("")
    lines.append("=" * 60)

    return "\n".join(lines)


def save_case_outputs(case: Dict[str, Any]) -> None:
    """
    Save individual case JSON and TXT reports, and update investigation_cases.json.
    """
    os.makedirs(REPORT_DIR, exist_ok=True)
    tx_id = case["transaction_id"]

    # 1. Save case_<TransactionID>.json
    json_path = os.path.join(REPORT_DIR, f"case_{tx_id}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(case, f, indent=2)

    # 2. Save case_<TransactionID>.txt
    txt_path = os.path.join(REPORT_DIR, f"case_{tx_id}.txt")
    text_content = format_case_text_report(case)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(text_content)

    # 3. Update/create master investigation_cases.json
    cases_list = []
    if os.path.exists(INVESTIGATION_CASES_JSON_PATH):
        try:
            with open(INVESTIGATION_CASES_JSON_PATH, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                if isinstance(existing_data, list):
                    cases_list = existing_data
                elif isinstance(existing_data, dict):
                    cases_list = [existing_data]
        except Exception:
            cases_list = []

    # Update if already exists, else append
    updated = False
    for i, c in enumerate(cases_list):
        if c.get("transaction_id") == tx_id:
            cases_list[i] = case
            updated = True
            break
    if not updated:
        cases_list.append(case)

    with open(INVESTIGATION_CASES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(cases_list, f, indent=2)


def investigate_transaction(transaction_id: int) -> Dict[str, Any]:
    """
    Perform a complete investigation on a transaction:
    - Looks up risk metrics from risk_scores.csv
    - Extracts transaction evidence from features dataset
    - Loads top SHAP model-important factors
    - Produces structured case and investigator summary
    - Saves case_<ID>.json and case_<ID>.txt
    """
    # 1. Retrieve risk score information
    risk_info = get_risk_info(transaction_id)
    if risk_info is None:
        raise ValueError(
            f"Transaction ID {transaction_id} not found in '{RISK_SCORES_PATH}'. "
            f"Please verify the TransactionID or ensure it is included in the scored sample."
        )

    # 2. Extract transaction evidence
    evidence = extract_transaction_evidence(transaction_id)
    if evidence is None:
        raise ValueError(
            f"Transaction ID {transaction_id} found in risk scores but missing in '{DATA_PATH}'."
        )

    # 3. Retrieve model-important SHAP features
    top_features = load_model_important_features(top_n=5)

    # 4. Generate investigator summary
    summary = generate_investigator_summary(
        risk_level=risk_info["risk_level"],
        risk_score=risk_info["risk_score"],
        fraud_probability=risk_info["fraud_probability"],
        recommended_action=risk_info["recommended_action"],
        top_features=top_features
    )

    # 5. Build structured case dictionary
    case = {
        "transaction_id": transaction_id,
        "fraud_probability": risk_info["fraud_probability"],
        "risk_score": risk_info["risk_score"],
        "risk_level": risk_info["risk_level"],
        "recommended_action": risk_info["recommended_action"],
        "transaction_evidence": evidence,
        "model_important_features": top_features,
        "investigator_summary": summary
    }

    # 6. Save case reports
    save_case_outputs(case)

    return case


def display_top_high_risk_cases(top_n: int = 10, risk_scores_path: str = RISK_SCORES_PATH) -> None:
    """
    Display the highest-risk transactions from risk_scores.csv in a formatted table.
    """
    validate_file_exists(risk_scores_path, "Risk scores CSV")
    df = pd.read_csv(risk_scores_path)

    sorted_df = df.sort_values(by=["risk_score", "fraud_probability"], ascending=False).head(top_n)

    print("=" * 60)
    print("CHARGESHIELD HIGH-RISK CASES")
    print("=" * 60)
    print("")
    print(f"{'Rank':<4} | {'TransactionID':<13} | {'Risk Score':<10} | {'Probability':<11} | {'Level':<6}")
    print("-" * 60)

    for rank, (_, row) in enumerate(sorted_df.iterrows(), start=1):
        tx_id = int(row["TransactionID"])
        score = f"{row['risk_score']:.2f}"
        prob = f"{row['fraud_probability'] * 100:.2f}%"
        level = row["risk_level"]
        print(f"{rank:<4} | {tx_id:<13} | {score:<10} | {prob:<11} | {level:<6}")

    print("-" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="ChargeShield Investigation & Evidence Engine"
    )
    parser.add_argument(
        "--transaction-id",
        type=int,
        help="Transaction ID to investigate and generate evidence case for."
    )
    parser.add_argument(
        "--top-high-risk",
        type=int,
        help="Number of highest-risk transactions to display from risk scores."
    )

    args = parser.parse_args()

    if args.top_high_risk:
        display_top_high_risk_cases(top_n=args.top_high_risk)
        print("\nCHARGESHIELD INVESTIGATION ENGINE COMPLETED")
        print("=" * 60)
        return

    if args.transaction_id:
        try:
            print("=" * 60)
            print(f"INVESTIGATING TRANSACTION: {args.transaction_id}")
            print("=" * 60)
            case = investigate_transaction(args.transaction_id)
            print("\n" + format_case_text_report(case))
            print(f"\nCase JSON saved to: {os.path.join(REPORT_DIR, f'case_{args.transaction_id}.json')}")
            print(f"Case TXT saved to : {os.path.join(REPORT_DIR, f'case_{args.transaction_id}.txt')}")
            print(f"Cases index saved : {INVESTIGATION_CASES_JSON_PATH}")
            print("\nCHARGESHIELD INVESTIGATION ENGINE COMPLETED")
            print("=" * 60)
        except Exception as e:
            print(f"\n[ERROR] Investigation failed: {e}", file=sys.stderr)
            sys.exit(1)
        return

    # If neither argument provided, display top 10 as default preview
    print("No arguments provided. Displaying top 10 high-risk cases:\n")
    display_top_high_risk_cases(top_n=10)
    print("\nUsage example:")
    print("  python src\\investigation_engine.py --transaction-id <ID>")
    print("  python src\\investigation_engine.py --top-high-risk 10")
    print("\nCHARGESHIELD INVESTIGATION ENGINE COMPLETED")
    print("=" * 60)


if __name__ == "__main__":
    main()
