import asyncio
import hashlib
import json
import os
import re
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query, Depends, Request, Body
from typing import Optional
from pydantic import BaseModel
from supabase import create_client

from app.main import limiter, get_current_user
from app.logger import logger
from app.constants.scoring import DOMAIN_PENALTY_CAP, SALARY_FLOOR_CAP, TIER_BREAKPOINTS
from app.services.token_budget import is_budget_exhausted
from app.services.usajobs import search_usajobs
from app.services.adzuna import search_adzuna_jobs
from app.services.jobspy_service import search_jobspy
from app.services.jooble import search_jooble
from app.services.holt_score import calculate_holt_score
from app.services.enrich import enrich_jobs_batch
from app.services.batch_scorer import batch_semantic_rescore
from app.services.gap_analyzer import analyze_gaps_batch

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _user_sb(user: dict):
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


async def _score_jobs(jobs: list, user: dict) -> list:
    """Enrich sparse descriptions then score using the 6-dimension Holt Score engine."""
    # Step 1: Enrich sparse job descriptions with Claude Haiku
    try:
        await enrich_jobs_batch(jobs)
    except Exception as exc:
        logger.error(f"[Enrich] Batch enrichment failed: {exc}")

    # Step 2: Fetch profile + analysis data with a SINGLE Supabase client
    profile = {}
    resume_skills = []
    analysis_gaps = []
    try:
        sb = _user_sb(user)
        profile_res = sb.table("profiles").select("*").eq("id", user["user_id"]).execute()
        profile = profile_res.data[0] if profile_res.data else {}

        resume_skills = profile.get("skills_extracted") or []
        if isinstance(resume_skills, str):
            try:
                resume_skills = json.loads(resume_skills)
            except (json.JSONDecodeError, TypeError):
                resume_skills = []

        analysis_res = sb.table("analyses").select("strengths,gaps,skills_match") \
            .eq("user_id", user["user_id"]) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        if analysis_res.data:
            latest = analysis_res.data[0]
            raw_gaps = latest.get("gaps", "[]")
            analysis_gaps = json.loads(raw_gaps) if isinstance(raw_gaps, str) else raw_gaps or []
    except Exception as exc:
        logger.error(f"[HoltScore] Profile/analysis fetch failed: {exc}")

    # Step 3: Score each job
    for job in jobs:
        try:
            score_data = calculate_holt_score(job, profile, resume_skills, analysis_gaps)
            job["holt_score"] = score_data["total_score"]
            job["holt_breakdown"] = score_data["breakdown"]
            job["coaching_label"] = score_data["coaching_label"]
            job["degree_warning"] = score_data["degree_warning"]
            job["dealbreaker_triggered"] = score_data["dealbreaker_triggered"]
            job["is_target_company"] = score_data["is_target_company"]
            job["domain_penalized"] = score_data.get("domain_penalized", False)
            job["salary_floor_violation"] = score_data.get("salary_floor_violation", False)
            job["salary_not_disclosed"] = score_data.get("salary_not_disclosed", False)
        except Exception as exc:
            logger.error(f"[HoltScore] Scoring failed for job {job.get('id', '?')}: {exc}")
            job["holt_score"] = 50
            job["holt_breakdown"] = {
                "skills_match": 50, "salary_alignment": 50, "schedule_fit": 50,
                "experience_match": 50, "location_fit": 50, "degree_flag": "none",
            }
            job["coaching_label"] = "Within Reach"
            job["degree_warning"] = False
            job["dealbreaker_triggered"] = False
            job["is_target_company"] = False
            job["domain_penalized"] = False
            job["salary_floor_violation"] = False
            job["salary_not_disclosed"] = False

    # Step 4: Semantic re-scoring via Batch API — no rate limits, 50% cost
    # reduction. Polls until results arrive (1-5 min). Falls back to
    # keyword-only scores on timeout or error.
    try:
        await batch_semantic_rescore(jobs, profile, user.get("user_id", ""))
    except Exception as exc:
        logger.error(f"[BatchScorer] Semantic re-scoring failed: {exc}")

    # Step 5: Claude-powered gap analysis — SKIP domain-penalized jobs entirely.
    # Pass target_roles so the gap analyzer knows what direction the candidate
    # is heading and doesn't flag misaligned skills as gaps.
    try:
        await analyze_gaps_batch(
            jobs, resume_skills,
            profile.get("target_roles") or "",
            profile.get("job_title") or "",
        )
    except Exception as exc:
        logger.error(f"[GapAnalyzer] Batch gap analysis failed: {exc}")

    # Step 6: FINAL domain penalty enforcement — 15% cap cannot be overridden.
    # This runs LAST so semantic re-scoring can never lift a domain-mismatched
    # job back into the visible buckets. Cap lowered from 28 → 15 so these
    # roles drop to the bottom of the list.
    for job in jobs:
        if job.get("domain_penalized"):
            job["holt_score"] = min(job["holt_score"], DOMAIN_PENALTY_CAP)
            job["coaching_label"] = "Different specialization"

    # Step 7: FINAL salary-floor enforcement — composite cap @ 25 for jobs that
    # pay > 25% below the seeker's stated minimum. Same architectural pattern as
    # the domain penalty: runs LAST so semantic re-scoring can never override.
    # Domain penalty wins ties (it's even more severe), so this only fires on
    # jobs that aren't already domain-capped at 15.
    for job in jobs:
        if job.get("salary_floor_violation") and not job.get("domain_penalized"):
            job["holt_score"] = min(job["holt_score"], SALARY_FLOOR_CAP)
            job["coaching_label"] = "Below your salary range"

    # Step 8: Hard exclusion for ALL dealbreaker-triggered jobs.
    # holt_score.py sets dealbreaker_triggered=True only when the user's
    # profile has the corresponding dealbreaker checked (below_salary,
    # outside_commute, hard_degree_required) AND the job violates it.
    # Filter server-side so these jobs never reach the frontend.
    jobs = [j for j in jobs if not j.get("dealbreaker_triggered")]

    return jobs


