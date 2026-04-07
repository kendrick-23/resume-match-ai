import asyncio
import hashlib
import json
import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query, Depends, Request, Body
from typing import Optional
from pydantic import BaseModel
from supabase import create_client

from app.main import limiter, get_current_user
from app.services.usajobs import search_usajobs
from app.services.adzuna import search_adzuna_jobs
from app.services.jobspy_service import search_jobspy
from app.services.holt_score import calculate_holt_score
from app.services.enrich import enrich_jobs_batch
from app.services.semantic_score import semantic_rescore_batch
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
        print(f"[Enrich] Batch enrichment failed: {exc}")

    # Step 2: Fetch profile data
    profile = {}
    try:
        sb = _user_sb(user)
        profile_res = sb.table("profiles").select("*").eq("id", user["user_id"]).execute()
        profile = profile_res.data[0] if profile_res.data else {}
    except Exception as exc:
        print(f"[HoltScore] Profile fetch failed: {exc}")

    resume_skills = profile.get("skills_extracted") or []
    if isinstance(resume_skills, str):
        try:
            resume_skills = json.loads(resume_skills)
        except (json.JSONDecodeError, TypeError):
            resume_skills = []

    # Step 2b: Fetch analysis data (separate so analysis failure doesn't wipe profile)
    analysis_gaps = []
    try:
        sb = _user_sb(user)
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
        print(f"[HoltScore] Analysis fetch failed: {exc}")

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
        except Exception as exc:
            print(f"[HoltScore] Scoring failed for job {job.get('id', '?')}: {exc}")
            job["holt_score"] = 50
            job["holt_breakdown"] = {
                "skills_match": 50, "salary_alignment": 50, "schedule_fit": 50,
                "experience_match": 50, "location_fit": 50, "degree_flag": "none",
            }
            job["coaching_label"] = "Within Reach"
            job["degree_warning"] = False
            job["dealbreaker_triggered"] = False
            job["is_target_company"] = False

    # Step 4: Semantic re-scoring for top candidates (55%+ and not domain-penalized)
    try:
        await semantic_rescore_batch(jobs, profile, user.get("user_id", ""))
    except Exception as exc:
        print(f"[SemanticScore] Batch re-scoring failed: {exc}")

    # Step 5: Claude-powered gap analysis for Within Reach jobs (50-69%)
    try:
        await analyze_gaps_batch(jobs, resume_skills)
    except Exception as exc:
        print(f"[GapAnalyzer] Batch gap analysis failed: {exc}")

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
        scored = await _score_jobs(results.get("jobs", []), user)
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
        scored = await _score_jobs(results.get("jobs", []), user)
        scored.sort(key=lambda j: j.get("holt_score", 0), reverse=True)
        results["jobs"] = scored
        return results
    except Exception as e:
        print(f"[/jobs/adzuna] Error: {e}")
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

        # Score all jobs
        unique_jobs = await _score_jobs(unique_jobs, user)

        # Sort by Holt Score descending (best matches first)
        unique_jobs.sort(key=lambda j: j.get("holt_score", 0), reverse=True)

        return {"total": len(unique_jobs), "jobs": unique_jobs}

    except Exception as e:
        print(f"[/jobs/aggregated] Error: {e}")
        return {"total": 0, "jobs": []}


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
        print(f"[Cache] Save failed: {exc}")
        return {"ok": False}
