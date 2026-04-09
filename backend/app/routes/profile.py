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


# Action types that represent a real forward action in the job search.
# Only these contribute to the streak — status shuffles and pure edits do not.
STREAK_ACTIONS = ["analysis", "status_applied", "status_interview", "status_offer"]


@router.get("/streak")
@limiter.limit("100/hour")
async def get_streak(request: Request, user: dict = Depends(get_current_user)):
    """Calculate current streak: consecutive calendar days with at least one
    real forward action (resume analysis, or moving an application TO
    Applied / Interview / Offer)."""
    sb = _user_sb(user)
    res = sb.table("activity_log") \
        .select("created_at,action_type") \
        .eq("user_id", user["user_id"]) \
        .in_("action_type", STREAK_ACTIONS) \
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
    applied_today = 0
    interviews_today = 0

    for row in res.data:
        dt = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        if dt.date() != today:
            continue
        action = row["action_type"]
        if action == "analysis":
            analyses_today += 1
        elif action == "status_applied":
            applied_today += 1
        elif action in ("status_interview", "status_offer"):
            interviews_today += 1

    # Build recent feed (last 5). Skip rows that aren't meaningful for the
    # user-facing activity stream — pure edits and Saved-only entries.
    LABELS = {
        "analysis": "Ran a resume analysis",
        "status_applied": "Submitted an application",
        "status_interview": "Moved an application to Interview",
        "status_offer": "Got an offer!",
        "application_created": "Saved a job",
    }
    recent = []
    for row in res.data:
        action = row["action_type"]
        if action not in LABELS:
            continue
        recent.append({
            "id": row["id"],
            "label": LABELS[action],
            "action_type": action,
            "created_at": row["created_at"],
        })
        if len(recent) >= 5:
            break

    return {
        "analyses_today": analyses_today,
        "applied_today": applied_today,
        "interviews_today": interviews_today,
        # Backwards-compatible alias for any old frontend code still reading it.
        "applications_today": applied_today,
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

    Bulk-fetches analyses + applications upfront, then evaluates every badge
    condition in memory. Replaces 8 serial Supabase reads (one per condition)
    with 2 bulk reads. Streak is also computed at most ONCE per call.
    """
    sb = _user_sb(user)
    user_id = user["user_id"]

    # Load existing badges (1 query — unavoidable)
    existing_res = sb.table("badges") \
        .select("badge_key") \
        .eq("user_id", user_id) \
        .execute()
    earned = {row["badge_key"] for row in existing_res.data}

    # --- Bulk fetch 1: all analyses needed for first_dive, sharp_eye, upgraded
    analyses_data = sb.table("analyses") \
        .select("id,score,created_at") \
        .eq("user_id", user_id) \
        .order("created_at", desc=False) \
        .execute().data or []

    # --- Bulk fetch 2: all applications needed for first_wave, making_moves, momentum
    apps_data = sb.table("applications") \
        .select("id,status") \
        .eq("user_id", user_id) \
        .execute().data or []

    newly_earned: list[str] = []

    # first_dive: at least one analysis
    if "first_dive" not in earned and len(analyses_data) >= 1:
        newly_earned.append("first_dive")

    # sharp_eye: any analysis with score >= 80
    if "sharp_eye" not in earned and any(
        (a.get("score") or 0) >= 80 for a in analyses_data
    ):
        newly_earned.append("sharp_eye")

    # upgraded: best score improved 20+ over first score
    if "upgraded" not in earned and len(analyses_data) >= 2:
        scores = [a.get("score") or 0 for a in analyses_data]
        if max(scores) - scores[0] >= 20:
            newly_earned.append("upgraded")

    # first_wave: at least one application
    if "first_wave" not in earned and len(apps_data) >= 1:
        newly_earned.append("first_wave")

    # making_moves: 10+ applications
    if "making_moves" not in earned and len(apps_data) >= 10:
        newly_earned.append("making_moves")

    # momentum: any application moved to Interview
    if "momentum" not in earned and any(
        a.get("status") == "Interview" for a in apps_data
    ):
        newly_earned.append("momentum")

    # consistent / dedicated: fetch streak ONCE, only if either could change
    needs_streak = "consistent" not in earned or "dedicated" not in earned
    if needs_streak:
        streak_data = await get_streak(request, user)
        streak_value = streak_data.get("streak", 0)

        if "consistent" not in earned and streak_value >= 7:
            newly_earned.append("consistent")
        if "dedicated" not in earned and streak_value >= 30:
            newly_earned.append("dedicated")

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
    """Get the user's profile. Creates one if it doesn't exist.

    Always returns the full profile row. Never returns an empty object —
    raises 500 if the row cannot be created or fetched.
    """
    sb = _user_sb(user)
    user_id = user["user_id"]

    # First attempt: SELECT existing row
    res = sb.table("profiles") \
        .select("*") \
        .eq("id", user_id) \
        .execute()

    if res.data:
        return res.data[0]

    # No row exists — try to auto-create. On race / unique violation,
    # fall back to SELECT (another request created it concurrently).
    try:
        sb.table("profiles").insert({"id": user_id}).execute()
    except Exception as e:
        # Unique violation (23505) means a concurrent request beat us — fine.
        # Any other error is a real failure and should surface.
        msg = str(e).lower()
        if "duplicate" not in msg and "23505" not in msg and "unique" not in msg:
            raise HTTPException(
                status_code=500,
                detail="Failed to create profile",
            )

    # Re-SELECT to return the full, canonical row (whether we inserted it
    # or a concurrent request did). Never trust insert().data alone.
    refetch = sb.table("profiles") \
        .select("*") \
        .eq("id", user_id) \
        .execute()

    if not refetch.data:
        raise HTTPException(
            status_code=500,
            detail="Profile row missing after auto-create",
        )

    return refetch.data[0]


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
    """Delete all user data: analyses, resumes, applications, activity_log, badges, profile."""
    sb = _user_sb(user)
    user_id = user["user_id"]

    # Delete from all tables. Order matters: analyses references resumes via
    # resume_id FK with ON DELETE SET NULL, so analyses can be deleted first
    # OR resumes first — but deleting analyses first avoids leaving orphaned
    # FK references in flight.
    sb.table("analyses").delete().eq("user_id", user_id).execute()
    sb.table("resumes").delete().eq("user_id", user_id).execute()
    sb.table("applications").delete().eq("user_id", user_id).execute()
    sb.table("activity_log").delete().eq("user_id", user_id).execute()
    sb.table("badges").delete().eq("user_id", user_id).execute()
    sb.table("profiles").delete().eq("id", user_id).execute()

    return {"deleted": True}
