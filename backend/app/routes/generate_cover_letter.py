import json
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional
from anthropic import Anthropic
from supabase import create_client
import os

from app.main import get_current_user, limiter
from app.logger import logger
from app.services.token_budget import check_budget, estimate_tokens

router = APIRouter(tags=["generate-cover-letter"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

anthropic_client = Anthropic()

HAIKU_MODEL = "claude-haiku-4-5-20251001"


def _user_sb(user: dict):
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


COVER_LETTER_SYSTEM_PROMPT = """You are Holt, an expert career coach writing a cover letter for a candidate transitioning into a new role.

Your job is to write a cover letter that:
1. Opens with the candidate's single strongest transferable achievement for THIS specific role
2. Bridges their current industry language into the corporate vocabulary this JD uses
3. Directly addresses the top 2-3 requirements from the JD using their real experience
4. Acknowledges any gap honestly but frames it as a short ramp-up, not a disqualifier
5. Closes with confidence and a clear call to action

Rules:
- First person ("I"), professional but warm tone — not stiff corporate
- 3-4 paragraphs, under 350 words
- Never fabricate experience — only use what's in the resume
- Mirror the JD's exact terminology where the candidate's experience overlaps
- Do NOT use hollow phrases like "I am writing to apply" or "I believe I would be a great fit" — open with a specific achievement instead
- Return ONLY the cover letter text, no preamble, no commentary, no markdown formatting"""


class GenerateCoverLetterRequest(BaseModel):
    analysis_id: str = Field(..., max_length=100)
    regenerate: bool = Field(default=False)


@router.post("/generate-cover-letter")
@limiter.limit("5/hour")
async def generate_cover_letter(
    request: Request,
    body: GenerateCoverLetterRequest,
    user: dict = Depends(get_current_user),
):
    """Generate a tailored cover letter based on a previous analysis."""
    sb = _user_sb(user)

    # Load the full analysis row
    res = sb.table("analyses") \
        .select("*") \
        .eq("id", body.analysis_id) \
        .eq("user_id", user["user_id"]) \
        .execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis = res.data[0]
    resume_text = analysis.get("resume_text", "")
    job_description = analysis.get("job_description_text", "")

    if not resume_text or not job_description:
        raise HTTPException(
            status_code=400,
            detail="This analysis doesn't have the original resume text stored. Please run a new analysis first."
        )

    # Return cached cover letter unless regenerating
    if not body.regenerate and analysis.get("cover_letter"):
        return {"cover_letter": analysis["cover_letter"], "cached": True}

    # Token budget check
    prompt_text = resume_text + job_description
    if not check_budget(estimate_tokens(prompt_text)):
        raise HTTPException(
            status_code=429,
            detail="Cover letter generation unavailable today — try again tomorrow."
        )

    # Gather analysis context for the prompt
    score = analysis.get("score", 0)
    strengths_raw = analysis.get("strengths", "[]")
    strengths = json.loads(strengths_raw) if isinstance(strengths_raw, str) else (strengths_raw or [])
    gaps_raw = analysis.get("gaps", "[]")
    gaps = json.loads(gaps_raw) if isinstance(gaps_raw, str) else (gaps_raw or [])
    summary = analysis.get("summary", "")
    role_name = analysis.get("role_name", "")
    company_name = analysis.get("company_name", "")

    # Format strengths/gaps for the prompt
    strengths_summary = "; ".join(strengths[:5]) if strengths else "None identified"
    gaps_list = []
    for g in gaps[:3]:
        if isinstance(g, dict):
            gaps_list.append(f"{g.get('gap', '')} ({g.get('effort', '')})")
        elif isinstance(g, str):
            gaps_list.append(g)
    gaps_summary = "; ".join(gaps_list) if gaps_list else "None identified"

    user_message = f"""Role: {role_name} at {company_name}

Job Description:
{job_description}

Candidate's Resume:
{resume_text}

Analysis context (use this to inform the letter — don't copy it verbatim):
- Overall match: {score}%
- Key strengths identified: {strengths_summary}
- Main gaps: {gaps_summary}
- Ott's coaching summary: {summary[:500] if summary else 'No summary available'}

Write the cover letter now."""

    try:
        message = anthropic_client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=1024,
            system=COVER_LETTER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        cover_letter = message.content[0].text.strip()

        # Cache the cover letter on the analysis row
        try:
            sb.table("analyses") \
                .update({"cover_letter": cover_letter}) \
                .eq("id", body.analysis_id) \
                .eq("user_id", user["user_id"]) \
                .execute()
        except Exception as exc:
            # cover_letter column may not exist yet — log and continue
            logger.warning(f"[/generate-cover-letter] Cache save failed (column may not exist): {exc}")

        return {"cover_letter": cover_letter, "cached": False}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[/generate-cover-letter] Error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Something went wrong generating your cover letter. Please try again."
        )
