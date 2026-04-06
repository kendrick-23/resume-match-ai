from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from anthropic import Anthropic
from supabase import create_client
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
import io
import re
import json
import jwt as pyjwt
from PyPDF2 import PdfReader
from docx import Document

load_dotenv()


def _get_user_or_ip(request: Request) -> str:
    """Rate limit key: user ID from JWT if present, otherwise client IP."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        secret = os.getenv("SUPABASE_JWT_SECRET")
        if secret:
            try:
                payload = pyjwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
                return payload.get("sub", get_remote_address(request))
            except Exception:
                pass
    return get_remote_address(request)


limiter = Limiter(key_func=_get_user_or_ip)

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

anthropic_client = Anthropic()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Validate Supabase JWT and return user payload.
    Uses the JWT secret from Supabase project settings.
    Falls back to verifying via Supabase auth API if no secret configured."""
    token = credentials.credentials

    if SUPABASE_JWT_SECRET:
        try:
            payload = pyjwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except pyjwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return {"user_id": user_id, "token": token}
    else:
        # Verify token by calling Supabase auth — works without JWT secret
        sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        try:
            res = sb.auth.get_user(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")

        if not res or not res.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        return {"user_id": res.user.id, "token": token}


@app.get("/analyses")
@limiter.limit("100/hour")
async def list_analyses(request: Request, user: dict = Depends(get_current_user)):
    sb = _user_sb(user)
    res = sb.table("analyses") \
        .select("*") \
        .eq("user_id", user["user_id"]) \
        .order("created_at", desc=True) \
        .execute()
    return res.data


@app.get("/analyses/{analysis_id}")
@limiter.limit("100/hour")
async def get_analysis(request: Request, analysis_id: str, user: dict = Depends(get_current_user)):
    sb = _user_sb(user)
    res = sb.table("analyses") \
        .select("*") \
        .eq("id", analysis_id) \
        .eq("user_id", user["user_id"]) \
        .execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return res.data[0]


from app.routes.applications import router as applications_router
from app.routes.jobs import router as jobs_router
from app.routes.profile import router as profile_router
from app.routes.generate_resume import router as generate_resume_router
app.include_router(applications_router)
app.include_router(jobs_router)
app.include_router(profile_router)
app.include_router(generate_resume_router)


class AnalyzeRequest(BaseModel):
    resume: str
    job_description: str
    company_name: str = ""
    role_name: str = ""
    linkedin_text: str = ""


class InterviewPrepRequest(BaseModel):
    role: str
    company: str = ""
    gaps: list[str] = []
    job_description: str = ""


@app.post("/interview-prep")
@limiter.limit("5/hour")
async def interview_prep(
    request: Request,
    body: InterviewPrepRequest,
    user: dict = Depends(get_current_user),
):
    """Generate 5 STAR-format behavioral interview questions."""
    gaps_text = "\n".join(f"- {g}" for g in body.gaps) if body.gaps else "No specific gaps identified."
    jd_section = f"\nJOB DESCRIPTION:\n{body.job_description[:2000]}" if body.job_description.strip() else ""

    prompt = f"""You are an expert interview coach preparing a candidate for a behavioral interview.

ROLE: {body.role}
COMPANY: {body.company or 'Not specified'}
{jd_section}

CANDIDATE'S IDENTIFIED GAPS:
{gaps_text}

Generate exactly 5 behavioral interview questions in STAR format that:
1. Are specific to this role at this company
2. Where possible, target the candidate's identified gaps so they can prepare for tough questions
3. Use the format: "Tell me about a time when..." or "Describe a situation where..."
4. Cover different competency areas (leadership, problem-solving, teamwork, technical skills, adaptability)
5. Are realistic questions an interviewer for this specific role would ask

Return ONLY a JSON array of 5 question strings. No other text."""

    try:
        message = anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        questions = json.loads(raw)
        if not isinstance(questions, list):
            questions = []
        return {"questions": questions[:5]}
    except Exception as e:
        print(f"[/interview-prep] Error: {e}")
        raise HTTPException(status_code=500, detail="Couldn't generate interview questions. Please try again.")


def _user_sb(user: dict):
    """Per-request Supabase client with user JWT for RLS enforcement."""
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


@app.get("/")
def root():
    return {"status": "Holt backend running"}


MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}


