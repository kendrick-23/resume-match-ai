"""Supabase helpers for the prefetched_jobs table.

These run in background tasks without a user session (no JWT in context),
so they use the service-role key. RLS still gates everything the user
sees via the existing user-JWT pattern in the jobs routes.
"""

import os
from datetime import datetime, timezone, timedelta
from supabase import create_client

from app.logger import logger

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

PREFETCH_TTL_HOURS = int(os.getenv("PREFETCH_TTL_HOURS", "4"))

_sb_service = None

# TODO: migrate to Redis when backend scales to multiple workers
# (same pattern as _user_batch_in_flight in batch_scorer.py)
_prefetch_running: dict[str, bool] = {}


def _service_client():
    global _sb_service
    if _sb_service is None:
        _sb_service = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _sb_service


def get_prefetched_jobs(user_id: str) -> dict | None:
    """Return the prefetched_jobs row for this user if fresh, else None."""
    try:
        sb = _service_client()
        res = sb.table("prefetched_jobs") \
            .select("*") \
            .eq("user_id", user_id) \
            .gte("expires_at", datetime.now(timezone.utc).isoformat()) \
            .limit(1) \
            .execute()
        if res.data:
            return res.data[0]
        return None
    except Exception as exc:
        logger.error(f"[PrefetchStore] get failed for {user_id[:8]}…: {exc}", exc_info=True)
        return None


def upsert_prefetched_jobs(user_id: str, jobs: list, haiku_complete: bool) -> bool:
    """Insert or update the user's prefetched_jobs row. Returns True on success."""
    try:
        sb = _service_client()
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=PREFETCH_TTL_HOURS)
        sb.table("prefetched_jobs") \
            .upsert({
                "user_id": user_id,
                "jobs": jobs,
                "job_count": len(jobs),
                "scored_at": now.isoformat(),
                "expires_at": expires.isoformat(),
                "haiku_complete": haiku_complete,
            }, on_conflict="user_id") \
            .execute()
        return True
    except Exception as exc:
        logger.error(f"[PrefetchStore] upsert failed for {user_id[:8]}…: {exc}", exc_info=True)
        return False


def is_prefetch_running(user_id: str) -> bool:
    """True if a pre-fetch pipeline is currently in flight for this user."""
    return _prefetch_running.get(user_id, False)


def set_prefetch_running(user_id: str, running: bool) -> None:
    """Mark a pre-fetch pipeline as started or finished. Idempotent."""
    if running:
        _prefetch_running[user_id] = True
    else:
        _prefetch_running.pop(user_id, None)
