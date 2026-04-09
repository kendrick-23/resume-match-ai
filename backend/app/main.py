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

from app.services.file_extraction import extract_resume_text_from_upload

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
from app.routes.resumes import router as resumes_router
app.include_router(applications_router)
app.include_router(jobs_router)
app.include_router(profile_router)
app.include_router(generate_resume_router)
app.include_router(resumes_router)


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


INTERVIEW_PREP_SYSTEM_PROMPT = """You are an expert interview coach. You know this candidate's actual background — their resume, skills, target roles, and the strengths/gaps identified for this specific role.

Your job: generate behavioral interview questions AND brief STAR answer scaffolds that draw on the candidate's REAL experience. Not generic prompts. Not advice to "think about a time you led a team" — instead, point them at a specific situation from their actual work history.

RULES:
- Every STAR scaffold must reference something concrete from the candidate's resume or about_me. If you can't ground a scaffold in their real experience, choose a different question.
- Cover different competency areas across the 5 questions (leadership, problem-solving, teamwork, communication, adaptability, and any technical skills relevant to this role).
- If the role has identified gaps, include 1-2 questions that gently probe those gaps so the candidate can prepare a thoughtful answer (acknowledging the gap and showing transferable skill).
- Tone: like a friend who has read their resume and is helping them prep over coffee. Direct, specific, encouraging."""


INTERVIEW_PREP_TOOL = {
    "name": "submit_interview_prep",
    "description": "Submit 5 candidate-specific behavioral interview questions with STAR scaffolds.",
    "input_schema": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "minItems": 5,
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string"},
                        "competency": {"type": "string", "description": "The competency this question tests, e.g. 'Leadership', 'Problem-solving'"},
                        "star_scaffold": {
                            "type": "string",
                            "description": "2-sentence STAR scaffold pointing the candidate at a specific real situation from their resume.",
                        },
                    },
                    "required": ["question", "competency", "star_scaffold"],
                },
            },
        },
        "required": ["questions"],
    },
}


@app.post("/interview-prep")
@limiter.limit("5/hour")
async def interview_prep(
    request: Request,
    body: InterviewPrepRequest,
    user: dict = Depends(get_current_user),
):
    """Generate 5 candidate-specific STAR-format behavioral interview questions
    with personalized answer scaffolds."""
    sb = _user_sb(user)

    # Pull profile + the most recent analysis for this role/company so the prep
    # is anchored in the candidate's actual experience.
    profile = _fetch_profile_for_analysis(sb, user["user_id"])

    latest_analysis = None
    try:
        ana_query = sb.table("analyses") \
            .select("strengths,gaps,resume_text,role_name,company_name") \
            .eq("user_id", user["user_id"]) \
            .order("created_at", desc=True) \
            .limit(10) \
            .execute()
        rows = ana_query.data or []
        # Prefer an analysis that matches this role; fall back to most recent.
        for row in rows:
            if row.get("role_name", "").strip().lower() == body.role.strip().lower():
                latest_analysis = row
                break
        if latest_analysis is None and rows:
            latest_analysis = rows[0]
    except Exception as exc:
        print(f"[/interview-prep] Profile/analysis fetch failed: {exc}")

    # Build the candidate background section.
    target_roles = profile.get("target_roles") or "(not specified)"
    about_me = profile.get("about_me") or "(none)"
    skills = profile.get("skills_extracted") or []
    if isinstance(skills, str):
        try:
            skills = json.loads(skills)
        except (json.JSONDecodeError, TypeError):
            skills = []

    # Resume highlights — first 4000 chars of the resume from the matching analysis.
    resume_highlights = ""
    if latest_analysis and latest_analysis.get("resume_text"):
        resume_highlights = latest_analysis["resume_text"][:4000]
    else:
        resume_highlights = "(no resume on file for this candidate)"

    # Strengths/gaps from the analysis (handles both old string format and new structured format)
    analysis_strengths = []
    analysis_gaps = []
    if latest_analysis:
        try:
            raw_s = latest_analysis.get("strengths")
            analysis_strengths = json.loads(raw_s) if isinstance(raw_s, str) else (raw_s or [])
        except (json.JSONDecodeError, TypeError):
            analysis_strengths = []
        try:
            raw_g = latest_analysis.get("gaps")
            parsed_g = json.loads(raw_g) if isinstance(raw_g, str) else (raw_g or [])
            # Normalize new structured-gap shape to plain strings for the prompt
            analysis_gaps = [
                g.get("gap") if isinstance(g, dict) else g for g in parsed_g if g
            ]
        except (json.JSONDecodeError, TypeError):
            analysis_gaps = []

    # Caller-provided gaps override (from Tracker)
    final_gaps = body.gaps if body.gaps else analysis_gaps
    final_strengths = analysis_strengths

    jd_section = f"\nJOB DESCRIPTION:\n{body.job_description[:3000]}" if body.job_description.strip() else "\n(no JD provided)"

    user_message = f"""ROLE: {body.role} at {body.company or 'Not specified'}

CANDIDATE BACKGROUND:
- Target roles: {target_roles}
- About: {about_me}
- Key skills: {", ".join(skills) if skills else "(none extracted)"}

RESUME HIGHLIGHTS:
{resume_highlights}

IDENTIFIED STRENGTHS FOR THIS ROLE:
{json.dumps(final_strengths, ensure_ascii=False)}

IDENTIFIED GAPS FOR THIS ROLE:
{json.dumps(final_gaps, ensure_ascii=False)}
{jd_section}

Generate 5 behavioral interview questions tailored to this candidate. Each STAR scaffold must reference something specific from the resume highlights above (e.g. "Draw on your experience managing 35 staff at Wawa — describe a specific compliance situation you navigated...")."""

    try:
        message = anthropic_client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=1500,
            system=INTERVIEW_PREP_SYSTEM_PROMPT,
            tools=[INTERVIEW_PREP_TOOL],
            tool_choice={"type": "tool", "name": "submit_interview_prep"},
            messages=[{"role": "user", "content": user_message}],
        )
        questions: list[dict] = []
        for block in message.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "submit_interview_prep":
                raw_questions = block.input.get("questions") or []
                for q in raw_questions:
                    if isinstance(q, dict) and q.get("question"):
                        questions.append({
                            "question": str(q.get("question", "")),
                            "competency": str(q.get("competency", "")),
                            "star_scaffold": str(q.get("star_scaffold", "")),
                        })
                break
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


