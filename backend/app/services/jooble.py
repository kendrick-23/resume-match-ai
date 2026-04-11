"""
Jooble job search integration.

Jooble aggregates listings from thousands of job boards. Free API key
available at https://jooble.org/api/about — sends POST with JSON body,
returns an array of job objects.
"""

import httpx
import os
import re
from typing import Optional

from app.logger import logger

JOOBLE_API_KEY = os.getenv("JOOBLE_API_KEY", "")
JOOBLE_BASE_URL = "https://jooble.org/api"

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    """Remove HTML tags from a string."""
    return _HTML_TAG_RE.sub("", text).strip()


def _parse_salary(salary_str: str) -> tuple[Optional[int], Optional[int]]:
    """Parse Jooble's salary string (e.g. '$50,000 - $70,000 a year') into min/max ints."""
    if not salary_str:
        return None, None
    numbers = re.findall(r"[\d,]+", salary_str.replace(",", ""))
    ints = []
    for n in numbers:
        try:
            val = int(n)
            # Filter out obviously non-salary numbers (< 1000 likely hourly rate marker)
            if val >= 1000:
                ints.append(val)
            elif val > 0 and ("hour" in salary_str.lower() or "/hr" in salary_str.lower()):
                # Convert hourly to annual estimate
                ints.append(val * 2080)
        except ValueError:
            continue
    if len(ints) >= 2:
        return min(ints), max(ints)
    if len(ints) == 1:
        return ints[0], ints[0]
    return None, None


async def search_jooble(
    keywords: str,
    location: Optional[str] = None,
    results: int = 20,
) -> dict:
    """Search Jooble for jobs. Returns normalized Holt job shape.

    Graceful degradation: returns empty list if API key is missing or
    request fails. Never raises — the unified pipeline must not crash.
    """
    if not JOOBLE_API_KEY:
        logger.warning("[Jooble] JOOBLE_API_KEY not set — skipping")
        return {"total": 0, "jobs": []}

    url = f"{JOOBLE_BASE_URL}/{JOOBLE_API_KEY}"
    payload = {
        "keywords": keywords,
        "location": location or "",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error(f"[Jooble] API request failed: {exc}")
        return {"total": 0, "jobs": []}

    raw_jobs = data.get("jobs", [])
    total = data.get("totalCount", len(raw_jobs))

    jobs = []
    for item in raw_jobs[:results]:
        title = (item.get("title") or "").strip()
        company = (item.get("company") or "").strip()
        loc = (item.get("location") or "").strip()
        link = (item.get("link") or "").strip()
        snippet = _strip_html(item.get("snippet") or "")
        salary_str = (item.get("salary") or "").strip()
        updated = (item.get("updated") or "")[:10]

        salary_min, salary_max = _parse_salary(salary_str)

        is_remote = (
            "remote" in loc.lower()
            or "remote" in title.lower()
        )

        # Generate a stable ID from the link
        job_id = f"jooble-{abs(hash(link)) % 10**10}" if link else f"jooble-{abs(hash(title + company)) % 10**10}"

        jobs.append({
            "id": job_id,
            "title": title or "Position available",
            "company": company or "Company not listed",
            "department": "",
            "location": loc,
            "salary_min": salary_min,
            "salary_max": salary_max,
            "posted": updated,
            "closing": "",
            "url": link,
            "apply_url": link,
            "description": snippet,
            "is_remote": is_remote,
            "source": "jooble",
        })

    return {"total": total, "jobs": jobs}