@router.get("/search")
@limiter.limit("30/hour")
async def search_jobs(
    request: Request,
    keyword: str = Query(..., min_length=1, max_length=200),
    location: Optional[str] = Query(default=None, max_length=200),
    salary_min: Optional[int] = Query(default=None, ge=0),
    salary_max: Optional[int] = Query(default=None, ge=0),
    remote: Optional[bool] = Query(default=None),
    page: int = Query(default=1, ge=1),
    user: dict = Depends(get_current_user),
):
    """Search for jobs via USAJobs API."""
    try:
        results = await search_usajobs(
            keyword=keyword,
            location=location,
            salary_min=salary_min,
            salary_max=salary_max,
            remote=remote,
            page=page,
        )
        try:
            scored = await asyncio.wait_for(
                _score_jobs(results.get("jobs", []), user),
                timeout=330.0,
            )
        except asyncio.TimeoutError:
            logger.warning("[/jobs/search] Scoring pipeline timed out after 330s")
            scored = results.get("jobs", [])
        scored.sort(key=lambda j: j.get("holt_score", 0), reverse=True)
        results["jobs"] = scored
        return results
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"USAJobs API error: {str(e)}")


@router.get("/adzuna")
@limiter.limit("30/hour")
async def search_adzuna(
    request: Request,
    keyword: str = Query(..., min_length=1, max_length=200),
    location: Optional[str] = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    user: dict = Depends(get_current_user),
):
    """Search for private sector jobs via Adzuna API."""
    try:
        results = await search_adzuna_jobs(
            keywords=keyword,
            location=location,
            page=page,
        )
        try:
            scored = await asyncio.wait_for(
                _score_jobs(results.get("jobs", []), user),
                timeout=330.0,
            )
        except asyncio.TimeoutError:
            logger.warning("[/jobs/adzuna] Scoring pipeline timed out after 330s")
            scored = results.get("jobs", [])
        scored.sort(key=lambda j: j.get("holt_score", 0), reverse=True)
        results["jobs"] = scored
        return results
    except Exception as e:
        logger.error(f"[/jobs/adzuna] Error: {e}", exc_info=True)
        return {"total": 0, "jobs": []}


@router.get("/aggregated")
@limiter.limit("20/hour")
async def search_aggregated(
    request: Request,
    keyword: str = Query(..., min_length=1, max_length=200),
    location: Optional[str] = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    user: dict = Depends(get_current_user),
):
    """Search multiple sources (JobSpy + Adzuna) in parallel and return unified results."""
    try:
        jobspy_result, adzuna_result = await asyncio.gather(
            search_jobspy(keywords=keyword, location=location, results=15),
            search_adzuna_jobs(keywords=keyword, location=location, page=page),
            return_exceptions=True,
        )

        all_jobs = []
        total = 0

        if isinstance(jobspy_result, dict):
            all_jobs.extend(jobspy_result.get("jobs", []))
            total += jobspy_result.get("total", 0)

        if isinstance(adzuna_result, dict):
            all_jobs.extend(adzuna_result.get("jobs", []))
            total += adzuna_result.get("total", 0)

        # Deduplicate by title+company (case-insensitive)
        seen = set()
        unique_jobs = []
        for job in all_jobs:
            key = (job.get("title", "").lower().strip(), job.get("company", "").lower().strip())
            if key not in seen:
                seen.add(key)
                unique_jobs.append(job)

        # Score all jobs with timeout
        try:
            unique_jobs = await asyncio.wait_for(
                _score_jobs(unique_jobs, user),
                timeout=330.0,
            )
        except asyncio.TimeoutError:
            logger.warning("[/jobs/aggregated] Scoring pipeline timed out after 330s")

        # Sort by Holt Score descending (best matches first)
        unique_jobs.sort(key=lambda j: j.get("holt_score", 0), reverse=True)

        return {"total": len(unique_jobs), "jobs": unique_jobs, "degraded": is_budget_exhausted()}

    except Exception as e:
        logger.error(f"[/jobs/aggregated] Error: {e}", exc_info=True)
        return {"total": 0, "jobs": [], "degraded": False}


