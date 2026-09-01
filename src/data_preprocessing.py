import pandas as pd
import os

# ============================================================
# ChargeShield - Data Preprocessing
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TRANSACTION_PATH = os.path.join(
    BASE_DIR, "data", "raw", "train_transaction.csv"
)

IDENTITY_PATH = os.path.join(
    BASE_DIR, "data", "raw", "train_identity.csv"
)

OUTPUT_PATH = os.path.join(
    BASE_DIR, "data", "processed", "chargeshield_train.csv"
)


print("=" * 60)
print("CHARGESHIELD DATA PREPROCESSING")
print("=" * 60)

# ------------------------------------------------------------
# 1. Load transaction data
# ------------------------------------------------------------

print("\n[1/5] Loading transaction data...")

transactions = pd.read_csv(TRANSACTION_PATH)

print("Transaction shape:", transactions.shape)


# ------------------------------------------------------------
# 2. Load identity data
# ------------------------------------------------------------

print("\n[2/5] Loading identity data...")

identity = pd.read_csv(IDENTITY_PATH)

print("Identity shape:", identity.shape)


# ------------------------------------------------------------
# 3. Merge datasets
# ------------------------------------------------------------

print("\n[3/5] Merging transaction + identity data...")

df = transactions.merge(
    identity,
    on="TransactionID",
    how="left"
)

print("Merged shape:", df.shape)


# ------------------------------------------------------------
# 4. Basic information
# ------------------------------------------------------------

print("\n[4/5] Dataset information")

print("\nFraud distribution:")
print(df["isFraud"].value_counts())

print("\nFraud percentage:")
print(df["isFraud"].value_counts(normalize=True) * 100)

print("\nMissing values:")
missing = df.isna().mean().sort_values(ascending=False)

print(missing.head(20))


# ------------------------------------------------------------
# 5. Save merged dataset
# ------------------------------------------------------------

print("\n[5/5] Saving processed dataset...")

df.to_csv(OUTPUT_PATH, index=False)

print("\nSaved to:")
print(OUTPUT_PATH)

print("\nFinal shape:", df.shape)

print("\n" + "=" * 60)
print("PREPROCESSING COMPLETED")
print("=" * 60)