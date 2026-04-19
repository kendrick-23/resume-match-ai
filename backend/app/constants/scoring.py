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


# ─── Dimension weights ───────────────────────────────────────────────
# NOTE: weights intentionally sum to 0.95, not 1.0.
# A perfect-match job scores 95 before clamping.
# To rebalance, change values here and re-run the test suite.
DIMENSION_WEIGHTS = {
    "skills_match":     0.35,
    "salary_alignment": 0.20,
    "schedule_fit":     0.15,
    "experience_match": 0.15,
    "location_fit":     0.10,
}

# ─── Skills match constants ──────────────────────────────────────────
SKILLS_MATCH = {
    "full_phrase_credit":    1.0,
    "partial_word_credit":   0.6,
    "min_word_length":       3,
    "denominator_cap":       12,
    "target_role_bonus":     15,
    "ops_floor":             65,
    "ops_skill_threshold":   3,
    "ops_bonus_max":         20,
    "ops_bonus_per_kw":      3,
    "domain_cap":            10,
    "revenue_mgmt_soft_cap": 30,
    "licensed_penalty":      -40,
}

# ─── Salary alignment constants ──────────────────────────────────────
SALARY_ALIGNMENT = {
    "comfort_score":             100,
    "overpay_floor":             70,
    "overpay_slope":             10,
    "overpay_width":             0.25,
    "shoulder_lower_bound":      0.9,
    "shoulder_base":             65,
    "shoulder_range":            35,
    "steep_lower_bound":         0.75,
    "steep_base":                25,
    "steep_range":               40,
    "hard_floor":                15,
    "undisclosed_default":       55,
    "undisclosed_title_penalty": 20,
}

# ─── Schedule fit scores ─────────────────────────────────────────────
SCHEDULE_FIT = {
    "mf_clean":           90,
    "mf_red_flag":        40,
    "remote_only_remote": 100,
    "remote_only_hybrid": 70,
    "remote_only_onsite": 20,
    "any":                85,
}

# ─── Experience match tiers ──────────────────────────────────────────
# List of (max_years_required, score) tuples, checked in order.
# If required_years > 15, EXPERIENCE_MATCH_OVER applies.
EXPERIENCE_MATCH_TIERS = [
    (0,  75),
    (5,  90),
    (10, 80),
    (15, 65),
]
EXPERIENCE_MATCH_OVER = 40

# ─── Location fit scores ─────────────────────────────────────────────
LOCATION_FIT = {
    "remote_or_same_city": 100,
    "same_metro":          90,
    "same_state":          70,
    "different_state":     20,
    "unknown_user_loc":    50,
}
