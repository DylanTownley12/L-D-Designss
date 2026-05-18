#!/usr/bin/env python3
"""
Barber & Hairdresser Lead Finder - Wigan Area
Finds businesses with no website or outdated websites within 50 miles of Wigan.
Saves business name, phone, email, and WhatsApp to an Excel spreadsheet.

Requirements:
    pip install -r requirements.txt

Usage:
    export GOOGLE_PLACES_API_KEY="your_key_here"
    python find_leads.py
"""

import os
import re
import sys
import math
import time
import requests
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from bs4 import BeautifulSoup
from datetime import datetime
from urllib.parse import urljoin

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "YOUR_GOOGLE_PLACES_API_KEY")

WIGAN_LAT = 53.5450
WIGAN_LNG = -2.6325

RADIUS_MILES = 50
RADIUS_METERS = int(RADIUS_MILES * 1609.34)          # ~80,467 m
MAX_NEARBY_RADIUS = 50_000                            # Google Places hard cap

# A website is "outdated" if its copyright / last-modified year is this many
# years (or more) behind the current year.
OUTDATED_YEARS = 3

SEARCH_KEYWORDS = ["barber", "hairdresser", "hair salon", "barbershop"]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

# ---------------------------------------------------------------------------
# Geo helpers
# ---------------------------------------------------------------------------

def haversine_m(lat1, lng1, lat2, lng2):
    """Return distance in metres between two WGS-84 points."""
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def build_search_grid(center_lat, center_lng, total_r, search_r):
    """
    Return a list of (lat, lng) points whose combined MAX_NEARBY_RADIUS circles
    cover the total_r area around the centre point.
    """
    points = [(center_lat, center_lng)]
    step = search_r * 1.6   # slight overlap so no gap between circles

    for ring in range(1, 5):
        ring_dist = ring * step
        if ring_dist - search_r > total_r:
            break
        n = max(6, ring * 6)
        for i in range(n):
            angle = 2 * math.pi * i / n
            lat = center_lat + (ring_dist / 111_320) * math.cos(angle)
            lng = center_lng + (ring_dist / (111_320 * math.cos(math.radians(center_lat)))) * math.sin(angle)
            if haversine_m(center_lat, center_lng, lat, lng) <= total_r + search_r:
                points.append((lat, lng))

    return points

# ---------------------------------------------------------------------------
# Google Places API
# ---------------------------------------------------------------------------

PLACES_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


