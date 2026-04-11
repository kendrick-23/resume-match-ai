import httpx
import os
import re
from typing import Optional

from app.logger import logger

USAJOBS_BASE_URL = "https://data.usajobs.gov/api/search"
USAJOBS_API_KEY = os.getenv("USAJOBS_API_KEY", "")
USAJOBS_EMAIL = os.getenv("USAJOBS_EMAIL", "")

# State name → abbreviation mapping for location filtering
_STATE_ABBREV = {
    "alabama": "al", "alaska": "ak", "arizona": "az", "arkansas": "ar",
    "california": "ca", "colorado": "co", "connecticut": "ct", "delaware": "de",
    "florida": "fl", "georgia": "ga", "hawaii": "hi", "idaho": "id",
    "illinois": "il", "indiana": "in", "iowa": "ia", "kansas": "ks",
    "kentucky": "ky", "louisiana": "la", "maine": "me", "maryland": "md",
    "massachusetts": "ma", "michigan": "mi", "minnesota": "mn", "mississippi": "ms",
    "missouri": "mo", "montana": "mt", "nebraska": "ne", "nevada": "nv",
    "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny",
    "north carolina": "nc", "north dakota": "nd", "ohio": "oh", "oklahoma": "ok",
    "oregon": "or", "pennsylvania": "pa", "rhode island": "ri", "south carolina": "sc",
    "south dakota": "sd", "tennessee": "tn", "texas": "tx", "utah": "ut",
    "vermont": "vt", "virginia": "va", "washington": "wa", "west virginia": "wv",
    "wisconsin": "wi", "wyoming": "wy", "district of columbia": "dc",
}
_ABBREV_TO_FULL = {v: k for k, v in _STATE_ABBREV.items()}
_ALL_ABBREVS = set(_STATE_ABBREV.values())


def _extract_state(location_str: str) -> Optional[str]:
    """Extract the 2-letter state abbreviation from a location string.

    Handles: 'Casselberry, FL', 'Florida', 'Orlando, Florida', 'FL'
    Returns lowercase 2-letter code or None if not parseable.
    """
    loc = location_str.strip().lower()
    if not loc:
        return None

    # Try last token as 2-letter state abbreviation
    parts = re.split(r"[,\s]+", loc)
    last = parts[-1].strip().rstrip(".")
    if last in _ALL_ABBREVS:
        return last

    # Try full state name anywhere in the string
    for full_name, abbrev in _STATE_ABBREV.items():
        if full_name in loc:
            return abbrev

    return None


def _job_matches_state(job: dict, target_state: str) -> bool:
    """Check if a job's location matches the target state.

    Always keeps: remote jobs, 'Anywhere in the U.S.', negotiable,
    or jobs with no meaningful location.
    """
    job_loc = (job.get("location") or "").lower()

    # Always keep remote / nationwide / unspecified
    if job.get("is_remote"):
        return True
    if not job_loc or job_loc == "location not specified":
        return True
    if "anywhere" in job_loc or "negotiable" in job_loc or "multiple" in job_loc:
        return True

    # Check all location strings (some jobs have multiple)
    for loc_str in job.get("locations", [job.get("location", "")]):
        loc_lower = loc_str.lower()
        state = _extract_state(loc_lower)
        if state == target_state:
            return True

    return False


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

    result = _normalize(data)

    # Post-fetch location filter — USAJobs returns jobs from anywhere in the
    # US even when a location is specified. Filter to the searched state.
    if location:
        target_state = _extract_state(location)
        if target_state:
            before = len(result["jobs"])
            result["jobs"] = [j for j in result["jobs"] if _job_matches_state(j, target_state)]
            after = len(result["jobs"])
            if before != after:
                logger.info(f"[USAJobs] Location filter: {before} → {after} jobs (state={target_state})")
            result["total"] = len(result["jobs"])

    return result


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
