from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional
from supabase import create_client
import os

from app.main import get_current_user, limiter

router = APIRouter(prefix="/applications", tags=["applications"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

VALID_STATUSES = {"Saved", "Applied", "Responded", "Interview", "Offer", "Closed"}


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

    # Log activity
    sb.table("activity_log").insert({
        "user_id": user["user_id"],
        "action_type": "application_created",
    }).execute()

    return res.data[0]


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

    # Log activity
    sb.table("activity_log").insert({
        "user_id": user["user_id"],
        "action_type": "application_updated",
    }).execute()

    return res.data[0]


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
