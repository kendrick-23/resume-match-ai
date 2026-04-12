"""
5-Dimension Semantic Scoring using Claude Haiku.

For jobs scoring 55%+ on keyword matching (not domain-penalized),
Claude Haiku evaluates 5 explicit dimensions that replace most manual
blocklist logic in holt_score.py:

  title_relevance     30%  — job title vs target roles
  seniority_match     20%  — role level vs current level
  domain_alignment    20%  — domain transition feasibility
  skills_match        20%  — skills coverage
  experience_relevance 10% — transferable experience

The weighted semantic score blends 70% with the keyword score (30%).
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

# Dimensional weights for the composite semantic score
DIMENSION_WEIGHTS = {
    "title_relevance": 0.30,
    "seniority_match": 0.20,
    "domain_alignment": 0.20,
    "skills_match": 0.20,
    "experience_relevance": 0.10,
}

SEMANTIC_SCORE_TOOL = {
    "name": "submit_dimensional_score",
    "description": "Submit the 5-dimension candidate-job fit scores.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title_relevance": {
                "type": "integer",
                "description": "How closely the job title aligns with target roles (0-100). Score 0-20 for completely different domains.",
            },
            "seniority_match": {
                "type": "integer",
                "description": "Whether role seniority matches or exceeds the candidate's current level (0-100). Low for entry-level when candidate is management.",
            },
            "domain_alignment": {
                "type": "integer",
                "description": "How realistic is the domain transition (0-100). High for ops/training/compliance. Low for clinical, construction trades, pure sales, defense.",
            },
            "skills_match": {
                "type": "integer",
                "description": "How well the candidate's skills address role requirements (0-100). Match conceptually, not just keywords.",
            },
            "experience_relevance": {
                "type": "integer",
                "description": "Does work history show transferable experience for this role (0-100).",
            },
            "reasoning": {
                "type": "string",
                "description": "One sentence citing specific text from the candidate profile or job description.",
            },
        },
        "required": [
            "title_relevance", "seniority_match", "domain_alignment",
            "skills_match", "experience_relevance", "reasoning",
        ],
    },
}

# Same relevance filter as enrich.py — controls API cost
RELEVANT_TITLE_WORDS = {
    "manager", "director", "supervisor", "coordinator",
    "operations", "general", "assistant", "training",
    "compliance", "branch", "regional", "area", "store",
    "facility", "site", "district", "administrative",
    "lead", "head", "chief", "officer", "specialist",
    # Broader catch for roles that should be evaluated but might be off-target
    "captain", "broker", "marketing", "recruiter", "receptionist",
    "financial", "development", "growth",
}


def _is_relevant_title(title: str) -> bool:
    words = set(title.lower().split())
    return bool(words & RELEVANT_TITLE_WORDS)


def _build_candidate_section(profile: dict) -> str:
    """Build rich candidate context for the 5-dimension prompt."""
    lines = []

    current_title = profile.get("job_title")
    if current_title:
        lines.append(f"Current title: {current_title}")

    target_roles = profile.get("target_roles")
    if target_roles:
        lines.append(f"Target roles: {target_roles}")

    salary_min = profile.get("target_salary_min")
    salary_max = profile.get("target_salary_max")
    if salary_min and salary_max:
        lines.append(f"Target salary: ${salary_min:,}-${salary_max:,}")
    elif salary_min:
        lines.append(f"Target salary min: ${salary_min:,}")

    schedule = profile.get("schedule_preference")
    if schedule:
        labels = {"monday_friday": "M-F only", "remote_only": "Remote", "any": "Any"}
        lines.append(f"Schedule: {labels.get(schedule, schedule)}")

    location = profile.get("location")
    if location:
        lines.append(f"Location: {location}")

    skills = profile.get("skills_extracted") or []
    if isinstance(skills, str):
        try:
            skills = json.loads(skills)
        except (json.JSONDecodeError, TypeError):
            skills = []
    if skills:
        lines.append(f"Skills: {', '.join(skills)}")

    about_me = profile.get("about_me")
    if about_me:
        lines.append(f"Background: {about_me[:500]}")

    return "\n".join(lines) if lines else "No profile data"


def _cache_key(job: dict, user_id: str) -> str:
    job_id = job.get("id") or f"{job.get('title', '')}:{job.get('company', '')}"
    return f"dim_v1:{job_id}:{user_id}"


def _compute_composite(result: dict) -> float:
    """Weighted average of the 5 dimensional scores."""
    return sum(
        result.get(dim, 50) * weight
        for dim, weight in DIMENSION_WEIGHTS.items()
    )


async def semantic_rescore(job: dict, profile: dict, user_id: str) -> Optional[dict]:
    """Ask Claude Haiku to score candidate-job fit on 5 dimensions.

    Returns dict with dimensional scores + composite, or None on failure.
    """
    key = _cache_key(job, user_id)

    if key in _semantic_cache:
        ts, cached = _semantic_cache[key]
        if time.time() - ts < _CACHE_TTL:
            return cached

    candidate = _build_candidate_section(profile)
    j_title = job.get("title") or ""
    j_company = job.get("company") or ""
    j_loc = job.get("location") or ""
    j_desc = (job.get("description") or "")[:1500]

    sal_parts = []
    if job.get("salary_min"):
        sal_parts.append(f"${job['salary_min']:,}")
    if job.get("salary_max"):
        sal_parts.append(f"${job['salary_max']:,}")
    j_sal = "-".join(sal_parts) or "unlisted"

    current_title = profile.get("job_title") or "not specified"
    target_roles = profile.get("target_roles") or "not specified"

    prompt = f"""Score this candidate-job fit on 5 dimensions (0-100 each).

