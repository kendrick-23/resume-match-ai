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

from app.constants.scoring import (
    DOMAIN_PENALTY_CAP,
    DIMENSION_WEIGHTS,
    SKILLS_MATCH,
    SKILLS_MATCH_CREDITS,
    SALARY_ALIGNMENT,
    SCHEDULE_FIT,
    EXPERIENCE_MATCH_TIERS,
    EXPERIENCE_MATCH_OVER,
    LOCATION_FIT,
    UPWARD_SENIORITY_CAP,
    get_coaching_label,
)


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

    # --- Required vs Preferred context extraction ---
    # Split the JD into sentence-like chunks and classify each as "required"
    # or "preferred" context based on cue phrases. Words inside each bucket
    # become the lookup sets used by the skills-match loop below. Required
    # wins when a sentence contains BOTH cues (elif branch). Works on the
    # full description — no truncation.
    _required_context_patterns = [
        r"required[:\s]", r"must\s+have[:\s]", r"must\s+possess",
        r"minimum\s+qualifications?", r"minimum\s+requirements?",
        r"you\s+must\s+have", r"we\s+require",
    ]
    _preferred_context_patterns = [
        r"preferred[:\s]", r"nice\s+to\s+have", r"a\s+plus",
        r"desired[:\s]", r"bonus\s+if", r"ideally\s+you",
        r"preferred\s+qualifications?",
    ]
    _req_words: set[str] = set()
    _pref_words: set[str] = set()
    for _sent in re.split(r"[.\n;•·\-–]", job_desc):
        _sent_lower = _sent.lower().strip()
        if not _sent_lower:
            continue
        _is_required = any(re.search(p, _sent_lower) for p in _required_context_patterns)
        _is_preferred = any(re.search(p, _sent_lower) for p in _preferred_context_patterns)
        # Normalize punctuation before splitting — without this, a trailing
        # comma ("compliance,") prevents the skill-word intersection from
        # matching the bare skill ("compliance") below.
        _tokens = re.sub(r"[^\w\s&]", " ", _sent_lower).split()
        if _is_required:
            _req_words.update(_tokens)
        elif _is_preferred:
            _pref_words.update(_tokens)

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

        # Match full phrases AND significant individual words, weighted by
        # whether the JD lists the skill as required vs preferred. Denominator
        # stays tied to the ORIGINAL skill count so the bridge can only improve
        # the score, never dilute it.
        matches = 0.0
        preferred_matches = 0.0  # tracked separately for post-bonus context penalty
        for s in match_terms:
            full_phrase_match = s in job_text
            words = [w for w in s.split() if len(w) > SKILLS_MATCH["min_word_length"]]
            partial_match = bool(words) and any(w in job_text for w in words)
            if not (full_phrase_match or partial_match):
                continue
            skill_words = set(s.split())
            in_required = bool(skill_words & _req_words)
            in_preferred = bool(skill_words & _pref_words)
            if full_phrase_match:
                if in_required:
                    credit = SKILLS_MATCH_CREDITS["required_full"]
                elif in_preferred:
                    credit = SKILLS_MATCH_CREDITS["preferred_full"]
                else:
                    credit = SKILLS_MATCH_CREDITS["neutral_full"]
            else:
                if in_required:
                    credit = SKILLS_MATCH_CREDITS["required_partial"]
                elif in_preferred:
                    credit = SKILLS_MATCH_CREDITS["preferred_partial"]
                else:
                    credit = SKILLS_MATCH_CREDITS["neutral_partial"]
            matches += credit
            if in_preferred and not in_required:
                preferred_matches += credit
        # The trailing * 100 is a percentage conversion, not a tunable constant.
        skills_match = min(100, round((matches / min(len(skills), SKILLS_MATCH["denominator_cap"])) * 100))
    else:
        # Fallback: if no skills but target_roles exist, do basic role matching
        if target_roles:
            role_parts = [r.strip() for r in target_roles.split(",") if r.strip()]
            role_match = any(r in job_title for r in role_parts)
            skills_match = 60 if role_match else 40
        else:
            skills_match = 50

    # --- Upward seniority cap ---
    # Mirrors the DOWNWARD seniority cap in batch_scorer._apply_gates
    # (coordinator/specialist title vs. manager user → cap at 55).
    # Fires before the ops floor / ops bonus so the cap cannot be overridden
    # by those bonuses. Skips the ops floor and ops bonus entirely when
    # triggered.
    _EXECUTIVE_PHRASES = (
        "vice president", "vp of", "vp,", "chief ", "c-suite",
        "president", "managing director", "general counsel",
        "partner,", "equity partner",
    )
    # Short acronyms matched with word boundaries to avoid hits on
    # "cook"/"cooperative"/"ceremony"/etc.
    _EXECUTIVE_TOKENS = {"svp", "evp", "avp", "coo", "ceo", "cfo", "cto", "cmo"}
    _ENTRY_MID_USER_SIGNALS = (
        "coordinator", "specialist", "associate", "assistant",
        "analyst", "representative", "agent", "clerk",
    )
    _MANAGER_USER_SIGNALS = ("manager", "agm", "supervisor", "lead", "director")
    _user_title_lower = (profile.get("job_title") or "").lower()
    _title_words = set(re.findall(r"[a-z]+", job_title))
    _job_is_executive = (
        any(p in job_title for p in _EXECUTIVE_PHRASES)
        or bool(_title_words & _EXECUTIVE_TOKENS)
    )
    _user_is_below_exec = (
        any(s in _user_title_lower for s in _ENTRY_MID_USER_SIGNALS)
        or any(s in _user_title_lower for s in _MANAGER_USER_SIGNALS)
    )
    _skip_ops_bonus = False
    if _job_is_executive and _user_is_below_exec:
        skills_match = min(skills_match, UPWARD_SENIORITY_CAP["skills_match_ceiling"])
        _skip_ops_bonus = True

    # Bonus for title matching target roles
    if target_roles:
        role_parts = [r.strip() for r in target_roles.split(",") if r.strip()]
        for role in role_parts:
            if role in job_title:
                skills_match = min(100, skills_match + SKILLS_MATCH["target_role_bonus"])
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
    has_ops_profile = len(skills) >= SKILLS_MATCH["ops_skill_threshold"]
    if (
        not _skip_ops_bonus
        and is_ops_role
        and has_ops_profile
        and skills_match < SKILLS_MATCH["ops_floor"]
    ):
        skills_match = SKILLS_MATCH["ops_floor"]

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
                skills_match = max(0, skills_match + SKILLS_MATCH["licensed_penalty"])
                degree_warning = True
                domain_penalty_applied = True
            break

    # --- Gate 1: credential hard disqualifiers (blocks A–F) ---
    # Catches credential requirements that don't surface in the title-trigger
    # table and don't match the legacy licensure-phrase regexes below. Each
    # block scans the FULL description (not the 500-char head), independently
    # guarded so the first hit wins.
    gate1_full_text = f"{job_title} {job_desc}"

    # Block A — Accounting / Finance hard credentials
    if not domain_penalty_applied:
        _acct_triggers = [
            r"\bcpa\s+required\b",
            r"\bcpa\s+is\s+required\b",
            r"\bmust\s+hold\s+a?\s*cpa\b",
            r"\bcertified\s+public\s+accountant\s+required\b",
            r"\bcfa\s+required\b",
            r"\bcia\s+required\b",
            r"\b24\s+semester\s+hours?\s+of\s+accounting\b",
            r"\bdegree\s+in\s+accounting\b",
            r"\baccounting\s+degree\s+required\b",
            r"\bseries\s+7\s+required\b",
            r"\bseries\s+63\s+required\b",
        ]
        if any(re.search(p, gate1_full_text, re.IGNORECASE) for p in _acct_triggers):
            has_acct_cred = (
                bool(re.search(r"\bcpa\b", skills_str))
                or "certified public accountant" in skills_str
                or bool(re.search(r"\bcfa\b", skills_str))
                or bool(re.search(r"\bcia\b", skills_str))
                or "series 7" in skills_str
                or "series 63" in skills_str
                or "accounting degree" in skills_str
                or bool(re.search(r"\bbs\s+accounting\b", skills_str))
                or bool(re.search(r"\bbachelor.*accounting\b", skills_str))
                or bool(re.search(r"\bcpa\b", degree))
                or "accounting" in degree
            )
            if not has_acct_cred:
                skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
                domain_penalty_applied = True
                logger.info(f"[Gate1/Accounting] cred disqualifier fired for job: {job_title[:50]}")

    # Block B — Engineering (PE license)
    if not domain_penalty_applied:
        _eng_triggers = [
            r"\bpe\s+license\s+required\b",
            r"\bprofessional\s+engineer\s+required\b",
            r"\bregistered\s+professional\s+engineer\b",
            r"\bmust\s+be\s+a\s+licensed\s+engineer\b",
        ]
        if any(re.search(p, gate1_full_text, re.IGNORECASE) for p in _eng_triggers):
            has_eng_cred = (
                "pe license" in skills_str
                or "professional engineer" in skills_str
                or "registered engineer" in skills_str
                or "pe license" in degree
                or "professional engineer" in degree
            )
            if not has_eng_cred:
                skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
                domain_penalty_applied = True
                logger.info(f"[Gate1/Engineering] fired for job: {job_title[:50]}")

    # Block C — Legal / bar admission
    if not domain_penalty_applied:
        _legal_triggers = [
            r"\bbar\s+admission\s+required\b",
            r"\badmitted\s+to\s+the\s+bar\b",
            r"\bjd\s+required\b",
            r"\bjuris\s+doctor\s+required\b",
            r"\bmust\s+be\s+licensed\s+to\s+practice\s+law\b",
            r"\bactive\s+bar\s+membership\b",
        ]
        if any(re.search(p, gate1_full_text, re.IGNORECASE) for p in _legal_triggers):
            has_legal_cred = (
                bool(re.search(r"\bjd\b", skills_str))
                or "juris doctor" in skills_str
                or "bar admission" in skills_str
                or "licensed attorney" in skills_str
                or bool(re.search(r"\bjd\b", degree))
                or "juris doctor" in degree
            )
            if not has_legal_cred:
                skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
                domain_penalty_applied = True
                logger.info(f"[Gate1/Legal] fired for job: {job_title[:50]}")

    # Block D — Federal GS-level specialized experience
    if not domain_penalty_applied:
        _fed_patterns = [
            r"\bgs-1[0-9]\s+(level\s+)?specialized\s+experience\b",
            r"\bone\s+year.*gs-1[0-9]\b",
            r"\bspecialized\s+experience.*gs-1[0-9]\b",
            r"\bfederal\s+(financial\s+management|accounting)\s+experience\s+required\b",
        ]
        fed_matched = any(re.search(p, gate1_full_text, re.IGNORECASE) for p in _fed_patterns)
        # OMB Circular or Treasury guidance co-occurring with "required" in the
        # same sentence. Note: spec originally wrote "omg circular" — corrected
        # to "omb" (the actual federal acronym) since "omg" never appears in
        # real postings.
        if not fed_matched:
            for s in re.split(r"[.?!]+", gate1_full_text):
                if (re.search(r"\bomb\s+circular\b", s, re.IGNORECASE)
                        or re.search(r"\btreasury\s+guidance\b", s, re.IGNORECASE)) \
                        and re.search(r"\brequired\b", s, re.IGNORECASE):
                    fed_matched = True
                    break
        if fed_matched:
            user_current_title = (profile.get("job_title") or "").lower()
            has_fed_cred = (
                "federal government" in skills_str
                or "gs-" in skills_str
                or "usajobs" in skills_str
                or "federal agency" in skills_str
                or "federal government" in degree
                or "gs-" in degree
                or "federal government" in user_current_title
                or "gs-" in user_current_title
                or "federal agency" in user_current_title
            )
            if not has_fed_cred:
                skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
                domain_penalty_applied = True
                logger.info(f"[Gate1/Federal] fired for job: {job_title[:50]}")

    # Block E — Security clearance required
    if not domain_penalty_applied:
        _clr_patterns = [
            r"\bactive\s+(secret|top\s+secret|ts/sci)\s+clearance\s+required\b",
            r"\bmust\s+hold\s+(a\s+)?(secret|top\s+secret)\s+clearance\b",
            r"\bmust\s+be\s+eligible\s+for\s+(secret|top\s+secret)\s+clearance\b",
        ]
        clr_matched = any(re.search(p, gate1_full_text, re.IGNORECASE) for p in _clr_patterns)
        if not clr_matched:
            # "clearance is required" co-occurring with "secret" or "ts" in the same sentence
            for s in re.split(r"[.?!]+", gate1_full_text):
                if re.search(r"\bclearance\s+is\s+required\b", s, re.IGNORECASE) \
                        and re.search(r"\b(secret|ts)\b", s, re.IGNORECASE):
                    clr_matched = True
                    break
        if clr_matched:
            has_clr_cred = (
                "security clearance" in skills_str
                or "secret clearance" in skills_str
                or "ts/sci" in skills_str
                or "top secret" in skills_str
            )
            if not has_clr_cred:
                skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
                domain_penalty_applied = True
                logger.info(f"[Gate1/Clearance] fired for job: {job_title[:50]}")

    # Block F — Degree domain specificity (non-generic degree requirements)
    if not domain_penalty_applied:
        _degree_domains = [
            (r"\bdegree\s+in\s+computer\s+science\s+required\b",       "computer science"),
            (r"\bdegree\s+in\s+software\s+engineering\s+required\b",   "software engineering"),
            (r"\bdegree\s+in\s+electrical\s+engineering\s+required\b", "electrical engineering"),
            (r"\bdegree\s+in\s+civil\s+engineering\s+required\b",      "civil engineering"),
            (r"\bdegree\s+in\s+mechanical\s+engineering\s+required\b", "mechanical engineering"),
            (r"\bdegree\s+in\s+chemical\s+engineering\s+required\b",   "chemical engineering"),
            (r"\bbs\s+(cs|computer\s+science)\s+required\b",           "computer science"),
            (r"\bdegree\s+in\s+nursing\s+required\b",                  "nursing"),
            (r"\bbsn\s+required\b",                                    "nursing"),
        ]
        for pattern, domain_term in _degree_domains:
            if re.search(pattern, gate1_full_text, re.IGNORECASE):
                if domain_term not in skills_str and domain_term not in degree:
                    skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
                    domain_penalty_applied = True
                    logger.info(f"[Gate1/Degree] fired for job: {job_title[:50]}")
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
                    skills_match = max(0, skills_match + SKILLS_MATCH["licensed_penalty"])
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
    if (
        ops_match
        and ops_keyword_count >= 2
        and not domain_penalty_applied
        and not _skip_ops_bonus
    ):
        # Scale bonus by how many ops keywords the user has (2-8 → +5 to +20)
        ops_bonus = min(SKILLS_MATCH["ops_bonus_max"], ops_keyword_count * SKILLS_MATCH["ops_bonus_per_kw"])
        skills_match = min(100, skills_match + ops_bonus)

    # Post-bonus context penalty: preserve the required-vs-preferred signal
    # through the target-role + ops-bonus clamps. Without this, a JD that
    # lists a candidate's skills as "preferred" can score identically to a
    # JD that lists them as "required" once both clamp at 100. The penalty
    # is proportional to the share of matches that came from preferred-only
    # context, capped at 15 points (covers the clamp headroom of +15 target
    # + +18 ops without negating the ops floor).
    if skills and matches > 0:
        _preferred_share = preferred_matches / matches
        _context_penalty = round(15 * _preferred_share)
        skills_match = max(0, skills_match - _context_penalty)

    # Adzuna category-based domain penalty — fires FIRST, before any keyword
    # checks. Adzuna pre-classifies every job; wrong-domain categories get
    # penalized automatically. Only Adzuna jobs have this field — Indeed,
    # Jooble, USAJobs will have adzuna_category="" and fall through.
    _ADZUNA_DOMAIN_PENALTY_CATEGORIES = {
        "trade-construction-jobs",
        "healthcare-nursing-jobs",
        "retail-jobs",
        "domestic-help-cleaning-jobs",
        "maintenance-jobs",
        "manufacturing-jobs",
    }
    adzuna_cat = job.get("adzuna_category", "")
    if not domain_penalty_applied and adzuna_cat in _ADZUNA_DOMAIN_PENALTY_CATEGORIES:
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True

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
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True
    if not domain_penalty_applied and any(
        idt in job_desc or idt in job_company for idt in _INDUSTRIAL_DESC_TRIGGERS
    ):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True

    # Retail clothing companies — Nicole targets corporate ops, not retail floor mgmt.
    # These companies almost exclusively hire for in-store roles when they appear
    # in job aggregators. Store Manager at Hollister ≠ Operations Manager.
    _RETAIL_CLOTHING_COMPANIES = [
        "hollister", "abercrombie", "h&m", "zara", "gap inc", "old navy",
        "forever 21", "american eagle", "aeropostale", "hot topic",
        "express", "banana republic", "victoria's secret", "bath & body works",
        "buckle",
        "dollar tree", "dollar general", "family dollar", "five below",
    ]
    _RETAIL_CLOTHING_DESC_TRIGGERS = [
        "apparel", "clothing store", "fashion retail", "retail clothing",
    ]
    if not domain_penalty_applied and (
        any(rc in job_company for rc in _RETAIL_CLOTHING_COMPANIES)
        or any(rd in job_desc for rd in _RETAIL_CLOTHING_DESC_TRIGGERS)
    ):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
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
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
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
            skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
            domain_penalty_applied = True

    # Construction description standalone — catches "Construction Operations
    # Director" or any title when the description is clearly construction work.
    _CONSTRUCTION_DESC_STANDALONE = [
        "general contractor", "subcontractor", "construction site",
        "building construction",
    ]
    if not domain_penalty_applied and any(
        cs in job_desc for cs in _CONSTRUCTION_DESC_STANDALONE
    ):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
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
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
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
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
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
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True

    # HVAC/mechanical contractor — "HVAC Operations Manager" requires trade
    # knowledge (refrigeration, ductwork, EPA certs) unrelated to hospitality ops.
    _HVAC_TRIGGERS = [
        "hvac", "air conditioning installation", "mechanical contractor",
        "heating systems", "refrigeration", "plumbing contractor",
    ]
    if not domain_penalty_applied and any(
        hv in job_desc or hv in job_title for hv in _HVAC_TRIGGERS
    ):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True

    # Carwash / auto detailing — service roles requiring unrelated vehicle
    # service experience. "Operations Manager" at a carwash ≠ corporate ops.
    _CARWASH_TRIGGERS = [
        "carwash", "car wash", "auto detailing", "car detailing",
    ]
    if not domain_penalty_applied and any(
        cw in job_title or cw in job_desc or cw in job_company for cw in _CARWASH_TRIGGERS
    ):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True

    # Clinical / medical specialist titles — require clinical licensure.
    _CLINICAL_TITLE_TRIGGERS = [
        "respiratory", "occupational therapist", "physician",
        "neurolog", "dermatolog", "intensivist",
        "otolaryngolog", "neurosurg",
    ]
    if not domain_penalty_applied and any(ct in job_title for ct in _CLINICAL_TITLE_TRIGGERS):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True

    # Technical IC engineering roles — wrong target for ops/training/compliance.
    _TECH_IC_TRIGGERS = [
        "data engineer", "software engineer", "data scientist",
        "machine learning engineer", "devops engineer", "cloud engineer",
    ]
    if not domain_penalty_applied and any(te in job_title for te in _TECH_IC_TRIGGERS):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True

    # Electrical / utility trades — require trade licensure and field experience.
    _ELECTRICAL_TRIGGERS = [
        "power distribution", "electrician", "lineman",
        "substation", "utility technician",
    ]
    if not domain_penalty_applied and any(et in job_title for et in _ELECTRICAL_TRIGGERS):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True

    # Tax preparation / seasonal office — seasonal tax roles at H&R Block etc.
    # are short-term financial services work, not operations management.
    _TAX_COMPANIES = ["h&r block", "jackson hewitt", "liberty tax"]
    _TAX_TRIGGERS = ["tax preparation", "tax returns", "tax office"]
    if not domain_penalty_applied and (
        any(tc in job_company for tc in _TAX_COMPANIES)
        or any(tt in job_desc for tt in _TAX_TRIGGERS)
    ):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
        domain_penalty_applied = True

    # Housekeeping/custodial management — title triggers for facility cleaning
    # roles that use "operations manager" in the title but are custodial work.
    _HOUSEKEEPING_TITLE_TRIGGERS = [
        "housekeeping manager", "housekeeping operations",
        "custodial manager", "custodial operations manager",
        "janitorial manager",
    ]
    if not domain_penalty_applied and any(ht in job_title for ht in _HOUSEKEEPING_TITLE_TRIGGERS):
        skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
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
        skills_match = min(skills_match, SKILLS_MATCH["revenue_mgmt_soft_cap"])

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
            skills_match = min(skills_match, SKILLS_MATCH["domain_cap"])
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
            salary_alignment = SALARY_ALIGNMENT["comfort_score"]
        elif job_salary > band_top:
            # Overpay: gentle decline (seniority-creep signal). Floored at overpay_floor.
            overpay_ratio = (job_salary - band_top) / (band_top * SALARY_ALIGNMENT["overpay_width"])
            salary_alignment = max(
                SALARY_ALIGNMENT["overpay_floor"],
                round(SALARY_ALIGNMENT["comfort_score"] - SALARY_ALIGNMENT["overpay_slope"] * overpay_ratio),
            )
        elif job_salary >= floor_min * SALARY_ALIGNMENT["shoulder_lower_bound"]:
            # Shoulder: linear comfort_score → shoulder_base across (1 - shoulder_lower_bound) below floor.
            # The 0.1 below = 1 - shoulder_lower_bound (derived span, not an independent knob).
            salary_alignment = round(
                SALARY_ALIGNMENT["shoulder_base"] + SALARY_ALIGNMENT["shoulder_range"] * (
                    (job_salary - floor_min * SALARY_ALIGNMENT["shoulder_lower_bound"])
                    / (floor_min * 0.1)
                )
            )
            salary_alignment = max(
                SALARY_ALIGNMENT["shoulder_base"],
                min(SALARY_ALIGNMENT["comfort_score"], salary_alignment),
            )
        elif job_salary >= floor_min * SALARY_ALIGNMENT["steep_lower_bound"]:
            # Steep decline: linear shoulder_base → steep_base across (shoulder_lower_bound - steep_lower_bound) below floor.
            # The 0.15 below = shoulder_lower_bound - steep_lower_bound (derived span, not an independent knob).
            salary_alignment = round(
                SALARY_ALIGNMENT["steep_base"] + SALARY_ALIGNMENT["steep_range"] * (
                    (job_salary - floor_min * SALARY_ALIGNMENT["steep_lower_bound"])
                    / (floor_min * 0.15)
                )
            )
            salary_alignment = max(
                SALARY_ALIGNMENT["steep_base"],
                min(SALARY_ALIGNMENT["shoulder_base"], salary_alignment),
            )
        else:
            # Hard floor: > 25% below the seeker's stated minimum.
            salary_alignment = SALARY_ALIGNMENT["hard_floor"]
            salary_floor_violation = True
            if dealbreakers.get("below_salary"):
                dealbreaker_triggered = True
    else:
        # No salary data — slightly pessimistic prior (was 70). Stops rewarding
        # postings that hide their pay relative to honest postings near floor.
        salary_alignment = SALARY_ALIGNMENT["undisclosed_default"]
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
            salary_alignment = max(0, salary_alignment - SALARY_ALIGNMENT["undisclosed_title_penalty"])

    # --- 3. Schedule Fit (15%) ---
    schedule_red_flags = ["weekend", "nights", "shift", "rotating", "overnight"]
    has_schedule_flag = any(flag in job_desc for flag in schedule_red_flags)

    if schedule_pref == "monday_friday":
        schedule_fit = SCHEDULE_FIT["mf_red_flag"] if has_schedule_flag else SCHEDULE_FIT["mf_clean"]
    elif schedule_pref == "remote_only":
        if is_remote:
            schedule_fit = SCHEDULE_FIT["remote_only_remote"]
        elif "hybrid" in job_desc or "hybrid" in job_title:
            schedule_fit = SCHEDULE_FIT["remote_only_hybrid"]
        else:
            schedule_fit = SCHEDULE_FIT["remote_only_onsite"]
    else:
        schedule_fit = SCHEDULE_FIT["any"]

    # --- 4. Experience Match (15%) ---
    years_patterns = re.findall(r"(\d+)\+?\s*(?:years?|yrs?)", job_desc)
    required_years = max((int(y) for y in years_patterns), default=0)

    # EXPERIENCE_MATCH_TIERS is a list of (max_years, score) tuples.
    # Indexed access preserves the original if/elif ladder structure.
    if required_years == EXPERIENCE_MATCH_TIERS[0][0]:
        experience_match = EXPERIENCE_MATCH_TIERS[0][1]
    elif required_years <= EXPERIENCE_MATCH_TIERS[1][0]:
        experience_match = EXPERIENCE_MATCH_TIERS[1][1]
    elif required_years <= EXPERIENCE_MATCH_TIERS[2][0]:
        experience_match = EXPERIENCE_MATCH_TIERS[2][1]
    elif required_years <= EXPERIENCE_MATCH_TIERS[3][0]:
        experience_match = EXPERIENCE_MATCH_TIERS[3][1]
    else:
        experience_match = EXPERIENCE_MATCH_OVER

    # --- 5. Location Fit (10%) ---
    if is_remote or "remote" in job_location:
        location_fit = LOCATION_FIT["remote_or_same_city"]
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
                        "lake mary", "apopka", "winter park", "clermont",
                        "winter garden", "st cloud"},
            "tampa": {"tampa", "st petersburg", "clearwater", "brandon", "lakeland",
                      "plant city", "wesley chapel", "new port richey", "largo"},
            "jacksonville": {"jacksonville", "orange park", "fleming island",
                             "st augustine", "ponte vedra", "ponte vedra beach"},
            "miami": {"miami", "fort lauderdale", "hollywood", "hialeah",
                      "coral gables", "doral", "boca raton", "pompano beach"},
        }

        def in_same_metro(city1: str, city2: str) -> bool:
            c1 = city1.lower().strip().replace(".", "").replace(",", "")
            c2 = city2.lower().strip().replace(".", "").replace(",", "")
            for cities in metro_areas.values():
                if c1 in cities and c2 in cities:
                    return True
            return False

        if user_city and user_city == job_city:
            location_fit = LOCATION_FIT["remote_or_same_city"]
        elif user_city and job_city and in_same_metro(user_city, job_city):
            location_fit = LOCATION_FIT["same_metro"]
        elif same_state:
            location_fit = LOCATION_FIT["same_state"]
            # Same state but NOT same city/metro — outside commute range.
            # Daytona Beach is in FL but ~60 miles from Casselberry.
            if dealbreakers.get("outside_commute"):
                dealbreaker_triggered = True
                logger.debug(
                    "[Dealbreaker] outside_commute triggered: %s is same-state but not same-metro for user in %s",
                    job_location, user_location,
                )
        else:
            location_fit = LOCATION_FIT["different_state"]
            if dealbreakers.get("outside_commute"):
                dealbreaker_triggered = True
                logger.debug(
                    "[Dealbreaker] outside_commute triggered: %s is out-of-state for user in %s",
                    job_location, user_location,
                )
    else:
        location_fit = LOCATION_FIT["unknown_user_loc"]

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
    # Weights sum to 0.95 by design; see DIMENSION_WEIGHTS comment.
    total_score = round(
        skills_match * DIMENSION_WEIGHTS["skills_match"]
        + salary_alignment * DIMENSION_WEIGHTS["salary_alignment"]
        + schedule_fit * DIMENSION_WEIGHTS["schedule_fit"]
        + experience_match * DIMENSION_WEIGHTS["experience_match"]
        + location_fit * DIMENSION_WEIGHTS["location_fit"]
    )
    total_score = max(0, min(100, total_score))

    # Domain penalty caps total — good salary/location doesn't make you a psychologist.
    # Cap is 15% (lowered from 28) so domain-mismatched roles drop to the very bottom
    # of the list and never appear in "Within Reach" or "Strong Match" buckets.
    if domain_penalty_applied:
        total_score = min(total_score, DOMAIN_PENALTY_CAP)

    # Coaching label — salary-floor is a special label not covered by the
    # shared helper; everything else goes through get_coaching_label so
    # thresholds stay unified across the backend. Passing domain_alignment=0
    # when the deterministic scorer has flagged a domain penalty makes the
    # helper emit "Different specialization" regardless of the capped score.
    if salary_floor_violation and not domain_penalty_applied:
        coaching_label = "Below your salary range"
    else:
        coaching_label = get_coaching_label(
            total_score,
            0 if domain_penalty_applied else 100,
        )

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
