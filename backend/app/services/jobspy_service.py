import re
import time
import asyncio
from typing import Optional

# In-memory cache: key -> (timestamp, result)
_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 1800  # 30 minutes


def _cache_key(keywords: str, location: str) -> str:
    return f"{keywords.lower().strip()}|{location.lower().strip()}"


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", str(text)).strip()


def _search_sync(keywords: str, location: str, results: int) -> dict:
    """Synchronous JobSpy call — runs in thread pool."""
    from jobspy import scrape_jobs

    try:
        df = scrape_jobs(
            site_name=["indeed", "glassdoor", "google", "zip_recruiter"],
            search_term=keywords,
            location=location,
            results_wanted=results,
            hours_old=72,
            country_indeed="USA",
        )
    except Exception as exc:
        print(f"[JobSpy] Scrape failed: {exc}")
        return {"total": 0, "jobs": []}

    if df is None or df.empty:
        return {"total": 0, "jobs": []}

    jobs = []
    for _, row in df.iterrows():
        source = str(row.get("site", "unknown")).lower()
        raw_id = str(row.get("id", "")) or str(row.get("job_url", ""))[-20:]

        salary_min = None
        salary_max = None
        try:
            if row.get("min_amount") and not _is_nan(row["min_amount"]):
                salary_min = int(float(row["min_amount"]))
            if row.get("max_amount") and not _is_nan(row["max_amount"]):
                salary_max = int(float(row["max_amount"]))
        except (ValueError, TypeError):
            pass

        location_str = str(row.get("location", "")) or "Location not specified"
        posted = ""
        if row.get("date_posted"):
            posted = str(row["date_posted"])[:10]

        is_remote = bool(row.get("is_remote"))

        jobs.append({
            "id": f"{source}-{raw_id}",
            "title": str(row.get("title", "")),
            "company": str(row.get("company", "")),
            "department": "",
            "location": location_str,
            "locations": [location_str],
            "salary_min": salary_min,
            "salary_max": salary_max,
            "posted": posted,
            "closing": "",
            "url": str(row.get("job_url", "")),
            "apply_url": str(row.get("job_url", "")),
            "description": _strip_html(str(row.get("description", ""))),
            "source": source,
            "is_remote": is_remote,
            "job_type": str(row.get("job_type", "")),
        })

    return {"total": len(jobs), "jobs": jobs}


def _is_nan(val) -> bool:
    try:
        import math
        return math.isnan(float(val))
    except (ValueError, TypeError):
        return False


async def search_jobspy(
    keywords: str,
    location: Optional[str] = None,
    results: int = 15,
) -> dict:
    """Search multiple job boards via JobSpy with 30-min caching."""
    loc = location or "Florida"
    key = _cache_key(keywords, loc)

    # Check cache
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            return data

    try:
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, _search_sync, keywords, loc, results)
    except Exception as exc:
        print(f"[JobSpy] Async wrapper failed: {exc}")
        data = {"total": 0, "jobs": []}

    _cache[key] = (time.time(), data)
    return data
