import pandas as pd
import numpy as np
import os
import joblib

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report
)

from xgboost import XGBClassifier


# ============================================================
# ChargeShield - XGBoost Fraud Detection
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INPUT_PATH = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "chargeshield_features.csv"
)

MODEL_DIR = os.path.join(BASE_DIR, "models")

os.makedirs(MODEL_DIR, exist_ok=True)

MODEL_PATH = os.path.join(
    MODEL_DIR,
    "chargeshield_xgb.json"
)

print("=" * 60)
print("CHARGESHIELD FRAUD DETECTION MODEL")
print("=" * 60)


# ------------------------------------------------------------
# 1. Load dataset
# ------------------------------------------------------------

print("\n[1/6] Loading dataset...")

df = pd.read_csv(INPUT_PATH)

print("Dataset shape:", df.shape)


# ------------------------------------------------------------
# 2. Separate target
# ------------------------------------------------------------

print("\n[2/6] Preparing features...")

TARGET = "isFraud"

y = df[TARGET]

X = df.drop(columns=[TARGET])


# Remove ID because it is not a meaningful predictive feature
if "TransactionID" in X.columns:
    X = X.drop(columns=["TransactionID"])


# ------------------------------------------------------------
# 3. Handle categorical columns
# ------------------------------------------------------------

print("\n[3/6] Processing categorical features...")

categorical_columns = X.select_dtypes(
    include=["object", "string"]
).columns.tolist()

print("Categorical columns:", len(categorical_columns))

for col in categorical_columns:
    X[col] = X[col].fillna("Unknown").astype("category")


# Numerical columns
numerical_columns = X.select_dtypes(
    include=[np.number]
).columns.tolist()

print("Numerical columns:", len(numerical_columns))


# Fill numerical missing values
X[numerical_columns] = X[numerical_columns].fillna(
    X[numerical_columns].median()
)


# ------------------------------------------------------------
# 4. Train / validation split
# ------------------------------------------------------------

print("\n[4/6] Creating train/validation split...")

X_train, X_valid, y_train, y_valid = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

print("Training rows:", len(X_train))
print("Validation rows:", len(X_valid))


# ------------------------------------------------------------
# 5. Calculate class imbalance
# ------------------------------------------------------------

negative = (y_train == 0).sum()
positive = (y_train == 1).sum()

scale_pos_weight = negative / positive

print("\nClass distribution:")
print("Legitimate:", negative)
print("Fraud:", positive)
print("Scale pos weight:", scale_pos_weight)


# ------------------------------------------------------------
# 6. Train XGBoost
# ------------------------------------------------------------

print("\n[5/6] Training XGBoost...")

model = XGBClassifier(
    n_estimators=400,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,

    objective="binary:logistic",

    eval_metric="aucpr",

    scale_pos_weight=scale_pos_weight,

    tree_method="hist",

    enable_categorical=True,

    random_state=42,

    n_jobs=4
)

model.fit(
    X_train,
    y_train,
    eval_set=[(X_valid, y_valid)],
    verbose=True
)


# ------------------------------------------------------------
# 7. Predictions
# ------------------------------------------------------------

print("\n[6/6] Evaluating model...")

y_probability = model.predict_proba(X_valid)[:, 1]

y_prediction = (
    y_probability >= 0.5
).astype(int)


# ------------------------------------------------------------
# Metrics
# ------------------------------------------------------------

roc_auc = roc_auc_score(
    y_valid,
    y_probability
)

pr_auc = average_precision_score(
    y_valid,
    y_probability
)

precision = precision_score(
    y_valid,
    y_prediction,
    zero_division=0
)

recall = recall_score(
    y_valid,
    y_prediction,
    zero_division=0
)

f1 = f1_score(
    y_valid,
    y_prediction,
    zero_division=0
)


print("\n" + "=" * 60)
print("CHARGESHIELD MODEL RESULTS")
print("=" * 60)

print(f"\nROC-AUC : {roc_auc:.4f}")
print(f"PR-AUC  : {pr_auc:.4f}")
print(f"Precision: {precision:.4f}")
print(f"Recall   : {recall:.4f}")
print(f"F1 Score : {f1:.4f}")

print("\nClassification Report:")
print(
    classification_report(
        y_valid,
        y_prediction,
        target_names=["Legitimate", "Fraud"],
        zero_division=0
    )
)


# ------------------------------------------------------------
# Save model
# ------------------------------------------------------------

model.save_model(MODEL_PATH)

print("\nModel saved to:")
print(MODEL_PATH)

print("\n" + "=" * 60)
print("TRAINING COMPLETED")
print("=" * 60)