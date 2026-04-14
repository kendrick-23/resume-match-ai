"""
local_scorer.py — Fast hybrid scoring using BM25 + MiniLM embeddings.
No API calls. No cost. Results in <500ms for 200 jobs.
Runs on CPU (Apple Silicon compatible, no MPS needed for this model size).
"""

import os
import logging
import time
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

logger = logging.getLogger("holt")

# Force CPU — fast enough for 200 docs, avoids Apple Silicon MPS fallback issues
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

# Load model once at module level — cached in memory for the lifetime of the process
# Downloads ~90MB on first run, then cached in ~/.cache/huggingface/
_MODEL = None


def get_model() -> SentenceTransformer:
    global _MODEL
    if _MODEL is None:
        logger.info("[LocalScorer] Loading all-MiniLM-L6-v2 (first load ~5s, then cached)")
        _MODEL = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
        logger.info("[LocalScorer] Model loaded and ready")
    return _MODEL


# Nicole's profile keywords for BM25 (hard-coded for her profile)
# These are the terms BM25 uses to find keyword matches in job descriptions
NICOLE_BM25_KEYWORDS = [
    "operations", "manager", "training", "assistant", "general", "manager",
    "team", "leadership", "staff", "scheduling", "inventory", "compliance",
    "customer", "experience", "vendor", "onboarding", "workforce", "development",
    "restaurant", "hospitality", "food", "service", "P&L", "budget",
    "coordinator", "supervisor", "process", "improvement", "KPI",
]

# Nicole's profile text for semantic embedding
# This is what MiniLM compares every job description against
NICOLE_PROFILE_TEXT = (
    "Assistant General Manager with 4 years experience at Wawa convenience store. "
    "Operations Manager and Training Manager skills. Team leadership, staff scheduling, "
    "inventory management, P&L oversight, customer experience, vendor coordination, "
    "compliance management, food safety, employee onboarding, workforce development, "
    "performance management, multi-unit coordination, SOP development. "
    "Seeking Operations Manager, Training Manager, or Compliance Coordinator role "
    "paying $75,000 to $85,000 in Casselberry Florida area, Monday through Friday schedule."
)

# Cache Nicole's embedding — computed once per process startup
_NICOLE_EMBEDDING = None


def get_nicole_embedding() -> np.ndarray:
    global _NICOLE_EMBEDDING
    if _NICOLE_EMBEDDING is None:
        model = get_model()
        _NICOLE_EMBEDDING = model.encode(
            NICOLE_PROFILE_TEXT,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        logger.info("[LocalScorer] Nicole's profile embedding cached")
    return _NICOLE_EMBEDDING


def _reciprocal_rank_fusion(rankings: list[list[int]], k: int = 60) -> dict[int, float]:
    """
    Combine multiple ranked lists using RRF formula: score = sum 1/(k + rank)
    Higher k = more gradual falloff, k=60 is empirically optimal per research.
    Returns: dict mapping job index -> combined RRF score
    """
    scores: dict[int, float] = {}
    for ranking in rankings:
        for rank, idx in enumerate(ranking, start=1):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank)
    return scores


def detect_search_mode(query: str) -> str:
    """
    Detect whether a keyword query is a company search or role search.
    Company search: short query with no role signals (e.g. "disney", "advent health")
    Role search: contains role keywords (e.g. "training manager", "operations coordinator")
    """
    if not query:
        return "profile"

    q = query.lower().strip()
    words = q.split()

    ROLE_SIGNALS = [
        "manager", "director", "coordinator", "supervisor", "specialist",
        "analyst", "trainer", "officer", "associate", "lead", "head",
        "executive", "administrator", "representative", "consultant",
        "engineer", "developer", "designer", "technician", "nurse",
        "operations", "training", "compliance", "hr", "human resources",
    ]

    has_role_signal = any(r in q for r in ROLE_SIGNALS)

    # 1-2 word query with no role signal = company search
    if len(words) <= 2 and not has_role_signal:
        return "company"

    return "role"


