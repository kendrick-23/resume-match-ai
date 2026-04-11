"""
Semantic re-scoring using Claude Haiku.

For jobs scoring 55%+ on keyword matching (not domain-penalized),
Claude Haiku produces a semantic score that weights 70% in the final result.

Only runs on jobs with relevant titles to save API costs.
"""

import asyncio
import json
import time
from typing import Optional

from app.clients import async_client as anthropic_async
from app.logger import logger
from app.services.token_budget import check_budget, estimate_tokens

# Cache: cache_key → (timestamp, result_dict)
_semantic_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 86400  # 24 hours

_semaphore = asyncio.Semaphore(5)

HAIKU_MODEL = "claude-haiku-4-5-20251001"

SEMANTIC_SCORE_TOOL = {
    "name": "submit_score",
    "description": "Submit the candidate-job fit score.",
    "input_schema": {
        "type": "object",
        "properties": {
            "score": {"type": "integer", "description": "Overall fit score 0-100"},
            "skills_score": {"type": "integer", "description": "Skills alignment sub-score 0-100"},
            "career_score": {"type": "integer", "description": "Career trajectory sub-score 0-100"},
            "practical_score": {"type": "integer", "description": "Practical fit sub-score 0-100"},
            "reasoning": {"type": "string", "description": "1 sentence citing specific text from prompt"},
        },
        "required": ["score", "skills_score", "career_score", "practical_score", "reasoning"],
    },
}

# Same relevance filter as enrich.py
RELEVANT_TITLE_WORDS = {
    "manager", "director", "supervisor", "coordinator",
    "operations", "general", "assistant", "training",
    "compliance", "branch", "regional", "area", "store",
    "facility", "site", "district", "administrative",
    "lead", "head", "chief", "officer", "specialist",
}


def _is_relevant_title(title: str) -> bool:
    words = set(title.lower().split())
    return bool(words & RELEVANT_TITLE_WORDS)


def _build_candidate_section(profile: dict) -> str:
    """Build candidate section. Uses ALL extracted skills (not top 8) and a
    fuller about_me window — quality matters more than tokens here."""
    lines = []

    job_title = profile.get("job_title")
    if job_title:
        lines.append(f"Role: {job_title}")

    target_roles = profile.get("target_roles")
    if target_roles:
        lines.append(f"Targeting: {target_roles}")

    skills = profile.get("skills_extracted") or []
    if isinstance(skills, str):
        try:
            skills = json.loads(skills)
        except (json.JSONDecodeError, TypeError):
            skills = []
    if skills:
        # Send the FULL skill list — was previously truncated to 8.
        lines.append(f"Skills: {', '.join(skills)}")

    salary_min = profile.get("target_salary_min")
    salary_max = profile.get("target_salary_max")
    if salary_min and salary_max:
        lines.append(f"Salary: ${salary_min:,}-${salary_max:,}")

    location = profile.get("location")
    if location:
        lines.append(f"Location: {location}")

    schedule = profile.get("schedule_preference")
    if schedule:
        labels = {"monday_friday": "M-F only", "remote_only": "Remote", "any": "Any"}
        lines.append(f"Schedule: {labels.get(schedule, schedule)}")

    about_me = profile.get("about_me")
    if about_me:
        # Was [:150] — far too short for a real pivot story. Bumped to 400.
        lines.append(f"Background: {about_me[:400]}")

    return "\n".join(lines) if lines else "No profile data"


def _cache_key(job: dict, user_id: str) -> str:
    job_id = job.get("id") or f"{job.get('title', '')}:{job.get('company', '')}"
    return f"{job_id}:{user_id}"


