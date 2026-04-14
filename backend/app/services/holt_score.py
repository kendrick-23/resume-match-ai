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
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

from app.constants.scoring import TIER_BREAKPOINTS, DOMAIN_PENALTY_CAP


# Hospitality / retail / food-service vocabulary → corporate operations vocabulary.
# Holt's primary user (Nicole) is pivoting from F&B / retail ops into corporate
# roles whose JDs use a different vocabulary for the same skills. The literal
# substring matcher in the skills section can't bridge this gap on its own,
# so before matching we expand each candidate skill through this map. Each
# entry is matched against the lowercased skill text as a substring; on hit,
# the corporate-equivalent phrases are appended to the candidate's match set.
HOSPITALITY_BRIDGE: dict[str, list[str]] = {
    "f&b": ["operations", "food service", "food and beverage operations"],
    "food and beverage": ["operations", "food service", "food and beverage operations"],
    "food service": ["operations", "food service operations"],
    "guest experience": ["customer experience", "client relations", "client experience"],
    "guest service": ["customer service", "client services"],
    "front of house": ["customer-facing", "service operations", "client-facing operations"],
    "back of house": ["operations", "back office operations"],
    "scheduling": ["workforce planning", "resource allocation", "labor planning", "staff scheduling"],
    "payroll": ["compensation", "hris", "payroll processing", "payroll administration"],
    "compliance": ["regulatory compliance", "policy", "policy compliance", "audit", "regulatory adherence"],
    "vendor": ["vendor management", "supplier", "procurement", "supplier management"],
    "vendor relations": ["vendor management", "procurement", "supplier management"],
    "staff training": ["l&d", "learning and development", "employee development", "onboarding"],
    "training": ["learning and development", "employee development", "l&d"],
    "assistant general manager": ["operations manager", "assistant director of operations", "operations lead"],
    "agm": ["operations manager", "assistant director of operations"],
    "general manager": ["operations director", "site director", "operations manager"],
    "shift lead": ["team lead", "operations supervisor"],
    "inventory": ["inventory management", "stock control", "supply chain"],
    "customer service": ["client services", "customer experience", "client relations"],
    "hiring": ["talent acquisition", "recruiting", "recruitment"],
    "onboarding": ["employee onboarding", "new hire orientation", "l&d"],
}


