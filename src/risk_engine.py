import os
import sys
import pandas as pd
import numpy as np
from typing import List, Tuple, Dict, Optional
from xgboost import XGBClassifier


# ============================================================
# ChargeShield - Risk Scoring Engine
# ============================================================

# Directory structure configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "chargeshield_features.csv"
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "models",
    "chargeshield_xgb.json"
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

RISK_SCORES_OUTPUT_PATH = os.path.join(
    REPORT_DIR,
    "risk_scores.csv"
)

INVESTIGATION_REPORT_OUTPUT_PATH = os.path.join(
    REPORT_DIR,
    "sample_investigation_report.txt"
)

# Configurable sample size for rapid evaluation and testing
# Set to None or 0 to process the entire dataset
SAMPLE_SIZE = 1000


def validate_file_exists(file_path: str, description: str) -> None:
    """
    Check if a required input file exists, raising a descriptive error if missing.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(
            f"Missing required {description} at: '{file_path}'. "
            f"Please ensure previous pipeline steps have executed successfully."
        )


_CACHED_XGB_MODELS: Dict[str, XGBClassifier] = {}


def load_model(model_path: str = MODEL_PATH) -> XGBClassifier:
    """
    Load the pre-trained XGBoost fraud detection model with caching.
    Does not modify or retrain the model.
    """
    global _CACHED_XGB_MODELS
    if model_path in _CACHED_XGB_MODELS:
        return _CACHED_XGB_MODELS[model_path]

    validate_file_exists(model_path, "XGBoost model file")
    
    model = XGBClassifier(enable_categorical=True)
    model.load_model(model_path)
    _CACHED_XGB_MODELS[model_path] = model
    return model


def load_and_preprocess_data(
    data_path: str,
    sample_size: int = SAMPLE_SIZE,
    random_state: int = 42
) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Load the engineered dataset and apply identical preprocessing used during training:
    - Separates TransactionID and isFraud
    - Categorical missing values -> "Unknown", cast to pandas categorical dtype
    - Numerical missing values -> median imputation
    - Preserves exact feature ordering expected by XGBoost
    - Supports configurable sample size
    """
    validate_file_exists(data_path, "processed features dataset")

    # If sampling is enabled, we can load a subset to optimize memory and runtime
    if sample_size and sample_size > 0:
        # Load dataset
        df = pd.read_csv(data_path)
        if sample_size < len(df):
            # Sample with fixed random state for reproducibility
            df = df.sample(n=sample_size, random_state=random_state).reset_index(drop=True)
    else:
        df = pd.read_csv(data_path)

    # Extract TransactionID for tracking and reporting
    if "TransactionID" in df.columns:
        transaction_ids = df["TransactionID"].copy()
    else:
        transaction_ids = pd.Series(
            range(len(df)),
            name="TransactionID"
        )

    # Drop target and identifier from feature set X
    drop_cols = [col for col in ["isFraud", "TransactionID"] if col in df.columns]
    X = df.drop(columns=drop_cols)

    # Categorical preprocessing: match training routine
    categorical_columns = X.select_dtypes(
        include=["object", "string"]
    ).columns.tolist()

    for col in categorical_columns:
        X[col] = X[col].fillna("Unknown").astype("category")

    # Numerical preprocessing: fill with median
    numerical_columns = X.select_dtypes(
        include=[np.number]
    ).columns.tolist()

    X[numerical_columns] = X[numerical_columns].fillna(
        X[numerical_columns].median()
    )

    return X, transaction_ids


def load_top_shap_features(shap_path: str, top_n: int = 5) -> List[str]:
    """
    Load SHAP feature importance rankings and return the top N risk factors.
    """
    validate_file_exists(shap_path, "SHAP feature importance report")

    shap_df = pd.read_csv(shap_path)
    if "Feature" not in shap_df.columns:
        raise ValueError("SHAP feature importance file is missing 'Feature' column.")

    if "MeanAbsSHAP" in shap_df.columns:
        shap_df = shap_df.sort_values(by="MeanAbsSHAP", ascending=False)

    top_features = shap_df["Feature"].head(top_n).tolist()
    return top_features


