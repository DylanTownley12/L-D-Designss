"""
Lead Finder (trades) — the agent that actually PULLS new prospects in.

Google Places API (New) Text Search → tradespeople in our patch who have NO website
(the no-website filter is the whole point: a tradesman with a site isn't a prospect).
Writes them as REAL-mode prospects, deduped by place_id (and phone, via Scout), then
fires the Lead Qualifier so they get scored + an angle and land in D's / L's queues.

Caps per run so we don't burn the Places budget. Contacts no one — it only builds
the list, exactly like Scout. Honours the queue-ready gate (name/trade/town/valid UK
phone/known website status) via Scout + the Qualifier.
"""
import logging
import time

import httpx

from config import settings
from db.client import get_db
from utils.helpers import clean_phone
from agents import trades

logger = logging.getLogger(__name__)

PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ("places.id,places.displayName,places.formattedAddress,"
              "places.nationalPhoneNumber,places.websiteUri")

# A social-only presence still counts as "no website" → still a prospect.
SOCIAL_DOMAINS = ("facebook.com", "instagram.com", "twitter.com", "x.com",
                  "tiktok.com", "linkedin.com", "linktree.com", "linktr.ee", "yell.com")

TRADES = ["plumber", "roofer", "heating engineer", "electrician"]
TOWNS = ["Wigan", "Bolton", "Leigh", "St Helens", "Warrington"]


def _has_real_website(url: str) -> bool:
    if not url:
        return False
    return not any(d in url.lower() for d in SOCIAL_DOMAINS)


def _search(trade: str, town: str) -> list:
    """One Places Text Search page for a trade in a town. Returns raw places[]."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    body = {"textQuery": f"{trade}s in {town}, UK", "languageCode": "en-GB",
            "regionCode": "GB", "pageSize": 20}
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(PLACES_URL, headers=headers, json=body)
        if r.status_code != 200:
            logger.warning(f"[lead_finder] Places {r.status_code} for {trade}/{town}: {r.text[:160]}")
            return []
        return r.json().get("places", [])
    except Exception as e:
        logger.error(f"[lead_finder] Places request failed {trade}/{town}: {e}")
        return []


def _existing_place_ids() -> set:
    """place_ids already in prospects (empty set if the column isn't there yet)."""
    try:
        rows = (get_db().table("prospects").select("place_id").limit(5000).execute().data or [])
        return {r["place_id"] for r in rows if r.get("place_id")}
    except Exception:
        return set()


def find_leads(cap: int = 20) -> dict:
    """Pull up to `cap` no-website tradespeople across our trades × towns, write them
    as REAL prospects (deduped), then run the Qualifier. Returns counts + the rows."""
    if not settings.GOOGLE_PLACES_API_KEY:
        trades.log_event("lead_finder", "GOOGLE_PLACES_API_KEY not set — can't pull leads", "error",
                         {"metric_ok": False, "metric": "no API key"})
        return {"ok": False, "written": 0, "rows": [],
                "message": "GOOGLE_PLACES_API_KEY isn't set on the server — can't pull leads."}

    known_ids = _existing_place_ids()
    seen_ids = set(known_ids)
    seen_phones = set()
    entries = []
    scanned = no_website = dupes = 0

    for town in TOWNS:
        if len(entries) >= cap:
            break
        for trade in TRADES:
            if len(entries) >= cap:
                break
            for place in _search(trade, town):
                if len(entries) >= cap:
                    break
                scanned += 1
                pid = place.get("id")
                name = (place.get("displayName", {}) or {}).get("text", "").strip()
                if not name:
                    continue
                if _has_real_website(place.get("websiteUri", "")):
                    continue                                   # has a site → not a prospect
                no_website += 1
                phone = clean_phone(place.get("nationalPhoneNumber", "") or "")
                pnorm = trades.normalize_phone(phone)
                if (pid and pid in seen_ids) or (pnorm and pnorm in seen_phones):
                    dupes += 1
                    continue
                if pid:
                    seen_ids.add(pid)
                if pnorm:
                    seen_phones.add(pnorm)
                entries.append({
                    "business_name": name, "phone": phone, "town": town, "trade": trade,
                    "website_status": "none", "place_id": pid,
                })
            time.sleep(0.4)                                    # be polite to the API

    if not entries:
        trades.log_event("lead_finder",
                         f"scanned {scanned} ({no_website} no-website, {dupes} dupes) — 0 new",
                         "warn", {"metric_ok": False, "metric": "0 new", "scanned": scanned})
        return {"ok": True, "written": 0, "rows": [], "scanned": scanned,
                "no_website": no_website, "duplicates": dupes,
                "message": (f"Scanned {scanned} listings — {no_website} had no website but all "
                            f"{dupes} were already in your list. No new prospects this run.")}

    # Write via Scout (dedupes on phone, ranks, assigns D/L, stamps data_mode='real').
    res = trades.scout(entries=entries, source="google_places", data_mode="real")
    # Score + angle + queue them (the Qualifier).
    trades.requalify_all(mode="real")

    # Read the rows back so the founder sees real tradesmen.
    rows = []
    try:
        written = (get_db().table("prospects").select(
            "business_name,trade,town,phone,opportunity_score,queue_ready,assigned_to")
            .eq("source", "google_places").eq("data_mode", "real")
            .order("created_at", desc=True).limit(cap).execute().data or [])
        rows = written
    except Exception:
        rows = []

    n = res.get("added", 0)
    trades.log_event("lead_finder",
                     f"🔎 pulled {n} no-website prospect(s) from Google Places "
                     f"(scanned {scanned}, {dupes} dupes)", "success",
                     {"metric_ok": n > 0, "metric": f"+{n} real", "scanned": scanned})

    lines = [f"{r.get('business_name')} — {r.get('trade')}, {r.get('town')} · {r.get('phone') or 'no number'}"
             f" [{r.get('assigned_to')}, score {r.get('opportunity_score')}]" for r in rows[:n or len(rows)]]
    return {
        "ok": True, "agent": "lead_finder",
        "written": n, "scanned": scanned, "no_website": no_website, "duplicates": dupes,
        "assigned": res.get("assigned"), "queue_ready": res.get("queue_ready"),
        "rows": rows,
        "message": (f"Lead Finder wrote {n} real no-website prospect(s) to Supabase "
                    f"(scanned {scanned}, skipped {dupes} dupes). Now in REAL queues:\n"
                    + "\n".join(lines) if lines else
                    f"Lead Finder wrote {n} prospect(s)."),
    }
