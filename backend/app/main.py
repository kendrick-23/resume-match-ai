from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from anthropic import Anthropic
from dotenv import load_dotenv
import os
import io
from PyPDF2 import PdfReader
from docx import Document

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Anthropic()

class AnalyzeRequest(BaseModel):
    resume: str
    job_description: str

@app.get("/")
def root():
    return {"status": "resume-match-ai backend running"}

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}


@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    # Validate file type using the MIME type the browser sends
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only PDF and Word (.docx) files are accepted.",
        )

    # Read file contents into memory (not to disk — no temp files to clean up)
    contents = await file.read()

    # Enforce size limit after reading so we get an accurate byte count
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
async def analyze(request: AnalyzeRequest):
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
        message = client.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"result": message.content[0].text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))