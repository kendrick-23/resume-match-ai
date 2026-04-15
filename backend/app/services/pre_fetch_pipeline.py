"""Background pre-fetch pipeline for profile match job recommendations.

Phase 1 (this file): fetch → keyword score → local score.
Phase 2 (E2-2, not yet built): Haiku batch refinement.

Runs as an asyncio background task with no HTTP request context — uses the
service-role Supabase client for profile/analysis reads.
"""

import asyncio
import json
import time
from typing import Optional

from app.constants.scoring import DOMAIN_PENALTY_CAP, SALARY_FLOOR_CAP
from app.logger import logger
from app.services.prefetch_store import (
    _service_client,
    is_prefetch_running,
    set_prefetch_running,
    upsert_prefetched_jobs,
)
from app.services.usajobs import search_usajobs
from app.services.adzuna import search_adzuna_jobs
from app.services.jobspy_service import search_jobspy
from app.services.jooble import search_jooble
from app.services.holt_score import calculate_holt_score
from app.services.local_scorer import hybrid_score_jobs

# Mirror of ROLE_SYNONYMS in frontend/src/screens/Jobs.jsx.
# TODO: move to a shared source once we stop duplicating across backend/frontend.
ROLE_SYNONYMS: dict[str, list[str]] = {
    "operations manager": ["operations coordinator", "operations director", "business operations manager", "operations supervisor"],
    "operations coordinator": ["operations manager", "operations specialist", "administrative coordinator"],
    "training manager": ["training coordinator", "learning and development manager", "training specialist", "l&d manager"],
    "training coordinator": ["training manager", "training specialist", "learning and development coordinator"],
    "compliance coordinator": ["compliance manager", "compliance specialist", "regulatory coordinator", "quality assurance coordinator"],
    "compliance manager": ["compliance coordinator", "compliance specialist", "regulatory manager"],
    "office manager": ["administrative manager", "business operations manager", "office administrator"],
    "store manager": ["assistant store manager", "retail operations manager", "retail manager"],
    "assistant manager": ["shift manager", "team lead", "assistant store manager"],
    "facilities manager": ["facilities coordinator", "building operations manager"],
    "project manager": ["program manager", "project coordinator", "operations project manager"],
    "administrative manager": ["office manager", "administrative coordinator", "operations administrator"],
}


def _expand_queries_with_synonyms(roles: list[str], max_total: int = 6) -> list[str]:
    """Mirror of expandQueriesWithSynonyms in Jobs.jsx — primary roles first,
    then synonyms until max_total."""
    queries: list[str] = []
    seen: set[str] = set()
    for role in roles[:2]:
        low = role.lower().strip()
        if low and low not in seen:
            queries.append(role)
            seen.add(low)
    for role in roles[:2]:
        for syn in ROLE_SYNONYMS.get(role.lower().strip(), []):
            if len(queries) >= max_total:
                break
            if syn not in seen:
                queries.append(syn)
                seen.add(syn)
        if len(queries) >= max_total:
            break
    return queries


async def _fetch_from_all_sources(keyword: str, location: Optional[str]) -> list:
    """Fetch from all 4 sources in parallel for one keyword.
    Mirror of _fetch_for_keyword in routes/jobs.py. Per-source failures are logged
    and skipped — one bad source must never kill the pipeline."""
    results = await asyncio.gather(
        search_usajobs(keyword=keyword, location=location, remote=None),
        search_adzuna_jobs(keywords=keyword, location=location),
        search_jobspy(keywords=keyword, location=location or "Florida", results=15),
        search_jooble(keywords=keyword, location=location),
        return_exceptions=True,
    )
    jobs: list = []
    names = ("usajobs", "adzuna", "jobspy", "jooble")
    for idx, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning(f"[PreFetch] {names[idx]} fetch failed for '{keyword}': {r}")
            continue
        if isinstance(r, dict):
            jobs.extend(r.get("jobs", []))
    return jobs


