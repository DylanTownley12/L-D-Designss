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

EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
INSTAGRAM_RE = re.compile(r'instagram\.com/([A-Za-z0-9_.]+)')
FACEBOOK_RE = re.compile(r'facebook\.com/([A-Za-z0-9_.]+)')
# Exclude common false positives
EMAIL_BLACKLIST = {"example.com", "sentry.io", "wixpress.com", "squarespace.com",
                   "wordpress.com", "schema.org", "googleapis.com", "w3.org"}
INSTAGRAM_BLACKLIST = {"p", "explore", "reel", "stories", "sharer", "share"}


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
        "email": None,
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

        # Extract email address from page
        emails = EMAIL_RE.findall(r.text)
        for e in emails:
            domain = e.split("@")[-1].lower()
            if domain not in EMAIL_BLACKLIST and not any(bad in domain for bad in EMAIL_BLACKLIST):
                result["email"] = e.lower()
                break

        # Extract social links
        ig_matches = INSTAGRAM_RE.findall(r.text)
        for handle in ig_matches:
            if handle.lower() not in INSTAGRAM_BLACKLIST and len(handle) > 2:
                result["instagram_url"] = f"https://www.instagram.com/{handle}/"
                break
        fb_matches = FACEBOOK_RE.findall(r.text)
        for handle in fb_matches:
            if handle.lower() not in {"sharer", "share", "plugins", "tr"} and len(handle) > 2:
                result["facebook_url"] = f"https://www.facebook.com/{handle}/"
                break

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
    try:
        get_db().table("agent_logs").insert({"agent_name": "website_analyzer", "action": "heartbeat", "status": "running"}).execute()
    except Exception:
        pass
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
            .in_("status", ["new", "analyzing"])
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

            # none/weak = still a good lead (no site or bad site)
            # decent/good = they already have a real site, skip them
            new_status = "preview_ready" if website_status in ("none", "weak") else "not_interested"
            update_data = {
                "status": new_status,
                "website_status": website_status,
                "quality_score": lead_quality,
                "analysis_data": analysis,
            }
            if analysis.get("email") and not lead.get("email"):
                update_data["email"] = analysis["email"]
            if analysis.get("instagram_url") and not lead.get("instagram_url"):
                update_data["instagram_url"] = analysis["instagram_url"]
            if analysis.get("facebook_url") and not lead.get("facebook_url"):
                update_data["facebook_url"] = analysis["facebook_url"]
            db.table("leads").update(update_data).eq("id", lead["id"]).execute()

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


def extract_emails_batch(limit: int = 200) -> dict:
    """
    Go back over preview_ready leads that have a website but no email.
    Re-visits the site and extracts email if present.
    """
    db = get_db()
    result = (
        db.table("leads")
        .select("id,website,email")
        .eq("status", "preview_ready")
        .is_("email", "null")
        .limit(limit)
        .execute()
    )
    leads = [l for l in (result.data or []) if l.get("website")]
    found = 0
    for lead in leads:
        try:
            analysis = _analyze_url(lead["website"])
            if analysis.get("email"):
                db.table("leads").update({"email": analysis["email"]}).eq("id", lead["id"]).execute()
                found += 1
            time.sleep(0.3)
        except Exception as e:
            logger.error(f"Email extraction failed for lead {lead['id']}: {e}")
    logger.info(f"Email extraction: {found} emails found from {len(leads)} leads with websites")
    return {"found": found, "checked": len(leads)}