def _expand_skills_with_bridge(skills: list[str]) -> list[str]:
    """Expand a candidate's skills through HOSPITALITY_BRIDGE so the substring
    matcher can bridge hospitality vocabulary to corporate JD vocabulary.

    The original skills are always preserved; bridge additions are appended.
    Deduped while preserving order so deterministic test results are easy.
    """
    expanded: list[str] = []
    seen: set[str] = set()
    for s in skills:
        s_low = s.lower().strip()
        if s_low and s_low not in seen:
            expanded.append(s_low)
            seen.add(s_low)
        for source_term, corporate_terms in HOSPITALITY_BRIDGE.items():
            if source_term in s_low:
                for c in corporate_terms:
                    c_low = c.lower()
                    if c_low not in seen:
                        expanded.append(c_low)
                        seen.add(c_low)
    return expanded


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
        # Expand candidate skills via HOSPITALITY_BRIDGE so hospitality / retail
        # vocabulary can match corporate-language JDs ("guest experience" →
        # "customer experience", "f&b" → "operations", etc.). Original skills
        # are always preserved; the bridge only ADDS additional match terms.
        match_terms = _expand_skills_with_bridge(skills)

        # Match full phrases AND significant individual words. Denominator stays
        # tied to the ORIGINAL skill count so the bridge can only improve the
        # score, never dilute it.
        matches = 0.0
        for s in match_terms:
            if s in job_text:
                matches += 1  # full phrase match (strongest)
            else:
                # Check if any significant word from the term appears in job text
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

    # Domain mismatch detection — scan title for licensed-profession triggers.
    # Each domain maps trigger words → required background signals.
    #
    # CRITICAL: short triggers and signals (e.g. "md", "do", "rn") MUST be
    # matched with word boundaries. A naive substring check matches "do" inside
    # "vendor", "rn" inside "concern", "md" inside "command" — which falsely
    # marks a hospitality candidate as having medical credentials and bypasses
    # the penalty entirely. See _trigger_matches / _signal_matches helpers.
    domain_requirements = [
        {
            "triggers": ["nurse", "nursing", "nurse practitioner", "rn",
                         "nursing degree", "nursing license"],
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
            # Expanded physician / medical specialist coverage. Any title with
            # MD or DO as a standalone token counts (handled via word-boundary
            # match in _trigger_matches). Also covers clinical specialty terms
            # (medical surgical, cardiac, neuro) that signal nursing/physician
            # leadership roles in hospital settings.
            "triggers": ["physician", "medicine", "medical degree",
                         "radiologist", "radiology", "diagnostic imaging",
                         "surgeon", "surgery", "anesthesiologist", "anesthesia",
                         "psychiatrist", "psychiatry", "pathologist", "pathology",
                         "neurologist", "neurology", "cardiologist", "cardiology",
                         "podiatrist", "podiatry",
                         "clinical design", "clinical integration", "clinical informatics",
                         "medical surgical", "cardiac neuro", "med surg",
                         "neuro icu", "cardiac icu",
                         "md", "do", "dpm"],
            "signals": ["medical degree", "md", "do", "dpm", "residency",
                        "board certified", "physician assistant"],
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
            # Legal: includes "counsel" and "lawyer" titles in addition to attorney.
            "triggers": ["attorney", "lawyer", "counsel", "law degree", "legal degree"],
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
            # Medical/clinical scheduling — titles with patient-facing signals
            # indicate healthcare roles requiring clinical environment experience.
            "triggers": ["new patients", "patient scheduling", "patient coordinator",
                         "patient intake"],
            "signals": ["clinical", "patient care", "ehr", "emr", "hipaa",
                        "medical office", "nursing"],
        },
        {
            "triggers": ["veterinarian", "veterinary"],
            "signals": ["dvm", "veterinary degree", "veterinary license"],
        },
    ]

    domain_penalty_applied = False
    skills_str = " ".join(skills).lower()
    degree = (profile.get("degree_status") or "").lower()
    # Scan job title for domain triggers. Description is also scanned for
    # hard licensure keywords later (see Section 2 / scan_description_for_licensure).
    title_words = set(re.findall(r"[a-z]+", job_title))

    def _trigger_matches(trigger: str) -> bool:
        """Match a trigger with word-boundary semantics for single-word triggers
        (so "do" only matches the standalone word, not vendor/door/etc.)."""
        t = trigger.lower().strip()
        if " " in t:
            return t in job_title  # multi-word phrase: substring is OK
        return t in title_words

    def _signal_matches(signal: str) -> bool:
        """Match a credential signal in skills/degree with word boundaries
        for single-word signals (md, do, rn, jd, etc. would otherwise match
        'command', 'vendor', 'concern', 'adjacent', and silently bypass the
        penalty for legitimate non-clinical candidates)."""
        s = signal.lower().strip()
        if " " in s:
            return s in skills_str or s in degree
        pat = re.compile(rf"\b{re.escape(s)}\b")
        return bool(pat.search(skills_str) or pat.search(degree))

    for domain in domain_requirements:
        if any(_trigger_matches(trigger) for trigger in domain["triggers"]):
            has_background = any(_signal_matches(sig) for sig in domain["signals"])
            if not has_background:
                skills_match = max(0, skills_match - 40)
                degree_warning = True
                domain_penalty_applied = True
            break

    # Title-trigger missed it — scan first 500 chars of description for HARD
    # licensure phrases. A job titled "Care Coordinator" with "MD required" in
    # the body must still be flagged as out-of-domain for an ops candidate.
    if not domain_penalty_applied:
        desc_head = job_desc[:500]
        # Multi-word, unambiguous phrases. No bare "md" / "do" here — too
        # noisy in description text. Use word-boundary regex for short tokens.
        licensure_phrases = [
            r"\bmd\s+required\b",
            r"\bdo\s+required\b",
            r"\brn\s+required\b",
            r"\bnp\s+required\b",
            r"\blpn\s+required\b",
            r"\blicensed\s+physician\b",
            r"\bmedical\s+degree\s+required\b",
            r"\bmedical\s+license\b",
            r"\bnursing\s+license\b",
            r"\bnursing\s+degree\s+required\b",
            r"\bboard[\s-]?certified\b",
            r"\bbar\s+exam\b",
            r"\badmitted\s+to\s+the\s+bar\b",
            r"\bjuris\s+doctor\b",
            r"\bpharmacy\s+license\b",
            r"\bdental\s+license\b",
            r"\bveterinary\s+license\b",
        ]
        # Same has-background test as the title path — if the candidate
        # actually holds the credential, no penalty.
        candidate_has_credential = (
            re.search(r"\b(md|do|dpm|rn|jd|pharmd|dds|dvm)\b", skills_str)
            or re.search(r"\b(md|do|dpm|rn|jd)\b", degree)
            or "medical degree" in skills_str
            or "nursing license" in skills_str
            or "law degree" in skills_str
        )
        for phrase in licensure_phrases:
            if re.search(phrase, desc_head):
                if not candidate_has_credential:
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

    # Vocational/trade role exclusion — these roles require specific
    # certifications or physical skills unrelated to ops/training/compliance.
    # Same cap as domain penalty (15%). Runs after the ops bonus so it
    # overrides any floor/bonus that may have applied.
    _VOCATIONAL_TRIGGERS = [
        "truck driver", "cdl", "owner operator", "class a driver",
        "grounds maintenance", "groundskeeper", "custodian",
        "security officer", "security guard", "janitor", "janitorial",
        "linen bagger", "linen folder", "team member", "crew member",
    ]
    # Industrial/construction JD signals — if the company or description
    # contains these, the role is industrial ops Nicole can't do.
    _INDUSTRIAL_DESC_TRIGGERS = ["dewatering", "submergent", "excavation",
                                 "heavy equipment", "crane operator"]
    if not domain_penalty_applied and any(vt in job_title for vt in _VOCATIONAL_TRIGGERS):
        skills_match = min(skills_match, 10)
        domain_penalty_applied = True
    if not domain_penalty_applied and any(
        idt in job_desc or idt in job_company for idt in _INDUSTRIAL_DESC_TRIGGERS
    ):
        skills_match = min(skills_match, 10)
        domain_penalty_applied = True

    # Retail clothing companies — Nicole targets corporate ops, not retail floor mgmt.
    # These companies almost exclusively hire for in-store roles when they appear
    # in job aggregators. Store Manager at Hollister ≠ Operations Manager.
    _RETAIL_CLOTHING_COMPANIES = [
        "hollister", "abercrombie", "h&m", "zara", "gap inc", "old navy",
        "forever 21", "american eagle", "aeropostale", "hot topic",
        "express", "banana republic", "victoria's secret", "bath & body works",
    ]
    if not domain_penalty_applied and any(rc in job_company for rc in _RETAIL_CLOTHING_COMPANIES):
        skills_match = min(skills_match, 10)
        domain_penalty_applied = True

    # Military enlistment/active duty — Nicole is a civilian job seeker, not
    # enlisting. "HR Officer" at Navy Reserve means military service, not corporate HR.
    # Real API descriptions use: "Navy occupations", "duty station", "job training",
    # "Career Information Program", "enlisted sailors".
    _MILITARY_COMPANIES = [
        "u.s. navy", "united states navy", "u.s. army", "united states army",
        "u.s. air force", "u.s. marine", "u.s. coast guard",
    ]
    _MILITARY_ENLISTMENT_SIGNALS = [
        "enlist", "active duty", "navy reserve", "army reserve",
        "air force reserve", "marine reserve", "coast guard reserve",
        "drill weekend", "deployment", "aboard ships", "military service",
        "national guard", "commissioned officer",
        "duty station", "navy occupations", "career information program",
        "enlisted sailor", "sailor",
    ]
    if not domain_penalty_applied and (
        any(mc in job_company for mc in _MILITARY_COMPANIES)
        or any(ms in job_desc or ms in job_company for ms in _MILITARY_ENLISTMENT_SIGNALS)
    ):
        skills_match = min(skills_match, 10)
        domain_penalty_applied = True

    # Construction superintendent/foreman titles — require construction trade
    # experience that doesn't transfer from hospitality/retail ops.
    _CONSTRUCTION_TITLE_TRIGGERS = [
        "superintendent", "project foreman", "site foreman",
        "construction foreman", "general foreman",
    ]
    if not domain_penalty_applied and any(ct in job_title for ct in _CONSTRUCTION_TITLE_TRIGGERS):
        # Only penalize if the company/description is actually construction
        _CONSTRUCTION_CONTEXT = [
            "construction", "general contractor", "build", "subcontract",
            "concrete", "steel", "framing", "roofing", "plumbing",
        ]
        if any(cc in job_company or cc in job_desc for cc in _CONSTRUCTION_CONTEXT):
            skills_match = min(skills_match, 10)
            domain_penalty_applied = True

    # Landscaping/outdoor services — "Operations Manager" at a landscaping
    # company means managing lawn crews, not corporate operations.
    # Real API descriptions are often generic ("branch operations") so we also
    # match known landscaping companies by name.
    _LANDSCAPING_COMPANIES = [
        "brightview", "trugreen", "yellowstone landscape", "davey tree",
        "bartlett tree", "ruppert landscape", "gothic landscape",
    ]
    _LANDSCAPING_TRIGGERS = [
        "landscaping", "landscape", "lawn care", "lawn mowing",
        "grounds maintenance", "grounds", "irrigation systems",
        "turf management", "outdoor services",
    ]
    if not domain_penalty_applied and (
        any(lc in job_company for lc in _LANDSCAPING_COMPANIES)
        or any(lt in job_desc or lt in job_company for lt in _LANDSCAPING_TRIGGERS)
    ):
        skills_match = min(skills_match, 10)
        domain_penalty_applied = True

    # Erosion/environmental construction — description signals that indicate
    # field construction work even when the title looks like generic ops.
    # Real API data: Jooble often serves these under a different company name
    # (e.g. "Valor Environmental" instead of "Watkins Erosion Control"), so
    # match both description keywords AND known company names.
    _EROSION_COMPANIES = [
        "erosion", "valor environmental", "stormwater",
        "environmental services",
    ]
    _EROSION_CONSTRUCTION_TRIGGERS = [
        "erosion control", "silt fence", "sediment control",
        "stormwater management", "earthwork", "grading contractor",
        "soil stabilization",
    ]
    if not domain_penalty_applied and (
        any(ec in job_company for ec in _EROSION_COMPANIES)
        or any(ec in job_desc for ec in _EROSION_CONSTRUCTION_TRIGGERS)
    ):
        skills_match = min(skills_match, 10)
        domain_penalty_applied = True

    # Installation/flooring trades — coordinator roles at flooring, HVAC, or
    # home improvement companies that require trades knowledge.
    _INSTALLATION_TRADES_TRIGGERS = [
        "flooring installation", "hardwood installation", "carpet installation",
        "tile installation", "in-home measurement", "installation coordinator",
    ]
    if not domain_penalty_applied and any(
        it in job_desc for it in _INSTALLATION_TRADES_TRIGGERS
    ):
        skills_match = min(skills_match, 10)
        domain_penalty_applied = True

    # Housekeeping/custodial management — title triggers for facility cleaning
    # roles that use "operations manager" in the title but are custodial work.
    _HOUSEKEEPING_TITLE_TRIGGERS = [
        "housekeeping manager", "housekeeping operations",
        "custodial manager", "custodial operations manager",
        "janitorial manager",
    ]
    if not domain_penalty_applied and any(ht in job_title for ht in _HOUSEKEEPING_TITLE_TRIGGERS):
        skills_match = min(skills_match, 10)
        domain_penalty_applied = True

    # Revenue/yield management — soft demotion (not full penalty).
    # These are finance/analytics roles that share the word "inventory" or
    # "manager" with ops but require pricing/revenue optimization skills.
    _REVENUE_MGMT_SIGNALS = [
        "revenue management", "yield management", "pricing strategy",
    ]
    if not domain_penalty_applied and any(
        rm in job_title or rm in job_desc for rm in _REVENUE_MGMT_SIGNALS
    ):
        skills_match = min(skills_match, 30)

    # Military/defense "Special Operations" exclusion — "special operations" at
    # defense contractors (CACI, Booz Allen, etc.) refers to military SpecOps
    # support, not business operations. Only penalize when the company name or
    # description contains defense/intelligence signals.
    _DEFENSE_SIGNALS = [
        "defense", "intelligence", "dod", "department of defense",
        "clearance required", "security clearance", "top secret",
        "ts/sci", "military", "armed forces", "combat",
    ]
    if not domain_penalty_applied and "special operations" in job_title:
        has_defense_context = any(sig in job_company or sig in job_desc for sig in _DEFENSE_SIGNALS)
        if has_defense_context:
            skills_match = min(skills_match, 10)
            domain_penalty_applied = True

    # --- Soft demotions removed (April 2026) ---
    # Sales, marketing, recruitment, construction, emergency services, franchise,
    # and entry-level title demotions have been replaced by 5-dimension semantic
    # scoring in semantic_score.py. The Haiku LLM now evaluates title_relevance,
    # seniority_match, and domain_alignment — producing more accurate and nuanced
    # results than manual blocklists. Only hard exclusions (vocational triggers,
    # licensure, defense SpecOps) remain above.

    # --- 2. Salary Alignment (20%) — sigmoid curve, hard floor, overpay penalty ---
    # Replaces the old 3-bucket cliff with a continuous curve grounded in
    # reservation-wage theory (Krueger & Mueller, NBER WP 19870): acceptance
    # probability is step-shaped around the seeker's stated minimum, not gradient.
    #
    #   Comfort band (target_min .. target_max)            → 100
    #   Shoulder    (target_min*0.9 .. target_min)         → linear 100 → 65
    #   Steep      (target_min*0.75 .. target_min*0.9)    → linear 65 → 25
    #   Hard floor  (< target_min*0.75)                    → 15  + composite cap @ 25
    #   Overpay    (> target_max)                         → max(70, 100 - 10*ratio)
    #   No data                                            → 55  + salary_not_disclosed flag
    #
    # The hard-floor composite cap is enforced in routes/jobs.py (final loop)
    # so semantic re-scoring can never lift a salary-floor job back into
    # visible buckets — same pattern as the domain penalty.
    job_salary = job_salary_max or job_salary_min
    salary_floor_violation = False
    salary_not_disclosed = False

    if target_salary_min and job_salary:
        # target_salary_max may be missing; fall back to target_salary_min as the
        # band ceiling (degenerates the comfort band to a single point).
        band_top = target_salary_max if target_salary_max else target_salary_min
        floor_min = target_salary_min

        if floor_min <= job_salary <= band_top:
            salary_alignment = 100
        elif job_salary > band_top:
            # Overpay: gentle decline (seniority-creep signal). Floored at 70.
            overpay_ratio = (job_salary - band_top) / (band_top * 0.25)
            salary_alignment = max(70, round(100 - 10 * overpay_ratio))
        elif job_salary >= floor_min * 0.9:
            # Shoulder: linear 100 → 65 across the top 10% below floor.
            salary_alignment = round(
                65 + 35 * ((job_salary - floor_min * 0.9) / (floor_min * 0.1))
            )
            salary_alignment = max(65, min(100, salary_alignment))
        elif job_salary >= floor_min * 0.75:
            # Steep decline: linear 65 → 25 across 10–25% below floor.
            salary_alignment = round(
                25 + 40 * ((job_salary - floor_min * 0.75) / (floor_min * 0.15))
            )
            salary_alignment = max(25, min(65, salary_alignment))
        else:
            # Hard floor: > 25% below the seeker's stated minimum.
            salary_alignment = 15
            salary_floor_violation = True
            if dealbreakers.get("below_salary"):
                dealbreaker_triggered = True
    else:
        # No salary data — slightly pessimistic prior (was 70). Stops rewarding
        # postings that hide their pay relative to honest postings near floor.
        salary_alignment = 55
        salary_not_disclosed = True

    # Salary dealbreaker — respect the user's stated minimum exactly.
    # Use the PESSIMISTIC salary (salary_min when available) since that's
    # the likely starting offer. A $65-75k range with a $75k minimum means
    # the starting pay doesn't meet the requirement. Jobs with NO salary
    # data are never filtered — we can't know if they violate the minimum.
    dealbreaker_salary = job_salary_min or job_salary_max
    if (
        dealbreakers.get("below_salary")
        and target_salary_min
        and dealbreaker_salary
        and dealbreaker_salary < target_salary_min
    ):
        dealbreaker_triggered = True
        salary_floor_violation = True

    # --- No-salary low-paying title inference ---
    # When a job has NO listed salary AND the title matches known low-salary
    # patterns (almost never meet $75k), apply -20 to salary_alignment.
    # Not a dealbreaker — we can't be certain — but a meaningful signal.
    # Exempt Nicole's target role patterns (Operations/Training/Compliance Coordinator).
    _LOW_SALARY_TITLE_PATTERNS = [
        "job captain", "sales coordinator", "marketing coordinator",
        "administrative coordinator", "receptionist", "team member",
        "crew member", "administrative assistant", "front desk",
    ]
    _EXEMPT_COORDINATOR_PREFIXES = [
        "operations coordinator", "training coordinator", "compliance coordinator",
        "program coordinator", "project coordinator",
    ]
    if salary_not_disclosed and target_salary_min:
        is_low_salary_title = any(lp in job_title for lp in _LOW_SALARY_TITLE_PATTERNS)
        is_exempt = any(ep in job_title for ep in _EXEMPT_COORDINATOR_PREFIXES)
        if is_low_salary_title and not is_exempt:
            salary_alignment = max(0, salary_alignment - 20)

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
                        "winter garden", "st cloud"},
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
            # Same state but NOT same city/metro — outside commute range.
            # Daytona Beach is in FL but ~60 miles from Casselberry.
            if dealbreakers.get("outside_commute"):
                dealbreaker_triggered = True
                logger.debug(
                    "[Dealbreaker] outside_commute triggered: %s is same-state but not same-metro for user in %s",
                    job_location, user_location,
                )
        else:
            location_fit = 20
            if dealbreakers.get("outside_commute"):
                dealbreaker_triggered = True
                logger.debug(
                    "[Dealbreaker] outside_commute triggered: %s is out-of-state for user in %s",
                    job_location, user_location,
                )
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

    # Domain penalty caps total — good salary/location doesn't make you a psychologist.
    # Cap is 15% (lowered from 28) so domain-mismatched roles drop to the very bottom
    # of the list and never appear in "Within Reach" or "Strong Match" buckets.
    if domain_penalty_applied:
        total_score = min(total_score, DOMAIN_PENALTY_CAP)

    # Coaching label
    if domain_penalty_applied:
        coaching_label = "Different specialization"
    elif salary_floor_violation:
        coaching_label = "Below your salary range"
    elif total_score >= TIER_BREAKPOINTS["strong"]:
        coaching_label = "Strong match"
    elif total_score >= TIER_BREAKPOINTS["stretch"]:
        coaching_label = "Within Reach"
    else:
        coaching_label = "Growth opportunity"

    # Target company check
    is_target_company = job_company in target_companies if target_companies else False

    # Job-specific gaps are populated asynchronously via Claude Haiku
    # in _score_jobs() for Within Reach jobs (50-69%). See gap_analyzer.py.
    job_specific_gaps = []

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
        "domain_penalized": domain_penalty_applied,
        "salary_floor_violation": salary_floor_violation,
        "salary_not_disclosed": salary_not_disclosed,
    }
