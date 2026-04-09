"""Resume file validation + text extraction.

Centralized so /upload-resume and /resumes POST share the same security
chain: MIME allowlist → size cap → magic-byte signature → parser → empty check.

Lives in services/ rather than main.py to avoid circular imports between
main.py and the route modules that need to call it.
"""

import io

from fastapi import HTTPException
from PyPDF2 import PdfReader
from docx import Document


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


def extract_resume_text_from_upload(content_type: str, contents: bytes) -> str:
    """Validate + parse a resume upload into plain text.

    Raises HTTPException with appropriate status codes on any failure so callers
    can let the error bubble up to FastAPI.
    """
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only PDF and Word (.docx) files are accepted.",
        )

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size is 5 MB.",
        )

    # Magic-byte validation — runs BEFORE any parser touches the bytes.
    expected_sig = FILE_SIGNATURES[content_type]
    if not contents[: len(expected_sig)] == expected_sig:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. The file does not match its declared type.",
        )

    try:
        if content_type == "application/pdf":
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

    return text