@app.post("/upload-resume")
@limiter.limit("20/hour")
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    contents = await file.read()
    text = extract_resume_text_from_upload(file.content_type, contents)
    return {"text": text, "filename": file.filename}


OPUS_MODEL = "claude-opus-4-6"
HAIKU_MODEL = "claude-haiku-4-5-20251001"


COACHING_SYSTEM_PROMPT = """You are Ott — a career coach who is warm, direct, occasionally punny, and always backed by real data. You speak in first person. You never use corporate jargon. You give specific, actionable advice the candidate can execute today.

TRUTHFULNESS — non-negotiable:
If a JD keyword does not appear in some form in the candidate's resume or LinkedIn, do NOT tell them to add it. Instead, find the closest real experience they DO have and show them how to translate it into that vocabulary.

TONE BY SCORE TIER:
- 70+ (strong): Energetic and affirming. "You've got this. Here's how to make it obvious to the ATS."
- 45-69 (stretch): Coaching and specific. "You're closer than you think. Here's the bridge to build."
- <45 (weak / wrong_domain): Honest and redirecting. "This one's a reach. Here's what would actually close this gap — and here's a role that's already within reach."

Each tip:
- References specific text from the resume AND the JD
- Suggests only reframes of real experience, never new skills
- Matches the tone for the score tier
- 1-3 sentences max
- Sounds like Ott, not a LinkedIn post"""


COACHING_TIPS_TOOL = {
    "name": "submit_coaching_tips",
    "description": "Submit 2-3 Ott coaching tips for this analysis.",
    "input_schema": {
        "type": "object",
        "properties": {
            "tips": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 2,
                "maxItems": 3,
            },
        },
        "required": ["tips"],
    },
}


def _generate_coaching_tips(
    *,
    score: int,
    score_tier: str,
    strengths: list,
    gaps_structured: list,
    translation_opportunities: list,
    profile: dict,
    resume: str,
    job_description: str,
) -> list[str]:
    """Ott's Take — Haiku follow-up after the main /analyze call.

    Receives the structured Opus output instead of re-deriving anything.
    Sends FULL resume + FULL JD (no 500-char truncations) so the model
    can ground every tip in real text.
    """
    target_roles = profile.get("target_roles") or "(not specified)"
    skills = profile.get("skills_extracted") or []
    if isinstance(skills, str):
        try:
            skills = json.loads(skills)
        except (json.JSONDecodeError, TypeError):
            skills = []

    gaps_payload = json.dumps(gaps_structured, ensure_ascii=False)
    strengths_payload = json.dumps(strengths, ensure_ascii=False)
    translation_payload = json.dumps(translation_opportunities, ensure_ascii=False)

    user_message = f"""SCORE: {score}/100
TIER: {score_tier or "(unknown)"}
CANDIDATE TARGET ROLES: {target_roles}
CANDIDATE SKILLS: {", ".join(skills) if skills else "(none extracted yet)"}

ANALYSIS RESULTS:
Strengths: {strengths_payload}
Gaps (with effort levels): {gaps_payload}
Translation opportunities: {translation_payload}

FULL RESUME:
{resume}

FULL JOB DESCRIPTION:
{job_description}

Generate 2-3 coaching tips. Apply the truthfulness rule strictly: never tell the candidate to add a skill they don't have evidence for. Match the tone to the {score_tier or "stretch"} tier."""

    try:
        msg = anthropic_client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=600,
            system=COACHING_SYSTEM_PROMPT,
            tools=[COACHING_TIPS_TOOL],
            tool_choice={"type": "tool", "name": "submit_coaching_tips"},
            messages=[{"role": "user", "content": user_message}],
        )
        for block in msg.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "submit_coaching_tips":
                tips = block.input.get("tips") or []
                return [t for t in tips if isinstance(t, str)][:3]
    except Exception as exc:
        print(f"[Ott coaching] Failed: {exc}")
    return []


