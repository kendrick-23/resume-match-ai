import httpx
import os
from typing import Optional

USAJOBS_BASE_URL = "https://data.usajobs.gov/api/search"
USAJOBS_API_KEY = os.getenv("USAJOBS_API_KEY", "")
USAJOBS_EMAIL = os.getenv("USAJOBS_EMAIL", "")


async def search_usajobs(
    keyword: str,
    location: Optional[str] = None,
    salary_min: Optional[int] = None,
    salary_max: Optional[int] = None,
    remote: Optional[bool] = None,
    page: int = 1,
    results_per_page: int = 25,
) -> dict:
    """Query the USAJobs Search API and return normalized results."""
    params = {
        "Keyword": keyword,
        "Page": page,
        "ResultsPerPage": results_per_page,
    }

    if location:
        params["LocationName"] = location

    if salary_min is not None:
        params["RemunerationMinimumAmount"] = salary_min

    if salary_max is not None:
        params["RemunerationMaximumAmount"] = salary_max

    if remote:
        params["RemoteIndicator"] = "True"

    headers = {
        "Host": "data.usajobs.gov",
        "User-Agent": USAJOBS_EMAIL,
        "Authorization-Key": USAJOBS_API_KEY,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(USAJOBS_BASE_URL, params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    return _normalize(data)


def _normalize(raw: dict) -> dict:
    """Transform USAJobs response into Holt's job card format."""
    search_result = raw.get("SearchResult", {})
    count = int(search_result.get("SearchResultCountAll", 0))
    items = search_result.get("SearchResultItems", [])

    jobs = []
    for item in items:
        matched = item.get("MatchedObjectDescriptor", {})
        position = matched.get("PositionLocation", [{}])

        # Salary range
        salary_obj = matched.get("PositionRemuneration", [{}])
        salary_min = None
        salary_max = None
        if salary_obj:
            salary_min = salary_obj[0].get("MinimumRange")
            salary_max = salary_obj[0].get("MaximumRange")
            # Convert to int if present
            if salary_min:
                salary_min = int(float(salary_min))
            if salary_max:
                salary_max = int(float(salary_max))

        # Location string
        locations = [
            loc.get("LocationName", "")
            for loc in position
            if loc.get("LocationName")
        ]
        location_str = locations[0] if locations else "Location not specified"

        # Build the URL
        pos_uri = matched.get("PositionURI", "")
        apply_url = matched.get("ApplyURI", [""])[0] if matched.get("ApplyURI") else pos_uri

        # Extract description from QualificationSummary + MajorDuties
        qual_summary = matched.get("QualificationSummary", "")
        user_area = matched.get("UserArea", {}).get("Details", {})
        major_duties = user_area.get("MajorDuties", [])
        if isinstance(major_duties, list):
            major_duties = " ".join(major_duties)
        description = f"{qual_summary} {major_duties}".strip()

        # Remote detection
        telework = user_area.get("TeleworkEligible", "")
        is_remote = telework == "True" or "remote" in location_str.lower()

        jobs.append({
            "id": matched.get("PositionID", ""),
            "title": matched.get("PositionTitle", ""),
            "company": matched.get("OrganizationName", ""),
            "department": matched.get("DepartmentName", ""),
            "location": location_str,
            "locations": locations,
            "salary_min": salary_min,
            "salary_max": salary_max,
            "posted": matched.get("PositionStartDate", "")[:10],
            "closing": matched.get("PositionEndDate", "")[:10],
            "url": pos_uri,
            "apply_url": apply_url,
            "description": description,
            "is_remote": is_remote,
            "source": "usajobs",
        })

    return {
        "total": count,
        "jobs": jobs,
    }
