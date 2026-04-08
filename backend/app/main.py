from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
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
    resume: str = Field(..., max_length=50000)
    job_description: str = Field(..., max_length=20000)
    company_name: str = Field(default="", max_length=200)
    role_name: str = Field(default="", max_length=200)
    linkedin_text: str = Field(default="", max_length=10000)


class InterviewPrepRequest(BaseModel):
    role: str = Field(..., max_length=200)
    company: str = Field(default="", max_length=200)
    gaps: list[str] = Field(default_factory=list, max_length=20)
    job_description: str = Field(default="", max_length=20000)


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

# Magic bytes (file signatures) for each declared MIME type. Validating these
# before parsing prevents a spoofed Content-Type from feeding arbitrary bytes
# to PdfReader / python-docx. PDFs start with "%PDF" (25 50 44 46). DOCX is
# a ZIP container, so it starts with "PK\x03\x04" (50 4B 03 04).
FILE_SIGNATURES = {
    "application/pdf": b"%PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK\x03\x04",
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

    # Magic-byte validation — runs BEFORE any parser touches the bytes.
    expected_sig = FILE_SIGNATURES[file.content_type]
    if not contents[: len(expected_sig)] == expected_sig:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. The file does not match its declared type.",
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


OPUS_MODEL = "claude-opus-4-6"

ANALYZE_SYSTEM_PROMPT = """You are Ott, Holt's career intelligence engine. You are analyzing a resume for a specific candidate with a known background and career goals.

The candidate is making a career pivot. Their current experience is real and valuable — it is simply described in the wrong vocabulary for their target industry. Your job is to identify both the match AND the translation opportunity.

TRUTHFULNESS RULES — these are non-negotiable:
- Strengths must come from actual content in the resume or LinkedIn profile.
- Gaps must be real requirements from the job description that are genuinely absent.
- Recommendations must only suggest reframing language the candidate already uses, never adding skills they don't have.
- If a skill could be inferred from their existing experience (e.g., "ran a Wawa office" implies basic office administration), flag this in `translation_opportunities`, NOT as a gap.
- The test for every recommendation: "Could the candidate defend this in an interview?" If no, do not include it.

SCORING PHILOSOPHY:
- 70-100 (strong): Has the core requirements. Gaps are soft skills or easily reframeable language.
- 45-69 (stretch): Has a transferable foundation. Gaps require real effort to close (a course, certification, or 3-6 months experience).
- 20-44 (weak): Missing hard requirements that take significant time to acquire.
- 0-19 (wrong_domain): Requires fundamentally different education or licensing (medical degree, law degree, engineering PE license).

SUB-SCORE RULES:
- skills_match: How well the candidate's actual demonstrated skills match the JD's must-haves. Be honest.
- seniority_fit: Years and level of responsibility vs. what the JD asks for.
- salary_alignment: ONLY score this if the JD discloses a salary or salary range. If salary is absent, return null and set salary_disclosed=false. NEVER default to 70.
- growth_potential: How much this role could advance the candidate's stated trajectory toward target_roles.

GAP EFFORT TAGS — be honest with the candidate about what closing each gap would take:
- "reframe": She already has it; just needs to use the JD's language.
- "easy": A short course, online tutorial, or self-study (under 1 month).
- "months": A certification or substantial training (1-6 months).
- "years": Degree, license, or major career detour.

The `honest` field on each gap should be true if this is a REAL gap she lacks, false if it's something she has but described differently (in which case it should arguably move to translation_opportunities instead).

OTT'S VOICE for the summary field:
- Strong tier: energetic, affirming, names the strongest evidence. "You've got this."
- Stretch tier: coaching, specific. "Closer than you think — here's the bridge."
- Weak tier: honest and redirecting. "This one's a reach — here's something closer."
- Wrong-domain tier: kind but firm. "This isn't the right path right now."
- First-person ("I see..."), warm, never corporate, occasional otter pun is fine but not required.
- 2-3 sentences. Always backed by something specific from the resume or JD."""


# Tool-use schema — forces structured JSON output, no regex parsing.
ANALYSIS_TOOL = {
    "name": "submit_analysis",
    "description": "Submit the structured resume analysis result for this candidate and job.",
    "input_schema": {
        "type": "object",
        "properties": {
            "company": {"type": "string", "description": "Company/organization name extracted from the JD"},
            "role": {"type": "string", "description": "Job title/role name extracted from the JD"},
            "match_score": {"type": "integer", "minimum": 0, "maximum": 100},
            "score_tier": {
                "type": "string",
                "enum": ["strong", "stretch", "weak", "wrong_domain"],
                "description": "Tier label per the scoring philosophy",
            },
            "sub_scores": {
                "type": "object",
                "properties": {
                    "skills_match": {"type": "integer", "minimum": 0, "maximum": 100},
                    "seniority_fit": {"type": "integer", "minimum": 0, "maximum": 100},
                    "salary_alignment": {
                        "type": ["integer", "null"],
                        "description": "0-100 if JD discloses salary, null otherwise. Never default to 70.",
                    },
                    "growth_potential": {"type": "integer", "minimum": 0, "maximum": 100},
                },
                "required": ["skills_match", "seniority_fit", "salary_alignment", "growth_potential"],
            },
            "salary_disclosed": {
                "type": "boolean",
                "description": "True if the JD includes a salary or salary range, false otherwise",
            },
            "strengths": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Real strengths from the resume that match this role. Each grounded in actual resume content.",
            },
            "gaps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "gap": {"type": "string"},
                        "effort": {"type": "string", "enum": ["reframe", "easy", "months", "years"]},
                        "honest": {"type": "boolean"},
                    },
                    "required": ["gap", "effort", "honest"],
                },
            },
            "recommendations": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Honest reframes only. Never suggest adding a skill the candidate doesn't have.",
            },
            "translation_opportunities": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Specific examples of the candidate's existing language (e.g. hospitality/retail) that map to corporate vocabulary for this role. Format: 'X → Y'.",
            },
            "summary": {
                "type": "string",
                "description": "2-3 sentences in Ott's voice, tone matching the score tier.",
            },
        },
        "required": [
            "company", "role", "match_score", "score_tier", "sub_scores",
            "salary_disclosed", "strengths", "gaps", "recommendations",
            "translation_opportunities", "summary",
        ],
    },
}


