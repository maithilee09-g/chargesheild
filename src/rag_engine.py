import os
import sys
import json
import glob
import re
import argparse
from typing import Dict, Any, List, Optional, Tuple, Union

import numpy as np


# ============================================================
# ChargeShield - FAISS + RAG Investigation Knowledge System
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT_DIR = os.path.join(BASE_DIR, "reports")
DEFAULT_INDEX_DIR = os.path.join(REPORT_DIR, "faiss_index")
INDEX_FILENAME = "charge_shield_cases.index"
METADATA_FILENAME = "cases_metadata.json"
DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


_EMBEDDING_MODELS: Dict[str, Any] = {}


def get_embedding_model(model_name: str = DEFAULT_MODEL_NAME):
    """
    Lazy load and cache SentenceTransformer embedding model globally.
    Avoids reloading model weights for every request.
    """
    global _EMBEDDING_MODELS
    if model_name in _EMBEDDING_MODELS:
        return _EMBEDDING_MODELS[model_name]

    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        raise ImportError(
            "sentence-transformers is not installed. "
            "Please install it using: pip install sentence-transformers faiss-cpu numpy"
        )
    model = SentenceTransformer(model_name)
    _EMBEDDING_MODELS[model_name] = model
    return model


def get_faiss_module():
    """
    Lazy load FAISS module.
    """
    try:
        import faiss
        return faiss
    except ImportError:
        raise ImportError(
            "faiss is not installed. "
            "Please install it using: pip install faiss-cpu"
        )


def extract_case_text(case_dict: Dict[str, Any]) -> str:
    """
    Convert a structured investigation case into rich semantic text representation
    suitable for dense vector embedding and similarity matching.
    """
    tx_id = case_dict.get("transaction_id", "Unknown")
    risk_level = case_dict.get("risk_level", "Unknown")
    risk_score = case_dict.get("risk_score", 0.0)
    fraud_prob = case_dict.get("fraud_probability", 0.0)
    action = case_dict.get("recommended_action", "Unknown")
    evidence = case_dict.get("transaction_evidence", {})
    features = case_dict.get("model_important_features", [])
    summary = case_dict.get("investigator_summary", "")

    evidence_lines = []
    if isinstance(evidence, dict):
        for k, v in evidence.items():
            evidence_lines.append(f"{k}: {v}")
    evidence_str = "\n".join(evidence_lines) if evidence_lines else "None"

    if isinstance(features, list):
        features_str = ", ".join(str(f) for f in features)
    else:
        features_str = str(features)

    text_representation = (
        f"Investigation Case ID: {tx_id}\n"
        f"Risk Level: {risk_level}\n"
        f"Risk Score: {risk_score}\n"
        f"Fraud Probability: {fraud_prob}\n"
        f"Recommended Action: {action}\n"
        f"Key Model Risk Factors: {features_str}\n"
        f"Transaction Evidence:\n{evidence_str}\n"
        f"Investigator Summary:\n{summary}"
    )
    return text_representation.strip()


def parse_case_text_report(file_path: str) -> Dict[str, Any]:
    """
    Parse a legacy case_<id>.txt report into a structured dictionary if JSON is missing.
    """
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    tx_match = re.search(r"Transaction ID\s*:\s*(\d+)", content)
    tx_id = int(tx_match.group(1)) if tx_match else 0

    prob_match = re.search(r"Fraud Probability\s*:\s*([\d\.]+)%", content)
    fraud_prob = float(prob_match.group(1)) / 100.0 if prob_match else 0.0

    score_match = re.search(r"Risk Score\s*:\s*([\d\.]+)/100", content)
    risk_score = float(score_match.group(1)) if score_match else 0.0

    level_match = re.search(r"Risk Level\s*:\s*(\w+)", content)
    risk_level = level_match.group(1) if level_match else "UNKNOWN"

    action_match = re.search(r"Recommended Action\s*:\s*(\w+)", content)
    action = action_match.group(1) if action_match else "UNKNOWN"

    # Extract summary section
    summary = ""
    summary_match = re.search(r"INVESTIGATOR SUMMARY:\s*-+\s*(.*?)\s*={10,}", content, re.DOTALL)
    if summary_match:
        summary = summary_match.group(1).strip()

    return {
        "transaction_id": tx_id,
        "fraud_probability": fraud_prob,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "recommended_action": action,
        "transaction_evidence": {},
        "model_important_features": [],
        "investigator_summary": summary,
        "raw_text": content
    }


