"""
Daily token budget tracker — separate limits for Haiku and Opus.

Haiku budget (~$0.05/day): enrichment, semantic scoring, gap analysis,
cover letter, coaching tips, interview prep, skills extraction.

Opus budget (~$5/day): /analyze main analysis, /generate-resume.
"""

import datetime
import os

from app.logger import logger

_daily_tokens = {"date": None, "count": 0}
DAILY_TOKEN_LIMIT = int(os.environ.get("HAIKU_DAILY_TOKEN_LIMIT", "250000"))

_daily_opus_tokens = {"date": None, "count": 0}
OPUS_DAILY_TOKEN_LIMIT = int(os.environ.get("OPUS_DAILY_TOKEN_LIMIT", "200000"))


def check_budget(estimated_tokens: int) -> bool:
    """Return True if Haiku budget allows this call, False if over budget."""
    today = datetime.date.today().isoformat()
    if _daily_tokens["date"] != today:
        logger.info(f"[TokenBudget/Haiku] New day {today} — resetting counter (yesterday: {_daily_tokens['count']} tokens)")
        _daily_tokens["date"] = today
        _daily_tokens["count"] = 0

    if _daily_tokens["count"] + estimated_tokens > DAILY_TOKEN_LIMIT:
        logger.warning(f"[TokenBudget/Haiku] Budget exhausted ({_daily_tokens['count']}/{DAILY_TOKEN_LIMIT}) — skipping call")
        return False

    _daily_tokens["count"] += estimated_tokens
    return True


def check_opus_budget(estimated_tokens: int) -> bool:
    """Return True if Opus budget allows this call, False if over budget."""
    today = datetime.date.today().isoformat()
    if _daily_opus_tokens["date"] != today:
        logger.info(f"[TokenBudget/Opus] New day {today} — resetting counter (yesterday: {_daily_opus_tokens['count']} tokens)")
        _daily_opus_tokens["date"] = today
        _daily_opus_tokens["count"] = 0

    if _daily_opus_tokens["count"] + estimated_tokens > OPUS_DAILY_TOKEN_LIMIT:
        logger.warning(f"[TokenBudget/Opus] Budget exhausted ({_daily_opus_tokens['count']}/{OPUS_DAILY_TOKEN_LIMIT}) — skipping call")
        return False

    _daily_opus_tokens["count"] += estimated_tokens
    return True


def estimate_tokens(prompt: str) -> int:
    """Rough estimate: ~4 chars per token."""
    return len(prompt) // 4


def is_budget_exhausted() -> bool:
    """Return True if the Haiku daily budget has been exceeded."""
    today = datetime.date.today().isoformat()
    if _daily_tokens["date"] != today:
        return False
    return _daily_tokens["count"] >= DAILY_TOKEN_LIMIT


def get_usage() -> dict:
    """Return current budget status for logging."""
    return {
        "haiku": {
            "date": _daily_tokens["date"],
            "used": _daily_tokens["count"],
            "limit": DAILY_TOKEN_LIMIT,
            "remaining": max(0, DAILY_TOKEN_LIMIT - _daily_tokens["count"]),
        },
        "opus": {
            "date": _daily_opus_tokens["date"],
            "used": _daily_opus_tokens["count"],
            "limit": OPUS_DAILY_TOKEN_LIMIT,
            "remaining": max(0, OPUS_DAILY_TOKEN_LIMIT - _daily_opus_tokens["count"]),
        },
    }
