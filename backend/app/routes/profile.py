from fastapi import APIRouter, HTTPException, Depends
from supabase import create_client
from datetime import datetime, timezone, timedelta
import os

from app.main import get_current_user

router = APIRouter(prefix="/profile", tags=["profile"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")


def _user_sb(user: dict):
    """Per-request Supabase client with user JWT for RLS enforcement."""
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user["token"])
    return sb


@router.get("/streak")
async def get_streak(user: dict = Depends(get_current_user)):
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
async def get_activity(user: dict = Depends(get_current_user)):
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
