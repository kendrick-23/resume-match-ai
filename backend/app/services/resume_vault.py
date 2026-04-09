"""Resume Vault helpers — shared between /resumes routes and /analyze.

Centralizes:
- Text validation (length, printable chars)
- Word counting
- Auto-label generation
- 5-resume cap enforcement (oldest non-default pruned)
- Content-hash lookup for "is this resume already in the vault?"
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException


# Constraints — must mirror what the migration enforces
MIN_RESUME_CHARS = 50
MAX_RESUME_CHARS = 50_000
MAX_RESUMES_PER_USER = 5


def validate_resume_text(text: str) -> str:
    """Validate extracted resume text. Returns cleaned text or raises 422."""
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

    has_printable = any(c.isprintable() and not c.isspace() for c in cleaned)
    if not has_printable:
        raise HTTPException(
            status_code=422,
            detail="Couldn't read this resume — try a different file.",
        )

    return cleaned


def word_count(text: str) -> int:
    return len(text.split())


def auto_label() -> str:
    """Default label like 'Resume from Apr 8' if the user didn't provide one.
    Cross-platform safe (Windows uses %#d instead of %-d for non-padded day)."""
    import os
    fmt = "Resume from %b %#d" if os.name == "nt" else "Resume from %b %-d"
    return datetime.now(timezone.utc).strftime(fmt)


def enforce_resume_cap(sb, user_id: str) -> Optional[str]:
    """If the user already has MAX_RESUMES_PER_USER resumes, delete the oldest
    NON-default to make room. The default is never auto-deleted.
    Returns the label of the pruned resume, or None if nothing was pruned."""
    existing = sb.table("resumes") \
        .select("id,is_default,created_at,label") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .execute().data or []

    if len(existing) < MAX_RESUMES_PER_USER:
        return None

    # Find the oldest non-default row
    for row in reversed(existing):  # reversed = oldest first
        if not row.get("is_default"):
            pruned_label = row.get("label") or "Untitled resume"
            sb.table("resumes").delete().eq("id", row["id"]).execute()
            return pruned_label

    return None


def find_or_create_vault_entry(
    sb,
    user_id: str,
    content: str,
    *,
    source_filename: Optional[str] = None,
    source_format: str = "pasted",
) -> tuple[str, Optional[str]]:
    """Look up an existing resumes row with identical content for this user.
    If found, return (id, None). Otherwise create a new row (enforcing the 5-cap
    + first-resume-becomes-default rules) and return (new_id, pruned_label).

    Used by /analyze to auto-save uploaded resume text into the vault.
    """
    cleaned = validate_resume_text(content)

    # Exact-match lookup. We pull only id+content for the user (typically <=5 rows)
    # to avoid sending content over the wire for every resume.
    existing = sb.table("resumes") \
        .select("id,content,is_default") \
        .eq("user_id", user_id) \
        .execute().data or []

    for row in existing:
        if (row.get("content") or "").strip() == cleaned:
            return row["id"], None

    # Not found — create a new vault entry.
    is_first = len(existing) == 0
    pruned_label = enforce_resume_cap(sb, user_id)

    insert_data = {
        "user_id": user_id,
        "label": auto_label(),
        "content": cleaned,
        "word_count": word_count(cleaned),
        "source_filename": source_filename,
        "source_format": source_format if source_format in ("pdf", "docx", "pasted") else "pasted",
        "is_default": is_first,
    }
    res = sb.table("resumes").insert(insert_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save resume to vault")
    return res.data[0]["id"], pruned_label


def fetch_resume_content(sb, user_id: str, resume_id: str) -> Optional[str]:
    """Return the content of a specific resume owned by this user, or None."""
    res = sb.table("resumes") \
        .select("content") \
        .eq("id", resume_id) \
        .eq("user_id", user_id) \
        .limit(1) \
        .execute()
    if res.data:
        return res.data[0].get("content")
    return None


def fetch_default_resume_content(sb, user_id: str) -> Optional[str]:
    """Return the content of this user's default resume, or None."""
    res = sb.table("resumes") \
        .select("id,content") \
        .eq("user_id", user_id) \
        .eq("is_default", True) \
        .limit(1) \
        .execute()
    if res.data:
        return res.data[0]
    return None
