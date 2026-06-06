"""
Smoke tests — pure logic, no DB or external services needed.
Run: cd platform/backend && pytest tests/test_smoke.py -v
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.revenue import revenue_score, AGENT_SCHEDULE


def test_revenue_score_ordering():
    """Interested lead with recent contact beats a new lead with old contact."""
    high = revenue_score("interested", 1, True, True)
    low = revenue_score("new", 48, False, False)
    assert high > low, f"Expected {high} > {low}"


def test_revenue_score_interested_max():
    """Interested + <2h + phone + instagram = 85 (the maximum)."""
    assert revenue_score("interested", 1, True, True) == 85


def test_revenue_score_replied_same_day():
    """Replied lead with phone, same-day contact = 40+10+10 = 60."""
    assert revenue_score("replied", 5, True, False) == 60


def test_agent_schedule_keys():
    """All critical pipeline agents must have an entry in AGENT_SCHEDULE."""
    required = {
        "lead_finder", "website_analyzer", "preview_generator",
        "outreach_writer", "followup_agent", "ceo_agent", "outreach_sender",
    }
    missing = required - set(AGENT_SCHEDULE.keys())
    assert not missing, f"Missing from AGENT_SCHEDULE: {missing}"


def test_agent_schedule_structure():
    """Every schedule entry must have interval_h, window_h, and label."""
    for name, sched in AGENT_SCHEDULE.items():
        assert "interval_h" in sched, f"{name} missing interval_h"
        assert "window_h" in sched, f"{name} missing window_h"
        assert "label" in sched, f"{name} missing label"
        assert sched["window_h"] >= sched["interval_h"], f"{name}: window_h must be >= interval_h"
