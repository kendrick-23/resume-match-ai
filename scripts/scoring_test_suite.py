#!/usr/bin/env python3
"""
Scoring test suite — validates holt_score.py keyword scoring against
Nicole's profile with 10 known-good and 10 known-bad jobs.

Run:  python scripts/scoring_test_suite.py
      (from the repo root, with backend on PYTHONPATH)

Each job is scored through calculate_holt_score() only (no Haiku calls).
Pass criteria:
  - Good jobs: keyword score >= 70%
  - Bad jobs:  keyword score < 60%
"""

import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.holt_score import calculate_holt_score

# --- Nicole's profile ---
PROFILE = {
    "target_roles": "Operations Manager, Training Manager, Compliance Coordinator",
    "target_salary_min": 75000,
    "target_salary_max": 95000,
    "schedule_preference": "monday_friday",
    "location": "Casselberry, FL",
    "job_title": "Assistant General Manager",
    "degree_status": "",
    "dealbreakers": {"below_salary": True, "outside_commute": True},
    "target_companies": "",
}

SKILLS = [
    "operations management", "team leadership", "compliance",
    "staff training", "scheduling", "payroll", "inventory management",
    "guest experience", "vendor relations", "food and beverage operations",
    "customer service", "hiring", "onboarding", "process improvement",
]

# --- 10 GOOD JOBS (should score >= 70%) ---
GOOD_JOBS = [
    {
        "title": "Operations Manager",
        "company": "Crunch Fitness",
        "description": "Manage daily operations for fitness location. Oversee team of 20+ staff. Handle scheduling, inventory, compliance, member experience. P&L responsibility. Training and development.",
        "location": "Orlando, FL",
        "salary_min": 75000, "salary_max": 85000, "is_remote": False,
    },
    {
        "title": "Training Manager",
        "company": "ResultsCX",
        "description": "Design and implement training programs for operations staff. Manage L&D budget. Develop onboarding curriculum. Compliance training oversight. Team of coordinators.",
        "location": "Orlando, FL",
        "salary_min": 78000, "salary_max": 92000, "is_remote": False,
    },
    {
        "title": "Compliance Coordinator",
        "company": "AdventHealth",
        "description": "Coordinate compliance programs across facilities. Audit processes, track regulatory requirements. Training staff on compliance standards. Scheduling and reporting.",
        "location": "Orlando, FL",
        "salary_min": 75000, "salary_max": 85000, "is_remote": False,
    },
    {
        "title": "Operations Director",
        "company": "Aramark",
        "description": "Direct food and beverage operations across multiple locations. P&L oversight, compliance, vendor management. Team leadership of 50+ staff. Process improvement initiatives.",
        "location": "Orlando, FL",
        "salary_min": 90000, "salary_max": 110000, "is_remote": False,
    },
    {
        "title": "Regional Operations Manager",
        "company": "Sodexo",
        "description": "Manage operations across 5 locations. Scheduling, inventory, compliance, customer service oversight. Hiring and training team leads. Budget management.",
        "location": "Orlando, FL",
        "salary_min": 80000, "salary_max": 95000, "is_remote": False,
    },
    {
        "title": "Assistant Director of Operations",
        "company": "Hilton",
        "description": "Support hotel operations. Staff scheduling, training oversight, guest experience management. Compliance and safety programs. Vendor relations. P&L reporting.",
        "location": "Orlando, FL",
        "salary_min": 78000, "salary_max": 88000, "is_remote": False,
    },
    {
        "title": "Supervisory Immigration Services Officer",
        "company": "Department of Homeland Security",
        "description": "Supervise team of immigration services officers. Manage case processing operations. Compliance with federal regulations. Training oversight. Scheduling.",
        "location": "Orlando, FL",
        "salary_min": 86962, "salary_max": 113047, "is_remote": False,
    },
    {
        "title": "General Manager",
        "company": "Compass Group",
        "description": "Full P&L responsibility for food service operations. Team leadership, compliance, scheduling, vendor management. Training program development. Customer service excellence.",
        "location": "Kissimmee, FL",
        "salary_min": 80000, "salary_max": 95000, "is_remote": False,
    },
    {
        "title": "Branch Manager",
        "company": "Enterprise Holdings",
        "description": "Manage branch operations, team of 15 employees. Scheduling, training, compliance. Customer service, inventory management. P&L reporting.",
        "location": "Winter Park, FL",
        "salary_min": 75000, "salary_max": 85000, "is_remote": False,
    },
    {
        "title": "Area Manager",
        "company": "Amazon",
        "description": "Lead a team of 50+ associates in warehouse operations. Scheduling, compliance, process improvement. Training new hires. Safety and quality oversight.",
        "location": "Orlando, FL",
        "salary_min": 75000, "salary_max": 95000, "is_remote": False,
    },
]