def _nearby_page(params):
    resp = requests.get(PLACES_NEARBY_URL, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def search_businesses():
    """Search Google Places for barbers / hairdressers and return a dict keyed by place_id."""
    grid = build_search_grid(WIGAN_LAT, WIGAN_LNG, RADIUS_METERS, MAX_NEARBY_RADIUS)
    print(f"  Grid points to search: {len(grid)}")

    seen = {}

    for grid_idx, (lat, lng) in enumerate(grid, 1):
        for keyword in SEARCH_KEYWORDS:
            params = {
                "location": f"{lat},{lng}",
                "radius": MAX_NEARBY_RADIUS,
                "keyword": keyword,
                "key": API_KEY,
            }

            while True:
                try:
                    data = _nearby_page(params)
                except Exception as exc:
                    print(f"    [warn] Places API error: {exc}")
                    break

                status = data.get("status")
                if status not in ("OK", "ZERO_RESULTS"):
                    print(f"    [warn] Places status: {status} – {data.get('error_message', '')}")
                    break

                for place in data.get("results", []):
                    pid = place["place_id"]
                    if pid not in seen:
                        plat = place["geometry"]["location"]["lat"]
                        plng = place["geometry"]["location"]["lng"]
                        if haversine_m(WIGAN_LAT, WIGAN_LNG, plat, plng) <= RADIUS_METERS:
                            seen[pid] = place

                token = data.get("next_page_token")
                if not token:
                    break
                time.sleep(2)   # Google requires a short delay before using next_page_token
                params = {"pagetoken": token, "key": API_KEY}

        print(f"  Grid {grid_idx}/{len(grid)} done – {len(seen)} unique businesses so far")

    return seen


def get_place_details(place_id):
    """Fetch phone, website, address, rating from Places Details API."""
    params = {
        "place_id": place_id,
        "fields": (
            "name,formatted_phone_number,international_phone_number,"
            "website,formatted_address,rating,user_ratings_total,business_status"
        ),
        "key": API_KEY,
    }
    try:
        resp = requests.get(PLACES_DETAILS_URL, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json().get("result", {})
    except Exception as exc:
        print(f"    [warn] Details error: {exc}")
        return {}

# ---------------------------------------------------------------------------
# Website status checker
# ---------------------------------------------------------------------------

SOCIAL_DOMAINS = ("facebook.com", "instagram.com", "twitter.com", "tiktok.com", "linkedin.com")


def check_website(url):
    """
    Returns (status, notes) where status is one of:
        'none'        – no website at all
        'social_only' – only a Facebook / Instagram page listed
        'outdated'    – site exists but appears old
        'error'       – site unreachable / broken
        'active'      – site exists and looks current
    """
    if not url:
        return "none", "No website listed"

    if any(d in url.lower() for d in SOCIAL_DOMAINS):
        domain = next(d for d in SOCIAL_DOMAINS if d in url.lower())
        return "social_only", f"Only a {domain} page"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=12, allow_redirects=True)
    except requests.exceptions.SSLError:
        return "outdated", "SSL certificate error"
    except requests.exceptions.ConnectionError:
        return "error", "Cannot connect to website"
    except requests.exceptions.Timeout:
        return "error", "Website timed out"
    except Exception as exc:
        return "error", str(exc)[:80]

    if resp.status_code >= 400:
        return "error", f"HTTP {resp.status_code}"

    current_year = datetime.now().year
    text = resp.text

    # ── Last-Modified header ──────────────────────────────────────────────
    lm = resp.headers.get("Last-Modified", "")
    if lm:
        try:
            from email.utils import parsedate
            parsed = parsedate(lm)
            if parsed and current_year - parsed[0] >= OUTDATED_YEARS:
                return "outdated", f"Last-Modified header: {parsed[0]}"
        except Exception:
            pass

    # ── Copyright year in page source ────────────────────────────────────
    years = (
        re.findall(r'copyright[^\d]{0,10}(\d{4})', text, re.I)
        + re.findall(r'[©&copy;]{1,6}\s*(\d{4})', text)
    )
    valid_years = [int(y) for y in years if 2000 <= int(y) <= current_year + 1]
    if valid_years:
        latest = max(valid_years)
        if current_year - latest >= OUTDATED_YEARS:
            return "outdated", f"Copyright year: {latest}"

    # ── Old WordPress via meta generator ─────────────────────────────────
    soup = BeautifulSoup(text, "html.parser")
    gen = soup.find("meta", {"name": "generator"})
    if gen:
        content = gen.get("content", "").lower()
        wp = re.search(r"wordpress\s+([\d.]+)", content)
        if wp:
            try:
                if float(wp.group(1)) < 5.0:
                    return "outdated", f"Old WordPress {wp.group(1)}"
            except ValueError:
                pass

    # ── Table-heavy layout (old-school HTML) ─────────────────────────────
    all_tags = soup.find_all()
    if all_tags:
        table_ratio = len(soup.find_all("table")) / len(all_tags)
        if table_ratio > 0.12:
            return "outdated", "Table-based layout detected"

    return "active", "Website appears current"

# ---------------------------------------------------------------------------
# Contact info scraper
# ---------------------------------------------------------------------------

EMAIL_RE = re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b')
EXCLUDE_EMAIL = {"noreply", "no-reply", "example", "test", "wordpress", "sentry", "privacy"}
WA_HREF_RE = re.compile(r'wa\.me/(\+?[\d]+)|whatsapp\.com/send\?phone=([\d+]+)', re.I)
WA_TEXT_RE = re.compile(r'whatsapp[\s:]*[\+]?[\d\s\-()]{9,15}', re.I)


def _scrape_page(url):
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10, allow_redirects=True)
        if resp.status_code == 200:
            return resp.text
    except Exception:
        pass
    return ""


def scrape_contacts(url):
    """Return (email, whatsapp) scraped from the business website."""
    if not url or any(d in url.lower() for d in SOCIAL_DOMAINS):
        return "", ""

    pages_to_try = [url]
    for slug in ("/contact", "/contact-us", "/about", "/about-us"):
        pages_to_try.append(urljoin(url, slug))

    email = ""
    whatsapp = ""

    for page_url in pages_to_try:
        if email and whatsapp:
            break
        html = _scrape_page(page_url)
        if not html:
            continue
        soup = BeautifulSoup(html, "html.parser")

        # ── Email ─────────────────────────────────────────────────────────
        if not email:
            for tag in soup.find_all("a", href=re.compile(r'^mailto:', re.I)):
                m = re.search(r'mailto:([^\?&\s]+)', tag["href"])
                if m:
                    candidate = m.group(1).strip().lower()
                    if not any(ex in candidate for ex in EXCLUDE_EMAIL):
                        email = candidate
                        break

        if not email:
            for candidate in EMAIL_RE.findall(html):
                if not any(ex in candidate.lower() for ex in EXCLUDE_EMAIL):
                    email = candidate.lower()
                    break

        # ── WhatsApp ──────────────────────────────────────────────────────
        if not whatsapp:
            for tag in soup.find_all("a", href=True):
                m = WA_HREF_RE.search(tag["href"])
                if m:
                    whatsapp = (m.group(1) or m.group(2)).strip()
                    break

        if not whatsapp:
            m = WA_TEXT_RE.search(html)
            if m:
                digits = re.findall(r'[\d+]{10,13}', m.group())
                if digits:
                    whatsapp = digits[0]

    return email, whatsapp

