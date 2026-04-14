import httpx
import os
from typing import Optional

from app.logger import logger

ADZUNA_BASE_URL = "https://api.adzuna.com/v1/api/jobs/us/search"


async def search_adzuna_jobs(
    keywords: str,
    location: Optional[str] = None,
    page: int = 1,
    results_per_page: int = 10,
) -> dict:
    """Query the Adzuna US Jobs API and return normalized results."""
    # Read at call time so load_dotenv() has already run
    app_id = os.environ.get("ADZUNA_APP_ID", "")
    app_key = os.environ.get("ADZUNA_APP_KEY", "")

    if not app_id or not app_key:
        logger.warning("[Adzuna] ADZUNA_APP_ID or ADZUNA_APP_KEY not set — skipping")
        return {"total": 0, "jobs": []}

    params: dict = {
        "app_id": app_id,
        "app_key": app_key,
        "what": keywords,
        "results_per_page": results_per_page,
        "content-type": "application/json",
    }

    if location:
        params["where"] = location

    url = f"{ADZUNA_BASE_URL}/{page}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                logger.warning(f"[Adzuna] Non-200 response: {resp.status_code} — {resp.text[:200]}")
                return {"total": 0, "jobs": []}
            data = resp.json()
    except Exception as exc:
        logger.error(f"[Adzuna] Request failed: {exc}", exc_info=True)
        return {"total": 0, "jobs": []}

    return _normalize(data)


def _normalize(raw: dict) -> dict:
    """Transform Adzuna response into Holt's job card format."""
    count = raw.get("count", 0)
    results = raw.get("results", [])

    jobs = []
    for item in results:
        company_obj = item.get("company", {})
        location_obj = item.get("location", {})

        salary_min = None
        salary_max = None
        if item.get("salary_min"):
            salary_min = int(item["salary_min"])
        if item.get("salary_max"):
            salary_max = int(item["salary_max"])

        location_str = location_obj.get("display_name", "Location not specified")

        jobs.append({
            "id": f"adzuna-{item.get('id', '')}",
            "title": item.get("title", "").replace("<strong>", "").replace("</strong>", ""),
            "company": company_obj.get("display_name", ""),
            "department": "",
            "location": location_str,
            "locations": [location_str],
            "salary_min": salary_min,
            "salary_max": salary_max,
            "posted": (item.get("created") or "")[:10],
            "closing": "",
            "url": item.get("redirect_url", ""),
            "apply_url": item.get("redirect_url", ""),
            "description": item.get("description", ""),
            "source": "adzuna",
            "adzuna_category": (item.get("category") or {}).get("tag", ""),
        })

    return {
        "total": count,
        "jobs": jobs,
    }
