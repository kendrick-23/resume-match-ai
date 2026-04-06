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
    dealbreakers = profile.get("dealbreakers") or {}
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

    # --- 1. Skills Match (35%) ---
    skills = [s.lower() for s in resume_skills] if resume_skills else []
    gap_words = []
    for g in (analysis_gaps or []):
        gap_words.extend(w.lower() for w in re.split(r"[\s,;.()]+", g) if len(w) > 3)

    all_skill_terms = list(set(skills + gap_words))
    if all_skill_terms:
        matches = sum(1 for s in all_skill_terms if s in job_text)
        skills_match = min(100, round((matches / min(len(all_skill_terms), 12)) * 100))
    else:
        skills_match = 50

    # Bonus for title matching target roles
    if target_roles:
        role_parts = [r.strip() for r in target_roles.split(",") if r.strip()]
        for role in role_parts:
            if role in job_title:
                skills_match = min(100, skills_match + 15)
                break

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

        if user_city and user_city in job_location:
            location_fit = 100
        elif user_state and user_state in job_location:
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
    degree_warning = False

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

    # Coaching label
    if total_score >= 70:
        coaching_label = "Strong match"
    elif total_score >= 50:
        coaching_label = "Within Reach"
    else:
        coaching_label = "Growth opportunity"

    # Target company check
    is_target_company = job_company in target_companies if target_companies else False

    return {
        "total_score": total_score,
        "breakdown": {
            "skills_match": skills_match,
            "salary_alignment": salary_alignment,
            "schedule_fit": schedule_fit,
            "experience_match": experience_match,
            "location_fit": location_fit,
            "degree_flag": degree_flag,
        },
        "coaching_label": coaching_label,
        "degree_warning": degree_warning,
        "dealbreaker_triggered": dealbreaker_triggered,
        "is_target_company": is_target_company,
    }