def _fetch_profile_for_analysis(sb, user_id: str) -> dict:
    """Best-effort fetch of the user's profile for prompt context.

    Returns an empty dict on any failure — analysis must still run even
    if the profile row is missing or unreadable.
    """
    try:
        res = sb.table("profiles").select("*").eq("id", user_id).execute()
        if res.data:
            return res.data[0]
    except Exception:
        pass
    return {}


def _format_profile_for_prompt(profile: dict) -> str:
    """Render the profile into a compact, model-friendly section.
    Only includes fields that are non-empty so the model isn't biased by 'None' / 'null'."""
    if not profile:
        return "No profile data on file — treat the candidate as anonymous."

    lines = []
    if profile.get("full_name"):
        lines.append(f"Name: {profile['full_name']}")
    if profile.get("job_title"):
        lines.append(f"Current role: {profile['job_title']}")
    if profile.get("target_roles"):
        lines.append(f"Targeting: {profile['target_roles']}")
    sal_min = profile.get("target_salary_min")
    sal_max = profile.get("target_salary_max")
    if sal_min and sal_max:
        lines.append(f"Salary target: ${sal_min:,} - ${sal_max:,}")
    elif sal_min:
        lines.append(f"Salary target: ${sal_min:,}+")
    if profile.get("location"):
        lines.append(f"Location: {profile['location']}")
    if profile.get("schedule_preference"):
        lines.append(f"Schedule preference: {profile['schedule_preference']}")
    if profile.get("degree_status"):
        lines.append(f"Degree status: {profile['degree_status']}")
    skills = profile.get("skills_extracted")
    if isinstance(skills, str):
        try:
            skills = json.loads(skills)
        except (json.JSONDecodeError, TypeError):
            skills = []
    if skills:
        lines.append(f"Extracted skills: {', '.join(skills)}")
    if profile.get("about_me"):
        lines.append(f"About: {profile['about_me']}")

    return "\n".join(lines) if lines else "No profile data on file."


