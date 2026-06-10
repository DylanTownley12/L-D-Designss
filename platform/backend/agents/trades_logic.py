"""
Pure logic for the trades sales pipeline — ranking, dedupe, list parsing,
trial maths. STDLIB ONLY (datetime, re): no db, no config, no FastAPI, no
Anthropic. This is deliberate so it can be unit-tested with a bare `python3`
(the rest of the backend's deps are not always installed locally) and reused
identically by Lead Scout, the Dial Manager, the Revenue Reporter and JARVIS.
"""
import re
from datetime import date, datetime
from typing import List, Dict, Optional, Tuple

# Trades whose customers call in a panic — the people who most need an instant
# text-back, and who lose the most money from a missed call.
EMERGENCY_TRADES = {
    "plumber", "plumbing", "heating", "gas", "gas engineer", "boiler",
    "electrician", "electrical", "drainage", "drains", "locksmith",
    "roofer", "roofing", "glazier", "glazing", "pest control",
}

# Proximity to Wigan (WN). Higher = closer = easier to meet / more relevant.
# Tiered by rough drive time; unknown towns get a small base score.
_PROXIMITY: Dict[str, int] = {}
def _seed(score: int, towns: str):
    for t in towns.split(","):
        _PROXIMITY[t.strip().lower()] = score
_seed(40, "wigan,leigh,hindley,ashton-in-makerfield,ashton in makerfield,standish,"
          "orrell,aspull,ince,pemberton,platt bridge,abram,bryn,shevington,"
          "appley bridge,wigan borough")
_seed(30, "bolton,st helens,st. helens,skelmersdale,atherton,tyldesley,golborne,"
          "up holland,upholland,westhoughton,horwich,chorley,warrington,"
          "newton-le-willows,newton le willows,billinge,rainford")
_seed(20, "manchester,salford,bury,preston,liverpool,widnes,runcorn,southport,"
          "ormskirk,farnworth,radcliffe,wirral,bootle,leyland,wigan greater manchester")


def normalize_phone(phone: Optional[str]) -> str:
    """Reduce a UK number to its last 9 significant digits for matching.

    07504 683058 / +447504683058 / 0044 7504 683058 all → '504683058'.
    Returns '' when there aren't enough digits to be a real number.
    """
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone))
    # Strip UK country code variants.
    if digits.startswith("0044"):
        digits = digits[4:]
    elif digits.startswith("44") and len(digits) > 10:
        digits = digits[2:]
    digits = digits.lstrip("0")
    return digits[-9:] if len(digits) >= 9 else ""


def has_mobile_number(phone: Optional[str]) -> bool:
    """UK mobiles are 07… / +447…  Landlines (01/02) cannot receive an SMS
    text-back, so a mobile is the single biggest 'can we even sell this' signal."""
    if not phone:
        return False
    digits = re.sub(r"\D", "", str(phone))
    if digits.startswith("0044"):
        digits = digits[2:]
    if digits.startswith("44"):
        digits = "0" + digits[2:]
    return digits.startswith("07") and len(digits) >= 11


def is_emergency_trade(trade: Optional[str]) -> bool:
    if not trade:
        return False
    t = trade.strip().lower()
    if t in EMERGENCY_TRADES:
        return True
    return any(word in t for word in EMERGENCY_TRADES)


def proximity_score(town: Optional[str]) -> int:
    if not town:
        return 10
    return _PROXIMITY.get(town.strip().lower(), 10)


def rank_prospect(has_mobile: bool, emergency: bool, proximity: int) -> int:
    """Compose the priority score. Order of weight matches the brief:
    mobile number (can we sell it at all) > emergency trade (do they feel the
    pain) > proximity to Wigan. Range ~10–120."""
    score = 0
    if has_mobile:
        score += 50
    if emergency:
        score += 30
    score += max(0, min(int(proximity or 0), 40))
    return score