_COMPANY_SUFFIXES = re.compile(
    r"\b(inc|llc|ltd|corp|corporation|company|co|group|holdings|services|solutions)\b\.?",
    re.IGNORECASE,
)


def _normalize_dedup_key(title: str, company: str, location: str) -> str:
    """Normalize (title, company, location) for cross-source deduplication."""
    t = (title or "").lower().strip()
    c = _COMPANY_SUFFIXES.sub("", (company or "").lower()).strip().rstrip(",. ")
    loc = (location or "").lower().strip()
    return f"{t}|{c}|{loc}"


@router.get("/unified")
@limiter.limit("20/hour")
async def search_unified(
    request: Request,
    keyword: str = Query(..., min_length=1, max_length=200),
    location: Optional[str] = Query(default=None, max_length=200),
    remote: Optional[bool] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    """Search all sources (USAJobs + Adzuna + JobSpy + Jooble) in parallel,
    deduplicate, score once, return a single sorted list."""
    try:
        usajobs_result, adzuna_result, jobspy_result, jooble_result = await asyncio.gather(
            search_usajobs(keyword=keyword, location=location, remote=remote),
            search_adzuna_jobs(keywords=keyword, location=location),
            search_jobspy(keywords=keyword, location=location or "Florida", results=15),
            search_jooble(keywords=keyword, location=location),
            return_exceptions=True,
        )

        all_jobs = []
        for result in (usajobs_result, adzuna_result, jobspy_result, jooble_result):
            if isinstance(result, dict):
                all_jobs.extend(result.get("jobs", []))

        # Deduplicate by normalized (title, company, location)
        seen: set[str] = set()
        unique_jobs = []
        for job in all_jobs:
            key = _normalize_dedup_key(
                job.get("title", ""),
                job.get("company", job.get("department", "")),
                job.get("location", ""),
            )
            if key not in seen:
                seen.add(key)
                unique_jobs.append(job)

        # Score all jobs with timeout
        try:
            unique_jobs = await asyncio.wait_for(
                _score_jobs(unique_jobs, user),
                timeout=330.0,
            )
        except asyncio.TimeoutError:
            logger.warning("[/jobs/unified] Scoring pipeline timed out after 330s")

        # Sort by Holt Score descending
        unique_jobs.sort(key=lambda j: j.get("holt_score", 0), reverse=True)

        return {
            "total": len(unique_jobs),
            "jobs": unique_jobs,
            "degraded": is_budget_exhausted(),
        }

    except Exception as e:
        logger.error(f"[/jobs/unified] Error: {e}", exc_info=True)
        return {"total": 0, "jobs": [], "degraded": False}


# --- Search result caching ---

def _make_cache_key(search_type: str, keywords: str = "", location: str = "") -> str:
    raw = f"{search_type}:{keywords}:{location}".lower().strip()
    return hashlib.md5(raw.encode()).hexdigest()


class CacheSaveBody(BaseModel):
    cache_key: str
    results: dict
    federal_count: int = 0
    private_count: int = 0


@router.get("/cache")
@limiter.limit("100/hour")
async def get_cached_search(
    request: Request,
    key: str = Query(..., min_length=1, max_length=64),
    user: dict = Depends(get_current_user),
):
    """Retrieve cached search results if not expired."""
    sb = _user_sb(user)

    # Clean up expired entries
    try:
        sb.table("job_search_cache") \
            .delete() \
            .eq("user_id", user["user_id"]) \
            .lt("expires_at", datetime.now(timezone.utc).isoformat()) \
            .execute()
    except Exception:
        pass

    res = sb.table("job_search_cache") \
        .select("*") \
        .eq("user_id", user["user_id"]) \
        .eq("cache_key", key) \
        .gte("expires_at", datetime.now(timezone.utc).isoformat()) \
        .limit(1) \
        .execute()

    if res.data:
        row = res.data[0]
        return {
            "cached": True,
            "results": row["results"],
            "federal_count": row.get("federal_count", 0),
            "private_count": row.get("private_count", 0),
            "cached_at": row["created_at"],
        }
    return {"cached": False}


@router.post("/cache")
@limiter.limit("30/hour")
async def save_search_cache(
    request: Request,
    body: CacheSaveBody,
    user: dict = Depends(get_current_user),
):
    """Cache search results with 4-hour expiry."""
    sb = _user_sb(user)
    expires = (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat()

    try:
        sb.table("job_search_cache") \
            .upsert({
                "user_id": user["user_id"],
                "cache_key": body.cache_key,
                "results": body.results,
                "federal_count": body.federal_count,
                "private_count": body.private_count,
                "expires_at": expires,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }) \
            .execute()
        return {"ok": True}
    except Exception as exc:
        logger.error(f"[Cache] Save failed: {exc}", exc_info=True)
        return {"ok": False}
