import asyncio
import json
import os
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from typing import Optional
from supabase import create_client

from app.main import limiter, get_current_user
from app.services.usajobs import search_usajobs
from app.services.adzuna import search_adzuna_jobs
from app.services.jobspy_service import search_jobspy
from app.services.holt_score import calculate_holt_score

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _user_sb(user: dict):
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


def _score_jobs(jobs: list, user: dict) -> list:
    """Score a list of jobs using the 6-dimension Holt Score engine."""
    try:
        sb = _user_sb(user)
        profile_res = sb.table("profiles").select("*").eq("id", user["user_id"]).execute()
        profile = profile_res.data[0] if profile_res.data else {}

        analysis_res = sb.table("analyses").select("strengths,gaps,skills_match") \
            .eq("user_id", user["user_id"]) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        resume_skills = profile.get("skills_extracted") or []
        if isinstance(resume_skills, str):
            resume_skills = json.loads(resume_skills)
        analysis_gaps = []
        if analysis_res.data:
            latest = analysis_res.data[0]
            raw_gaps = latest.get("gaps", "[]")
            analysis_gaps = json.loads(raw_gaps) if isinstance(raw_gaps, str) else raw_gaps or []
    except Exception as exc:
        print(f"[HoltScore] Profile/analysis fetch failed: {exc}")
        profile, resume_skills, analysis_gaps = {}, [], []

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
        scored = _score_jobs(results.get("jobs", []), user)
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
        scored = _score_jobs(results.get("jobs", []), user)
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
        unique_jobs = _score_jobs(unique_jobs, user)

        # Sort by Holt Score descending (best matches first)
        unique_jobs.sort(key=lambda j: j.get("holt_score", 0), reverse=True)

        return {"total": len(unique_jobs), "jobs": unique_jobs}

    except Exception as e:
        print(f"[/jobs/aggregated] Error: {e}")
        return {"total": 0, "jobs": []}
