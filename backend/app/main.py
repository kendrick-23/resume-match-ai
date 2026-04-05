from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from anthropic import Anthropic
from supabase import create_client
from dotenv import load_dotenv
import os
import io
import jwt
from PyPDF2 import PdfReader
from docx import Document

load_dotenv()

app = FastAPI()

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
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.InvalidTokenError:
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
async def list_analyses(user: dict = Depends(get_current_user)):
    sb = _user_sb(user)
    res = sb.table("analyses") \
        .select("*") \
        .eq("user_id", user["user_id"]) \
        .order("created_at", desc=True) \
        .execute()
    return res.data


@app.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str, user: dict = Depends(get_current_user)):
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
app.include_router(applications_router)
app.include_router(jobs_router)
app.include_router(profile_router)


class AnalyzeRequest(BaseModel):
    resume: str
    job_description: str
    company_name: str = ""
    role_name: str = ""


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
async def upload_resume(
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
async def analyze(
    request: AnalyzeRequest,
    user: dict = Depends(get_current_user),
):
    if not request.resume.strip() or not request.job_description.strip():
        raise HTTPException(status_code=400, detail="Resume and job description are required.")

    prompt = f"""You are an expert resume analyst and career coach.

Compare the following resume against the job description and return a structured analysis.

RESUME:
{request.resume}

JOB DESCRIPTION:
{request.job_description}

Return your analysis in this exact format:

MATCH SCORE: [0-100]

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

        # Parse score from the AI response
        import re
        score_match = re.search(r"MATCH SCORE:\s*(\d+)", raw_result, re.IGNORECASE)
        score = int(score_match.group(1)) if score_match else 0

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

        # Save analysis to Supabase
        sb = _user_sb(user)
        import json
        sb.table("analyses").insert({
            "user_id": user["user_id"],
            "company_name": request.company_name,
            "role_name": request.role_name,
            "score": score,
            "summary": summary,
            "strengths": json.dumps(strengths),
            "gaps": json.dumps(gaps),
            "recommendations": json.dumps(recommendations),
        }).execute()

        # Log activity
        sb.table("activity_log").insert({
            "user_id": user["user_id"],
            "action_type": "analysis",
        }).execute()

        return {"result": raw_result, "analysis_id": None, "parsed": {
            "score": score,
            "strengths": strengths,
            "gaps": gaps,
            "recommendations": recommendations,
            "summary": summary,
        }}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