# --- 10 BAD JOBS (should score < 60%) ---
BAD_JOBS = [
    {
        "title": "Marketing Manager - Ole Red Orlando",
        "company": "Opry Entertainment Group",
        "description": "Plan and execute marketing campaigns for restaurant and entertainment venue. Social media, events marketing, local partnerships. Brand guidelines.",
        "location": "Orlando, FL",
        "salary_min": None, "salary_max": None, "is_remote": False,
    },
    {
        "title": "Director of Operations - Commercial",
        "company": "Wharton Smith Inc",
        "description": "Oversee commercial construction operations. Manage project teams, budgets. Building codes and safety. Construction management experience required. General contractor.",
        "location": "Sanford, FL",
        "salary_min": 95000, "salary_max": 130000, "is_remote": False,
    },
    {
        "title": "Linen Bagger",
        "company": "Clean Sweep Linen",
        "description": "Bag and sort linens in industrial laundry facility. Physical labor, standing for extended periods.",
        "location": "Orlando, FL",
        "salary_min": 28000, "salary_max": 32000, "is_remote": False,
    },
    {
        "title": "Broker Growth & Field Development Manager",
        "company": "IDEA Insurance",
        "description": "Grow insurance broker network. Field development of new agents. Sales targets and territory management. Insurance license required.",
        "location": "Orlando, FL",
        "salary_min": 60000, "salary_max": 70000, "is_remote": False,
    },
    {
        "title": "Receptionist",
        "company": "Orlando Health",
        "description": "Front desk reception. Answer phones, greet visitors, schedule appointments. Data entry and filing.",
        "location": "Orlando, FL",
        "salary_min": 32000, "salary_max": 38000, "is_remote": False,
    },
    {
        "title": "Sales Coordinator",
        "company": "Marriott International",
        "description": "Coordinate sales activities for hotel. Manage group bookings, prepare proposals, maintain CRM. Support sales team with administrative tasks.",
        "location": "Orlando, FL",
        "salary_min": 45000, "salary_max": 55000, "is_remote": False,
    },
    {
        "title": "Registered Nurse - ICU",
        "company": "AdventHealth",
        "description": "Provide critical care nursing in ICU. Patient assessment, medication administration. BSN and RN license required. 12-hour shifts.",
        "location": "Orlando, FL",
        "salary_min": 65000, "salary_max": 85000, "is_remote": False,
    },
    {
        "title": "Team Member",
        "company": "Chipotle",
        "description": "Prepare food, serve customers, maintain cleanliness. Fast-paced environment. No experience required.",
        "location": "Orlando, FL",
        "salary_min": 28000, "salary_max": 33000, "is_remote": False,
    },
    {
        "title": "Financial Services Coordinator - Fire Rescue and EMS",
        "company": "Osceola County",
        "description": "Manage financial services for fire rescue and EMS department. Budget tracking, procurement, compliance with emergency services funding requirements. Dispatch coordination.",
        "location": "Kissimmee, FL",
        "salary_min": 55000, "salary_max": 65000, "is_remote": False,
    },
    {
        "title": "Truck Driver - CDL Class A",
        "company": "Schneider National",
        "description": "Drive commercial vehicles on regional routes. CDL Class A required. DOT compliance. Loading and unloading.",
        "location": "Orlando, FL",
        "salary_min": 55000, "salary_max": 70000, "is_remote": False,
    },
]


def run_tests():
    passed = 0
    failed = 0
    failures = []

    print("=" * 72)
    print("SCORING TEST SUITE — Nicole's Profile")
    print("=" * 72)

    # Good jobs
    print("\n--- GOOD JOBS (expect keyword score >= 70%) ---\n")
    for job in GOOD_JOBS:
        result = calculate_holt_score(job, PROFILE, SKILLS, [])
        score = result["total_score"]
        ok = score >= 70
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        else:
            failed += 1
            failures.append((job["title"], job["company"], score, ">=70"))
        print(f"  [{status}] {score:3d}%  {job['title']} at {job['company']}")
        if not ok:
            b = result["breakdown"]
            print(f"         skills={b['skills_match']} sal={b['salary_alignment']} sched={b['schedule_fit']} exp={b['experience_match']} loc={b['location_fit']}")

    # Bad jobs
    print("\n--- BAD JOBS (expect keyword score < 60%) ---\n")
    for job in BAD_JOBS:
        result = calculate_holt_score(job, PROFILE, SKILLS, [])
        score = result["total_score"]
        ok = score < 60
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        else:
            failed += 1
            failures.append((job["title"], job["company"], score, "<60"))
        label = result["coaching_label"]
        extra = ""
        if result["domain_penalized"]:
            extra = " [DOMAIN_PENALIZED]"
        if result["dealbreaker_triggered"]:
            extra += " [DEALBREAKER]"
        print(f"  [{status}] {score:3d}%  {job['title']} at {job['company']}{extra}")
        if not ok:
            b = result["breakdown"]
            print(f"         skills={b['skills_match']} sal={b['salary_alignment']} sched={b['schedule_fit']} exp={b['experience_match']} loc={b['location_fit']}")

    # Summary
    print(f"\n{'=' * 72}")
    print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed}")
    if failures:
        print(f"\nFAILURES:")
        for title, company, score, threshold in failures:
            print(f"  {title} at {company}: {score}% (expected {threshold})")
    print("=" * 72)

    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