CANDIDATE:
{candidate}

JOB: {j_title} at {j_company}, {j_loc}, {j_sal}
{j_desc}

DIMENSIONS TO SCORE:

1. TITLE_RELEVANCE: How closely does "{j_title}" align with target roles "{target_roles}"? Semantic similarity counts — "Operations Supervisor" ≈ "Operations Manager". Score 0-20 for completely different domains (clinical medical, construction trades, insurance sales, military operations, pure marketing).

2. SENIORITY_MATCH: Does this role's seniority match someone currently working as "{current_title}"? Score high (70-90) if lateral move or step-up. Score low (10-30) if entry-level, individual contributor, or franchise store-level when candidate manages teams. Score very low (0-15) for roles like Team Member, Receptionist, Crew Member.

3. DOMAIN_ALIGNMENT: Can this candidate realistically transition into this role's domain? HIGH (70-90): operations, training, compliance, hospitality admin, retail management, healthcare admin, government services. LOW (10-30): clinical medical requiring licensure, defense/military operations, construction trades, licensed professions (attorney, engineer, accountant), pure sales/marketing, emergency services (fire/EMS).

4. SKILLS_MATCH: Do the candidate's listed skills address this role's requirements? Match conceptually — "guest experience" covers "customer experience", "F&B operations" covers "operations management". Don't require exact keyword matches.

5. EXPERIENCE_RELEVANCE: Has the candidate done work like this before? Team management, compliance, training programs, scheduling, inventory, and operations oversight all transfer across industries.

CRITICAL RULES:
- Do NOT adjust scores based on company name, brand recognition, or employer prestige. A Sales Coordinator at Marriott is still a Sales Coordinator. Score only the role requirements and candidate fit.
- SENIORITY CAP: If the job title contains "coordinator", "specialist", or "associate" AND the candidate's current title contains "manager", "supervisor", "director", or "general manager", the seniority_match score MUST NOT exceed 40. Moving from management to coordinator is always a step backward.
- Your reasoning MUST cite specific text from the candidate profile or job description. Do not invent justifications.

