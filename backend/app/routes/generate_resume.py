from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from anthropic import Anthropic
from supabase import create_client
import os

from app.main import get_current_user, limiter

router = APIRouter(tags=["generate-resume"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

anthropic_client = Anthropic()


def _user_sb(user: dict):
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


class GenerateResumeRequest(BaseModel):
    analysis_id: str
    linkedin_text: str = ""


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

    linkedin_section = ""
    if body.linkedin_text.strip():
        linkedin_section = f"""

LINKEDIN PROFILE (additional context about the candidate):
{body.linkedin_text.strip()}
"""

    prompt = f"""You are an expert ATS resume optimizer and career coach. Your job is to rewrite this resume to maximize keyword alignment with the job posting while keeping every experience claim 100% truthful. The candidate has real skills that are being described in the wrong language for this role. Translate their experience into the vocabulary this employer uses.

Focus especially on:
1. Mirroring exact keyword phrases from the job description
2. Quantifying achievements that are already implied
3. Leading bullets with strong action verbs the job posting uses
4. Rewriting the professional summary to speak directly to this role

Never invent experience. Only reframe what exists.

ORIGINAL RESUME:
{resume_text}
{linkedin_section}
JOB DESCRIPTION:
{job_description}

Generate the rewritten resume in clean markdown format with these exact sections:

# [Candidate Name]

## Professional Summary
[2-3 sentences opening with the target role title, mirroring the job's language. Highlight the candidate's most relevant qualifications using keywords from the job posting.]

## Core Competencies
[A keyword-rich skills grid using exact phrases from the job description that the candidate genuinely possesses. Format as a bullet list of 8-12 competencies.]

## Professional Experience

### [Job Title] | [Company] | [Dates]
- [Achievement-focused bullets rewritten to lead with impact and use industry language matching the job posting]
- [Each bullet should start with a strong action verb from the job description]
- [Quantify wherever the original resume implies measurable results]

[Repeat for each role]

## Education
[Format education entries cleanly]

## Certifications & Training
[Only if the candidate has relevant certifications mentioned in their resume]

Important formatting rules:
- Use markdown headers (#, ##, ###) for sections
- Use bullet points (-) for lists
- Keep it clean and scannable
- Do not add any commentary or notes — output ONLY the resume content"""

    try:
        message = anthropic_client.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}]
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
        raise HTTPException(status_code=500, detail=str(e))


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
