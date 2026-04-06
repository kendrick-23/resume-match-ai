from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional
from supabase import create_client
from datetime import datetime, timezone, timedelta
import os

from app.main import get_current_user, limiter

router = APIRouter(prefix="/profile", tags=["profile"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")


def _user_sb(user: dict):
    """Per-request Supabase client with user JWT for RLS enforcement."""
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


@router.get("/streak")
@limiter.limit("100/hour")
async def get_streak(request: Request, user: dict = Depends(get_current_user)):
    """Calculate current streak: consecutive calendar days with at least one activity."""
    sb = _user_sb(user)
    res = sb.table("activity_log") \
        .select("created_at") \
        .eq("user_id", user["user_id"]) \
        .order("created_at", desc=True) \
        .execute()

    if not res.data:
        return {"streak": 0}

    # Get unique dates (in UTC) sorted descending
    dates = set()
    for row in res.data:
        dt = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        dates.add(dt.date())

    sorted_dates = sorted(dates, reverse=True)

    today = datetime.now(timezone.utc).date()

    # Streak must include today or yesterday to be active
    if sorted_dates[0] != today and sorted_dates[0] != today - timedelta(days=1):
        return {"streak": 0}

    streak = 1
    for i in range(1, len(sorted_dates)):
        if sorted_dates[i] == sorted_dates[i - 1] - timedelta(days=1):
            streak += 1
        else:
            break

    return {"streak": streak}


@router.get("/activity")
@limiter.limit("100/hour")
async def get_activity(request: Request, user: dict = Depends(get_current_user)):
    """Get recent activity and today's summary."""
    sb = _user_sb(user)

    # Get all activity (recent 50)
    res = sb.table("activity_log") \
        .select("*") \
        .eq("user_id", user["user_id"]) \
        .order("created_at", desc=True) \
        .limit(50) \
        .execute()

    today = datetime.now(timezone.utc).date()
    analyses_today = 0
    apps_today = 0

    for row in res.data:
        dt = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        if dt.date() == today:
            if row["action_type"] == "analysis":
                analyses_today += 1
            elif row["action_type"] in ("application_created", "application_updated"):
                apps_today += 1

    # Build recent feed (last 5)
    recent = []
    for row in res.data[:5]:
        action = row["action_type"]
        label = {
            "analysis": "Ran a resume analysis",
            "application_created": "Logged a new application",
            "application_updated": "Updated an application",
        }.get(action, action)
        recent.append({
            "id": row["id"],
            "label": label,
            "action_type": action,
            "created_at": row["created_at"],
        })

    return {
        "analyses_today": analyses_today,
        "applications_today": apps_today,
        "recent": recent,
    }


@router.get("/badges")
@limiter.limit("100/hour")
async def list_badges(request: Request, user: dict = Depends(get_current_user)):
    """List all earned badges for the user."""
    sb = _user_sb(user)
    res = sb.table("badges") \
        .select("*") \
        .eq("user_id", user["user_id"]) \
        .order("earned_at", desc=True) \
        .execute()
    return res.data


@router.post("/badges/check")
@limiter.limit("100/hour")
async def check_badges(request: Request, user: dict = Depends(get_current_user)):
    """Evaluate all badge conditions and award any newly earned ones.
    Returns list of newly awarded badge keys."""
    sb = _user_sb(user)
    user_id = user["user_id"]

    # Load existing badges
    existing_res = sb.table("badges") \
        .select("badge_key") \
        .eq("user_id", user_id) \
        .execute()
    earned = {row["badge_key"] for row in existing_res.data}

    newly_earned = []

    # first_dive: first analysis run
    if "first_dive" not in earned:
        analyses = sb.table("analyses") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .limit(1) \
            .execute()
        if analyses.count and analyses.count >= 1:
            newly_earned.append("first_dive")

    # sharp_eye: first score >= 80
    if "sharp_eye" not in earned:
        high_score = sb.table("analyses") \
            .select("id") \
            .eq("user_id", user_id) \
            .gte("score", 80) \
            .limit(1) \
            .execute()
        if high_score.data:
            newly_earned.append("sharp_eye")

    # consistent: 7-day streak
    if "consistent" not in earned:
        streak_data = await get_streak(request, user)
        if streak_data["streak"] >= 7:
            newly_earned.append("consistent")

    # dedicated: 30-day streak
    if "dedicated" not in earned:
        if "consistent" in earned or "consistent" in newly_earned:
            # Re-use streak if already calculated
            streak_data = await get_streak(request, user)
            if streak_data["streak"] >= 30:
                newly_earned.append("dedicated")

    # first_wave: first application tracked
    if "first_wave" not in earned:
        apps = sb.table("applications") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .limit(1) \
            .execute()
        if apps.count and apps.count >= 1:
            newly_earned.append("first_wave")

    # making_moves: 10 applications tracked
    if "making_moves" not in earned:
        apps_10 = sb.table("applications") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .execute()
        if apps_10.count and apps_10.count >= 10:
            newly_earned.append("making_moves")

    # momentum: first application moved to Interview
    if "momentum" not in earned:
        interviews = sb.table("applications") \
            .select("id") \
            .eq("user_id", user_id) \
            .eq("status", "Interview") \
            .limit(1) \
            .execute()
        if interviews.data:
            newly_earned.append("momentum")

    # upgraded: resume score improved 20+ from first analysis
    if "upgraded" not in earned:
        all_analyses = sb.table("analyses") \
            .select("score") \
            .eq("user_id", user_id) \
            .order("created_at", desc=False) \
            .execute()
        if len(all_analyses.data) >= 2:
            first_score = all_analyses.data[0]["score"]
            best_score = max(a["score"] for a in all_analyses.data)
            if best_score - first_score >= 20:
                newly_earned.append("upgraded")

    # Insert newly earned badges
    for key in newly_earned:
        sb.table("badges").insert({
            "user_id": user_id,
            "badge_key": key,
        }).execute()

    return {"newly_earned": newly_earned}


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=200)
    job_title: Optional[str] = Field(default=None, max_length=200)
    target_roles: Optional[str] = Field(default=None, max_length=500)
    target_salary_min: Optional[int] = Field(default=None, ge=0)
    target_salary_max: Optional[int] = Field(default=None, ge=0)
    location: Optional[str] = Field(default=None, max_length=200)
    schedule_preference: Optional[str] = Field(default=None, max_length=50)
    max_commute_miles: Optional[int] = Field(default=None, ge=0, le=200)
    degree_status: Optional[str] = Field(default=None, max_length=50)
    work_authorization: Optional[str] = Field(default=None, max_length=50)
    target_companies: Optional[str] = Field(default=None, max_length=1000)
    dealbreakers: Optional[dict] = None
    skills_extracted: Optional[list[str]] = None
    job_seeker_status: Optional[str] = Field(default=None, max_length=50)
    linkedin_text: Optional[str] = Field(default=None, max_length=10000)
    about_me: Optional[str] = Field(default=None, max_length=5000)


@router.get("")
@limiter.limit("100/hour")
async def get_profile(request: Request, user: dict = Depends(get_current_user)):
    """Get the user's profile. Creates one if it doesn't exist."""
    sb = _user_sb(user)
    res = sb.table("profiles") \
        .select("*") \
        .eq("id", user["user_id"]) \
        .execute()

    if res.data:
        return res.data[0]

    # Auto-create empty profile
    new = sb.table("profiles").insert({
        "id": user["user_id"],
    }).execute()
    return new.data[0] if new.data else {}


@router.patch("")
@limiter.limit("100/hour")
async def update_profile(
    request: Request,
    body: ProfileUpdate,
    user: dict = Depends(get_current_user),
):
    """Update the user's profile fields."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    sb = _user_sb(user)

    res = sb.table("profiles") \
        .upsert({"id": user["user_id"], **updates}) \
        .execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update profile")

    return res.data[0]


@router.delete("/data")
@limiter.limit("100/hour")
async def delete_all_data(request: Request, user: dict = Depends(get_current_user)):
    """Delete all user data: analyses, applications, activity_log, badges, profile."""
    sb = _user_sb(user)
    user_id = user["user_id"]

    # Delete from all tables
    sb.table("analyses").delete().eq("user_id", user_id).execute()
    sb.table("applications").delete().eq("user_id", user_id).execute()
    sb.table("activity_log").delete().eq("user_id", user_id).execute()
    sb.table("badges").delete().eq("user_id", user_id).execute()
    sb.table("profiles").delete().eq("id", user_id).execute()

    return {"deleted": True}
