"""Resume Vault routes — persistent first-class resume storage.

Endpoints:
    GET    /resumes              List all resumes (no content payload — too large)
    GET    /resumes/default      Return the default resume INCLUDING content
    POST   /resumes              Create from uploaded file or pasted text
    PATCH  /resumes/{id}         Update label or is_default
    DELETE /resumes/{id}         Delete with safety rules

Security: per-request user JWT context (RLS enforced). Magic-byte file
validation reused from main.extract_resume_text_from_upload.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from pydantic import BaseModel, Field
from supabase import create_client
import os

from app.main import get_current_user, limiter
from app.services.file_extraction import extract_resume_text_from_upload

router = APIRouter(prefix="/resumes", tags=["resumes"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

# Constraints — must mirror what the migration enforces
MIN_RESUME_CHARS = 50
MAX_RESUME_CHARS = 50_000
MAX_RESUMES_PER_USER = 5

VALID_FORMATS = {"pdf", "docx", "pasted"}

# MIME → format tag for the resumes.source_format column
MIME_TO_FORMAT = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}


def _user_sb(user: dict):
    """Per-request Supabase client with user JWT — enforces RLS."""
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


def _validate_resume_text(text: str) -> str:
    """Validate extracted resume text. Returns the cleaned text or raises 422.

    Rules:
    - Minimum 50 chars (anything shorter is almost certainly garbage)
    - Maximum 50,000 chars (matches AnalyzeRequest cap)
    - Must contain at least some printable characters (not all whitespace/control)
    """
    if not text:
        raise HTTPException(status_code=422, detail="Couldn't read this resume — empty content.")

    cleaned = text.strip()

    if len(cleaned) < MIN_RESUME_CHARS:
        raise HTTPException(
            status_code=422,
            detail="Couldn't read this resume — try a different file. The extracted text was too short.",
        )

    if len(cleaned) > MAX_RESUME_CHARS:
        raise HTTPException(
            status_code=422,
            detail=f"Resume is too long. Maximum is {MAX_RESUME_CHARS:,} characters.",
        )

    # Reject if there are no printable, non-whitespace characters at all.
    has_printable = any(c.isprintable() and not c.isspace() for c in cleaned)
    if not has_printable:
        raise HTTPException(
            status_code=422,
            detail="Couldn't read this resume — try a different file.",
        )

    return cleaned


def _word_count(text: str) -> int:
    return len(text.split())


def _auto_label() -> str:
    """Default label like 'Resume from Apr 8' if the user didn't provide one."""
    return datetime.now(timezone.utc).strftime("Resume from %b %-d") if os.name != "nt" \
        else datetime.now(timezone.utc).strftime("Resume from %b %#d")


def _enforce_resume_cap(sb, user_id: str) -> None:
    """If the user already has MAX_RESUMES_PER_USER resumes, delete the oldest
    NON-default to make room. The default is never auto-deleted."""
    existing = sb.table("resumes") \
        .select("id,is_default,created_at") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .execute().data or []

    if len(existing) < MAX_RESUMES_PER_USER:
        return

    # Find the oldest non-default row
    non_default_oldest = None
    for row in reversed(existing):  # reversed = oldest first
        if not row.get("is_default"):
            non_default_oldest = row
            break

    if non_default_oldest is None:
        # All slots are taken by the default (impossible — only 1 can be default)
        # but defensive: don't delete anything in this edge case.
        return

    sb.table("resumes").delete().eq("id", non_default_oldest["id"]).execute()


# ============================================================
# GET /resumes — list all (no content)
# ============================================================
@router.get("")
@limiter.limit("100/hour")
async def list_resumes(request: Request, user: dict = Depends(get_current_user)):
    sb = _user_sb(user)
    res = sb.table("resumes") \
        .select("id,label,source_filename,source_format,word_count,is_default,created_at,updated_at") \
        .eq("user_id", user["user_id"]) \
        .order("created_at", desc=True) \
        .execute()
    return res.data or []


# ============================================================
# GET /resumes/default — full content
# ============================================================
@router.get("/default")
@limiter.limit("100/hour")
async def get_default_resume(request: Request, user: dict = Depends(get_current_user)):
    sb = _user_sb(user)
    res = sb.table("resumes") \
        .select("*") \
        .eq("user_id", user["user_id"]) \
        .eq("is_default", True) \
        .limit(1) \
        .execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="No default resume on file")

    return res.data[0]


