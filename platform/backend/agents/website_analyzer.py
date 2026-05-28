"""
Website Analyzer Agent
Checks each lead's website (if any) for quality issues.
Assigns a quality_score (0-100) and updates website_status.
No paid API needed — pure HTTP + heuristics.
"""
import re
import time
import logging
import requests
from datetime import datetime
from db.client import get_db
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
    )
}

SOCIAL_DOMAINS = (
    "facebook.com", "instagram.com", "twitter.com",
    "tiktok.com", "linkedin.com", "linktree.com", "linktr.ee",
)

BOOKING_KEYWORDS = [
    "book", "booking", "appointment", "reserve", "calendar",
    "schedule", "fresha", "treatwell", "booksy", "vagaro",
]

MOBILE_KEYWORDS = ["viewport", "responsive", "mobile"]
CONTACT_KEYWORDS = ["contact", "phone", "email", "whatsapp", "call us"]


def _is_social_only(url: str) -> bool:
    if not url:
        return False
    return any(d in url.lower() for d in SOCIAL_DOMAINS)


def _analyze_url(url: str) -> dict:
    """Fetch and analyze a website URL. Returns analysis dict."""
    result = {
        "reachable": False,
        "load_time_ms": None,
        "has_mobile_meta": False,
        "has_booking": False,
        "has_contact": False,
        "has_ssl": False,
        "page_size_kb": None,
        "issues": [],
        "score": 0,
    }

    if not url or _is_social_only(url):
        result["issues"].append("social_only_or_no_website")
        return result

    if not url.startswith("http"):
        url = "http://" + url

    result["has_ssl"] = url.startswith("https")

    try:
        start = datetime.now()
        r = requests.get(url, headers=HEADERS, timeout=12, allow_redirects=True)
        load_ms = int((datetime.now() - start).total_seconds() * 1000)
        result["load_time_ms"] = load_ms
        result["reachable"] = r.status_code == 200

        if r.status_code != 200:
            result["issues"].append(f"http_{r.status_code}")
            return result

        html = r.text.lower()
        size_kb = len(r.content) / 1024
        result["page_size_kb"] = round(size_kb, 1)

        result["has_mobile_meta"] = any(k in html for k in MOBILE_KEYWORDS)
        result["has_booking"] = any(k in html for k in BOOKING_KEYWORDS)
        result["has_contact"] = any(k in html for k in CONTACT_KEYWORDS)

        # Issues
        if load_ms > 5000:
            result["issues"].append("slow_load")
        if not result["has_ssl"]:
            result["issues"].append("no_ssl")
        if not result["has_mobile_meta"]:
            result["issues"].append("not_mobile_friendly")
        if not result["has_booking"]:
            result["issues"].append("no_booking_system")
        if not result["has_contact"]:
            result["issues"].append("no_contact_info")
        if size_kb > 3000:
            result["issues"].append("heavy_page")

        # Quality score (max 100)
        score = 30  # Base for being reachable
        if result["has_ssl"]:
            score += 15
        if result["has_mobile_meta"]:
            score += 20
        if result["has_booking"]:
            score += 20
        if result["has_contact"]:
            score += 10
        if load_ms < 3000:
            score += 5

        result["score"] = min(score, 100)

    except requests.exceptions.ConnectionError:
        result["issues"].append("unreachable")
    except requests.exceptions.Timeout:
        result["issues"].append("timeout")
    except Exception as e:
        result["issues"].append(f"error: {str(e)[:50]}")

    return result


def _score_to_status(score: int, has_website: bool) -> str:
    if not has_website:
        return "none"
    if score < 30:
        return "weak"
    if score < 60:
        return "decent"
    return "good"


def run(lead_id: str | None = None, batch_size: int = 100) -> dict:
    """
    Analyze website quality for leads.
    If lead_id is given, analyze just that lead.
    Otherwise, process a batch of unanalyzed leads.
    """
    start = datetime.now()
    db = get_db()
    analyzed = 0
    errors = 0

    if lead_id:
        result = db.table("leads").select("*").eq("id", lead_id).single().execute()
        leads = [result.data] if result.data else []
    else:
        result = (
            db.table("leads")
            .select("*")
            .eq("status", "new")
            .is_("analysis_data", "null")
            .limit(batch_size)
            .execute()
        )
        leads = result.data or []

    for lead in leads:
        try:
            db.table("leads").update({"status": "analyzing"}).eq("id", lead["id"]).execute()

            website = lead.get("website") or ""
            has_real_website = website and not _is_social_only(website)

            if has_real_website:
                analysis = _analyze_url(website)
            else:
                analysis = {
                    "reachable": False, "has_mobile_meta": False,
                    "has_booking": False, "has_contact": False,
                    "has_ssl": False, "score": 0,
                    "issues": ["no_website"],
                    "load_time_ms": None, "page_size_kb": None,
                }

            website_status = _score_to_status(analysis["score"], has_real_website)

            # Quality score for lead prioritisation (separate from site score)
            # High quality lead = no website, has phone/email, has reviews
            lead_quality = 0
            if website_status == "none":
                lead_quality += 40  # No website = best lead for us
            elif website_status == "weak":
                lead_quality += 25
            if lead.get("phone"):
                lead_quality += 20
            if lead.get("email"):
                lead_quality += 15
            if lead.get("google_rating") and lead["google_rating"] >= 4.0:
                lead_quality += 15
            if lead.get("google_reviews") and lead["google_reviews"] >= 10:
                lead_quality += 10
            lead_quality = min(lead_quality, 100)

            db.table("leads").update({
                "status": "preview_ready" if website_status == "none" else "analyzing",
                "website_status": website_status,
                "quality_score": lead_quality,
                "analysis_data": analysis,
            }).eq("id", lead["id"]).execute()

            analyzed += 1
            time.sleep(0.5)

        except Exception as e:
            logger.error(f"Analysis failed for lead {lead.get('id')}: {e}")
            errors += 1

    duration_ms = int((datetime.now() - start).total_seconds() * 1000)

    log_agent_action(db, "website_analyzer", "analyze_batch", None, "success", {
        "analyzed": analyzed,
        "errors": errors,
    }, duration_ms)

    return {"analyzed": analyzed, "errors": errors}
