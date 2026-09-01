import pandas as pd
import numpy as np
import os

from xgboost import XGBClassifier

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    precision_score,
    recall_score,
    f1_score
)

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

print("=" * 60)
print("CHARGESHIELD MODEL EVALUATION")
print("=" * 60)

print("\nLoading dataset...")

df = pd.read_csv(DATA_PATH)

y = df["isFraud"]
X = df.drop(columns=["isFraud"])

if "TransactionID" in X.columns:
    X = X.drop(columns=["TransactionID"])

# Match training preprocessing
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

# Same validation split used during training
_, X_valid, _, y_valid = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

print("Validation rows:", len(X_valid))

print("\nLoading saved XGBoost model...")

model = XGBClassifier(
    enable_categorical=True
)

model.load_model(MODEL_PATH)

print("Model loaded successfully.")

print("\nGenerating predictions...")

probabilities = model.predict_proba(X_valid)[:, 1]

predictions = (probabilities >= 0.5).astype(int)

roc_auc = roc_auc_score(
    y_valid,
    probabilities
)

pr_auc = average_precision_score(
    y_valid,
    probabilities
)

precision = precision_score(
    y_valid,
    predictions,
    zero_division=0
)

recall = recall_score(
    y_valid,
    predictions,
    zero_division=0
)

f1 = f1_score(
    y_valid,
    predictions,
    zero_division=0
)

print("\n" + "=" * 60)
print("CHARGESHIELD MODEL RESULTS")
print("=" * 60)

print(f"\nROC-AUC  : {roc_auc:.4f}")
print(f"PR-AUC   : {pr_auc:.4f}")
print(f"Precision: {precision:.4f}")
print(f"Recall   : {recall:.4f}")
print(f"F1 Score : {f1:.4f}")

print("\n" + "=" * 60)
print("EVALUATION COMPLETED")
print("=" * 60)

results = {
    "ROC-AUC": roc_auc,
    "PR-AUC": pr_auc,
    "Precision": precision,
    "Recall": recall,
    "F1 Score": f1
}

results_df = pd.DataFrame([results])

results_path = os.path.join(
    BASE_DIR,
    "reports",
    "model_metrics.csv"
)

results_df.to_csv(results_path, index=False)

print("\nMetrics saved to:")
print(results_path)