SKILLS_EXTRACTION_TOOL = {
    "name": "submit_skills",
    "description": "Submit a normalized, deduplicated list of the candidate's skills.",
    "input_schema": {
        "type": "object",
        "properties": {
            "skills": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Canonical skill names — specific, deduplicated, normalized.",
            },
        },
        "required": ["skills"],
    },
}


def _extract_and_merge_skills(
    *,
    sb,
    user_id: str,
    resume: str,
    target_roles: str,
    existing_skills,
) -> list[str]:
    """Skills extractor — full resume, target_roles-aware, merge-not-overwrite.

    - No more 'operations/management' hardcode — uses the candidate's actual target_roles.
    - No truncation — sends the full resume.
    - Receives existing_skills and instructs the model to merge + dedupe.
    - Normalization rule: prefer canonical terms (e.g. 'P&L management' over 'P and L management').
    """
    if isinstance(existing_skills, str):
        try:
            existing_skills = json.loads(existing_skills)
        except (json.JSONDecodeError, TypeError):
            existing_skills = []
    if not isinstance(existing_skills, list):
        existing_skills = []

    target_roles_text = target_roles.strip() or "the candidate's intended career direction"
    existing_payload = json.dumps(existing_skills, ensure_ascii=False)

    user_message = f"""Extract and normalize all skills from this resume.

Target roles: {target_roles_text}

Previously extracted skills (merge with these — do NOT erase them; if a skill is already present, keep its existing form):
{existing_payload}

Include:
- Technical skills and tools (software, platforms, systems)
- Certifications and licenses
- Soft skills relevant to {target_roles_text}
- Any domain expertise demonstrated in the resume

Rules:
- Be specific. "Inventory management", not "management". "QuickBooks", not "accounting software".
- Normalize to a single canonical term per skill. Examples:
    "P and L management" / "Profit & Loss" / "P&L" → "P&L management"
    "MS Excel" / "Excel" / "Microsoft Excel" → "Microsoft Excel"
- Deduplicate aggressively. The merged output should have no two entries that mean the same thing.
- Only include skills with actual evidence in the resume. Do not invent.

FULL RESUME:
{resume}

Submit the merged, deduplicated, canonical list via the submit_skills tool."""

    try:
        msg = anthropic_client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=800,
            tools=[SKILLS_EXTRACTION_TOOL],
            tool_choice={"type": "tool", "name": "submit_skills"},
            messages=[{"role": "user", "content": user_message}],
        )
        merged: list[str] = []
        for block in msg.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "submit_skills":
                raw_skills = block.input.get("skills") or []
                merged = [s.strip() for s in raw_skills if isinstance(s, str) and s.strip()]
                break

        if merged:
            try:
                sb.table("profiles").upsert({
                    "id": user_id,
                    "skills_extracted": merged,
                }).execute()
            except Exception as exc:
                print(f"[Skills extraction] Upsert failed: {exc}")
            return merged
    except Exception as exc:
        print(f"[Skills extraction] Failed: {exc}")

    # On any failure, preserve the existing list rather than wiping it.
    return existing_skills


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

        # Ott's Take coaching tips — overhauled in Section 2.
        # Profile-aware, tiered tone, full context, truthfulness guardrail.
        coaching_tips = _generate_coaching_tips(
            score=score,
            score_tier=score_tier,
            strengths=strengths,
            gaps_structured=gaps_structured,
            translation_opportunities=translation_opportunities,
            profile=profile,
            resume=body.resume,
            job_description=body.job_description,
        )

        # Extract skills — overhauled in Section 3.
        # No more "operations/management" bias, no more 3000-char truncation,
        # merges with existing skills_extracted instead of overwriting.
        extracted_skills = _extract_and_merge_skills(
            sb=sb,
            user_id=user["user_id"],
            resume=body.resume,
            target_roles=profile.get("target_roles") or "",
            existing_skills=profile.get("skills_extracted") or [],
        )

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
