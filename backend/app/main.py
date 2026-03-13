from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from anthropic import Anthropic
from dotenv import load_dotenv
import os

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