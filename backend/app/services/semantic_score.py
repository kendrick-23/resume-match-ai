"""
Lightweight semantic re-scoring using Claude Haiku.

For jobs scoring 55%+ on keyword matching (not domain-penalized),
Claude Haiku returns two scores:
  - Overall match (0-100): blended 70% with keyword score (30%)
  - Domain alignment (0-100): powers the domain gate that caps off-domain jobs

Prompt kept under 400 tokens per job for cost and latency control.
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

_semaphore = asyncio.Semaphore(3)

HAIKU_MODEL = "claude-haiku-4-5-20251001"

SEMANTIC_SCORE_TOOL = {
    "name": "submit_score",
    "description": "Submit the candidate-job fit score and domain alignment.",
    "input_schema": {
        "type": "object",
        "properties": {
            "score": {
                "type": "integer",
                "description": "Overall fit score 0-100",
            },
            "domain_alignment": {
                "type": "integer",
                "description": "Is this the right type of role for this candidate? 0-100. HIGH (70+): ops, training, compliance, hospitality admin. LOW (<30): clinical, construction trades, pure sales/marketing, defense, emergency services.",
            },
            "reasoning": {
                "type": "string",
                "description": "One sentence citing specific text from the prompt.",
            },
        },
        "required": ["score", "domain_alignment", "reasoning"],
    },
}

# Relevance filter — controls API cost
RELEVANT_TITLE_WORDS = {
    "manager", "director", "supervisor", "coordinator",
    "operations", "general", "assistant", "training",
    "compliance", "branch", "regional", "area", "store",
    "facility", "site", "district", "administrative",
    "lead", "head", "chief", "officer", "specialist",
    "captain", "broker", "marketing", "recruiter", "receptionist",
    "financial", "development", "growth",
}


def _is_relevant_title(title: str) -> bool:
    words = set(title.lower().split())
    return bool(words & RELEVANT_TITLE_WORDS)


def _build_candidate_summary(profile: dict) -> str:
    """Compact candidate summary — kept short for token budget."""
    parts = []
    if profile.get("job_title"):
        parts.append(f"Current: {profile['job_title']}")
    if profile.get("target_roles"):
        parts.append(f"Target: {profile['target_roles']}")
    skills = profile.get("skills_extracted") or []
    if isinstance(skills, str):
        try:
            skills = json.loads(skills)
        except (json.JSONDecodeError, TypeError):
            skills = []
    if skills:
        parts.append(f"Skills: {', '.join(skills[:15])}")
    if profile.get("about_me"):
        parts.append(f"Background: {profile['about_me'][:200]}")
    return "\n".join(parts) if parts else "No profile data"


def _cache_key(job: dict, user_id: str) -> str:
    job_id = job.get("id") or f"{job.get('title', '')}:{job.get('company', '')}"
    return f"lite_v1:{job_id}:{user_id}"


async def semantic_rescore(job: dict, profile: dict, user_id: str) -> Optional[dict]:
    """Ask Claude Haiku for overall fit + domain alignment.

    Returns {"score": int, "domain_alignment": int, "reasoning": str} or None.
    """
    key = _cache_key(job, user_id)

    if key in _semantic_cache:
        ts, cached = _semantic_cache[key]
        if time.time() - ts < _CACHE_TTL:
            return cached

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

    prompt = f"""Score candidate-job fit 0-100 and domain alignment 0-100.

Candidate:
{candidate}

Job: {j_title} at {j_company}, {j_sal}
{j_desc}

Rules:
- Score only role fit, NOT company prestige.
- Domain alignment HIGH (70+): operations, training, compliance, hospitality/retail management, government services.
- Domain alignment LOW (<30): clinical medical, construction trades, pure sales/marketing, defense/military, emergency services, licensed professions.
- Cite specific text in reasoning.

Submit via the submit_score tool."""

    if not check_budget(estimate_tokens(prompt)):
        return None

    api_kwargs = dict(
        model=HAIKU_MODEL,
        max_tokens=150,
        tools=[SEMANTIC_SCORE_TOOL],
        tool_choice={"type": "tool", "name": "submit_score"},
        messages=[{"role": "user", "content": prompt}],
    )

    # Retry once on rate limit (429) with 3s backoff
    response = None
    for attempt in range(2):
        try:
            response = await anthropic_async.messages.create(**api_kwargs)
            break
        except Exception as exc:
            is_rate_limit = "rate" in str(exc).lower() or getattr(exc, "status_code", 0) == 429
            if is_rate_limit and attempt == 0:
                logger.warning(f"[SemanticScore] Rate limited for '{j_title}', retrying in 3s")
                await asyncio.sleep(3)
                continue
            logger.error(f"[SemanticScore] Failed for '{j_title}': {exc}", exc_info=True)
            return None

    if response is None:
        return None

    try:
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "submit_score":
                result = block.input
                if "score" not in result or not isinstance(result["score"], (int, float)):
                    return None
                result["score"] = max(0, min(100, int(result["score"])))
                da = result.get("domain_alignment")
                result["domain_alignment"] = max(0, min(100, int(da))) if isinstance(da, (int, float)) else 50

                # --- Server-side domain_alignment caps (zero-cost overrides) ---
                title_lower = j_title.lower()
                company_lower = j_company.lower()
                desc_lower = j_desc.lower()

                # Construction companies
                _CONSTRUCTION_COMPANIES = (
                    "wharton smith", "hoar", "skanska", "turner construction",
                    "suffolk", "brasfield", "hensel phelps", "toll brothers",
                    "pulte", "dr horton", "lennar", "kb home",
                )
                if any(cc in company_lower for cc in _CONSTRUCTION_COMPANIES):
                    result["domain_alignment"] = min(result["domain_alignment"], 30)

                # Marketing titles
                if "marketing manager" in title_lower or "marketing coordinator" in title_lower:
                    result["domain_alignment"] = min(result["domain_alignment"], 30)

                # Development review (government land use/planning)
                if "development review" in title_lower:
                    result["domain_alignment"] = min(result["domain_alignment"], 30)

                # Financial services in emergency context
                if "financial services" in title_lower and any(
                    sig in desc_lower for sig in ("fire rescue", "ems", "emergency")
                ):
                    result["domain_alignment"] = min(result["domain_alignment"], 35)

                # --- Domain-alignment quality gate ---
                da = result["domain_alignment"]
                if da < 45:
                    result["score"] = min(result["score"], 25)
                elif da < 60:
                    result["score"] = min(result["score"], 58)

                _semantic_cache[key] = (time.time(), result)
                return result
        return None
    except Exception as exc:
        logger.error(f"[SemanticScore] Failed for '{j_title}': {exc}", exc_info=True)
        return None


async def semantic_rescore_batch(jobs: list, profile: dict, user_id: str = "") -> list:
    """Run lightweight semantic re-scoring on eligible jobs in parallel.

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
        job["holt_breakdown"]["semantic_domain_alignment"] = result.get("domain_alignment")
        job["holt_breakdown"]["reasoning"] = result.get("reasoning", "")

        # Coaching label based on semantic score
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

    return jobs
