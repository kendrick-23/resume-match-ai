"""
Job-specific gap analysis using Claude Haiku.

For Within Reach jobs (stretch tier), asks Haiku to identify 2-3 specific
skills or qualifications the job requires that the candidate lacks.
"""

import asyncio
import json
import os
import time
from typing import Optional

import anthropic

from app.constants.scoring import TIER_BREAKPOINTS

from app.logger import logger
from app.services.token_budget import check_budget, estimate_tokens

_semaphore = asyncio.Semaphore(5)
_gap_cache: dict[str, tuple[float, list]] = {}
_CACHE_TTL = 86400  # 24 hours

HAIKU_MODEL = "claude-haiku-4-5-20251001"


async def get_job_specific_gaps(
    job: dict,
    user_skills: list[str],
    target_roles: str = "",
) -> list[dict]:
    """Return 2-3 specific gap objects for this job vs the candidate.

    Each gap object has shape:
        {"gap": str, "effort": "easy|months|years", "effort_note": str}

    Effort tags:
        - easy: skill she likely has but hasn't articulated, or short course (under 1 month)
        - months: a certification or course (1-6 months)
        - years: requires degree, extensive experience, or major career detour
    """
    title = job.get("title") or ""
    company = job.get("company") or ""
    cache_key = f"gaps_v2:{title.lower()}:{company.lower()}"

    if cache_key in _gap_cache:
        ts, cached = _gap_cache[cache_key]
        if time.time() - ts < _CACHE_TTL:
            return cached

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return []

    # Send the FULL skill list (was capped at 10) and full target_roles for context.
    skills_str = ", ".join(user_skills) if user_skills else "(no extracted skills)"
    target_text = target_roles.strip() or "(target roles not specified)"
    # Was 400 — bumped to 1500 so the model sees real requirements.
    desc = (job.get("description") or "")[:1500]

    prompt = (
        f"Candidate target roles: {target_text}\n"
        f"Candidate skills (FULL list): {skills_str}\n\n"
        f"Job: {title} at {company}\n"
        f"Description: {desc}\n\n"
        "List exactly 2-3 specific skills or qualifications this job requires that the "
        "candidate is clearly missing. Be specific and actionable.\n"
        "Do NOT list skills the candidate already has (cross-check the full skills list above).\n"
        "Do NOT list generic words like \"experience\" or \"skills\".\n\n"
        "For each gap, tag the effort honestly:\n"
        "  - \"easy\": something she could demonstrate from prior work, or a short tutorial (<1 month)\n"
        "  - \"months\": a certification or course (1-6 months)\n"
        "  - \"years\": degree, license, or major career detour\n\n"
        "Return ONLY a JSON array of objects, no preamble:\n"
        "[\n"
        "  {\"gap\": \"QuickBooks experience\", \"effort\": \"easy\", \"effort_note\": \"~$50 online course, 1-2 weeks\"},\n"
        "  {\"gap\": \"PMP certification\", \"effort\": \"months\", \"effort_note\": \"~$1000, 4-6 months prep + exam\"}\n"
        "]"
    )

    if not check_budget(estimate_tokens(prompt)):
        return []

    async with _semaphore:
        try:
            client = anthropic.AsyncAnthropic(api_key=api_key)
            response = await client.messages.create(
                model=HAIKU_MODEL,
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            gaps = json.loads(text)
            if isinstance(gaps, list):
                result: list[dict] = []
                for g in gaps[:3]:
                    if not isinstance(g, dict):
                        continue
                    gap_text = (g.get("gap") or "").strip()
                    effort = (g.get("effort") or "").strip().lower()
                    if effort not in ("easy", "months", "years"):
                        effort = "months"
                    if gap_text and len(gap_text) > 3:
                        result.append({
                            "gap": gap_text,
                            "effort": effort,
                            "effort_note": (g.get("effort_note") or "").strip(),
                        })
                _gap_cache[cache_key] = (time.time(), result)
                return result
        except Exception as exc:
            logger.error(f"[GapAnalyzer] Failed for '{title}': {exc}", exc_info=True)
    return []


def _format_gap(g: dict) -> str:
    """Render a structured gap into a single user-facing line for the Job card."""
    base = f"This role wants {g['gap']}"
    note = g.get("effort_note")
    if note:
        return f"{base} \u2014 {note}"
    return f"{base} \u2014 not in your skills yet"


async def analyze_gaps_batch(
    jobs: list,
    user_skills: list[str],
    target_roles: str = "",
) -> None:
    """Run gap analysis on Within Reach (stretch tier) jobs in parallel."""
    within_reach = [
        j for j in jobs
        if j.get("holt_score") is not None
        and TIER_BREAKPOINTS["stretch"] <= j["holt_score"] < TIER_BREAKPOINTS["strong"]
        and not j.get("domain_penalized")
        and j.get("coaching_label") != "Different specialization"
    ]

    if not within_reach:
        return

    async def _analyze_one(job):
        async with _semaphore:
            gaps = await get_job_specific_gaps(job, user_skills, target_roles)
            if gaps:
                # Backwards-compat string array for the existing frontend
                job["holt_breakdown"]["job_specific_gaps"] = [_format_gap(g) for g in gaps]
                # Structured array for any future UI that wants effort tags
                job["holt_breakdown"]["job_specific_gaps_structured"] = gaps

    await asyncio.gather(*[_analyze_one(j) for j in within_reach])
