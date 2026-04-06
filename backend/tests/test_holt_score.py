"""
Holt Score Engine — scoring verification tests.
Run: python -m pytest backend/tests/test_holt_score.py -v
"""

from backend.app.services.holt_score import calculate_holt_score

NICOLE_PROFILE = {
    "location": "Casselberry, FL",
    "target_roles": "Operations Manager, General Manager",
    "target_salary_min": 75000,
    "target_salary_max": 85000,
    "schedule_preference": "monday_friday",
}
NICOLE_SKILLS = [
    "operations", "management", "leadership", "compliance",
    "training", "scheduling", "customer service", "inventory management",
]


def _score(title, desc="", company="", location="Orlando, FL",
           salary_min=75000, salary_max=85000):
    job = {
        "title": title, "description": desc, "company": company,
        "location": location, "salary_min": salary_min, "salary_max": salary_max,
    }
    return calculate_holt_score(job, NICOLE_PROFILE, NICOLE_SKILLS, [])


# --- Ops roles should score 80%+ with skills >= 65 ---

def test_operations_manager():
    r = _score("Operations Manager", "manage daily operations, scheduling, compliance")
    assert r["total_score"] >= 80 and r["breakdown"]["skills_match"] >= 65

def test_assistant_general_manager():
    r = _score("Assistant General Manager", "daily operations, scheduling, training, customer service")
    assert r["total_score"] >= 80 and r["breakdown"]["skills_match"] >= 65

def test_training_manager():
    r = _score("Training Manager", "training programs, compliance reporting, leadership")
    assert r["total_score"] >= 80 and r["breakdown"]["skills_match"] >= 65

def test_regional_manager_of_operations():
    r = _score("Regional Manager of Operations - Orlando",
               "oversee regional operations for dental offices, manage teams",
               company="Heartland Dental")
    assert r["total_score"] >= 80 and r["breakdown"]["skills_match"] >= 65


# --- Domain mismatches should score 28% ---

def test_staff_psychologist():
    r = _score("Staff Psychologist", "clinical psychology services", location="Remote")
    assert r["total_score"] == 28

def test_psychology_direct_hire():
    r = _score("Public Notice for Psychology (Direct Hire)", "clinical psychology services")
    assert r["total_score"] == 28

def test_pharmacy_operations_manager():
    r = _score("Pharmacy Operations Manager", "manage pharmacy operations, dispensing")
    assert r["total_score"] == 28


# --- Location scoring ---

def test_same_metro_scores_90():
    r = _score("Operations Manager", location="Middleton, FL, US")
    assert r["breakdown"]["location_fit"] == 90

def test_same_state_scores_70():
    r = _score("Operations Manager", location="Jacksonville, FL")
    assert r["breakdown"]["location_fit"] == 70

def test_different_state_scores_20():
    r = _score("Operations Manager", location="Atlanta, GA")
    assert r["breakdown"]["location_fit"] == 20

def test_remote_scores_100():
    r = _score("Operations Manager", location="Remote")
    assert r["breakdown"]["location_fit"] == 100