async def _run_phase_1(user_id: str, start: float) -> None:
    """Body of phase 1. Split out so pre_fetch_pipeline can wrap it in wait_for."""
    # --- Profile + analysis load (service-role client — no JWT here) ---
    try:
        sb = _service_client()
        pr = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        profile = pr.data[0] if pr.data else {}
    except Exception as exc:
        logger.error(f"[PreFetch] profile fetch failed for {user_id[:8]}: {exc}", exc_info=True)
        return

    target_roles_raw = (profile.get("target_roles") or "").strip()
    if not profile or not target_roles_raw:
        logger.info(f"[PreFetch] skipped — no profile for {user_id[:8]}")
        return

    resume_skills = profile.get("skills_extracted") or []
    if isinstance(resume_skills, str):
        try:
            resume_skills = json.loads(resume_skills)
        except (json.JSONDecodeError, TypeError):
            resume_skills = []

    analysis_gaps: list = []
    try:
        ar = sb.table("analyses").select("gaps") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        if ar.data:
            raw_gaps = ar.data[0].get("gaps", "[]")
            analysis_gaps = json.loads(raw_gaps) if isinstance(raw_gaps, str) else (raw_gaps or [])
    except Exception as exc:
        logger.error(f"[PreFetch] analysis fetch failed for {user_id[:8]}: {exc}")

    roles = [r.strip() for r in target_roles_raw.split(",") if r.strip()]
    keywords = _expand_queries_with_synonyms(roles, max_total=6)
    if not keywords:
        logger.info(f"[PreFetch] skipped — no valid keywords for {user_id[:8]}")
        return

    location = (profile.get("location") or "").strip() or None
    logger.info(f"[PreFetch] fetching {len(keywords)} queries for {user_id[:8]}: {keywords}")

    # --- Phase 1a: parallel fetch across all keywords ---
    fetch_results = await asyncio.gather(
        *[_fetch_from_all_sources(kw, location) for kw in keywords],
        return_exceptions=True,
    )

    # --- Phase 1b: merge + global dedup (reuses routes/jobs helper) ---
    # Lazy import — routes/jobs imports from services/, so importing at module
    # top would create a reverse dependency.
    from app.routes.jobs import _normalize_dedup_key
    seen: set[str] = set()
    unique_jobs: list[dict] = []
    for r in fetch_results:
        if isinstance(r, Exception):
            logger.warning(f"[PreFetch] one fetch failed: {r}")
            continue
        for job in r:
            key = _normalize_dedup_key(
                job.get("title", ""),
                job.get("company", job.get("department", "")),
                job.get("location", ""),
            )
            if key not in seen:
                seen.add(key)
                unique_jobs.append(job)
    logger.info(f"[PreFetch] {len(unique_jobs)} unique jobs after dedup for {user_id[:8]}")

    # --- Phase 1c: keyword scoring (mirrors routes/jobs::_score_jobs step 3) ---
    # calculate_holt_score already sets dealbreaker_triggered based on profile
    # dealbreakers, so no separate pass is needed for flag #5's dealbreaker step.
    for job in unique_jobs:
        try:
            sd = calculate_holt_score(job, profile, resume_skills, analysis_gaps)
            job["holt_score"] = sd["total_score"]
            job["holt_breakdown"] = sd["breakdown"]
            job["coaching_label"] = sd["coaching_label"]
            job["degree_warning"] = sd["degree_warning"]
            job["dealbreaker_triggered"] = sd["dealbreaker_triggered"]
            job["is_target_company"] = sd["is_target_company"]
            job["domain_penalized"] = sd.get("domain_penalized", False)
            job["salary_floor_violation"] = sd.get("salary_floor_violation", False)
            job["salary_not_disclosed"] = sd.get("salary_not_disclosed", False)
        except Exception as exc:
            logger.error(f"[PreFetch] scoring failed for job {job.get('id', '?')}: {exc}")

    # --- Phase 1d: local hybrid scoring (BM25 + MiniLM, ~500ms, $0) ---
    try:
        hybrid_score_jobs(unique_jobs)
    except Exception as exc:
        logger.error(f"[PreFetch] local scorer failed: {exc}")

    # --- Phase 1e: final caps — mirror routes/jobs::_score_jobs steps 6-7 ---
    # Uses the same constants (DOMAIN_PENALTY_CAP=15, SALARY_FLOOR_CAP=25) so
    # the interim Supabase row is consistent with what the live pipeline would
    # produce for a Haiku-pending state. (Spec stated cap=40 for salary floor;
    # overridden to SALARY_FLOOR_CAP=25 to match the existing invariant.)
    for job in unique_jobs:
        if job.get("domain_penalized"):
            job["holt_score"] = min(job.get("holt_score", 0), DOMAIN_PENALTY_CAP)
            job["coaching_label"] = "Different specialization"
    for job in unique_jobs:
        if job.get("salary_floor_violation") and not job.get("domain_penalized"):
            job["holt_score"] = min(job.get("holt_score", 0), SALARY_FLOOR_CAP)
            job["coaching_label"] = "Below your salary range"

    # --- Phase 1f: write interim results; Haiku will upsert again in E2-2 ---
    if not upsert_prefetched_jobs(user_id, unique_jobs, haiku_complete=False):
        logger.error(f"[PreFetch] upsert failed for {user_id[:8]}")
        return

    elapsed_ms = int((time.time() - start) * 1000)
    logger.info(
        f"[PreFetch] phase 1 complete: {len(unique_jobs)} jobs scored for "
        f"{user_id[:8]} in {elapsed_ms}ms"
    )


async def pre_fetch_pipeline(user_id: str) -> None:
    """Phase-1 background pipeline: fetch + keyword score + local score.

    Writes interim results to prefetched_jobs with haiku_complete=False so the
    frontend can display fast local scores immediately. Haiku refinement is E2-2.
    """
    if is_prefetch_running(user_id):
        logger.info(f"[PreFetch] already running for {user_id[:8]}, skipping")
        return

    set_prefetch_running(user_id, True)
    start = time.time()
    try:
        try:
            await asyncio.wait_for(_run_phase_1(user_id, start), timeout=300.0)
        except asyncio.TimeoutError:
            logger.error(f"[PreFetch] timed out after 300s for {user_id[:8]}")
    except Exception as exc:
        logger.error(f"[PreFetch] pipeline error for {user_id[:8]}: {exc}", exc_info=True)
    finally:
        set_prefetch_running(user_id, False)