# ---------------------------------------------------------------------------
# Excel output
# ---------------------------------------------------------------------------

COL_HEADERS = [
    "Business Name",
    "Phone Number",
    "Email Address",
    "WhatsApp Number",
    "Website Status",
    "Website / Social URL",
    "Address",
    "Google Rating",
    "No. Reviews",
    "Notes",
    "Distance (miles)",
]

COL_WIDTHS = [32, 18, 34, 18, 16, 42, 46, 12, 12, 38, 16]

STATUS_ORDER = {"none": 0, "social_only": 1, "outdated": 2, "error": 3, "active": 4}

FILL_NONE    = PatternFill("solid", fgColor="FFD6D6")   # red-ish  – no website
FILL_SOCIAL  = PatternFill("solid", fgColor="D6EAFF")   # blue     – social only
FILL_OUTDATED= PatternFill("solid", fgColor="FFF3CC")   # amber    – outdated
FILL_ERROR   = PatternFill("solid", fgColor="E8E8E8")   # grey     – error
FILL_ALT     = PatternFill("solid", fgColor="F7F7F7")   # off-white
FILL_HEADER  = PatternFill("solid", fgColor="1A2035")

THIN = Border(
    left=Side(style="thin", color="C0C0C0"),
    right=Side(style="thin", color="C0C0C0"),
    top=Side(style="thin", color="C0C0C0"),
    bottom=Side(style="thin", color="C0C0C0"),
)


def _row_fill(status, row_idx):
    return {
        "none":     FILL_NONE,
        "social_only": FILL_SOCIAL,
        "outdated": FILL_OUTDATED,
        "error":    FILL_ERROR,
    }.get(status, FILL_ALT if row_idx % 2 == 0 else PatternFill(fill_type=None))