def load_investigation_cases(reports_dir: str = REPORT_DIR) -> List[Dict[str, Any]]:
    """
    Scan the reports directory for existing investigation cases from:
    1. case_*.json files
    2. case_*.txt files
    3. investigation_cases.json
    Merges and deduplicates cases by transaction_id.
    """
    cases_by_id: Dict[Any, Dict[str, Any]] = {}

    # 1. Check investigation_cases.json
    master_json_path = os.path.join(reports_dir, "investigation_cases.json")
    if os.path.exists(master_json_path):
        try:
            with open(master_json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    for item in data:
                        tx_id = item.get("transaction_id")
                        if tx_id:
                            item["source_file"] = master_json_path
                            cases_by_id[tx_id] = item
                elif isinstance(data, dict):
                    tx_id = data.get("transaction_id")
                    if tx_id:
                        data["source_file"] = master_json_path
                        cases_by_id[tx_id] = data
        except Exception as e:
            print(f"[WARNING] Could not parse '{master_json_path}': {e}", file=sys.stderr)

    # 2. Check individual case_*.json files
    json_pattern = os.path.join(reports_dir, "case_*.json")
    for json_file in glob.glob(json_pattern):
        if os.path.basename(json_file) == "investigation_cases.json":
            continue
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                item = json.load(f)
                tx_id = item.get("transaction_id")
                if tx_id:
                    item["source_file"] = json_file
                    # Prefer standalone case JSON details if available
                    cases_by_id[tx_id] = item
        except Exception as e:
            print(f"[WARNING] Could not parse '{json_file}': {e}", file=sys.stderr)

    # 3. Check individual case_*.txt files for any missing cases
    txt_pattern = os.path.join(reports_dir, "case_*.txt")
    for txt_file in glob.glob(txt_pattern):
        try:
            # Check if this case is already in cases_by_id
            match = re.search(r"case_(\d+)\.txt$", os.path.basename(txt_file))
            if match:
                tx_id = int(match.group(1))
                if tx_id not in cases_by_id:
                    parsed = parse_case_text_report(txt_file)
                    parsed["source_file"] = txt_file
                    cases_by_id[tx_id] = parsed
                else:
                    cases_by_id[tx_id]["report_file_txt"] = txt_file
        except Exception as e:
            print(f"[WARNING] Could not parse '{txt_file}': {e}", file=sys.stderr)

    cases_list = list(cases_by_id.values())
    return cases_list


def build_faiss_index(
    reports_dir: str = REPORT_DIR,
    index_dir: str = DEFAULT_INDEX_DIR,
    model_name: str = DEFAULT_MODEL_NAME
) -> Tuple[Any, List[Dict[str, Any]]]:
    """
    Extract text representations from all investigation reports, compute dense embeddings
    using sentence-transformers, build FAISS similarity index, and save index + metadata.
    """
    faiss = get_faiss_module()
    print("=" * 60)
    print("CHARGESHIELD FAISS INDEX BUILDER")
    print("=" * 60)
    print(f"Scanning reports from: {reports_dir}")

    cases = load_investigation_cases(reports_dir)
    if not cases:
        raise ValueError(
            f"No investigation cases found in '{reports_dir}'. "
            f"Run 'python src\\investigation_engine.py --transaction-id <ID>' first to generate cases."
        )

    print(f"Found {len(cases)} historical investigation case(s).")
    print(f"Loading embedding model: {model_name} ...")
    model = get_embedding_model(model_name)

    # Generate texts & metadata
    case_texts = []
    metadata = []

    for idx, case in enumerate(cases):
        tx_id = case.get("transaction_id", f"case_{idx}")
        text = extract_case_text(case)
        case_texts.append(text)

        meta_entry = {
            "index_id": idx,
            "case_id": f"case_{tx_id}",
            "transaction_id": tx_id,
            "risk_score": float(case.get("risk_score", 0.0)),
            "fraud_probability": float(case.get("fraud_probability", 0.0)),
            "risk_level": str(case.get("risk_level", "UNKNOWN")),
            "recommended_action": str(case.get("recommended_action", "UNKNOWN")),
            "source_file": case.get("source_file", ""),
            "model_important_features": case.get("model_important_features", []),
            "transaction_evidence": case.get("transaction_evidence", {}),
            "investigator_summary": case.get("investigator_summary", ""),
            "indexed_text_snippet": text[:300] + ("..." if len(text) > 300 else "")
        }
        metadata.append(meta_entry)

    print(f"Generating dense embeddings for {len(case_texts)} cases...")
    # Normalize embeddings for cosine similarity via Inner Product (IndexFlatIP)
    embeddings = model.encode(case_texts, convert_to_numpy=True, normalize_embeddings=True)
    embeddings = np.ascontiguousarray(embeddings, dtype=np.float32)

    embedding_dim = embeddings.shape[1]
    print(f"Embedding dimension: {embedding_dim}")

    # Build FAISS IndexFlatIP (Inner Product on normalized vectors = Cosine Similarity)
    index = faiss.IndexFlatIP(embedding_dim)
    index.add(embeddings)
    print(f"Indexed {index.ntotal} vectors in FAISS index.")

    # Save Index and Metadata
    os.makedirs(index_dir, exist_ok=True)
    index_file_path = os.path.join(index_dir, INDEX_FILENAME)
    metadata_file_path = os.path.join(index_dir, METADATA_FILENAME)

    faiss.write_index(index, index_file_path)
    with open(metadata_file_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"FAISS index saved to : {index_file_path}")
    print(f"Case metadata saved to: {metadata_file_path}")
    print("=" * 60)
    print("FAISS INDEX BUILD COMPLETED SUCCESSFULLY")
    print("=" * 60)

    return index, metadata


class ChargeShieldRAGRetriever:
    """
    RAG Retriever for retrieving relevant historical investigation cases and evidence.
    """

    def __init__(
        self,
        index_dir: str = DEFAULT_INDEX_DIR,
        model_name: str = DEFAULT_MODEL_NAME
    ):
        self.index_dir = index_dir
        self.model_name = model_name
        self.index_file = os.path.join(index_dir, INDEX_FILENAME)
        self.metadata_file = os.path.join(index_dir, METADATA_FILENAME)

        self._model = None
        self._index = None
        self._metadata: List[Dict[str, Any]] = []

    def _ensure_loaded(self):
        """
        Verify index files exist and load model, FAISS index, and metadata.
        """
        if self._index is not None and self._model is not None:
            return

        if not os.path.exists(self.index_file) or not os.path.exists(self.metadata_file):
            raise FileNotFoundError(
                f"FAISS index or metadata not found in '{self.index_dir}'. "
                f"Please build the index first using: python src\\rag_engine.py --build-index"
            )

        faiss = get_faiss_module()
        self._index = faiss.read_index(self.index_file)

        with open(self.metadata_file, "r", encoding="utf-8") as f:
            self._metadata = json.load(f)

        self._model = get_embedding_model(self.model_name)

    def retrieve_by_text(self, query_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieve top-k similar historical cases for a given text query.
        """
        self._ensure_loaded()

        # Compute normalized query embedding
        query_embedding = self._model.encode([query_text], convert_to_numpy=True, normalize_embeddings=True)
        query_embedding = np.ascontiguousarray(query_embedding, dtype=np.float32)

        actual_k = min(top_k, self._index.ntotal)
        if actual_k <= 0:
            return []

        distances, indices = self._index.search(query_embedding, actual_k)

        results = []
        for rank, (score, idx) in enumerate(zip(distances[0], indices[0]), start=1):
            if idx < 0 or idx >= len(self._metadata):
                continue
            meta = dict(self._metadata[idx])
            # Clamp cosine similarity between -1.0 and 1.0 (typically [0, 1])
            clamped_score = max(-1.0, min(1.0, float(score)))
            meta["similarity_score"] = round(clamped_score, 4)
            meta["rank"] = rank
            results.append(meta)

        return results

    def retrieve_by_case(
        self,
        case_input: Union[str, Dict[str, Any]],
        top_k: int = 5
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Retrieve top-k similar historical cases for a given case dictionary or file path.
        Returns:
            Tuple of (query_case_dict, list_of_retrieved_cases)
        """
        query_case: Dict[str, Any] = {}

        if isinstance(case_input, str):
            if not os.path.exists(case_input):
                raise FileNotFoundError(f"Case file not found at '{case_input}'")

            if case_input.endswith(".json"):
                with open(case_input, "r", encoding="utf-8") as f:
                    query_case = json.load(f)
            else:
                query_case = parse_case_text_report(case_input)
            query_case["source_file"] = case_input
        elif isinstance(case_input, dict):
            query_case = case_input
        else:
            raise ValueError(f"Invalid case input type: {type(case_input)}")

        query_text = extract_case_text(query_case)
        retrieved_cases = self.retrieve_by_text(query_text, top_k=top_k)

        return query_case, retrieved_cases

    def generate_rag_context_explanation(
        self,
        query_case: Dict[str, Any],
        retrieved_cases: List[Dict[str, Any]]
    ) -> str:
        """
        Synthesize RAG context comparing the new query case with historical retrieved cases.
        """
        tx_id = query_case.get("transaction_id", "Unknown")
        risk_score = query_case.get("risk_score", 0.0)
        risk_level = query_case.get("risk_level", "UNKNOWN")
        fraud_prob = query_case.get("fraud_probability", 0.0)
        action = query_case.get("recommended_action", "UNKNOWN")
        query_evidence = query_case.get("transaction_evidence", {})
        query_features = query_case.get("model_important_features", [])

        lines = [
            "CHARGESHIELD RAG INVESTIGATION CONTEXT & EXPLANATION",
            "------------------------------------------------------------",
            f"Query Transaction ID : {tx_id}",
            f"Current Assessment   : {risk_level} Risk (Score: {risk_score:.2f}, Prob: {fraud_prob*100:.2f}%)",
            f"Recommended Action   : {action}",
            "",
            "HISTORICAL COMPARISON & PRECEDENT ANALYSIS:"
        ]

        if not retrieved_cases:
            lines.append("No historical cases available in index for comparison.")
        else:
            shared_actions = set()
            high_similarity_cases = []

            for c in retrieved_cases:
                c_id = c.get("transaction_id", c.get("case_id", "Unknown"))
                sim = c.get("similarity_score", 0.0)
                rec = c.get("recommended_action", "UNKNOWN")
                shared_actions.add(rec)

                if sim >= 0.70:
                    high_similarity_cases.append(c)

                lines.append(
                    f"- Case #{c_id}: Similarity={sim:.2f} | Risk={c.get('risk_score', 0):.2f} | "
                    f"Level={c.get('risk_level', 'N/A')} | Action={rec}"
                )

            lines.append("")
            lines.append("SYNTHESIS:")
            if str(tx_id) in [str(c.get("transaction_id")) for c in retrieved_cases]:
                lines.append(
                    f"- Exact match for case #{tx_id} found in historical knowledge base."
                )

            if high_similarity_cases:
                lines.append(
                    f"- {len(high_similarity_cases)} historical case(s) exhibit high behavioral similarity "
                    f"(>= 70%) with transaction #{tx_id}."
                )

            if "MANUAL_INVESTIGATION" in shared_actions:
                lines.append(
                    "- Historical precedent strongly correlates with MANUAL_INVESTIGATION due to "
                    "elevated risk scores and matching evidence indicators."
                )

        lines.append("------------------------------------------------------------")
        return "\n".join(lines)


def format_retrieval_output(
    query_case: Dict[str, Any],
    retrieved_cases: List[Dict[str, Any]],
    query_name: Optional[str] = None
) -> str:
    """
    Format RAG retrieval results strictly according to ChargeShield specifications.
    """
    tx_id = query_case.get("transaction_id", "Unknown")
    case_label = query_name if query_name else f"case_{tx_id}"

    lines = [
        "=" * 60,
        "CHARGESHIELD RAG RETRIEVAL",
        "==========================",
        "",
        f"Query Case: {case_label}",
        "",
        "## Top Relevant Historical Cases",
        ""
    ]

    if not retrieved_cases:
        lines.append("No relevant historical cases found in FAISS index.")
    else:
        for idx, case in enumerate(retrieved_cases, start=1):
            c_id = case.get("transaction_id", case.get("case_id", "Unknown"))
            sim_score = case.get("similarity_score", 0.0)
            risk_score = case.get("risk_score", 0.0)
            fraud_prob = case.get("fraud_probability", 0.0)
            action = case.get("recommended_action", "UNKNOWN")

            lines.append(f"{idx}. Case ID: {c_id}")
            lines.append(f"   Similarity Score: {sim_score:.2f}")
            lines.append(f"   Risk Score: {risk_score:.2f}")
            lines.append(f"   Fraud Probability: {fraud_prob * 100:.2f}%")
            lines.append(f"   Recommended Action: {action}")
            lines.append("")

    lines.append("=" * 60)
    lines.append("")
    lines.append("# RAG RETRIEVAL COMPLETED")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="ChargeShield FAISS + RAG Investigation Knowledge System"
    )
    parser.add_argument(
        "--build-index",
        action="store_true",
        help="Build FAISS vector index from all existing investigation reports."
    )
    parser.add_argument(
        "--case",
        type=str,
        help="Path to an investigation report (case_*.json or case_*.txt) to query."
    )
    parser.add_argument(
        "--transaction-id",
        type=int,
        help="Transaction ID to query against the FAISS index."
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=5,
        help="Number of most similar historical cases to retrieve (default: 5)."
    )
    parser.add_argument(
        "--reports-dir",
        type=str,
        default=REPORT_DIR,
        help="Directory containing investigation reports (default: reports/)."
    )
    parser.add_argument(
        "--index-dir",
        type=str,
        default=DEFAULT_INDEX_DIR,
        help="Directory to save/load FAISS index and metadata (default: reports/faiss_index/)."
    )
    parser.add_argument(
        "--model-name",
        type=str,
        default=DEFAULT_MODEL_NAME,
        help="Sentence Transformer model name (default: sentence-transformers/all-MiniLM-L6-v2)."
    )

    args = parser.parse_args()

    if args.build_index:
        try:
            build_faiss_index(
                reports_dir=args.reports_dir,
                index_dir=args.index_dir,
                model_name=args.model_name
            )
        except Exception as e:
            print(f"[ERROR] Index building failed: {e}", file=sys.stderr)
            sys.exit(1)
        return

    if args.case:
        try:
            case_path = args.case
            query_label = os.path.splitext(os.path.basename(case_path))[0]

            retriever = ChargeShieldRAGRetriever(
                index_dir=args.index_dir,
                model_name=args.model_name
            )

            query_case, retrieved = retriever.retrieve_by_case(case_path, top_k=args.top_k)
            output = format_retrieval_output(query_case, retrieved, query_name=query_label)
            print(output)

            # Investigator RAG Context synthesis
            print("\n" + retriever.generate_rag_context_explanation(query_case, retrieved))

        except Exception as e:
            print(f"[ERROR] RAG retrieval failed: {e}", file=sys.stderr)
            sys.exit(1)
        return

    if args.transaction_id:
        try:
            # Check if case file exists in reports_dir
            json_file = os.path.join(args.reports_dir, f"case_{args.transaction_id}.json")
            txt_file = os.path.join(args.reports_dir, f"case_{args.transaction_id}.txt")

            case_path = None
            if os.path.exists(json_file):
                case_path = json_file
            elif os.path.exists(txt_file):
                case_path = txt_file
            else:
                # Attempt to retrieve from index metadata if already indexed
                retriever = ChargeShieldRAGRetriever(
                    index_dir=args.index_dir,
                    model_name=args.model_name
                )
                retriever._ensure_loaded()
                matched_meta = next(
                    (m for m in retriever._metadata if m.get("transaction_id") == args.transaction_id),
                    None
                )
                if matched_meta:
                    query_case, retrieved = retriever.retrieve_by_case(matched_meta, top_k=args.top_k)
                    output = format_retrieval_output(query_case, retrieved, query_name=f"case_{args.transaction_id}")
                    print(output)
                    print("\n" + retriever.generate_rag_context_explanation(query_case, retrieved))
                    return
                else:
                    raise FileNotFoundError(
                        f"No case file found for transaction {args.transaction_id} in '{args.reports_dir}' "
                        f"and not found in FAISS index metadata."
                    )

            retriever = ChargeShieldRAGRetriever(
                index_dir=args.index_dir,
                model_name=args.model_name
            )
            query_case, retrieved = retriever.retrieve_by_case(case_path, top_k=args.top_k)
            output = format_retrieval_output(query_case, retrieved, query_name=f"case_{args.transaction_id}")
            print(output)
            print("\n" + retriever.generate_rag_context_explanation(query_case, retrieved))

        except Exception as e:
            print(f"[ERROR] RAG retrieval failed: {e}", file=sys.stderr)
            sys.exit(1)
        return

    # If no arguments provided
    print("ChargeShield FAISS + RAG Investigation System")
    print("=" * 60)
    print("Usage:")
    print("  python src\\rag_engine.py --build-index")
    print("  python src\\rag_engine.py --case reports\\case_3388943.json --top-k 5")
    print("  python src\\rag_engine.py --transaction-id 3388943 --top-k 5")
    print("=" * 60)


if __name__ == "__main__":
    main()
