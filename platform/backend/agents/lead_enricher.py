"""
Lead Enricher Agent
Finds emails and Instagram URLs for leads that have neither.
Uses Google Places Details for website/Instagram, then scrapes any
website found for email addresses.
"""
import re
import time
import logging
import requests
from db.client import get_db
from config import settings
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
    )
}

EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
EMAIL_BLOCKLIST = {"example.com", "domain.com", "email.com", "yourdomain.com", "sentry.io", "wixpress.com"}
INSTAGRAM_RE = re.compile(r'(?:https?://)?(?:www\.)?instagram\.com/([A-Za-z0-9_.]+)/?')


def _clean_email(email: str) -> str | None:
    domain = email.split("@")[-1].lower()
    if domain in EMAIL_BLOCKLIST or "." not in domain:
        return None
    if any(x in email.lower() for x in ["example", "test@", "noreply", "no-reply"]):
        return None
    return email.lower()


def _places_details(place_id: str) -> dict:
    """Fetch website + other details for a Google Places place_id."""
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    resp = requests.get(
        url,
        headers={
            "X-Goog-Api-Key": settings.GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "websiteUri,nationalPhoneNumber",
        },
        timeout=8,
    )
    if resp.status_code == 200:
        return resp.json()
    return {}


def _find_place_id(business_name: str, city: str, phone: str) -> str | None:
    """Search Google Places to get a place_id for this business."""
    url = "https://places.googleapis.com/v1/places:searchText"
    query = f"{business_name} barber {city} UK"
    try:
        resp = requests.post(
            url,
            headers={
                "X-Goog-Api-Key": settings.GOOGLE_PLACES_API_KEY,
                "X-Goog-FieldMask": "places.id,places.displayName,places.nationalPhoneNumber",
                "Content-Type": "application/json",
            },
            json={"textQuery": query, "maxResultCount": 3},
            timeout=8,
        )
        if resp.status_code != 200:
            return None
        places = resp.json().get("places", [])
        if not places:
            return None
        # Try to match by phone number first
        if phone:
            clean_phone = re.sub(r'\D', '', phone)[-9:]
            for p in places:
                p_phone = re.sub(r'\D', '', p.get("nationalPhoneNumber", ""))[-9:]
                if clean_phone and p_phone and clean_phone == p_phone:
                    return p["id"]
        # Fall back to first result
        return places[0]["id"]
    except Exception as e:
        logger.debug(f"Place ID lookup failed for {business_name}: {e}")
        return None


def _scrape_email_from_url(url: str) -> str | None:
    """Try to scrape an email from a website's homepage or contact page."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=6, allow_redirects=True)
        if resp.status_code != 200:
            return None
        text = resp.text
        emails = EMAIL_RE.findall(text)
        for email in emails:
            cleaned = _clean_email(email)
            if cleaned:
                return cleaned
    except Exception:
        pass
    return None


_IG_SKIP = {"p", "reel", "explore", "stories", "accounts", "hashtag", "tv", "direct", "share"}

def _google_search_instagram(business_name: str, city: str) -> str | None:
    """Search Google for the barber's Instagram when they have no website."""
    try:
        query = f'"{business_name}" barber "{city}" site:instagram.com'
        url = f"https://www.google.com/search?q={requests.utils.quote(query)}&num=5&hl=en"
        resp = requests.get(url, headers=HEADERS, timeout=8)
        if resp.status_code != 200:
            return None
        for handle in INSTAGRAM_RE.findall(resp.text):
            if handle.lower() not in _IG_SKIP and len(handle) > 2:
                return f"https://www.instagram.com/{handle}/"
    except Exception:
        pass
    return None


def _enrich_lead(lead: dict) -> dict:
    """Return a dict of fields to update for this lead. Empty dict = nothing found."""
    updates = {}
    name = lead.get("business_name", "")
    city = lead.get("city", "")
    phone = lead.get("phone", "")

    if not settings.GOOGLE_PLACES_API_KEY:
        return updates

    # Step 1: find place_id via Google Places
    place_id = _find_place_id(name, city, phone)
    if not place_id:
        return updates

    time.sleep(0.3)

    # Step 2: get website from Place Details
    details = _places_details(place_id)
    website = details.get("websiteUri", "")

    if website:
        # Check if website is Instagram
        ig_match = INSTAGRAM_RE.search(website)
        if ig_match:
            handle = ig_match.group(1)
            if handle.lower() not in _IG_SKIP:
                updates["instagram_url"] = f"https://www.instagram.com/{handle}/"
        else:
            # Scrape website for email
            if not lead.get("email"):
                email = _scrape_email_from_url(website)
                if email:
                    updates["email"] = email
            # Also check for Instagram link on their website
            if not lead.get("instagram_url"):
                try:
                    resp = requests.get(website, headers=HEADERS, timeout=6)
                    ig_match = INSTAGRAM_RE.search(resp.text)
                    if ig_match:
                        handle = ig_match.group(1)
                        if handle.lower() not in _IG_SKIP:
                            updates["instagram_url"] = f"https://www.instagram.com/{handle}/"
                except Exception:
                    pass

    # No website found — search Google directly for their Instagram
    if not updates.get("instagram_url") and not lead.get("instagram_url"):
        ig = _google_search_instagram(name, city)
        if ig:
            updates["instagram_url"] = ig

    return updates


def run(limit: int = 100) -> dict:
    """
    Enrich preview_ready leads that have no email and no instagram_url.
    Uses Google Places Details + website scraping.
    """
    db = get_db()

    result = (
        db.table("leads")
        .select("id,business_name,city,phone,email,instagram_url")
        .eq("status", "preview_ready")
        .is_("email", "null")
        .is_("instagram_url", "null")
        .limit(limit)
        .execute()
    )
    leads = result.data or []

    enriched_email = 0
    enriched_instagram = 0
    checked = 0

    for lead in leads:
        try:
            updates = _enrich_lead(lead)
            if updates:
                db.table("leads").update(updates).eq("id", lead["id"]).execute()
                if "email" in updates:
                    enriched_email += 1
                if "instagram_url" in updates:
                    enriched_instagram += 1
            checked += 1
            time.sleep(0.5)
        except Exception as e:
            logger.error(f"Enrichment failed for lead {lead['id']}: {e}")

    log_agent_action(db, "lead_enricher", "enrich_batch", None, "success", {
        "checked": checked,
        "emails_found": enriched_email,
        "instagram_found": enriched_instagram,
    })

    logger.info(f"Enrichment: {checked} checked, {enriched_email} emails, {enriched_instagram} Instagram URLs")
    return {"checked": checked, "emails_found": enriched_email, "instagram_found": enriched_instagram}
