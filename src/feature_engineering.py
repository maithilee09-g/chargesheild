import pandas as pd
import numpy as np
import os

# ============================================================
# ChargeShield - Feature Engineering
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INPUT_PATH = os.path.join(
    BASE_DIR, "data", "processed", "chargeshield_train.csv"
)

OUTPUT_PATH = os.path.join(
    BASE_DIR, "data", "processed", "chargeshield_features.csv"
)

print("=" * 60)
print("CHARGESHIELD FEATURE ENGINEERING")
print("=" * 60)

# ------------------------------------------------------------
# 1. Load merged dataset
# ------------------------------------------------------------

print("\n[1/6] Loading merged dataset...")

df = pd.read_csv(INPUT_PATH)

print("Original shape:", df.shape)


# ------------------------------------------------------------
# 2. Transaction amount features
# ------------------------------------------------------------

print("\n[2/6] Creating transaction features...")

df["TransactionAmt_log"] = np.log1p(df["TransactionAmt"])

df["TransactionAmt_decimal"] = (
    df["TransactionAmt"] - df["TransactionAmt"].round()
).abs()


# ------------------------------------------------------------
# 3. Transaction time features
# ------------------------------------------------------------

print("\n[3/6] Creating time features...")

# TransactionDT is measured in seconds
df["Transaction_hour"] = (
    (df["TransactionDT"] // 3600) % 24
)

df["Transaction_day"] = (
    df["TransactionDT"] // (3600 * 24)
)

df["Transaction_week"] = (
    df["Transaction_day"] // 7
)


# ------------------------------------------------------------
# 4. Missing-value features
# ------------------------------------------------------------

print("\n[4/6] Creating missing-value features...")

feature_columns = [
    col for col in df.columns
    if col not in ["isFraud"]
]

df["missing_count"] = df[feature_columns].isna().sum(axis=1)

df["missing_ratio"] = (
    df["missing_count"] / len(feature_columns)
)


# ------------------------------------------------------------
# 5. Selected identity/device features
# ------------------------------------------------------------

print("\n[5/6] Processing identity features...")

# DeviceType
if "DeviceType" in df.columns:
    df["DeviceType"] = df["DeviceType"].fillna("Unknown")

# DeviceInfo
if "DeviceInfo" in df.columns:
    df["DeviceInfo"] = df["DeviceInfo"].fillna("Unknown")

# Email domains
for col in ["P_emaildomain", "R_emaildomain"]:
    if col in df.columns:
        df[col] = df[col].fillna("Unknown")


# ------------------------------------------------------------
# 6. Save feature dataset
# ------------------------------------------------------------

print("\n[6/6] Saving engineered dataset...")

df.to_csv(OUTPUT_PATH, index=False)

print("\nFinal shape:", df.shape)

print("\nCreated features:")

new_features = [
    "TransactionAmt_log",
    "TransactionAmt_decimal",
    "Transaction_hour",
    "Transaction_day",
    "Transaction_week",
    "missing_count",
    "missing_ratio"
]

for feature in new_features:
    print(" -", feature)

print("\nSaved to:")
print(OUTPUT_PATH)

print("\n" + "=" * 60)
print("FEATURE ENGINEERING COMPLETED")
print("=" * 60)