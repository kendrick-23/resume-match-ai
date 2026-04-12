"""
Batch semantic scoring using the Anthropic Message Batch API.

Submits all eligible jobs in a single batch request — no rate limits,
50% cost reduction over individual calls. Latency is 1-5 minutes
(acceptable because results are cached 4h in Supabase).

Uses the same prompt, tool schema, server-side caps, and domain gate
as semantic_score.py to ensure identical scoring behavior.
"""

import asyncio
import json
import time
from typing import Optional

from app.clients import async_client as anthropic_async
from app.logger import logger
from app.services.token_budget import check_budget, estimate_tokens
from app.services.semantic_score import (
    HAIKU_MODEL,
    SEMANTIC_SCORE_TOOL,
    RELEVANT_TITLE_WORDS,
    _is_relevant_title,
    _build_candidate_summary,
    _semantic_cache,
    _CACHE_TTL,
)

# ---------------------------------------------------------------------------
# Prompt builder — reuses the candidate summary from semantic_score.py
# ---------------------------------------------------------------------------

def _build_prompt(job: dict, profile: dict) -> str:
    """Build the lite scoring prompt for one job. Same as semantic_score.py."""
    candidate = _build_candidate_summary(profile)
    j_title = job.get("title") or ""
    j_company = job.get("company") or ""
    j_desc = (job.get("description") or "")[:800]

    sal_parts = []
    if job.get("salary_min"):
        sal_parts.append(f"${job['salary_min']:,}")
    if job.get("salary_max"):
        sal_parts.append(f"${job['salary_max']:,}")
    j_sal = "-".join(sal_parts) or "unlisted"

    return f"""Score candidate-job fit 0-100 and domain alignment 0-100.

Candidate:
{candidate}

Job: {j_title} at {j_company}, {j_sal}
{j_desc}

Scoring guide:
STRONG MATCH (80-95): Job title directly matches or is semantically equivalent to a target role. Role is in hospitality, retail, food service, corporate operations, or training & development. Candidate's ops/training experience directly transfers.
MODERATE MATCH (60-79): Adjacent domain where ops/training skills transfer with some gap. Title is a stretch up (Director) or slight step sideways (Supervisor).
WEAK MATCH (below 45): Role requires specialized credentials the candidate lacks (clinical, construction trades, emergency services, insurance sales). Title is clearly outside operations/training/compliance.

Rules:
- Score only role fit, NOT company prestige.
- Seniority: if the job is coordinator/specialist/associate level and the candidate is currently a manager/AGM, cap the score at 55.
- Domain alignment HIGH (70+): operations, training, compliance, hospitality/retail management, government services.
- Domain alignment LOW (<30): clinical medical, construction trades, pure sales/marketing, defense/military, emergency services, licensed professions.
- Cite specific text in reasoning.

Submit via the submit_score tool."""


def _make_custom_id(job: dict, idx: int) -> str:
    """Unique ID for each job in the batch. Uses index as fallback."""
    job_id = job.get("id") or f"{idx}"
    return f"job_{job_id}"


# ---------------------------------------------------------------------------
# Server-side caps and domain gate — identical to semantic_score.py
# ---------------------------------------------------------------------------

_CONSTRUCTION_COMPANIES = (
    "wharton smith", "hoar", "skanska", "turner construction",
    "suffolk", "brasfield", "hensel phelps", "toll brothers",
    "pulte", "dr horton", "lennar", "kb home",
)

_JUNIOR_SIGNALS = ("coordinator", "specialist", "associate")
_SENIOR_SIGNALS = ("manager", "supervisor", "director", "general manager")


def _apply_gates(result: dict, job: dict, profile: dict) -> dict:
    """Apply server-side caps, seniority cap, and domain gate to a raw result.
    Mutates and returns result."""
    title_lower = (job.get("title") or "").lower()
    company_lower = (job.get("company") or "").lower()
    desc_lower = (job.get("description") or "")[:800].lower()

    # Construction companies
    if any(cc in company_lower for cc in _CONSTRUCTION_COMPANIES):
        result["domain_alignment"] = min(result["domain_alignment"], 30)

    # Marketing titles
    if "marketing manager" in title_lower or "marketing coordinator" in title_lower:
        result["domain_alignment"] = min(result["domain_alignment"], 30)

    # Development review
    if "development review" in title_lower:
        result["domain_alignment"] = min(result["domain_alignment"], 30)

    # Financial services in emergency context
    if "financial services" in title_lower and any(
        sig in desc_lower for sig in ("fire rescue", "ems", "emergency")
    ):
        result["domain_alignment"] = min(result["domain_alignment"], 35)

    # Seniority cap
    current_title = (profile.get("job_title") or "").lower()
    if any(s in title_lower for s in _JUNIOR_SIGNALS) and any(s in current_title for s in _SENIOR_SIGNALS):
        result["score"] = min(result["score"], 55)

    # Domain gate
    da = result["domain_alignment"]
    if da < 45:
        result["score"] = min(result["score"], 25)
    elif da < 60:
        result["score"] = min(result["score"], 58)

    return result


