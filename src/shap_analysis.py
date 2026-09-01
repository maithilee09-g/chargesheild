import pandas as pd
import numpy as np
import os
import shap
import matplotlib.pyplot as plt

from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split


# ============================================================
# ChargeShield - SHAP Explainability
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

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

REPORT_DIR = os.path.join(
    BASE_DIR,
    "reports"
)

os.makedirs(REPORT_DIR, exist_ok=True)

print("=" * 60)
print("CHARGESHIELD SHAP ANALYSIS")
print("=" * 60)


# ------------------------------------------------------------
# 1. Load data
# ------------------------------------------------------------

print("\n[1/5] Loading dataset...")

df = pd.read_csv(DATA_PATH)

y = df["isFraud"]

X = df.drop(columns=["isFraud"])

if "TransactionID" in X.columns:
    X = X.drop(columns=["TransactionID"])


# ------------------------------------------------------------
# 2. Match training preprocessing
# ------------------------------------------------------------

print("\n[2/5] Preparing features...")

categorical_columns = X.select_dtypes(
    include=["object", "string"]
).columns.tolist()

for col in categorical_columns:
    X[col] = X[col].fillna("Unknown").astype("category")

numerical_columns = X.select_dtypes(
    include=[np.number]
).columns.tolist()

X[numerical_columns] = X[numerical_columns].fillna(
    X[numerical_columns].median()
)


# ------------------------------------------------------------
# 3. Get validation sample
# ------------------------------------------------------------

print("\n[3/5] Selecting SHAP sample...")

_, X_valid, _, y_valid = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

# Only explain 1,000 transactions
SAMPLE_SIZE = 1000

X_sample = X_valid.sample(
    n=min(SAMPLE_SIZE, len(X_valid)),
    random_state=42
)

print("SHAP sample size:", len(X_sample))


# ------------------------------------------------------------
# 4. Load model
# ------------------------------------------------------------

print("\n[4/5] Loading XGBoost model...")

model = XGBClassifier(
    enable_categorical=True
)

model.load_model(MODEL_PATH)

print("Model loaded successfully.")


# ------------------------------------------------------------
# 5. Calculate SHAP values
# ------------------------------------------------------------

print("\n[5/5] Calculating SHAP values...")

explainer = shap.TreeExplainer(model)

shap_values = explainer.shap_values(X_sample)

print("SHAP calculation completed.")


# ------------------------------------------------------------
# Global feature importance
# ------------------------------------------------------------

print("\nCreating feature importance...")

mean_abs_shap = np.abs(shap_values).mean(axis=0)

importance = pd.DataFrame({
    "Feature": X_sample.columns,
    "MeanAbsSHAP": mean_abs_shap
})

importance = importance.sort_values(
    "MeanAbsSHAP",
    ascending=False
)

importance_path = os.path.join(
    REPORT_DIR,
    "shap_feature_importance.csv"
)

importance.to_csv(
    importance_path,
    index=False
)

print("\nTop 20 features:")

print(
    importance.head(20).to_string(index=False)
)


# ------------------------------------------------------------
# SHAP summary plot
# ------------------------------------------------------------

print("\nCreating SHAP summary plot...")

plt.figure()

shap.summary_plot(
    shap_values,
    X_sample,
    max_display=20,
    show=False
)

plt.tight_layout()

plot_path = os.path.join(
    REPORT_DIR,
    "shap_summary.png"
)

plt.savefig(
    plot_path,
    dpi=150,
    bbox_inches="tight"
)

plt.close()

print("\nSHAP report saved:")
print(importance_path)

print("\nSHAP plot saved:")
print(plot_path)

print("\n" + "=" * 60)
print("SHAP ANALYSIS COMPLETED")
print("=" * 60)