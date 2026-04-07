"""
Job description enrichment using Claude Haiku.

Sparse API job descriptions (< 300 chars) are expanded into realistic
requirement paragraphs so the scoring engine has enough data to work with.

Only enriches jobs with relevant titles (ops/management keywords) to
save ~60-70% of Haiku calls.
"""

import asyncio
import os
import time

import anthropic

# Module-level cache: key → (timestamp, enriched_text)
_description_cache: dict[str, tuple[float, str]] = {}
_CACHE_TTL = 86400  # 24 hours

_semaphore = asyncio.Semaphore(5)

HAIKU_MODEL = "claude-haiku-4-5-20251001"

# Only enrich jobs whose title contains at least one of these words
RELEVANT_TITLE_WORDS = {
    "manager", "director", "supervisor", "coordinator",
    "operations", "general", "assistant", "training",
    "compliance", "branch", "regional", "area", "store",
    "facility", "site", "district", "administrative",
    "lead", "head", "chief", "officer", "specialist",
}


def _cache_key(title: str, company: str) -> str:
    return f"{(title or '').lower().strip()}:{(company or '').lower().strip()}"


def _is_relevant_title(title: str) -> bool:
    words = set(title.lower().split())
    return bool(words & RELEVANT_TITLE_WORDS)


async def enrich_job_description(job: dict) -> str:
    """Return an enriched description for sparse jobs, or the original if sufficient."""
    desc = job.get("description") or ""
    if len(desc) >= 300:
        return desc

    title = job.get("title") or ""
    if not _is_relevant_title(title):
        return desc

    company = job.get("company") or ""
    key = _cache_key(title, company)

    # Check cache
    if key in _description_cache:
        ts, cached = _description_cache[key]
        if time.time() - ts < _CACHE_TTL:
            return cached

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return desc

    try:
        client = anthropic.AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=150,
            messages=[{
                "role": "user",
                "content": (
                    f"Job: {title} at {company}. {desc}\n"
                    "Write a 100-word requirements summary covering: "
                    "required skills, experience level, key responsibilities. "
                    "Return only the summary."
                ),
            }],
        )
        enriched = response.content[0].text.strip()
        combined = f"{desc} {enriched}".strip()
        _description_cache[key] = (time.time(), combined)
        return combined
    except Exception as exc:
        print(f"[Enrich] Haiku call failed for '{title}': {exc}")
        return desc


async def enrich_jobs_batch(jobs: list) -> list:
    """Enrich sparse job descriptions in parallel (semaphore limits to 5 concurrent)."""
    async def _enrich_one(job):
        async with _semaphore:
            job["description"] = await enrich_job_description(job)

    await asyncio.gather(*[
        _enrich_one(job) for job in jobs
        if len(job.get("description") or "") < 300 and _is_relevant_title(job.get("title") or "")
    ])
    return jobs