def score_prospect(phone: Optional[str], trade: Optional[str], town: Optional[str]) -> Dict:
    """Convenience: derive every ranking signal from the raw fields."""
    hm = has_mobile_number(phone)
    em = is_emergency_trade(trade)
    px = proximity_score(town)
    return {
        "has_mobile": hm,
        "is_emergency_trade": em,
        "proximity_score": px,
        "rank_score": rank_prospect(hm, em, px),
    }


# ── Pasted-list parsing ───────────────────────────────────────────────
_PHONE_RE = re.compile(r"(\+?\d[\d\s().-]{7,}\d)")


def _looks_like_phone(field: str) -> bool:
    return len(re.sub(r"\D", "", field)) >= 9


def parse_pasted_list(text: str) -> List[Dict]:
    """
    Parse a pasted list of leads. One per line. Tolerant of separators
    (comma, tab, pipe, multiple spaces) and field order — the phone is found
    by digit count, the rest fall into name then town.

        Joe's Plumbing, 07504 683058, Wigan
        Spark Electrical | 01942 123456 | Leigh
        AB Heating  07700900123  Bolton
    """
    rows: List[Dict] = []
    for raw in (text or "").splitlines():
        line = raw.strip().strip("-•*").strip()
        if not line:
            continue
        # Choose a separator: prefer pipe, then tab, then comma, else split on 2+ spaces.
        if "|" in line:
            parts = [p.strip() for p in line.split("|")]
        elif "\t" in line:
            parts = [p.strip() for p in line.split("\t")]
        elif "," in line:
            parts = [p.strip() for p in line.split(",")]
        else:
            # Pull the phone out, the remainder splits into name / town.
            m = _PHONE_RE.search(line)
            if m:
                phone = m.group(1).strip()
                rest = (line[: m.start()] + " " + line[m.end():]).strip()
                chunks = re.split(r"\s{2,}", rest)
                name = chunks[0].strip() if chunks else ""
                town = chunks[1].strip() if len(chunks) > 1 else ""
                rows.append({"business_name": name, "phone": phone, "town": town})
                continue
            parts = [line]
        parts = [p for p in parts if p != ""]
        if not parts:
            continue
        phone, name, town = "", "", ""
        leftovers = []
        for p in parts:
            if not phone and _looks_like_phone(p):
                phone = p
            else:
                leftovers.append(p)
        name = leftovers[0] if leftovers else ""
        town = leftovers[1] if len(leftovers) > 1 else ""
        if name or phone:
            rows.append({"business_name": name, "phone": phone, "town": town})
    return rows


def dedupe_entries(entries: List[Dict], existing_norms: set) -> Tuple[List[Dict], int]:
    """Drop entries whose normalised phone already exists (in the DB or earlier
    in the same batch). Entries without a usable phone are de-duped by lowercased
    business name instead. Returns (kept, dropped_count)."""
    kept: List[Dict] = []
    seen = set(existing_norms or set())
    dropped = 0
    for e in entries:
        norm = normalize_phone(e.get("phone"))
        key = norm or ("name:" + (e.get("business_name") or "").strip().lower())
        if not key or key == "name:":
            dropped += 1
            continue
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        kept.append(e)
    return kept, dropped


# ── Trial maths ───────────────────────────────────────────────────────
def _as_date(value) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    s = str(value)[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def trial_day(trial_start, today: Optional[date] = None) -> Optional[int]:
    """Days elapsed since the trial began (start day = 0)."""
    start = _as_date(trial_start)
    if not start:
        return None
    today = today or date.today()
    return (today - start).days


def trial_days_remaining(trial_end, today: Optional[date] = None) -> Optional[int]:
    end = _as_date(trial_end)
    if not end:
        return None
    today = today or date.today()
    return (end - today).days


def churn_risk(days_remaining: Optional[int], leads_captured: int) -> bool:
    """Red flag: trial ends in under 3 days having captured fewer than 3 leads."""
    if days_remaining is None:
        return False
    return days_remaining < 3 and (leads_captured or 0) < 3


def is_trial_touchpoint(trial_start, today: Optional[date] = None) -> Optional[int]:
    """Return 7 or 12 if today is a trial check-in day, else None."""
    d = trial_day(trial_start, today)
    return d if d in (7, 12) else None