def hybrid_score_jobs(
    jobs: list[dict],
    profile_keywords: list[str] | None = None,
    mode: str = "profile",
) -> list[dict]:
    """
    Score jobs using BM25 + MiniLM embeddings combined with Reciprocal Rank Fusion.

    Returns jobs with 'local_score' field added (0-100 scale).
    Jobs are NOT reordered — caller handles sorting.

    Speed: ~200ms for 200 jobs including embedding generation.
    Cost: $0 — fully local.
    """
    if not jobs:
        return jobs

    start = time.time()
    model = get_model()
    nicole_embedding = get_nicole_embedding()
    keywords = profile_keywords or NICOLE_BM25_KEYWORDS

    # Build job text for each job (title + company + first 400 chars of description)
    job_texts = []
    for j in jobs:
        title = j.get("title", "")
        company = j.get("company", "")
        description = (j.get("description") or "")[:400]
        job_texts.append(f"{title} {company} {description}")

    # --- BM25 SCORING ---
    # Tokenize corpus
    tokenized_corpus = [text.lower().split() for text in job_texts]
    bm25 = BM25Okapi(tokenized_corpus)
    bm25_scores = bm25.get_scores(keywords)
    # Rank indices by BM25 score descending
    bm25_ranking = np.argsort(bm25_scores)[::-1].tolist()

    # --- SEMANTIC SCORING (MiniLM) ---
    # Encode all job texts in one batch — fast on M-series CPU
    job_embeddings = model.encode(
        job_texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        batch_size=64,
        show_progress_bar=False,
    )
    # Cosine similarity = dot product since both are normalized
    semantic_scores = np.dot(job_embeddings, nicole_embedding)
    # Rank indices by semantic score descending
    semantic_ranking = np.argsort(semantic_scores)[::-1].tolist()

    # --- RRF FUSION ---
    rrf_scores = _reciprocal_rank_fusion([bm25_ranking, semantic_ranking])

    # Normalize RRF scores to 0-100 range
    if rrf_scores:
        max_rrf = max(rrf_scores.values())
        min_rrf = min(rrf_scores.values())
        rrf_range = max_rrf - min_rrf if max_rrf != min_rrf else 1.0
    else:
        min_rrf = 0.0
        rrf_range = 1.0

    for i, job in enumerate(jobs):
        rrf_raw = rrf_scores.get(i, 0.0)
        # Normalize to 0-100, then scale: top jobs should be in 70-90 range
        normalized = (rrf_raw - min_rrf) / rrf_range if rrf_scores else 0.0
        # Scale to realistic score range (40-90) — not all 100s, not all 0s
        job["local_score"] = round(40 + (normalized * 50), 1)
        job["local_bm25_score"] = float(bm25_scores[i])
        job["local_semantic_score"] = float(semantic_scores[i])

    elapsed_ms = (time.time() - start) * 1000
    logger.info(f"[LocalScorer] Scored {len(jobs)} jobs in {elapsed_ms:.0f}ms")

    return jobs


def warmup():
    """Pre-load model and compute Nicole's embedding. Call at startup."""
    start = time.time()
    model = get_model()
    _ = get_nicole_embedding()

    # Benchmark: encode 10 test sentences
    test_sentences = [
        "Operations Manager at Walt Disney World",
        "Training Coordinator at AdventHealth",
        "Compliance Specialist at Lockheed Martin",
        "Registered Nurse ICU at Orlando Health",
        "Truck Driver CDL Class A at Schneider",
        "Assistant Store Manager at Target",
        "HR Coordinator at Marriott International",
        "Branch Manager at Enterprise Holdings",
        "Linen Bagger at Clean Sweep Linen",
        "Director of Operations at Aramark",
    ]
    bench_start = time.time()
    model.encode(test_sentences, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
    bench_ms = (time.time() - bench_start) * 1000

    total_ms = (time.time() - start) * 1000
    logger.info(
        f"[LocalScorer] Warmup complete: model load + embedding in {total_ms:.0f}ms, "
        f"10-sentence benchmark: {bench_ms:.0f}ms"
    )