# ============================================================
# POST /resumes — create from file or pasted text
# ============================================================
@router.post("")
@limiter.limit("20/hour")
async def create_resume(
    request: Request,
    file: Optional[UploadFile] = File(default=None),
    label: Optional[str] = Form(default=None),
    content: Optional[str] = Form(default=None),
    user: dict = Depends(get_current_user),
):
    """Create a resume from an uploaded file OR pasted text.

    Multipart form fields:
        file:    uploaded PDF/DOCX (optional — choose one of file or content)
        content: pasted resume text (optional — choose one of file or content)
        label:   user-friendly name (optional — auto-generated if missing)
    """
    sb = _user_sb(user)

    # ---- Resolve source: file vs pasted text ----
    extracted_text: str
    source_format: str
    source_filename: Optional[str]

    if file is not None and file.filename:
        raw_bytes = await file.read()
        # Reuses MIME allowlist + size cap + magic-byte check + parser
        extracted_text = extract_resume_text_from_upload(file.content_type, raw_bytes)
        source_format = MIME_TO_FORMAT.get(file.content_type, "pasted")
        source_filename = file.filename
    elif content is not None and content.strip():
        extracted_text = content
        source_format = "pasted"
        source_filename = None
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either a file or pasted resume content.",
        )

    cleaned = _validate_resume_text(extracted_text)
    wc = _word_count(cleaned)

    # ---- Determine if this should be the default ----
    existing = sb.table("resumes") \
        .select("id,is_default") \
        .eq("user_id", user["user_id"]) \
        .execute().data or []

    is_first_resume = len(existing) == 0

    # ---- Enforce 5-resume cap (deletes oldest non-default if needed) ----
    _enforce_resume_cap(sb, user["user_id"])

    # ---- Insert ----
    insert_data = {
        "user_id": user["user_id"],
        "label": (label or "").strip() or _auto_label(),
        "content": cleaned,
        "word_count": wc,
        "source_filename": source_filename,
        "source_format": source_format,
        "is_default": is_first_resume,
    }

    res = sb.table("resumes").insert(insert_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save resume")

    new_resume = res.data[0]
    # Don't echo the full content back in the response — consistent with the
    # list-view contract. The client can refetch the default if it needs the text.
    new_resume.pop("content", None)
    return new_resume


# ============================================================
# PATCH /resumes/{resume_id} — update label or is_default
# ============================================================
class ResumePatch(BaseModel):
    label: Optional[str] = Field(default=None, max_length=200)
    is_default: Optional[bool] = None


@router.patch("/{resume_id}")
@limiter.limit("100/hour")
async def update_resume(
    request: Request,
    resume_id: str,
    body: ResumePatch,
    user: dict = Depends(get_current_user),
):
    sb = _user_sb(user)

    # Verify the resume belongs to this user (RLS already does this, but
    # we want a clean 404 instead of a silent no-op).
    existing = sb.table("resumes") \
        .select("id") \
        .eq("id", resume_id) \
        .eq("user_id", user["user_id"]) \
        .execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Resume not found")

    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if body.label is not None:
        updates["label"] = body.label.strip()

    if body.is_default is True:
        # Clear is_default on all other resumes for this user FIRST,
        # so the unique partial index doesn't fire.
        sb.table("resumes") \
            .update({"is_default": False}) \
            .eq("user_id", user["user_id"]) \
            .neq("id", resume_id) \
            .execute()
        updates["is_default"] = True
    elif body.is_default is False:
        updates["is_default"] = False

    if len(updates) == 1:  # only updated_at
        raise HTTPException(status_code=400, detail="No fields to update")

    res = sb.table("resumes") \
        .update(updates) \
        .eq("id", resume_id) \
        .eq("user_id", user["user_id"]) \
        .execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update resume")

    out = res.data[0]
    out.pop("content", None)
    return out


# ============================================================
# DELETE /resumes/{resume_id} — with safety rules
# ============================================================
@router.delete("/{resume_id}")
@limiter.limit("100/hour")
async def delete_resume(
    request: Request,
    resume_id: str,
    user: dict = Depends(get_current_user),
):
    sb = _user_sb(user)
    user_id = user["user_id"]

    # Fetch the target resume
    target_res = sb.table("resumes") \
        .select("id,is_default") \
        .eq("id", resume_id) \
        .eq("user_id", user_id) \
        .execute()
    if not target_res.data:
        raise HTTPException(status_code=404, detail="Resume not found")
    target = target_res.data[0]

    # Hard rule: if this is the only resume AND analyses reference it, refuse.
    all_resumes = sb.table("resumes") \
        .select("id") \
        .eq("user_id", user_id) \
        .execute().data or []

    if len(all_resumes) == 1:
        # Only resume — check for attached analyses
        attached = sb.table("analyses") \
            .select("id") \
            .eq("user_id", user_id) \
            .eq("resume_id", resume_id) \
            .limit(1) \
            .execute().data or []
        if attached:
            raise HTTPException(
                status_code=409,
                detail="This resume has analyses attached — archive it instead by uploading a new version.",
            )

    # If deleting the default and others exist, promote the next most recent.
    promote_id: Optional[str] = None
    if target.get("is_default") and len(all_resumes) > 1:
        candidates = sb.table("resumes") \
            .select("id,created_at") \
            .eq("user_id", user_id) \
            .neq("id", resume_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute().data or []
        if candidates:
            promote_id = candidates[0]["id"]

    # Delete
    sb.table("resumes") \
        .delete() \
        .eq("id", resume_id) \
        .eq("user_id", user_id) \
        .execute()

    # Promote replacement default
    if promote_id:
        sb.table("resumes") \
            .update({"is_default": True, "updated_at": datetime.now(timezone.utc).isoformat()}) \
            .eq("id", promote_id) \
            .execute()

    return {"deleted": True, "promoted_default": promote_id}