def _parse_tool_result(content_blocks) -> Optional[dict]:
    """Extract score + domain_alignment from a Haiku response."""
    for block in content_blocks:
        if getattr(block, "type", None) == "tool_use" and block.name == "submit_score":
            raw = block.input
            if "score" not in raw or not isinstance(raw["score"], (int, float)):
                return None
            result = {
                "score": max(0, min(100, int(raw["score"]))),
                "reasoning": raw.get("reasoning", ""),
            }
            da = raw.get("domain_alignment")
            result["domain_alignment"] = max(0, min(100, int(da))) if isinstance(da, (int, float)) else 50
            return result
    return None


# ---------------------------------------------------------------------------
# Batch API: submit → poll → apply
# ---------------------------------------------------------------------------

async def submit_scoring_batch(
    jobs: list[dict], profile: dict, user_id: str
) -> Optional[str]:
    """Submit all jobs to the Batch API. Returns batch_id or None on failure."""
    requests = []
    for idx, job in enumerate(jobs):
        prompt = _build_prompt(job, profile)
        if not check_budget(estimate_tokens(prompt)):
            logger.warning("[BatchScorer] Token budget exhausted — stopping batch build")
            break
        requests.append({
            "custom_id": _make_custom_id(job, idx),
            "params": {
                "model": HAIKU_MODEL,
                "max_tokens": 150,
                "tools": [SEMANTIC_SCORE_TOOL],
                "tool_choice": {"type": "tool", "name": "submit_score"},
                "messages": [{"role": "user", "content": prompt}],
            },
        })

    if not requests:
        return None

    try:
        batch = await anthropic_async.messages.batches.create(requests=requests)
        logger.info(f"[BatchScorer] Batch submitted: {batch.id} ({len(requests)} jobs)")
        return batch.id
    except Exception as exc:
        logger.error(f"[BatchScorer] Failed to submit batch: {exc}", exc_info=True)
        return None


async def poll_batch_until_done(
    batch_id: str,
    poll_interval: int = 10,
    max_wait: int = 300,
) -> dict[str, dict]:
    """Poll until batch status == 'ended'. Returns {custom_id: result_dict}.

    Raises asyncio.TimeoutError if max_wait exceeded.
    """
    start = time.time()
    while True:
        elapsed = time.time() - start
        if elapsed > max_wait:
            raise asyncio.TimeoutError(
                f"Batch {batch_id} not done after {max_wait}s"
            )

        try:
            batch = await anthropic_async.messages.batches.retrieve(batch_id)
        except Exception as exc:
            logger.error(f"[BatchScorer] Poll failed: {exc}")
            await asyncio.sleep(poll_interval)
            continue

        status = batch.processing_status
        logger.debug(
            f"[BatchScorer] Batch {batch_id}: {status} "
            f"({elapsed:.0f}s elapsed)"
        )

        if status == "ended":
            break

        await asyncio.sleep(poll_interval)

    # Collect results
    results: dict[str, dict] = {}
    try:
        results_stream = await anthropic_async.messages.batches.results(batch_id)
        async for result in results_stream:
            cid = result.custom_id
            if result.result.type == "succeeded":
                parsed = _parse_tool_result(result.result.message.content)
                if parsed:
                    results[cid] = parsed
            else:
                logger.warning(f"[BatchScorer] {cid} failed: {result.result.type}")
    except Exception as exc:
        logger.error(f"[BatchScorer] Failed to read results: {exc}", exc_info=True)

    logger.info(f"[BatchScorer] Batch {batch_id} done: {len(results)} results collected")
    return results


