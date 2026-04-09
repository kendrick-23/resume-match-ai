"""
Single source of truth for score-tier breakpoints.
Keep in sync with frontend/src/constants/scoring.js.
"""

TIER_BREAKPOINTS = {"strong": 70, "stretch": 45, "weak": 20}

DOMAIN_PENALTY_CAP = 15
SALARY_FLOOR_CAP = 25


def derive_tier(score: int | None) -> str:
    if score is None:
        return "stretch"
    if score >= TIER_BREAKPOINTS["strong"]:
        return "strong"
    if score >= TIER_BREAKPOINTS["stretch"]:
        return "stretch"
    if score >= TIER_BREAKPOINTS["weak"]:
        return "weak"
    return "wrong_domain"
