"""
Semantic re-scoring using Claude Haiku.

For jobs that score 55%+ on keyword matching and aren't domain-penalized,
this module calls Claude Haiku to produce a semantic understanding score
that weights 70% in the final result (keyword = 30%).
"""

import asyncio
import json
import os
import time
from typing import Optional

import anthropic

# Cache: job_id → (timestamp, result_dict)
_semantic_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 86400  # 24 hours

_semaphore = asyncio.Semaphore(5)

HAIKU_MODEL = "claude-haiku-4-5-20251001"


async def semantic_rescore(job: dict, profile: dict) -> Optional[dict]:
    """
    Ask Claude Haiku to score how well this candidate matches this job.

    Returns dict with: score, skills_score, career_score, practical_score, reasoning
    or None if the call fails.
    """
    job_id = job.get("id") or f"{job.get('title', '')}:{job.get('company', '')}"

    # Check cache
    if job_id in _semantic_cache:
        ts, cached = _semantic_cache[job_id]
        if time.time() - ts < _CACHE_TTL:
            return cached

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None

    skills = profile.get("skills_extracted") or []
    if isinstance(skills, str):
        skills = json.loads(skills)
    skills_str = ", ".join(skills[:15]) if skills else "Not specified"

    job_title = profile.get("job_title") or "Not specified"
    salary_min = profile.get("target_salary_min") or "?"
    salary_max = profile.get("target_salary_max") or "?"
    location = profile.get("location") or "Not specified"
    schedule = profile.get("schedule_preference") or "any"

    j_title = job.get("title") or ""
    j_company = job.get("company") or ""
    j_location = job.get("location") or ""
    j_salary_min = job.get("salary_min") or "?"
    j_salary_max = job.get("salary_max") or "?"
    j_desc = (job.get("description") or "")[:500]

    prompt = f"""Score how well this candidate matches this job on a 0-100 scale.

Candidate Profile:
- Current role: {job_title}
- Key skills: {skills_str}
- Target salary: ${salary_min}-${salary_max}
- Location: {location}
- Schedule preference: {schedule}

Job:
Title: {j_title}
Company: {j_company}
Location: {j_location}
Salary: {j_salary_min}-{j_salary_max}
Description: {j_desc}

Score based on:
- Skills alignment (40%)
- Career trajectory fit (25%)
- Practical fit (salary, location, schedule) (35%)

Return ONLY a JSON object with these exact keys:
{{"score": <0-100 integer>, "skills_score": <0-100>, "career_score": <0-100>, "practical_score": <0-100>, "reasoning": "<one sentence>"}}"""

    async with _semaphore:
        try:
            client = anthropic.AsyncAnthropic(api_key=api_key)
            response = await client.messages.create(
                model=HAIKU_MODEL,
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            # Parse JSON — handle potential markdown wrapping
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            result = json.loads(text)

            # Validate expected keys
            if "score" not in result or not isinstance(result["score"], (int, float)):
                return None

            result["score"] = max(0, min(100, int(result["score"])))
            _semantic_cache[job_id] = (time.time(), result)
            return result
        except Exception as exc:
            print(f"[SemanticScore] Failed for '{j_title}': {exc}")
            return None


async def semantic_rescore_batch(jobs: list, profile: dict) -> list:
    """
    Run semantic re-scoring on eligible jobs (score >= 55, not domain-penalized).
    Blends result: final = keyword * 0.3 + semantic * 0.7
    """
    tasks = []
    for job in jobs:
        keyword_score = job.get("holt_score", 0)
        is_domain_penalized = job.get("coaching_label") == "Different specialization"

        if keyword_score >= 55 and not is_domain_penalized:
            tasks.append((job, semantic_rescore(job, profile)))
        else:
            tasks.append((job, None))

    # Run all semantic calls concurrently
    for job, coro in tasks:
        if coro is None:
            continue

        result = await coro
        if result is None:
            continue

        keyword_score = job["holt_score"]
        semantic_score = result["score"]
        blended = round(keyword_score * 0.3 + semantic_score * 0.7)
        blended = max(0, min(100, blended))

        job["holt_score"] = blended
        job["holt_breakdown"]["semantic_score"] = semantic_score
        job["holt_breakdown"]["semantic_skills"] = result.get("skills_score")
        job["holt_breakdown"]["semantic_career"] = result.get("career_score")
        job["holt_breakdown"]["semantic_practical"] = result.get("practical_score")
        job["holt_breakdown"]["reasoning"] = result.get("reasoning", "")

        # Update coaching label based on semantic score
        if semantic_score >= 80:
            job["coaching_label"] = "Strong match \u2014 Ott recommends applying"
        elif semantic_score >= 70:
            job["coaching_label"] = "Good match \u2014 worth a closer look"
        elif semantic_score >= 55:
            job["coaching_label"] = "Within Reach \u2014 close your skills gap"
        else:
            job["coaching_label"] = "Growth opportunity"

    return jobs