async def apply_batch_scores(
    jobs: list[dict],
    batch_results: dict[str, dict],
    profile: dict,
    user_id: str,
) -> list[dict]:
    """Apply batch scores with same gate logic as semantic_score.py.

    Blends: final = keyword * 0.3 + semantic * 0.7
    Falls back to keyword score if no batch result for a job.
    """
    for idx, job in enumerate(jobs):
        cid = _make_custom_id(job, idx)
        result = batch_results.get(cid)
        if result is None:
            continue

        # Apply gates (domain caps, seniority, domain gate)
        result = _apply_gates(result, job, profile)

        # Blend with keyword score
        keyword_score = job["holt_score"]
        sem_score = result["score"]
        blended = round(keyword_score * 0.3 + sem_score * 0.7)
        job["holt_score"] = max(0, min(100, blended))

        job["holt_breakdown"]["semantic_score"] = sem_score
        job["holt_breakdown"]["semantic_domain_alignment"] = result.get("domain_alignment")
        job["holt_breakdown"]["reasoning"] = result.get("reasoning", "")

        # Coaching label
        if sem_score >= 80:
            job["coaching_label"] = "Strong match — Ott recommends applying"
        elif sem_score >= 70:
            job["coaching_label"] = "Good match — worth a closer look"
        elif sem_score >= 55:
            job["coaching_label"] = "Within Reach — close your skills gap"
        elif result.get("domain_alignment", 50) < 25:
            job["coaching_label"] = "Different specialization"
        else:
            job["coaching_label"] = "Growth opportunity"

        # Write to in-memory cache (same key format as semantic_score.py)
        job_id = job.get("id") or f"{job.get('title', '')}:{job.get('company', '')}"
        cache_key = f"lite_v1:{job_id}:{user_id}"
        _semantic_cache[cache_key] = (time.time(), result)

    return jobs


# ---------------------------------------------------------------------------
# Main entry point — called from _score_jobs() in jobs.py
# ---------------------------------------------------------------------------

async def batch_semantic_rescore(
    jobs: list[dict], profile: dict, user_id: str
) -> list[dict]:
    """Score eligible jobs via the Batch API. Full pipeline:
    submit → poll → apply gates → blend → update coaching labels.

    Falls back gracefully to keyword-only scores on any failure.
    """
    # Filter eligible jobs (same criteria as semantic_score.py)
    eligible = [
        j for j in jobs
        if j.get("holt_score", 0) >= 55
        and not j.get("domain_penalized")
        and j.get("coaching_label") != "Different specialization"
        and _is_relevant_title(j.get("title") or "")
    ]

    if not eligible:
        logger.info("[BatchScorer] No eligible jobs for semantic scoring")
        return jobs

    # Check in-memory cache — skip jobs already scored
    uncached = []
    cached_results: dict[str, dict] = {}
    for idx, job in enumerate(eligible):
        job_id = job.get("id") or f"{job.get('title', '')}:{job.get('company', '')}"
        cache_key = f"lite_v1:{job_id}:{user_id}"
        if cache_key in _semantic_cache:
            ts, cached = _semantic_cache[cache_key]
            if time.time() - ts < _CACHE_TTL:
                cached_results[_make_custom_id(job, jobs.index(job))] = cached
                continue
        uncached.append(job)

    if cached_results:
        logger.info(f"[BatchScorer] {len(cached_results)} jobs served from cache")
        await apply_batch_scores(jobs, cached_results, profile, user_id)

    if not uncached:
        return jobs

    logger.info(f"[BatchScorer] Submitting {len(uncached)} uncached jobs to Batch API")

    # Build a temporary list mapping for uncached jobs
    batch_id = await submit_scoring_batch(uncached, profile, user_id)
    if batch_id is None:
        logger.warning("[BatchScorer] Batch submission failed — using keyword scores")
        return jobs

    try:
        batch_results = await poll_batch_until_done(batch_id, poll_interval=10, max_wait=300)
    except asyncio.TimeoutError:
        logger.warning(f"[BatchScorer] Batch {batch_id} timed out after 5 min — using keyword scores")
        return jobs
    except Exception as exc:
        logger.error(f"[BatchScorer] Polling failed: {exc} — using keyword scores")
        return jobs

    # Map batch results back — uncached jobs use their own indices
    uncached_results: dict[str, dict] = {}
    for idx, job in enumerate(uncached):
        cid = _make_custom_id(job, idx)
        if cid in batch_results:
            # Remap to the index in the full jobs list
            full_idx = jobs.index(job)
            full_cid = _make_custom_id(job, full_idx)
            uncached_results[full_cid] = batch_results[cid]

    if uncached_results:
        await apply_batch_scores(jobs, uncached_results, profile, user_id)

    return jobs
