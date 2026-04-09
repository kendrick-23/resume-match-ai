"""
Daily Haiku token budget tracker.

Caps spending at ~$0.05/day by tracking estimated token usage
across enrichment and semantic scoring calls. When budget is
exhausted, callers fall back to keyword-only scoring.
"""

import datetime
import os

from app.logger import logger

_daily_tokens = {"date": None, "count": 0}
DAILY_TOKEN_LIMIT = int(os.environ.get("HAIKU_DAILY_TOKEN_LIMIT", "250000"))


def check_budget(estimated_tokens: int) -> bool:
    """Return True if budget allows this call, False if over budget."""
    today = datetime.date.today().isoformat()
    if _daily_tokens["date"] != today:
        logger.info(f"[TokenBudget] New day {today} — resetting counter (yesterday: {_daily_tokens['count']} tokens)")
        _daily_tokens["date"] = today
        _daily_tokens["count"] = 0

    if _daily_tokens["count"] + estimated_tokens > DAILY_TOKEN_LIMIT:
        logger.warning(f"[TokenBudget] Budget exhausted ({_daily_tokens['count']}/{DAILY_TOKEN_LIMIT}) — skipping Haiku call")
        return False

    _daily_tokens["count"] += estimated_tokens
    return True


def estimate_tokens(prompt: str) -> int:
    """Rough estimate: ~4 chars per token."""
    return len(prompt) // 4


def is_budget_exhausted() -> bool:
    """Return True if the daily budget has been exceeded."""
    today = datetime.date.today().isoformat()
    if _daily_tokens["date"] != today:
        return False
    return _daily_tokens["count"] >= DAILY_TOKEN_LIMIT


def get_usage() -> dict:
    """Return current budget status for logging."""
    return {
        "date": _daily_tokens["date"],
        "used": _daily_tokens["count"],
        "limit": DAILY_TOKEN_LIMIT,
        "remaining": max(0, DAILY_TOKEN_LIMIT - _daily_tokens["count"]),
    }
