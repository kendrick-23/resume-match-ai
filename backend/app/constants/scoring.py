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


# Coaching label thresholds — used by batch_scorer and semantic_score
COACHING_LABEL_THRESHOLDS = {
    "strong": 80,       # score >= 80 → "Strong match"
    "good": 70,         # score >= 70 → "Good match — worth a closer look"
    "within_reach": 55, # score >= 55 → "Within Reach"
    # below 55 → "Growth opportunity — significant gaps to close"
}
DIFFERENT_SPECIALIZATION_DA_THRESHOLD = 25  # domain_alignment < 25


def get_coaching_label(score: int, domain_alignment: int = 100) -> str:
    """Single source of truth for coaching labels.
    domain_alignment defaults to 100 (no penalty) when not available."""
    if domain_alignment < DIFFERENT_SPECIALIZATION_DA_THRESHOLD:
        return "Different specialization"
    if score >= COACHING_LABEL_THRESHOLDS["strong"]:
        return "Strong match"
    if score >= COACHING_LABEL_THRESHOLDS["good"]:
        return "Good match — worth a closer look"
    if score >= COACHING_LABEL_THRESHOLDS["within_reach"]:
        return "Within Reach"
    return "Growth opportunity — significant gaps to close"
