"""
Lead Finder Agent
Scrapes Yell.com for barber shops with no website.
Uses requests + BeautifulSoup — no paid API needed.
"""
import re
import time
import logging
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from db.client import get_db
from utils.helpers import log_agent_action, clean_phone, clean_postcode

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9",
}

SOCIAL_DOMAINS = (
    "facebook.com", "instagram.com", "twitter.com",
    "tiktok.com", "linkedin.com", "linktree.com", "linktr.ee",
)

UK_CITIES = [
    "Wigan", "Manchester", "Liverpool", "Leeds", "Sheffield",
    "Birmingham", "Bristol", "Leicester", "Nottingham", "Newcastle",
    "Bradford", "Coventry", "Stoke-on-Trent", "Derby", "Wolverhampton",
    "Preston", "Bolton", "Blackburn", "Burnley", "Oldham",
    "Stockport", "Rochdale", "Salford", "Warrington", "St Helens",
    "Bury", "Wakefield", "Huddersfield", "Halifax", "York",
]


def _is_real_website(url: str) -> bool:
    """Returns True only if the URL is a proper business website."""
    if not url:
        return False
    url_lower = url.lower()
    return not any(domain in url_lower for domain in SOCIAL_DOMAINS)


def _scrape_yell_page(city: str, page: int = 1) -> list[dict]:
    """Scrape one page of Yell results for barbers in a city."""
    query = "barbers"
    url = f"https://www.yell.com/ucs/UcsSearchAction.do?keywords={query}&location={city}&pageNum={page}"

    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            logger.warning(f"Yell returned {r.status_code} for {city} page {page}")
            return []
        return _parse_yell_results(r.text, city)
    except Exception as e:
        logger.error(f"Yell scrape failed for {city} p{page}: {e}")
        return []


def _parse_yell_results(html: str, city: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    leads = []

    for card in soup.select(".businessCapsule--mainContent"):
        try:
            name_el = card.select_one(".businessCapsule--name")
            if not name_el:
                continue
            name = name_el.get_text(strip=True)

            phone_el = card.select_one("[class*='phone'], .businessCapsule--phone")
            phone = clean_phone(phone_el.get_text(strip=True)) if phone_el else None

            addr_el = card.select_one(".businessCapsule--address, address")
            address = addr_el.get_text(" ", strip=True) if addr_el else None

            website_el = card.select_one("a[href*='http']:not([href*='yell.com'])")
            raw_website = website_el["href"] if website_el else None

            # Only include leads with NO real website
            if _is_real_website(raw_website):
                continue

            # Extract rating
            rating_el = card.select_one("[class*='rating'], .rating")
            rating = None
            if rating_el:
                m = re.search(r"(\d+\.?\d*)", rating_el.get_text())
                rating = float(m.group(1)) if m else None

            review_el = card.select_one("[class*='reviewCount'], [class*='review-count']")
            reviews = 0
            if review_el:
                m = re.search(r"\d+", review_el.get_text())
                reviews = int(m.group()) if m else 0

            yell_link = card.select_one("a.businessCapsule--name")
            yell_url = ("https://www.yell.com" + yell_link["href"]) if yell_link and yell_link.get("href") else None

            # Try to get email/social from the Yell listing page
            social_url = raw_website if raw_website else yell_url

            leads.append({
                "business_name": name,
                "phone": phone,
                "address": address,
                "city": city,
                "website": social_url,
                "website_status": "none",
                "google_rating": rating,
                "google_reviews": reviews,
                "source": "yell",
            })

        except Exception as e:
            logger.debug(f"Failed to parse card: {e}")
            continue

    return leads


def _get_lead_email(yell_url: str) -> str | None:
    """Try to extract an email from the Yell listing page."""
    if not yell_url:
        return None
    try:
        r = requests.get(yell_url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return None
        emails = re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", r.text)
        skip = {"noreply", "no-reply", "example", "wordpress", "sentry",
                "privacy", "abuse", "postmaster", "webmaster", "yell.com"}
        for email in emails:
            if not any(s in email.lower() for s in skip):
                return email.lower()
    except Exception:
        pass
    return None


def run(cities: list[str] | None = None, pages_per_city: int = 3) -> dict:
    """
    Main entry point for the Lead Finder agent.
    Scrapes Yell for barbers with no website across UK cities.
    Returns a summary dict.
    """
    start = datetime.now()
    db = get_db()
    cities_to_search = cities or UK_CITIES
    new_leads = 0
    skipped_dupes = 0
    errors = 0

    for city in cities_to_search:
        logger.info(f"Searching {city}...")
        city_leads = []

        for page in range(1, pages_per_city + 1):
            page_leads = _scrape_yell_page(city, page)
            city_leads.extend(page_leads)
            if not page_leads:
                break  # No more results for this city
            time.sleep(1.5)  # Polite delay

        for lead in city_leads:
            try:
                # Check for duplicates by name + city
                existing = (
                    db.table("leads")
                    .select("id")
                    .eq("business_name", lead["business_name"])
                    .eq("city", city)
                    .execute()
                )
                if existing.data:
                    skipped_dupes += 1
                    continue

                # Try to get email from Yell listing
                email = _get_lead_email(lead.get("website"))
                if email:
                    lead["email"] = email

                db.table("leads").insert(lead).execute()
                new_leads += 1

            except Exception as e:
                logger.error(f"DB insert failed for {lead.get('business_name')}: {e}")
                errors += 1

        time.sleep(2)  # Polite pause between cities

    duration_ms = int((datetime.now() - start).total_seconds() * 1000)

    log_agent_action(db, "lead_finder", "scrape_yell", None, "success", {
        "cities": len(cities_to_search),
        "new_leads": new_leads,
        "skipped_dupes": skipped_dupes,
        "errors": errors,
    }, duration_ms)

    return {
        "cities_searched": len(cities_to_search),
        "new_leads_added": new_leads,
        "duplicates_skipped": skipped_dupes,
        "errors": errors,
        "duration_seconds": duration_ms / 1000,
    }