@app.post("/analyze")
@limiter.limit("10/hour")
async def analyze(
    request: Request,
    body: AnalyzeRequest,
    user: dict = Depends(get_current_user),
):
    if not body.resume.strip() or not body.job_description.strip():
        raise HTTPException(status_code=400, detail="Resume and job description are required.")

    sb = _user_sb(user)

    # Fetch the candidate's profile BEFORE the Claude call so the prompt is personalized.
    profile = _fetch_profile_for_analysis(sb, user["user_id"])
    profile_section = _format_profile_for_prompt(profile)

    linkedin_section = ""
    if body.linkedin_text.strip():
        linkedin_section = f"\n\nLINKEDIN (supplementary):\n{body.linkedin_text.strip()}"

    user_message = f"""CANDIDATE PROFILE:
{profile_section}

RESUME:
{body.resume}{linkedin_section}

JOB DESCRIPTION:
{body.job_description}

Analyze this match. Apply the truthfulness rules strictly. Use the gap effort tags honestly. If salary is not disclosed in the JD, set salary_alignment=null and salary_disclosed=false. Submit the result via the submit_analysis tool."""

    try:
        message = anthropic_client.messages.create(
            model=OPUS_MODEL,
            max_tokens=2048,
            system=ANALYZE_SYSTEM_PROMPT,
            tools=[ANALYSIS_TOOL],
            tool_choice={"type": "tool", "name": "submit_analysis"},
            messages=[{"role": "user", "content": user_message}],
        )

        # Extract the structured tool_use payload
        result_data = None
        for block in message.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "submit_analysis":
                result_data = block.input
                break
        if result_data is None:
            raise ValueError("Model did not return submit_analysis tool call")

        extracted_company = (result_data.get("company") or "").strip()
        extracted_role = (result_data.get("role") or "").strip()
        final_company = body.company_name or extracted_company
        final_role = body.role_name or extracted_role

        score = int(result_data.get("match_score") or 0)
        score_tier = result_data.get("score_tier") or ""

        sub_scores = result_data.get("sub_scores") or {}
        skills_match = int(sub_scores.get("skills_match") or 0)
        seniority_fit = int(sub_scores.get("seniority_fit") or 0)
        # salary_alignment is intentionally allowed to be None — we no longer fake it.
        salary_alignment = sub_scores.get("salary_alignment")
        if salary_alignment is not None:
            salary_alignment = int(salary_alignment)
        growth_potential = int(sub_scores.get("growth_potential") or 0)
        salary_disclosed = bool(result_data.get("salary_disclosed", False))

        strengths = [s for s in (result_data.get("strengths") or []) if isinstance(s, str)]
        # gaps are now structured objects {gap, effort, honest} — store as-is.
        gaps_structured = result_data.get("gaps") or []
        recommendations = [r for r in (result_data.get("recommendations") or []) if isinstance(r, str)]
        translation_opportunities = [
            t for t in (result_data.get("translation_opportunities") or []) if isinstance(t, str)
        ]
        summary = (result_data.get("summary") or "").strip()

        # Save analysis to Supabase (include original inputs for resume generation).
        # The sb client was created at the top of the function for the profile fetch.
        insert_data = {
            "user_id": user["user_id"],
            "company_name": final_company,
            "role_name": final_role,
            "score": score,
            "summary": summary,
            "strengths": json.dumps(strengths),
            "gaps": json.dumps(gaps_structured),
            "recommendations": json.dumps(recommendations),
            "resume_text": body.resume,
            "job_description_text": body.job_description,
            "skills_match": skills_match,
            "seniority_fit": seniority_fit,
            "salary_alignment": salary_alignment,
            "growth_potential": growth_potential,
            "score_tier": score_tier,
            "salary_disclosed": salary_disclosed,
            "translation_opportunities": json.dumps(translation_opportunities),
        }
        # Newer columns may not exist on older Supabase schemas. Drop them progressively.
        OPTIONAL_NEW_COLS = ("score_tier", "salary_disclosed", "translation_opportunities")
        OPTIONAL_SUB_SCORE_COLS = ("skills_match", "seniority_fit", "salary_alignment", "growth_potential")
        try:
            insert_res = sb.table("analyses").insert(insert_data).execute()
        except Exception:
            for col in OPTIONAL_NEW_COLS:
                insert_data.pop(col, None)
            try:
                insert_res = sb.table("analyses").insert(insert_data).execute()
            except Exception:
                for col in OPTIONAL_SUB_SCORE_COLS:
                    insert_data.pop(col, None)
                insert_res = sb.table("analyses").insert(insert_data).execute()

        analysis_id = insert_res.data[0]["id"] if insert_res.data else None

        # Log activity
        sb.table("activity_log").insert({
            "user_id": user["user_id"],
            "action_type": "analysis",
        }).execute()

        # Generate Ott coaching tips via Haiku (legacy inline version — overhauled in Section 2)
        coaching_tips = []
        try:
            gaps_text_for_haiku = json.dumps([g.get("gap", "") if isinstance(g, dict) else str(g) for g in gaps_structured])
            coaching_prompt = f"""You are Ott, a warm and encouraging otter career coach. You speak in a friendly, specific, and actionable way — like a supportive mentor who knows ATS systems inside out.

Given this resume analysis, generate exactly 2-3 coaching tips.

SCORE: {score}/100
STRENGTHS: {json.dumps(strengths)}
GAPS: {gaps_text_for_haiku}
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

        return {"analysis_id": analysis_id, "parsed": {
            "score": score,
            "score_tier": score_tier,
            "strengths": strengths,
            "gaps": gaps_structured,
            "recommendations": recommendations,
            "translation_opportunities": translation_opportunities,
            "summary": summary,
            "coaching_tips": coaching_tips,
            "company_name": final_company,
            "role_name": final_role,
            "job_description_text": body.job_description,
            "skills_match": skills_match,
            "seniority_fit": seniority_fit,
            "salary_alignment": salary_alignment,
            "salary_disclosed": salary_disclosed,
            "growth_potential": growth_potential,
            "skills_extracted": extracted_skills,
        }}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[/analyze] Error: {e}")
        raise HTTPException(status_code=500, detail="Something went wrong during analysis. Please try again.")
