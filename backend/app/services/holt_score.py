"""
Holt Score Engine — 6-dimension weighted job-candidate scoring.

Dimensions:
  skills_match      35%
  salary_alignment  20%
  schedule_fit      15%
  experience_match  15%
  location_fit      10%
  degree_flag       (qualitative — affects coaching label, not score)
"""

import json
import re
from typing import Optional


def calculate_holt_score(
    job: dict,
    user_profile: dict,
    resume_skills: list[str],
    analysis_gaps: list[str],
) -> dict:
    """Calculate a 6-dimension Holt Score for a job against a user profile."""

    profile = user_profile or {}
    target_roles = (profile.get("target_roles") or "").lower()
    target_salary_min = profile.get("target_salary_min")
    target_salary_max = profile.get("target_salary_max")
    schedule_pref = profile.get("schedule_preference") or "any"
    user_location = (profile.get("location") or "").lower()
    raw_db = profile.get("dealbreakers") or {}
    dealbreakers = json.loads(raw_db) if isinstance(raw_db, str) else raw_db
    target_companies = [c.strip().lower() for c in (profile.get("target_companies") or "").split(",") if c.strip()]

    job_title = (job.get("title") or "").lower()
    job_desc = (job.get("description") or "").lower()
    job_text = f"{job_title} {job_desc} {(job.get('company') or '').lower()}"
    job_location = (job.get("location") or "").lower()
    job_company = (job.get("company") or "").lower()
    is_remote = job.get("is_remote", False)
    job_salary_min = job.get("salary_min")
    job_salary_max = job.get("salary_max")

    dealbreaker_triggered = False
    degree_warning = False

    # --- 1. Skills Match (35%) ---
    # Only use positive skills (skills_extracted) — never analysis_gaps.
    # Gaps represent what the user LACKS, so matching them would inflate scores.
    skills = [s.lower() for s in resume_skills] if resume_skills else []

    if skills:
        # Match full skill phrases AND individual words for multi-word skills
        # e.g. "inventory management" matches "inventory controls" via "inventory"
        matches = 0
        for s in skills:
            if s in job_text:
                matches += 1  # full phrase match (strongest)
            else:
                # Check if any significant word from the skill appears in job text
                words = [w for w in s.split() if len(w) > 3]
                if words and any(w in job_text for w in words):
                    matches += 0.6  # partial word match (weaker)
        skills_match = min(100, round((matches / min(len(skills), 12)) * 100))
    else:
        # Fallback: if no skills but target_roles exist, do basic role matching
        if target_roles:
            role_parts = [r.strip() for r in target_roles.split(",") if r.strip()]
            role_match = any(r in job_title for r in role_parts)
            skills_match = 60 if role_match else 40
        else:
            skills_match = 50

    # Bonus for title matching target roles
    if target_roles:
        role_parts = [r.strip() for r in target_roles.split(",") if r.strip()]
        for role in role_parts:
            if role in job_title:
                skills_match = min(100, skills_match + 15)
                break

    # Operations/management role floor: ops professionals applying to ops roles
    # should start at 65 minimum before keyword matching adjusts
    ops_role_titles = [
        "manager", "director", "supervisor", "coordinator", "operations",
        "general manager", "agm", "assistant manager", "regional manager",
        "area manager", "district manager", "store manager", "branch manager",
        "site manager", "facility manager", "operations manager",
        "operations coordinator", "operations director", "operations supervisor",
    ]
    is_ops_role = any(t in job_title for t in ops_role_titles)
    has_ops_profile = len(skills) >= 3
    if is_ops_role and has_ops_profile and skills_match < 65:
        skills_match = 65

    # Domain mismatch detection — scan title AND first 500 chars of description
    # Each domain maps trigger words (title/desc) → required background signals
    domain_requirements = [
        {
            "triggers": ["nurse", "nursing degree", "nursing license"],
            "signals": ["nursing", "rn", "bsn", "lpn", "clinical", "patient care", "bedside"],
        },
        {
            "triggers": ["psychologist", "psychology", "psychological"],
            "signals": ["psychology degree", "doctoral", "phd", "psyd",
                        "clinical psychology", "licensure", "mental health"],
        },
        {
            "triggers": ["therapist", "therapy"],
            "signals": ["therapy license", "lmft", "lpc", "clinical hours",
                        "supervised practice", "counseling"],
        },
        {
            "triggers": ["physician", "medicine", "medical degree"],
            "signals": ["medical degree", "md", "do", "residency", "clinical",
                        "board certified"],
        },
        {
            "triggers": ["pharmacist", "pharmacy", "pharmaceutical"],
            "signals": ["pharmacy degree", "pharmd", "rph", "dispensing"],
        },
        {
            "triggers": ["engineer", "engineering degree"],
            "signals": ["engineering degree", "pe license", "p.e.", "licensed engineer"],
        },
        {
            "triggers": ["attorney", "law degree", "legal degree"],
            "signals": ["law degree", "jd", "bar exam", "admitted to bar", "esquire"],
        },
        {
            "triggers": ["pilot"],
            "signals": ["faa", "flight hours", "atp", "commercial pilot certificate"],
        },
        {
            "triggers": ["teacher", "teaching"],
            "signals": ["teaching certificate", "education degree", "state certification",
                        "classroom"],
        },
        {
            "triggers": ["social worker"],
            "signals": ["msw", "lcsw", "social work license", "field placement"],
        },
        {
            "triggers": ["accountant", "accounting"],
            "signals": ["cpa", "accounting degree", "cma", "gaap"],
        },
        {
            "triggers": ["dentist", "dental"],
            "signals": ["dds", "dmd", "dental degree", "dental license"],
        },
        {
            "triggers": ["veterinarian", "veterinary"],
            "signals": ["dvm", "veterinary degree", "veterinary license"],
        },
    ]

    domain_penalty_applied = False
    skills_str = " ".join(skills).lower()
    degree = (profile.get("degree_status") or "").lower()
    # Scan job title for domain keywords — description is too noisy
    # (e.g., "dental offices" in description doesn't mean role requires dental degree)
    domain_scan_text = job_title

    for domain in domain_requirements:
        if any(trigger in domain_scan_text for trigger in domain["triggers"]):
            has_background = any(
                sig in skills_str or sig in degree for sig in domain["signals"]
            )
            if not has_background:
                skills_match = max(0, skills_match - 40)
                degree_warning = True
                domain_penalty_applied = True
            break

    # Operations/management bonus — stacks with floor
    ops_signals = ["operations", "manager", "general manager", "agm",
                   "assistant manager", "branch manager", "operations coordinator",
                   "compliance", "program manager"]
    ops_match = any(sig in job_title or sig in job_desc for sig in ops_signals)
    ops_keywords = ["operations", "management", "leadership", "compliance",
                    "training", "scheduling", "inventory", "customer service"]
    ops_keyword_count = sum(1 for kw in ops_keywords if kw in skills_str)
    if ops_match and ops_keyword_count >= 2 and not domain_penalty_applied:
        # Scale bonus by how many ops keywords the user has (2-8 → +5 to +20)
        ops_bonus = min(20, ops_keyword_count * 3)
        skills_match = min(100, skills_match + ops_bonus)

    # --- 2. Salary Alignment (20%) ---
    if target_salary_min and job_salary_max:
        if job_salary_max >= target_salary_min:
            salary_alignment = 100
        elif job_salary_max >= target_salary_min * 0.9:
            salary_alignment = 60
        else:
            salary_alignment = 30
            if dealbreakers.get("below_salary"):
                dealbreaker_triggered = True
    elif target_salary_min and job_salary_min:
        if job_salary_min >= target_salary_min * 0.8:
            salary_alignment = 80
        else:
            salary_alignment = 40
    else:
        salary_alignment = 70  # neutral if no data

    # --- 3. Schedule Fit (15%) ---
    schedule_red_flags = ["weekend", "nights", "shift", "rotating", "overnight"]
    has_schedule_flag = any(flag in job_desc for flag in schedule_red_flags)

    if schedule_pref == "monday_friday":
        schedule_fit = 40 if has_schedule_flag else 90
    elif schedule_pref == "remote_only":
        if is_remote:
            schedule_fit = 100
        elif "hybrid" in job_desc or "hybrid" in job_title:
            schedule_fit = 70
        else:
            schedule_fit = 20
    else:
        schedule_fit = 85

    # --- 4. Experience Match (15%) ---
    years_patterns = re.findall(r"(\d+)\+?\s*(?:years?|yrs?)", job_desc)
    required_years = max((int(y) for y in years_patterns), default=0)

    if required_years == 0:
        experience_match = 75
    elif required_years <= 5:
        experience_match = 90
    elif required_years <= 10:
        experience_match = 80
    elif required_years <= 15:
        experience_match = 65
    else:
        experience_match = 40

    # --- 5. Location Fit (10%) ---
    if is_remote or "remote" in job_location:
        location_fit = 100
    elif user_location:
        user_parts = [p.strip() for p in user_location.split(",")]
        user_city = user_parts[0] if user_parts else ""
        user_state = user_parts[-1].strip() if len(user_parts) > 1 else ""
        # Strip trailing country codes like "us" from job location
        job_loc_parts = [p.strip() for p in job_location.split(",")]
        job_city = job_loc_parts[0] if job_loc_parts else ""
        job_state = ""
        for part in job_loc_parts[1:]:
            part = part.strip()
            if part and part not in ("us", "usa", "united states"):
                job_state = part
                break

        # State name ↔ abbreviation mapping for matching
        state_map = {
            "al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas",
            "ca": "california", "co": "colorado", "ct": "connecticut", "de": "delaware",
            "fl": "florida", "ga": "georgia", "hi": "hawaii", "id": "idaho",
            "il": "illinois", "in": "indiana", "ia": "iowa", "ks": "kansas",
            "ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
            "ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi",
            "mo": "missouri", "mt": "montana", "ne": "nebraska", "nv": "nevada",
            "nh": "new hampshire", "nj": "new jersey", "nm": "new mexico", "ny": "new york",
            "nc": "north carolina", "nd": "north dakota", "oh": "ohio", "ok": "oklahoma",
            "or": "oregon", "pa": "pennsylvania", "ri": "rhode island", "sc": "south carolina",
            "sd": "south dakota", "tn": "tennessee", "tx": "texas", "ut": "utah",
            "vt": "vermont", "va": "virginia", "wa": "washington", "wv": "west virginia",
            "wi": "wisconsin", "wy": "wyoming", "dc": "district of columbia",
        }
        reverse_map = {v: k for k, v in state_map.items()}

        def normalize_state(s: str) -> str:
            s = s.lower().strip()
            if s in state_map:
                return s  # already abbreviation
            if s in reverse_map:
                return reverse_map[s]  # full name → abbreviation
            return s

        user_st_norm = normalize_state(user_state)
        job_st_norm = normalize_state(job_state)
        same_state = user_st_norm and job_st_norm and user_st_norm == job_st_norm

        # Metro area clusters (cities within ~30 miles of each other)
        metro_areas = {
            "orlando": {"orlando", "casselberry", "winter springs", "altamonte springs",
                        "oviedo", "sanford", "kissimmee", "maitland", "longwood",
                        "lake mary", "middleton", "apopka", "winter park", "clermont",
                        "daytona beach", "deltona", "winter garden", "st cloud"},
            "tampa": {"tampa", "st petersburg", "clearwater", "brandon", "lakeland",
                      "plant city", "wesley chapel", "new port richey", "largo"},
            "jacksonville": {"jacksonville", "orange park", "fleming island",
                             "st augustine", "ponte vedra"},
            "miami": {"miami", "fort lauderdale", "hollywood", "hialeah",
                      "coral gables", "doral", "boca raton", "pompano beach"},
        }

        def in_same_metro(city1: str, city2: str) -> bool:
            c1 = city1.lower().strip()
            c2 = city2.lower().strip()
            for cities in metro_areas.values():
                if c1 in cities and c2 in cities:
                    return True
            return False

        if user_city and user_city == job_city:
            location_fit = 100
        elif user_city and job_city and in_same_metro(user_city, job_city):
            location_fit = 90
        elif same_state:
            location_fit = 70
        else:
            location_fit = 20
            if dealbreakers.get("outside_commute"):
                dealbreaker_triggered = True
    else:
        location_fit = 50

    # --- 6. Degree Flag ---
    degree_required_patterns = [
        r"bachelor'?s?\s+required", r"degree\s+required",
        r"bs/?ba\s+required", r"4[- ]year\s+degree\s+required",
    ]
    degree_preferred_patterns = [
        r"bachelor'?s?\s+preferred", r"degree\s+preferred",
    ]

    degree_flag = "none"

    for p in degree_required_patterns:
        if re.search(p, job_desc):
            degree_flag = "required"
            degree_warning = True
            break

    if degree_flag == "none":
        for p in degree_preferred_patterns:
            if re.search(p, job_desc):
                degree_flag = "preferred"
                break

    if degree_flag == "required" and dealbreakers.get("hard_degree_required"):
        dealbreaker_triggered = True

    # --- Total Score ---
    total_score = round(
        skills_match * 0.35
        + salary_alignment * 0.20
        + schedule_fit * 0.15
        + experience_match * 0.15
        + location_fit * 0.10
    )
    total_score = max(0, min(100, total_score))

    # Domain penalty caps total — good salary/location doesn't make you a psychologist
    if domain_penalty_applied:
        total_score = min(total_score, 28)

    # Coaching label
    if domain_penalty_applied:
        coaching_label = "Different specialization"
    elif total_score >= 70:
        coaching_label = "Strong match"
    elif total_score >= 50:
        coaching_label = "Within Reach"
    else:
        coaching_label = "Growth opportunity"

    # Target company check
    is_target_company = job_company in target_companies if target_companies else False

    # --- Job-specific gaps ---
    # Extract skills/experience the job requires that the user doesn't have
    _STOPWORDS = {
        "the","a","an","and","or","but","in","on","at","to",
        "for","of","with","by","from","is","are","was","were",
        "be","been","being","have","has","had","do","does","did",
        "will","would","could","should","may","might","must",
        "our","their","your","its","this","that","these","those",
        "we","you","they","he","she","it","not","also","all",
        "as","if","so","up","out","no","new","just","can",
    }
    _NOISE_VERBS = {
        "providing","ensuring","managing","supporting","working",
        "including","using","developing","maintaining","creating",
        "leading","building","serves","serving","making","helping",
        "seeking","looking","required","preferred","ability","must",
    }
    _LOCATION_WORDS = {
        "maitland","orlando","florida","casselberry","sanford",
        "north","south","east","west","york","united","states",
        "county","beach","lake","city","town","area","region",
    }

    def _is_valid_gap_term(term: str) -> bool:
        t = term.lower().strip()
        if len(t) < 4:
            return False
        if t.isdigit():
            return False
        if t in _STOPWORDS or t in _NOISE_VERBS or t in _LOCATION_WORDS:
            return False
        # Reject single common words without domain meaning
        if len(t.split()) == 1 and t in {
            "other", "more", "many", "such", "some", "each", "both",
            "able", "well", "good", "high", "full", "part", "time",
        }:
            return False
        return True

    job_specific_gaps = []
    if job_desc and skills:
        # Prefer multi-word phrases from requirement sentences
        req_patterns = [
            r"(?:required|must have|experience with|knowledge of|proficiency in|"
            r"familiar with|expertise in|skilled in|ability to use)\s*:?\s*([^.;\n]{3,60})",
        ]
        required_terms = []
        seen_terms = set()
        for pat in req_patterns:
            for m in re.finditer(pat, job_desc):
                phrase = m.group(1).strip().lower()
                for term in re.split(r"[,;&/]|\band\b", phrase):
                    term = term.strip()
                    if _is_valid_gap_term(term) and term not in seen_terms:
                        seen_terms.add(term)
                        required_terms.append(term)

        # Also extract capitalized tool/system names (multi-word preferred)
        for m in re.finditer(r"\b([A-Z][a-zA-Z+#]{2,15})\b", job.get("description") or ""):
            word = m.group(1).lower()
            if _is_valid_gap_term(word) and word not in seen_terms:
                seen_terms.add(word)
                required_terms.append(word)

        skills_lower = set(skills)
        for term in required_terms:
            if not any(s in term or term in s for s in skills_lower):
                job_specific_gaps.append(f"This role wants {term} \u2014 not in your skills yet")
                if len(job_specific_gaps) >= 3:
                    break

    return {
        "total_score": total_score,
        "breakdown": {
            "skills_match": skills_match,
            "salary_alignment": salary_alignment,
            "schedule_fit": schedule_fit,
            "experience_match": experience_match,
            "location_fit": location_fit,
            "degree_flag": degree_flag,
            "job_specific_gaps": job_specific_gaps,
        },
        "coaching_label": coaching_label,
        "degree_warning": degree_warning,
        "dealbreaker_triggered": dealbreaker_triggered,
        "is_target_company": is_target_company,
    }
