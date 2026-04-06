import httpx
import os
from typing import Optional

ADZUNA_BASE_URL = "https://api.adzuna.com/v1/api/jobs/us/search"
ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID", "")
ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY", "")


async def search_adzuna_jobs(
    keywords: str,
    location: Optional[str] = None,
    page: int = 1,
    results_per_page: int = 10,
) -> dict:
    """Query the Adzuna US Jobs API and return normalized results."""
    if not ADZUNA_APP_ID or not ADZUNA_APP_KEY:
        print("[Adzuna] Warning: ADZUNA_APP_ID or ADZUNA_APP_KEY not set — skipping")
        return {"total": 0, "jobs": []}

    params: dict = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_APP_KEY,
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
                print(f"[Adzuna] Non-200 response: {resp.status_code}")
                return {"total": 0, "jobs": []}
            data = resp.json()
    except Exception as exc:
        print(f"[Adzuna] Request failed: {exc}")
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
        })

    return {
        "total": count,
        "jobs": jobs,
    }