Submit via the submit_dimensional_score tool."""

    if not check_budget(estimate_tokens(prompt)):
        return None

    try:
        response = await anthropic_async.messages.create(
            model=HAIKU_MODEL,
            max_tokens=300,
            tools=[SEMANTIC_SCORE_TOOL],
            tool_choice={"type": "tool", "name": "submit_dimensional_score"},
            messages=[{"role": "user", "content": prompt}],
        )
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "submit_dimensional_score":
                result = block.input
                # Clamp all dimensional scores to 0-100
                for dim in DIMENSION_WEIGHTS:
                    if dim in result and isinstance(result[dim], (int, float)):
                        result[dim] = max(0, min(100, int(result[dim])))
                    else:
                        result[dim] = 50  # fallback

                # Server-side seniority cap: coordinator/specialist/associate
                # titles are always a step down for a manager/director/AGM.
                # Haiku is instructed to cap at 40, but we enforce it here too.
                _JUNIOR_TITLE_SIGNALS = ("coordinator", "specialist", "associate", "assistant")
                _SENIOR_CURRENT_SIGNALS = ("manager", "supervisor", "director", "general manager")
                title_lower = j_title.lower()
                current_lower = current_title.lower()
                is_junior_role = any(s in title_lower for s in _JUNIOR_TITLE_SIGNALS)
                is_senior_candidate = any(s in current_lower for s in _SENIOR_CURRENT_SIGNALS)
                if is_junior_role and is_senior_candidate:
                    result["seniority_match"] = min(result["seniority_match"], 40)

                # Server-side construction company gate: directors at known
                # construction firms are construction project leads, not
                # ops/training roles. Cap domain_alignment before composite.
                _CONSTRUCTION_COMPANIES = (
                    "wharton smith", "hoar", "skanska", "turner construction",
                    "suffolk", "brasfield", "hensel phelps", "toll brothers",
                    "pulte", "dr horton", "lennar", "kb home",
                )
                company_lower = j_company.lower()
                if any(cc in company_lower for cc in _CONSTRUCTION_COMPANIES):
                    result["domain_alignment"] = min(result["domain_alignment"], 30)

                result["composite"] = round(_compute_composite(result))

                # Domain-alignment quality gate — caps composite based on
                # domain fit. Wrong-domain jobs can't be rescued by skills
                # overlap alone (LinkedIn production pattern).
                da = result["domain_alignment"]
                if da < 35:
                    result["composite"] = min(result["composite"], 25)
                elif da < 50:
                    result["composite"] = min(result["composite"], 58)

                _semantic_cache[key] = (time.time(), result)
                return result
        return None
    except Exception as exc:
        logger.error(f"[SemanticScore] Failed for '{j_title}': {exc}", exc_info=True)
        return None


async def semantic_rescore_batch(jobs: list, profile: dict, user_id: str = "") -> list:
    """Run 5-dimension semantic re-scoring on eligible jobs in parallel.

    Blends: final = keyword * 0.3 + semantic_composite * 0.7
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
        sem_composite = result["composite"]
        blended = round(keyword_score * 0.3 + sem_composite * 0.7)
        job["holt_score"] = max(0, min(100, blended))

        # Store dimensional breakdown for frontend display
        job["holt_breakdown"]["semantic_composite"] = sem_composite
        job["holt_breakdown"]["semantic_title_relevance"] = result.get("title_relevance")
        job["holt_breakdown"]["semantic_seniority_match"] = result.get("seniority_match")
        job["holt_breakdown"]["semantic_domain_alignment"] = result.get("domain_alignment")
        job["holt_breakdown"]["semantic_skills_match"] = result.get("skills_match")
        job["holt_breakdown"]["semantic_experience"] = result.get("experience_relevance")
        job["holt_breakdown"]["reasoning"] = result.get("reasoning", "")

        # Update coaching label based on blended score
        if sem_composite >= 80:
            job["coaching_label"] = "Strong match — Ott recommends applying"
        elif sem_composite >= 70:
            job["coaching_label"] = "Good match — worth a closer look"
        elif sem_composite >= 55:
            job["coaching_label"] = "Within Reach — close your skills gap"
        elif result.get("domain_alignment", 50) < 25:
            job["coaching_label"] = "Different specialization"
        elif result.get("seniority_match", 50) < 25:
            job["coaching_label"] = "Not at your level"
        else:
            job["coaching_label"] = "Growth opportunity"

    return jobs
