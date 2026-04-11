from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from supabase import create_client
import os

from app.main import get_current_user, limiter
from app.logger import logger
from app.clients import sync_client as anthropic_client
from app.services.token_budget import check_opus_budget, estimate_tokens

router = APIRouter(tags=["generate-resume"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

OPUS_MODEL = "claude-opus-4-6"


def _user_sb(user: dict):
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


class GenerateResumeRequest(BaseModel):
    analysis_id: str = Field(..., max_length=100)
    linkedin_text: str = Field(default="", max_length=10000)


@router.post("/generate-resume")
@limiter.limit("5/hour")
async def generate_resume(
    request: Request,
    body: GenerateResumeRequest,
    user: dict = Depends(get_current_user),
):
    """Generate an ATS-optimized resume based on a previous analysis."""
    sb = _user_sb(user)

    # Load the analysis with original inputs
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

    # Check if already generated
    if analysis.get("generated_resume_md"):
        return {"resume_md": analysis["generated_resume_md"], "cached": True}

    # Pull profile for pivot context.
    profile = {}
    try:
        prof_res = sb.table("profiles").select("*").eq("id", user["user_id"]).execute()
        if prof_res.data:
            profile = prof_res.data[0]
    except Exception:
        pass

    target_roles = (profile.get("target_roles") or "").strip() or "(target roles not specified)"
    about_me = (profile.get("about_me") or "").strip() or "(no background summary on file)"
    current_background = (profile.get("job_title") or "their current field").strip()

    linkedin_section = ""
    if body.linkedin_text.strip():
        linkedin_section = f"""

LINKEDIN PROFILE (additional context about the candidate):
{body.linkedin_text.strip()}
"""

    system_prompt = """You are an expert ATS resume optimizer and career coach. Your job is to rewrite a resume to maximize keyword alignment with a specific job posting while keeping every claim 100% truthful.

The candidate has real skills described in the wrong language for the target role. Translate, don't invent.

NON-NEGOTIABLE TRUTHFULNESS RULES:
- Never fabricate employer names, dates, certifications, degrees, or metrics.
- Quantify achievements ONLY where the original resume already contains a specific number or a clearly countable fact (e.g. "managed 12-person team" — keep "12"). Do NOT invent metrics where the original was qualitative.
- Never add a skill or experience the candidate doesn't have evidence for in the source material.
- Every bullet must be defensible by the candidate in an interview.

WHAT YOU CAN AND SHOULD DO:
- Mirror exact keyword phrases from the JD where the candidate's existing experience legitimately demonstrates them.
- Lead bullets with strong action verbs the job posting uses.
- Reframe the professional summary to position the candidate's pivot toward the target role.
- Reorganize bullet order to lead with the most relevant impact for THIS role.

OUTPUT FORMAT — clean markdown, no commentary:

# [Candidate Name]

## Professional Summary
[2-3 sentences positioning the candidate's pivot from their current background to the target role. Use the JD's vocabulary where their real experience supports it.]

## Core Competencies
[8-12 bullets — keyword-rich, using exact JD phrases ONLY where the candidate genuinely possesses the skill. Pull from extracted_skills + resume evidence.]

## Professional Experience

### [Job Title] | [Company] | [Dates]
- [Achievement-focused bullets, action-verb-led, JD vocabulary where supported]
- [Numbers ONLY when present in the source]

[Repeat for each role]

## Education
[Format cleanly]

## Certifications & Training
[Only if the candidate has them in the source]"""

    user_message = f"""CANDIDATE PROFILE:
- Current background: {current_background}
- Pivoting to: {target_roles}
- About: {about_me}

The candidate is pivoting from {current_background} to {target_roles}. Frame the professional summary to position this pivot, not just to match the JD title.

ORIGINAL RESUME:
{resume_text}
{linkedin_section}
JOB DESCRIPTION:
{job_description}

Rewrite the resume per the system rules. Output only the markdown — no commentary."""

    if not check_opus_budget(estimate_tokens(user_message)):
        raise HTTPException(
            status_code=429,
            detail="Ott's been busy today — resume generation is temporarily unavailable. Try again tomorrow!",
        )

    try:
        message = anthropic_client.messages.create(
            model=OPUS_MODEL,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}]
        )
        resume_md = message.content[0].text.strip()

        # Save generated resume to database
        sb.table("analyses") \
            .update({"generated_resume_md": resume_md}) \
            .eq("id", body.analysis_id) \
            .eq("user_id", user["user_id"]) \
            .execute()

        return {"resume_md": resume_md, "cached": False}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[/generate-resume] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Something went wrong generating your resume. Please try again.")


@router.get("/generate-resume/{analysis_id}")
@limiter.limit("100/hour")
async def get_generated_resume(
    request: Request,
    analysis_id: str,
    user: dict = Depends(get_current_user),
):
    """Retrieve a previously generated resume without regenerating."""
    sb = _user_sb(user)

    res = sb.table("analyses") \
        .select("generated_resume_md, role_name, company_name") \
        .eq("id", analysis_id) \
        .eq("user_id", user["user_id"]) \
        .execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return {
        "resume_md": res.data[0].get("generated_resume_md"),
        "role_name": res.data[0].get("role_name", ""),
        "company_name": res.data[0].get("company_name", ""),
    }