def save_spreadsheet(businesses):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"wigan_hair_leads_{timestamp}.xlsx"

    wb = openpyxl.Workbook()

    # ── Leads sheet ───────────────────────────────────────────────────────
    ws = wb.active
    ws.title = "Leads"

    for col, (hdr, width) in enumerate(zip(COL_HEADERS, COL_WIDTHS), 1):
        cell = ws.cell(row=1, column=col, value=hdr)
        cell.fill = FILL_HEADER
        cell.font = Font(color="FFFFFF", bold=True, size=10)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = THIN
        ws.column_dimensions[get_column_letter(col)].width = width

    ws.row_dimensions[1].height = 32

    businesses_sorted = sorted(
        businesses,
        key=lambda b: (STATUS_ORDER.get(b["status"], 9), b["distance_miles"]),
    )

    for row_idx, biz in enumerate(businesses_sorted, 2):
        fill = _row_fill(biz["status"], row_idx)
        values = [
            biz["name"],
            biz["phone"],
            biz["email"],
            biz["whatsapp"],
            biz["status"].upper().replace("_", " "),
            biz["website"],
            biz["address"],
            biz["rating"],
            biz["reviews"],
            biz["notes"],
            round(biz["distance_miles"], 1),
        ]
        for col, val in enumerate(values, 1):
            cell = ws.cell(row=row_idx, column=col, value=val)
            cell.fill = fill
            cell.alignment = Alignment(vertical="center", wrap_text=False)
            cell.border = THIN
        ws.row_dimensions[row_idx].height = 18

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    # ── Summary sheet ─────────────────────────────────────────────────────
    ws2 = wb.create_sheet("Summary")
    totals = {
        "none":     sum(1 for b in businesses if b["status"] == "none"),
        "social_only": sum(1 for b in businesses if b["status"] == "social_only"),
        "outdated": sum(1 for b in businesses if b["status"] == "outdated"),
        "error":    sum(1 for b in businesses if b["status"] == "error"),
    }
    summary_rows = [
        ("Search area",           "50-mile radius of Wigan, UK"),
        ("Date generated",        datetime.now().strftime("%d/%m/%Y %H:%M")),
        ("Total leads found",     len(businesses)),
        ("",                      ""),
        ("No website",            totals["none"]),
        ("Social media only",     totals["social_only"]),
        ("Outdated website",      totals["outdated"]),
        ("Site unreachable",      totals["error"]),
        ("",                      ""),
        ("Have email address",    sum(1 for b in businesses if b["email"])),
        ("Have WhatsApp",         sum(1 for b in businesses if b["whatsapp"])),
        ("Have phone number",     sum(1 for b in businesses if b["phone"])),
        ("",                      ""),
        ("Colour key",            ""),
        ("RED  = No website",     ""),
        ("BLUE = Social only",    ""),
        ("AMBER = Outdated site", ""),
        ("GREY = Unreachable",    ""),
    ]
    for r, (label, val) in enumerate(summary_rows, 1):
        ws2.cell(r, 1, label).font = Font(bold=True)
        ws2.cell(r, 2, val)
    ws2.column_dimensions["A"].width = 28
    ws2.column_dimensions["B"].width = 35

    wb.save(filename)
    return filename, businesses_sorted

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 62)
    print("  Barber & Hairdresser Lead Finder – 50-mile radius of Wigan")
    print("=" * 62)

    if API_KEY == "YOUR_GOOGLE_PLACES_API_KEY":
        print("\nERROR: No Google Places API key found.\n")
        print("To fix this, run:")
        print('  export GOOGLE_PLACES_API_KEY="your_key_here"')
        print("  python find_leads.py\n")
        print("Or edit the API_KEY variable at the top of this script.\n")
        print("Get a free key at https://console.cloud.google.com/")
        print("Enable the 'Places API' for your project.")
        sys.exit(1)

    # ── 1. Discover businesses ────────────────────────────────────────────
    print("\n[1/3] Searching Google Places...")
    raw_places = search_businesses()
    print(f"\n  Total unique businesses discovered: {len(raw_places)}")

    if not raw_places:
        print("No businesses found. Check your API key and quota.")
        sys.exit(1)

    # ── 2. Enrich each business ───────────────────────────────────────────
    print("\n[2/3] Enriching business details & checking websites...")
    businesses = []

    for idx, (place_id, place) in enumerate(raw_places.items(), 1):
        name = place.get("name", "Unknown")
        plat = place["geometry"]["location"]["lat"]
        plng = place["geometry"]["location"]["lng"]
        dist_miles = haversine_m(WIGAN_LAT, WIGAN_LNG, plat, plng) / 1609.34

        print(f"\n  [{idx}/{len(raw_places)}] {name} ({dist_miles:.1f} mi)")

        details  = get_place_details(place_id)
        phone    = details.get("formatted_phone_number") or details.get("international_phone_number", "")
        website  = details.get("website", "")
        address  = details.get("formatted_address") or place.get("vicinity", "")
        rating   = details.get("rating", "")
        reviews  = details.get("user_ratings_total", 0)

        status, notes = check_website(website)
        print(f"    website status: {status}  |  {notes}")

        # Only save businesses with no or poor web presence
        if status == "active":
            print("    -> Skipped (active website)")
            continue

        email, whatsapp = "", ""
        if website and status not in ("none",):
            email, whatsapp = scrape_contacts(website)
            if email:
                print(f"    email found: {email}")
            if whatsapp:
                print(f"    whatsapp found: {whatsapp}")

        businesses.append({
            "name":          name,
            "phone":         phone,
            "email":         email,
            "whatsapp":      whatsapp,
            "website":       website,
            "status":        status,
            "notes":         notes,
            "address":       address,
            "rating":        rating,
            "reviews":       reviews,
            "distance_miles": dist_miles,
        })

        time.sleep(0.05)   # gentle rate limiting

    # ── 3. Save spreadsheet ───────────────────────────────────────────────
    print(f"\n[3/3] Saving {len(businesses)} leads to spreadsheet...")
    filename, sorted_leads = save_spreadsheet(businesses)

    # ── Summary ───────────────────────────────────────────────────────────
    counts = {s: sum(1 for b in sorted_leads if b["status"] == s)
              for s in ("none", "social_only", "outdated", "error")}

    print(f"\n{'=' * 62}")
    print(f"  Done!  Saved to: {filename}")
    print(f"{'=' * 62}")
    print(f"  Total leads          : {len(sorted_leads)}")
    print(f"  No website           : {counts['none']}")
    print(f"  Social media only    : {counts['social_only']}")
    print(f"  Outdated website     : {counts['outdated']}")
    print(f"  Site unreachable     : {counts['error']}")
    print(f"  With email address   : {sum(1 for b in sorted_leads if b['email'])}")
    print(f"  With WhatsApp        : {sum(1 for b in sorted_leads if b['whatsapp'])}")
    print(f"  With phone number    : {sum(1 for b in sorted_leads if b['phone'])}")
    print(f"{'=' * 62}\n")


if __name__ == "__main__":
    main()
