"""
Job description enrichment using Claude Haiku.

Sparse API job descriptions (< 300 chars) are expanded into realistic
requirement paragraphs so the scoring engine has enough data to work with.
"""

import asyncio
import os
import time
from typing import Optional

import anthropic

# Module-level cache: key → (timestamp, enriched_text)
_description_cache: dict[str, tuple[float, str]] = {}
_CACHE_TTL = 86400  # 24 hours

# Concurrency limiter — max 5 Haiku calls at once
_semaphore = asyncio.Semaphore(5)

HAIKU_MODEL = "claude-haiku-4-5-20251001"


def _cache_key(title: str, company: str) -> str:
    return f"{(title or '').lower().strip()}:{(company or '').lower().strip()}"


async def enrich_job_description(job: dict) -> str:
    """Return an enriched description for sparse jobs, or the original if sufficient."""
    desc = job.get("description") or ""
    if len(desc) >= 300:
        return desc

    title = job.get("title") or ""
    company = job.get("company") or ""
    key = _cache_key(title, company)

    # Check cache
    if key in _description_cache:
        ts, cached = _description_cache[key]
        if time.time() - ts < _CACHE_TTL:
            return cached

    # Call Haiku to expand
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return desc  # can't enrich without API key

    async with _semaphore:
        try:
            client = anthropic.AsyncAnthropic(api_key=api_key)
            response = await client.messages.create(
                model=HAIKU_MODEL,
                max_tokens=300,
                messages=[{
                    "role": "user",
                    "content": (
                        "You are a job description expert. Given this job title and "
                        "brief description, write a realistic and detailed job "
                        "requirements paragraph (150-200 words) covering: required "
                        "skills, typical responsibilities, experience level needed, "
                        "and any common qualifications. Be specific to this role type.\n\n"
                        f"Job Title: {title}\n"
                        f"Company: {company}\n"
                        f"Brief Description: {desc or 'Not provided'}\n\n"
                        "Return ONLY the expanded description paragraph. No preamble."
                    ),
                }],
            )
            enriched = response.content[0].text.strip()
            # Combine original + enriched for maximum keyword coverage
            combined = f"{desc} {enriched}".strip()
            _description_cache[key] = (time.time(), combined)
            return combined
        except Exception as exc:
            print(f"[Enrich] Haiku call failed for '{title}': {exc}")
            return desc


async def enrich_jobs_batch(jobs: list) -> list:
    """Enrich all sparse job descriptions in a batch, concurrently."""
    tasks = []
    for job in jobs:
        desc = job.get("description") or ""
        if len(desc) < 300:
            tasks.append((job, enrich_job_description(job)))
        else:
            tasks.append((job, None))

    # Run all enrichments concurrently (semaphore limits to 5 at a time)
    for job, coro in tasks:
        if coro is not None:
            job["description"] = await coro

    return jobs
