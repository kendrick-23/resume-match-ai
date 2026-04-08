from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional
from supabase import create_client
from datetime import datetime, timezone, timedelta
import os

from app.main import get_current_user, limiter

router = APIRouter(prefix="/applications", tags=["applications"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

VALID_STATUSES = {"Saved", "Applied", "Responded", "Interview", "Offer", "Closed"}

# Statuses that count toward the streak / "real forward action".
FORWARD_STATUSES = {"Applied", "Interview", "Offer"}

# Window for collapsing rapid status shuffles on the same application
# into a single activity_log row.
DEDUP_WINDOW_MINUTES = 30


def _action_type_for_status(status: str) -> str:
    """Map an application status to an activity_log action_type.

    Forward statuses get distinct action types so the streak query can
    filter on them. Other status changes are tagged 'status_other' and
    do not contribute to the streak.
    """
    if status == "Applied":
        return "status_applied"
    if status == "Interview":
        return "status_interview"
    if status == "Offer":
        return "status_offer"
    return "status_other"


def _log_status_change(sb, user_id: str, application_id: str, status: str) -> None:
    """Insert a status-change activity row, deduping rapid same-app shuffles.

    If a prior status_* activity for this application exists within
    DEDUP_WINDOW_MINUTES, delete it first so only the final transition
    in a quick succession survives.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=DEDUP_WINDOW_MINUTES)).isoformat()
    try:
        sb.table("activity_log") \
            .delete() \
            .eq("user_id", user_id) \
            .eq("application_id", application_id) \
            .like("action_type", "status_%") \
            .gte("created_at", cutoff) \
            .execute()
    except Exception:
        # If the application_id column doesn't exist yet (migration not
        # applied), fall through and just insert the new row.
        pass

    sb.table("activity_log").insert({
        "user_id": user_id,
        "action_type": _action_type_for_status(status),
        "application_id": application_id,
        "status": status,
    }).execute()


def _user_sb(user: dict):
    """Per-request Supabase client with user JWT for RLS enforcement."""
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


class ApplicationCreate(BaseModel):
    company: str = Field(..., max_length=200)
    role: str = Field(..., max_length=200)
    status: str = Field(default="Saved", max_length=20)
    notes: str = Field(default="", max_length=2000)
    url: str = Field(default="", max_length=500)
    match_score: Optional[int] = Field(default=None, ge=0, le=100)
    applied_date: Optional[str] = None


class ApplicationUpdate(BaseModel):
    company: Optional[str] = Field(default=None, max_length=200)
    role: Optional[str] = Field(default=None, max_length=200)
    status: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=2000)
    url: Optional[str] = Field(default=None, max_length=500)
    match_score: Optional[int] = Field(default=None, ge=0, le=100)
    applied_date: Optional[str] = None


@router.get("")
@limiter.limit("100/hour")
async def list_applications(request: Request, user: dict = Depends(get_current_user)):
    sb = _user_sb(user)
    res = sb.table("applications") \
        .select("*") \
        .eq("user_id", user["user_id"]) \
        .order("created_at", desc=True) \
        .execute()
    return res.data


@router.post("")
@limiter.limit("100/hour")
async def create_application(
    request: Request,
    body: ApplicationCreate,
    user: dict = Depends(get_current_user),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")

    data = body.model_dump(exclude_none=True)
    data["user_id"] = user["user_id"]

    sb = _user_sb(user)
    res = sb.table("applications").insert(data).execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create application")

    new_app = res.data[0]
    initial_status = new_app.get("status", "Saved")

    # Log activity. If created with a forward status (Applied/Interview/Offer),
    # log as the status change so the streak picks it up. Otherwise log a
    # neutral "application_created" entry that does NOT count toward the streak.
    if initial_status in FORWARD_STATUSES:
        _log_status_change(sb, user["user_id"], new_app["id"], initial_status)
    else:
        sb.table("activity_log").insert({
            "user_id": user["user_id"],
            "action_type": "application_created",
            "application_id": new_app["id"],
            "status": initial_status,
        }).execute()

    return new_app


@router.patch("/{app_id}")
@limiter.limit("100/hour")
async def update_application(
    request: Request,
    app_id: str,
    body: ApplicationUpdate,
    user: dict = Depends(get_current_user),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")

    sb = _user_sb(user)
    res = sb.table("applications") \
        .update(updates) \
        .eq("id", app_id) \
        .eq("user_id", user["user_id"]) \
        .execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Application not found")

    updated_app = res.data[0]

    # Only log activity for actual status changes — and dedupe rapid
    # same-app shuffles. Pure field edits (notes, URL, etc.) do NOT
    # touch the activity log so they cannot inflate the streak.
    if "status" in updates:
        _log_status_change(sb, user["user_id"], app_id, updates["status"])

    return updated_app


@router.delete("/{app_id}")
@limiter.limit("100/hour")
async def delete_application(
    request: Request,
    app_id: str,
    user: dict = Depends(get_current_user),
):
    sb = _user_sb(user)
    res = sb.table("applications") \
        .delete() \
        .eq("id", app_id) \
        .eq("user_id", user["user_id"]) \
        .execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Application not found")

    return {"deleted": True}