def calculate_risk_scores(
    model: XGBClassifier,
    X: pd.DataFrame
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generate fraud probabilities from XGBoost model and compute ChargeShield Risk Score (0-100).
    """
    # Generate predicted probability for positive class (Fraud = 1)
    fraud_probabilities = model.predict_proba(X)[:, 1]

    # Convert probability to 0-100 risk score and round to 2 decimal places
    risk_scores = np.round(fraud_probabilities * 100.0, 2)

    return fraud_probabilities, risk_scores


def categorize_risk(risk_score: float) -> str:
    """
    Categorize the risk score into operational risk tiers:
    - 0 to 39.99  -> LOW
    - 40 to 69.99 -> MEDIUM
    - 70 to 100   -> HIGH

    NOTE:
    These are initial operational thresholds and are not claimed to be statistically
    optimal. They can later be optimized using validation-set precision/recall analysis,
    cost-benefit trade-offs, and operational investigator capacity.
    """
    if risk_score < 40.0:
        return "LOW"
    elif risk_score < 70.0:
        return "MEDIUM"
    else:
        return "HIGH"


def get_recommended_action(risk_level: str) -> str:
    """
    Map risk tier to actionable operational decision:
    - LOW    -> ALLOW
    - MEDIUM -> REVIEW
    - HIGH   -> MANUAL_INVESTIGATION
    """
    actions = {
        "LOW": "ALLOW",
        "MEDIUM": "REVIEW",
        "HIGH": "MANUAL_INVESTIGATION"
    }
    return actions.get(risk_level, "REVIEW")


def build_risk_dataframe(
    transaction_ids: pd.Series,
    fraud_probabilities: np.ndarray,
    risk_scores: np.ndarray,
    top_shap_features: List[str]
) -> pd.DataFrame:
    """
    Combine transaction metrics into a structured risk scores DataFrame.
    """
    risk_levels = [categorize_risk(score) for score in risk_scores]
    recommended_actions = [get_recommended_action(level) for level in risk_levels]

    # Comma-separated list of top SHAP features
    top_factors_str = ", ".join(top_shap_features)

    results_df = pd.DataFrame({
        "TransactionID": transaction_ids.values,
        "fraud_probability": np.round(fraud_probabilities, 4),
        "risk_score": risk_scores,
        "risk_level": risk_levels,
        "recommended_action": recommended_actions,
        "top_risk_factors": top_factors_str
    })

    return results_df


def generate_sample_investigation_report(
    results_df: pd.DataFrame,
    top_shap_features: List[str],
    output_file_path: str,
    sample_count: int = 10
) -> None:
    """
    Generate a human-readable investigation report for sample transactions.
    Selects representative sample transactions across risk tiers where possible.
    """
    os.makedirs(os.path.dirname(output_file_path), exist_ok=True)

    # To provide the most informative investigation sample report, select a balanced sample
    # (e.g. prioritizing HIGH/MEDIUM cases along with LOW cases, or first N rows)
    high_cases = results_df[results_df["risk_level"] == "HIGH"]
    med_cases = results_df[results_df["risk_level"] == "MEDIUM"]
    low_cases = results_df[results_df["risk_level"] == "LOW"]

    samples_list = []
    # Pick top high cases first if present
    if not high_cases.empty:
        samples_list.append(high_cases.head(4))
    if not med_cases.empty:
        samples_list.append(med_cases.head(3))
    if not low_cases.empty:
        samples_list.append(low_cases.head(3))

    if samples_list:
        sample_transactions = pd.concat(samples_list).drop_duplicates()
        # If fewer than sample_count, fill up from remaining rows
        if len(sample_transactions) < sample_count:
            remaining = results_df.drop(sample_transactions.index).head(sample_count - len(sample_transactions))
            sample_transactions = pd.concat([sample_transactions, remaining])
        sample_transactions = sample_transactions.head(sample_count)
    else:
        sample_transactions = results_df.head(sample_count)

    report_lines = [
        "=" * 60,
        "CHARGESHIELD INVESTIGATION REPORT",
        "=" * 60,
        ""
    ]

    for _, row in sample_transactions.iterrows():
        tx_id = int(row["TransactionID"]) if pd.notnull(row["TransactionID"]) else "UNKNOWN"
        fraud_prob_pct = f"{row['fraud_probability'] * 100:.2f}%"
        risk_score_str = f"{row['risk_score']:.2f}/100"
        risk_level = row["risk_level"]
        recommended_action = row["recommended_action"]

        report_lines.append(f"Transaction ID: {tx_id}")
        report_lines.append("")
        report_lines.append(f"Fraud Probability: {fraud_prob_pct}")
        report_lines.append(f"Risk Score: {risk_score_str}")
        report_lines.append(f"Risk Level: {risk_level}")
        report_lines.append(f"Recommended Action: {recommended_action}")
        report_lines.append("")
        report_lines.append("Top Risk Factors:")
        for idx, feat in enumerate(top_shap_features, start=1):
            report_lines.append(f"{idx}. {feat}")
        report_lines.append("")
        report_lines.append("-" * 60)
        report_lines.append("")

    with open(output_file_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))


def run_risk_engine(
    data_path: str = DATA_PATH,
    model_path: str = MODEL_PATH,
    shap_path: str = SHAP_IMPORTANCE_PATH,
    sample_size: int = SAMPLE_SIZE
) -> pd.DataFrame:
    """
    Main orchestration function for ChargeShield Risk Scoring Engine.
    """
    print("=" * 60)
    print("CHARGESHIELD RISK SCORING ENGINE")
    print("=" * 60)

    # 1. Environment & File Validation
    print("\n[1/6] Validating files and paths...")
    validate_file_exists(data_path, "Features dataset")
    validate_file_exists(model_path, "Trained XGBoost model")
    validate_file_exists(shap_path, "SHAP feature importance report")
    os.makedirs(REPORT_DIR, exist_ok=True)

    # 2. Load Model
    print("\n[2/6] Loading pre-trained XGBoost model...")
    model = load_model(model_path)
    print(f"Model loaded successfully from: {model_path}")

    # 3. Load & Preprocess Data
    print(f"\n[3/6] Loading dataset (sample size: {sample_size if sample_size else 'Full'})...")
    X, transaction_ids = load_and_preprocess_data(data_path, sample_size=sample_size)
    print(f"Processed feature matrix shape: {X.shape}")

    # 4. Load SHAP Feature Explanations
    print("\n[4/6] Loading SHAP feature explanations...")
    top_shap_features = load_top_shap_features(shap_path, top_n=5)
    print(f"Top {len(top_shap_features)} Risk Factors identified:")
    for idx, feature_name in enumerate(top_shap_features, start=1):
        print(f"  {idx}. {feature_name}")

    # 5. Generate Predictions and Risk Scores
    print("\n[5/6] Generating fraud probabilities and risk scores...")
    fraud_probabilities, risk_scores = calculate_risk_scores(model, X)
    results_df = build_risk_dataframe(
        transaction_ids,
        fraud_probabilities,
        risk_scores,
        top_shap_features
    )

    # 6. Save Outputs
    print("\n[6/6] Saving risk score outputs and reports...")
    results_df.to_csv(RISK_SCORES_OUTPUT_PATH, index=False)
    print(f"Risk scores saved to: {RISK_SCORES_OUTPUT_PATH}")

    generate_sample_investigation_report(
        results_df,
        top_shap_features,
        INVESTIGATION_REPORT_OUTPUT_PATH,
        sample_count=10
    )
    print(f"Investigation report saved to: {INVESTIGATION_REPORT_OUTPUT_PATH}")

    # 7. Summary Statistics
    total_processed = len(results_df)
    low_count = int((results_df["risk_level"] == "LOW").sum())
    med_count = int((results_df["risk_level"] == "MEDIUM").sum())
    high_count = int((results_df["risk_level"] == "HIGH").sum())
    avg_risk = float(results_df["risk_score"].mean())
    max_risk = float(results_df["risk_score"].max())

    print("\n" + "=" * 60)
    print("CHARGESHIELD RISK SUMMARY")
    print("=" * 60)
    print(f"Total Transactions Processed: {total_processed}")
    print(f"LOW Risk (ALLOW)            : {low_count} ({low_count / total_processed * 100:.1f}%)")
    print(f"MEDIUM Risk (REVIEW)        : {med_count} ({med_count / total_processed * 100:.1f}%)")
    print(f"HIGH Risk (MANUAL_INVEST)   : {high_count} ({high_count / total_processed * 100:.1f}%)")
    print(f"Average Risk Score          : {avg_risk:.2f}")
    print(f"Highest Risk Score          : {max_risk:.2f}")
    print("=" * 60)

    print("\nCHARGESHIELD RISK ENGINE COMPLETED")
    print("=" * 60)

    return results_df


if __name__ == "__main__":
    try:
        run_risk_engine()
    except Exception as e:
        print(f"\n[ERROR] Risk Engine execution failed: {e}", file=sys.stderr)
        sys.exit(1)