@app.post("/upload-resume")
@limiter.limit("20/hour")
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only PDF and Word (.docx) files are accepted.",
        )

    contents = await file.read()

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size is 5 MB.",
        )

    try:
        if file.content_type == "application/pdf":
            reader = PdfReader(io.BytesIO(contents))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        else:
            doc = Document(io.BytesIO(contents))
            text = "\n".join(paragraph.text for paragraph in doc.paragraphs)
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from this file. It may be corrupted or image-based.",
        )

    text = text.strip()
    if not text:
        raise HTTPException(
            status_code=422,
            detail="No readable text found. The file may be a scanned image — try pasting your resume text instead.",
        )

    return {"text": text, "filename": file.filename}


@app.post("/analyze")
@limiter.limit("10/hour")
async def analyze(
    request: Request,
    body: AnalyzeRequest,
    user: dict = Depends(get_current_user),
):
    if not body.resume.strip() or not body.job_description.strip():
        raise HTTPException(status_code=400, detail="Resume and job description are required.")

    linkedin_section = ""
    if body.linkedin_text.strip():
        linkedin_section = f"""

LINKEDIN PROFILE (supplementary context about the candidate's background, skills framing, and professional narrative — use this to inform your analysis alongside the resume):
{body.linkedin_text.strip()}
"""

    prompt = f"""You are an expert resume analyst and career coach.

Compare the following resume against the job description and return a structured analysis.

RESUME:
{body.resume}
{linkedin_section}
JOB DESCRIPTION:
{body.job_description}

Return your analysis in this exact format:

COMPANY: [Extract the company/organization name from the job description]
ROLE: [Extract the job title/role name from the job description]

MATCH SCORE: [0-100]

SUB-SCORES:
SKILLS_MATCH: [0-100 how well the candidate's technical skills and experience match the job requirements]
SENIORITY_FIT: [0-100 how well the candidate's level and years of experience match the role's seniority expectations]
SALARY_ALIGNMENT: [0-100 based on role type, location, and any salary info — how well the role likely aligns with reasonable expectations for this candidate's level. If no salary info available, use 70]
GROWTH_POTENTIAL: [0-100 how much this role could advance the candidate's career trajectory based on their background]

STRENGTHS:
- [List what the candidate does well relative to this role]

GAPS:
- [List missing skills, experience, or qualifications]

RECOMMENDATIONS:
- [Specific, actionable advice to improve the resume for this role]

SUMMARY:
[2-3 sentence overall assessment]"""

    try:
        message = anthropic_client.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        raw_result = message.content[0].text

        # Extract company and role from AI response (fallback to user-provided)
        company_match = re.search(r"COMPANY:\s*(.+)", raw_result, re.IGNORECASE)
        role_match = re.search(r"ROLE:\s*(.+)", raw_result, re.IGNORECASE)
        extracted_company = company_match.group(1).strip() if company_match else ""
        extracted_role = role_match.group(1).strip() if role_match else ""
        final_company = body.company_name or extracted_company
        final_role = body.role_name or extracted_role

        # Parse score from the AI response
        score_match = re.search(r"MATCH SCORE:\s*(\d+)", raw_result, re.IGNORECASE)
        score = int(score_match.group(1)) if score_match else 0

        # Parse sub-scores
        def parse_sub_score(name: str, default: int = 50) -> int:
            m = re.search(rf"{name}:\s*(\d+)", raw_result, re.IGNORECASE)
            return int(m.group(1)) if m else default

        skills_match = parse_sub_score("SKILLS_MATCH")
        seniority_fit = parse_sub_score("SENIORITY_FIT")
        salary_alignment = parse_sub_score("SALARY_ALIGNMENT", 70)
        growth_potential = parse_sub_score("GROWTH_POTENTIAL")

        # Parse sections
        def parse_section(text: str, section: str) -> list[str]:
            pattern = rf"{section}:\s*\n([\s\S]*?)(?=\n(?:STRENGTHS|GAPS|RECOMMENDATIONS|SUMMARY):|$)"
            m = re.search(pattern, text, re.IGNORECASE)
            if not m:
                return []
            return [line.strip().lstrip("-•* ") for line in m.group(1).split("\n") if line.strip()]

        strengths = parse_section(raw_result, "STRENGTHS")
        gaps = parse_section(raw_result, "GAPS")
        recommendations = parse_section(raw_result, "RECOMMENDATIONS")
        summary_match = re.search(r"SUMMARY:\s*\n([\s\S]*?)$", raw_result, re.IGNORECASE)
        summary = summary_match.group(1).strip() if summary_match else ""

        # Save analysis to Supabase (include original inputs for resume generation)
        sb = _user_sb(user)
        insert_data = {
            "user_id": user["user_id"],
            "company_name": final_company,
            "role_name": final_role,
            "score": score,
            "summary": summary,
            "strengths": json.dumps(strengths),
            "gaps": json.dumps(gaps),
            "recommendations": json.dumps(recommendations),
            "resume_text": body.resume,
            "job_description_text": body.job_description,
            "skills_match": skills_match,
            "seniority_fit": seniority_fit,
            "salary_alignment": salary_alignment,
            "growth_potential": growth_potential,
        }
        try:
            insert_res = sb.table("analyses").insert(insert_data).execute()
        except Exception:
            # Sub-score columns may not exist yet — retry without them
            for col in ("skills_match", "seniority_fit", "salary_alignment", "growth_potential"):
                insert_data.pop(col, None)
            insert_res = sb.table("analyses").insert(insert_data).execute()

        analysis_id = insert_res.data[0]["id"] if insert_res.data else None

        # Log activity
        sb.table("activity_log").insert({
            "user_id": user["user_id"],
            "action_type": "analysis",
        }).execute()

        # Generate Ott coaching tips via Haiku (fast + cheap)
        coaching_tips = []
        try:
            coaching_prompt = f"""You are Ott, a warm and encouraging otter career coach. You speak in a friendly, specific, and actionable way — like a supportive mentor who knows ATS systems inside out.

Given this resume analysis, generate exactly 2-3 coaching tips.

SCORE: {score}/100
STRENGTHS: {json.dumps(strengths)}
GAPS: {json.dumps(gaps)}
RESUME EXCERPT (first 500 chars): {body.resume[:500]}
JOB DESCRIPTION EXCERPT (first 500 chars): {body.job_description[:500]}

Rules for each tip:
- Reference SPECIFIC words, skills, or phrases from the resume and job description
- Tell the user EXACTLY what to add, change, or rephrase and WHERE
- Focus on ATS keyword matching — use the job posting's exact terminology
- Be warm and encouraging — acknowledge what they're doing right before suggesting changes
- Keep each tip to 1-2 sentences

Return ONLY the tips as a JSON array of strings. No other text."""

            coaching_msg = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                messages=[{"role": "user", "content": coaching_prompt}]
            )
            coaching_raw = coaching_msg.content[0].text.strip()
            # Strip markdown code fences if present
            if coaching_raw.startswith("```"):
                coaching_raw = re.sub(r"^```(?:json)?\s*", "", coaching_raw)
                coaching_raw = re.sub(r"\s*```$", "", coaching_raw)
            coaching_tips = json.loads(coaching_raw)
            if not isinstance(coaching_tips, list):
                coaching_tips = []
        except Exception as exc:
            print(f"[Ott coaching] Failed: {exc}")
            coaching_tips = []

        # Extract skills from resume and save to profile (async, non-blocking)
        extracted_skills = []
        try:
            skills_prompt = f"""Extract all skills from this resume text as a JSON array of strings. Include: technical skills, tools, certifications, soft skills relevant to operations/management, and any domain expertise. Be specific — 'inventory management' not just 'management'. Return ONLY valid JSON array, no other text.

Resume: {body.resume[:3000]}"""

            skills_msg = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                messages=[{"role": "user", "content": skills_prompt}]
            )
            skills_raw = skills_msg.content[0].text.strip()
            if skills_raw.startswith("```"):
                skills_raw = re.sub(r"^```(?:json)?\s*", "", skills_raw)
                skills_raw = re.sub(r"\s*```$", "", skills_raw)
            extracted_skills = json.loads(skills_raw)
            if isinstance(extracted_skills, list):
                # Save to profile
                sb.table("profiles").upsert({
                    "id": user["user_id"],
                    "skills_extracted": extracted_skills,
                }).execute()
        except Exception as exc:
            print(f"[Skills extraction] Failed: {exc}")

        return {"result": raw_result, "analysis_id": analysis_id, "parsed": {
            "score": score,
            "strengths": strengths,
            "gaps": gaps,
            "recommendations": recommendations,
            "summary": summary,
            "coaching_tips": coaching_tips,
            "company_name": final_company,
            "role_name": final_role,
            "job_description_text": body.job_description,
            "skills_match": skills_match,
            "seniority_fit": seniority_fit,
            "salary_alignment": salary_alignment,
            "growth_potential": growth_potential,
            "skills_extracted": extracted_skills,
        }}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[/analyze] Error: {e}")
        raise HTTPException(status_code=500, detail="Something went wrong during analysis. Please try again.")
