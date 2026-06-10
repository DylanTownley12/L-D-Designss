"""
Pure-logic tests for the trades sales pipeline — no DB, no network, no deps.
Run:  cd platform/backend && python3 tests/test_trades_logic.py
  or: pytest tests/test_trades_logic.py -v
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.trades_logic import (
    normalize_phone, has_mobile_number, is_emergency_trade, proximity_score,
    rank_prospect, score_prospect, parse_pasted_list, dedupe_entries,
    trial_day, trial_days_remaining, churn_risk, is_trial_touchpoint,
)


def test_normalize_phone_variants():
    assert normalize_phone("07504 683058") == "504683058"
    assert normalize_phone("+447504683058") == "504683058"
    assert normalize_phone("0044 7504 683058") == "504683058"
    assert normalize_phone("(01942) 123456") == "942123456"
    assert normalize_phone("123") == ""
    assert normalize_phone(None) == ""


def test_has_mobile_number():
    assert has_mobile_number("07504683058") is True
    assert has_mobile_number("+447504683058") is True
    assert has_mobile_number("01942 123456") is False   # landline
    assert has_mobile_number("0161 123 4567") is False
    assert has_mobile_number(None) is False


def test_is_emergency_trade():
    assert is_emergency_trade("plumber") is True
    assert is_emergency_trade("Gas Engineer") is True
    assert is_emergency_trade("emergency electrician") is True
    assert is_emergency_trade("painter") is False
    assert is_emergency_trade("carpenter") is False


def test_proximity_score():
    assert proximity_score("Wigan") == 40
    assert proximity_score("leigh") == 40
    assert proximity_score("Bolton") == 30
    assert proximity_score("Manchester") == 20
    assert proximity_score("London") == 10        # unknown → base
    assert proximity_score(None) == 10


def test_rank_ordering():
    # Mobile + emergency + local must beat landline + non-emergency + far.
    best = rank_prospect(True, True, 40)            # 50+30+40 = 120
    worst = rank_prospect(False, False, 10)         # 0+0+10 = 10
    assert best == 120
    assert worst == 10
    assert best > worst
    # A mobile alone (50) outranks emergency+proximity without a mobile (30+40=70)? No —
    # emergency+local landline = 70 > mobile-only non-emergency far = 50. That's intended:
    assert rank_prospect(False, True, 40) == 70
    assert rank_prospect(True, False, 0) == 50


def test_score_prospect_compose():
    s = score_prospect("07504683058", "plumber", "Wigan")
    assert s == {"has_mobile": True, "is_emergency_trade": True,
                 "proximity_score": 40, "rank_score": 120}


def test_parse_pasted_list_separators():
    text = """
    Joe's Plumbing, 07504 683058, Wigan
    Spark Electrical | 01942 123456 | Leigh
    AB Heating  07700900123  Bolton
    - Bullet Drains, 07000111222, Standish
    """
    rows = parse_pasted_list(text)
    assert len(rows) == 4
    assert rows[0] == {"business_name": "Joe's Plumbing", "phone": "07504 683058", "town": "Wigan"}
    assert rows[1]["business_name"] == "Spark Electrical"
    assert rows[1]["town"] == "Leigh"
    assert normalize_phone(rows[2]["phone"]) == "700900123"
    assert rows[3]["business_name"] == "Bullet Drains"


def test_dedupe_entries():
    existing = {normalize_phone("07504683058")}
    entries = [
        {"business_name": "Joe", "phone": "07504 683058"},   # dup of existing
        {"business_name": "New One", "phone": "07700900123"},
        {"business_name": "New One Again", "phone": "07700 900 123"},  # dup within batch
        {"business_name": "No Phone Co", "phone": ""},        # kept by name
    ]
    kept, dropped = dedupe_entries(entries, existing)
    names = [k["business_name"] for k in kept]
    assert "Joe" not in names
    assert "New One" in names
    assert "New One Again" not in names
    assert "No Phone Co" in names
    assert dropped == 2


def test_trial_maths():
    start = date(2026, 6, 1)
    assert trial_day(start, date(2026, 6, 8)) == 7
    assert trial_day(start, date(2026, 6, 13)) == 12
    assert is_trial_touchpoint(start, date(2026, 6, 8)) == 7
    assert is_trial_touchpoint(start, date(2026, 6, 13)) == 12
    assert is_trial_touchpoint(start, date(2026, 6, 9)) is None

    end = date(2026, 6, 15)
    assert trial_days_remaining(end, date(2026, 6, 13)) == 2
    assert trial_days_remaining(end, date(2026, 6, 15)) == 0


def test_churn_risk():
    assert churn_risk(2, 1) is True       # ending soon, few leads → red
    assert churn_risk(2, 5) is False      # ending soon but plenty of leads
    assert churn_risk(9, 0) is False      # lots of time left
    assert churn_risk(None, 0) is False   # no trial end → not flagged


# ── Allow running as a plain script (no pytest needed locally) ────────
if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
        passed += 1
    print(f"\n{passed}/{len(fns)} trades-logic tests passed")
