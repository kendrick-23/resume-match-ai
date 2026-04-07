"""
Job-specific gap analysis using Claude Haiku.

For Within Reach jobs (50-69%), asks Haiku to identify 2-3 specific
skills or qualifications the job requires that the candidate lacks.
"""

import asyncio
import json
import os
import time
from typing import Optional

import anthropic

from app.services.token_budget import check_budget, estimate_tokens

_semaphore = asyncio.Semaphore(5)
_gap_cache: dict[str, tuple[float, list]] = {}
_CACHE_TTL = 86400  # 24 hours

HAIKU_MODEL = "claude-haiku-4-5-20251001"


async def get_job_specific_gaps(
    job: dict,
    user_skills: list[str],
) -> list[str]:
    """Return 2-3 specific skill gaps for this job vs the candidate."""
    title = job.get("title") or ""
    company = job.get("company") or ""
    cache_key = f"gaps:{title.lower()}:{company.lower()}"

    if cache_key in _gap_cache:
        ts, cached = _gap_cache[cache_key]
        if time.time() - ts < _CACHE_TTL:
            return cached

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return []

    skills_str = ", ".join(user_skills[:10]) if user_skills else "operations, management, leadership"
    desc = (job.get("description") or "")[:400]

    prompt = (
        f"Job: {title} at {company}\n"
        f"Description: {desc}\n\n"
        f"Candidate skills: {skills_str}\n\n"
        "List exactly 2-3 specific skills or qualifications this job "
        "requires that the candidate is clearly missing. "
        "Be specific and actionable (e.g. \"QuickBooks experience\", "
        "\"multi-site management\", \"P&L ownership\").\n"
        "Do NOT list skills the candidate already has.\n"
        "Do NOT list generic words like \"experience\" or \"skills\".\n"
        "Return as a JSON array of short strings (max 6 words each).\n"
        "Return ONLY the JSON array, nothing else."
    )

    if not check_budget(estimate_tokens(prompt)):
        return []

    async with _semaphore:
        try:
            client = anthropic.AsyncAnthropic(api_key=api_key)
            response = await client.messages.create(
                model=HAIKU_MODEL,
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            gaps = json.loads(text)
            if isinstance(gaps, list):
                result = [g for g in gaps if isinstance(g, str) and len(g) > 3][:3]
                _gap_cache[cache_key] = (time.time(), result)
                return result
        except Exception as exc:
            print(f"[GapAnalyzer] Failed for '{title}': {exc}")
    return []


async def analyze_gaps_batch(
    jobs: list,
    user_skills: list[str],
) -> None:
    """Run gap analysis on Within Reach jobs (50-69%) in parallel."""
    within_reach = [
        j for j in jobs
        if j.get("holt_score") is not None
        and 50 <= j["holt_score"] <= 69
        and not j.get("domain_penalized")
        and j.get("coaching_label") != "Different specialization"
    ]

    if not within_reach:
        return

    async def _analyze_one(job):
        async with _semaphore:
            gaps = await get_job_specific_gaps(job, user_skills)
            if gaps:
                formatted = [f"This role wants {g} \u2014 not in your skills yet" for g in gaps]
                job["holt_breakdown"]["job_specific_gaps"] = formatted

    await asyncio.gather(*[_analyze_one(j) for j in within_reach])