async def semantic_rescore(job: dict, profile: dict, user_id: str) -> Optional[dict]:
    """Ask Claude Haiku to score candidate-job fit. Returns score dict or None."""
    key = _cache_key(job, user_id)

    if key in _semantic_cache:
        ts, cached = _semantic_cache[key]
        if time.time() - ts < _CACHE_TTL:
            return cached

    candidate = _build_candidate_section(profile)
    j_title = job.get("title") or ""
    j_company = job.get("company") or ""
    j_loc = job.get("location") or ""
    # Was [:300] — far too short to identify real requirements. Bumped to 1500.
    j_desc = (job.get("description") or "")[:1500]

    sal_parts = []
    if job.get("salary_min"):
        sal_parts.append(f"${job['salary_min']:,}")
    if job.get("salary_max"):
        sal_parts.append(f"${job['salary_max']:,}")
    j_sal = "-".join(sal_parts) or "unlisted"

    prompt = f"""Score candidate-job fit 0-100.

Candidate:
{candidate}

Job: {j_title} at {j_company}, {j_loc}, {j_sal}
{j_desc}

Criteria: Skills alignment 40%, Career trajectory 25%, Practical fit 35%.

Career trajectory scoring guidance:
- Lateral move (same level, adjacent field): 60
- Step up one level: 75
- Two+ levels above current: 45 (too far)
- Field pivot with transferable skills: 65
- Field pivot without transferable skills: 30

Your `reasoning` field MUST cite specific text from either the candidate profile or the job description above. Do not invent justifications. If you can't ground your reasoning in the prompt content, lower your confidence and pick a more conservative score.

Submit the result via the submit_score tool."""

    if not check_budget(estimate_tokens(prompt)):
        return None

    try:
        response = await anthropic_async.messages.create(
            model=HAIKU_MODEL,
            max_tokens=250,
            tools=[SEMANTIC_SCORE_TOOL],
            tool_choice={"type": "tool", "name": "submit_score"},
            messages=[{"role": "user", "content": prompt}],
        )
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "submit_score":
                result = block.input
                if "score" not in result or not isinstance(result["score"], (int, float)):
                    return None
                result["score"] = max(0, min(100, int(result["score"])))
                _semantic_cache[key] = (time.time(), result)
                return result
        return None
    except Exception as exc:
        logger.error(f"[SemanticScore] Failed for '{j_title}': {exc}", exc_info=True)
        return None


async def semantic_rescore_batch(jobs: list, profile: dict, user_id: str = "") -> list:
    """
    Run semantic re-scoring on eligible jobs in parallel.
    Blends: final = keyword * 0.3 + semantic * 0.7
    """
    eligible = []
    for job in jobs:
        kw_score = job.get("holt_score", 0)
        is_penalized = job.get("domain_penalized") or job.get("coaching_label") == "Different specialization"
        title = job.get("title") or ""
        if kw_score >= 55 and not is_penalized and _is_relevant_title(title):
            eligible.append(job)

    if not eligible:
        return jobs

    async def _score_one(job):
        async with _semaphore:
            return job, await semantic_rescore(job, profile, user_id)

    results = await asyncio.gather(*[_score_one(j) for j in eligible])

    for job, result in results:
        if result is None:
            continue

        keyword_score = job["holt_score"]
        sem_score = result["score"]
        blended = round(keyword_score * 0.3 + sem_score * 0.7)
        job["holt_score"] = max(0, min(100, blended))
        job["holt_breakdown"]["semantic_score"] = sem_score
        job["holt_breakdown"]["semantic_skills"] = result.get("skills_score")
        job["holt_breakdown"]["semantic_career"] = result.get("career_score")
        job["holt_breakdown"]["semantic_practical"] = result.get("practical_score")
        job["holt_breakdown"]["reasoning"] = result.get("reasoning", "")

        if sem_score >= 80:
            job["coaching_label"] = "Strong match \u2014 Ott recommends applying"
        elif sem_score >= 70:
            job["coaching_label"] = "Good match \u2014 worth a closer look"
        elif sem_score >= 55:
            job["coaching_label"] = "Within Reach \u2014 close your skills gap"
        else:
            job["coaching_label"] = "Growth opportunity"

    return jobs
