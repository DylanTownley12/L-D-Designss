#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║   Barber & Hairdresser Lead Finder – 50 miles of Wigan       ║
║   Uses SerpAPI free tier (100 searches/month, NO card)       ║
╠══════════════════════════════════════════════════════════════╣
║  SETUP (one time, takes 2 minutes):                          ║
║  1. Go to  https://serpapi.com  and click "Start Free Trial" ║
║  2. Verify your email – you'll land on your dashboard        ║
║  3. Copy the API key shown at the top of the dashboard       ║
║  4. Paste it below where it says  YOUR_KEY_HERE              ║
║  5. Double-click  run.bat  (Windows) or  run.sh  (Mac/Linux) ║
╚══════════════════════════════════════════════════════════════╝
"""

# ── PASTE YOUR SERPAPI KEY HERE (between the quotes) ─────────────────────
SERPAPI_KEY = "YOUR_KEY_HERE"
# ─────────────────────────────────────────────────────────────────────────

# How many pages of results per keyword (1 page = 20 results = 1 API credit)
# Free tier = 100 credits/month.  Default 2 pages × 4 keywords = 8 credits.
MAX_PAGES = 2

# =========================================================================
# Auto-install missing packages so the user never has to open a terminal
# =========================================================================
import subprocess, sys

def _ensure(package, import_as=None):
    name = import_as or package
    try:
        __import__(name)
    except ImportError:
        print(f"  Installing {package} …")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-q", package],
            stdout=subprocess.DEVNULL,
        )

_ensure("requests")
_ensure("openpyxl")
_ensure("beautifulsoup4", "bs4")
_ensure("lxml")

# =========================================================================
# Imports (safe to do after auto-install)
# =========================================================================
import re, math, time
from datetime import datetime
from urllib.parse import urljoin

import requests
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from bs4 import BeautifulSoup

# =========================================================================
# Search configuration
# =========================================================================

WIGAN_LAT  = 53.5450
WIGAN_LNG  = -2.6325
RADIUS_MI  = 50

# SerpAPI Google Maps – zoom 10 covers roughly a 30-40 mile radius per search.
# We search from Wigan plus a ring of satellite towns to fill the 50-mile circle.
# Each entry = (lat, lng, label).  Kept to ~7 points to stay API-efficient.
SEARCH_CENTRES = [
    (53.5450, -2.6325, "Wigan"),
    (53.5780, -2.4290, "Bolton"),
    (53.3900, -2.5900, "Warrington"),
    (53.4560, -2.7940, "St Helens"),
    (53.6750, -2.6270, "Chorley"),
    (53.7580, -2.7050, "Preston"),
    (53.5990, -2.1580, "Rochdale"),
]

KEYWORDS = ["barbers", "hairdressers", "hair salon", "barbershop"]

SERPAPI_URL = "https://serpapi.com/search"

# =========================================================================
# Geo helper
# =========================================================================

def haversine_mi(lat1, lng1, lat2, lng2):
    R = 3_958.8   # Earth radius in miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))

# =========================================================================
# SerpAPI search
# =========================================================================

def serpapi_maps_page(lat, lng, keyword, start=0):
    """One page of Google Maps results from SerpAPI."""
    params = {
        "engine":  "google_maps",
        "q":       keyword,
        "ll":      f"@{lat},{lng},10z",   # zoom 10 ≈ 35-mile viewport radius
        "type":    "search",
        "hl":      "en",
        "gl":      "uk",
        "start":   start,
        "api_key": SERPAPI_KEY,
    }
    resp = requests.get(SERPAPI_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_all_businesses():
    """
    Search every centre × keyword combination, deduplicate by place title+address,
    and return only businesses within RADIUS_MI of Wigan.
    """
    seen   = {}   # key: (name_lower, address_lower)
    total_credits = 0

    for centre_lat, centre_lng, centre_name in SEARCH_CENTRES:
        for keyword in KEYWORDS:
            for page in range(MAX_PAGES):
                start = page * 20
                print(f"  Searching '{keyword}' near {centre_name} (page {page+1}) …")
                try:
                    data = serpapi_maps_page(centre_lat, centre_lng, keyword, start)
                    total_credits += 1
                except requests.HTTPError as exc:
                    print(f"    [!] API error: {exc}")
                    break

                results = data.get("local_results", [])
                if not results:
                    break   # no more pages

                for biz in results:
                    coords = biz.get("gps_coordinates", {})
                    blat   = coords.get("latitude")
                    blng   = coords.get("longitude")

                    if blat is None or blng is None:
                        continue

                    dist = haversine_mi(WIGAN_LAT, WIGAN_LNG, blat, blng)
                    if dist > RADIUS_MI:
                        continue

                    name    = biz.get("title", "").strip()
                    address = biz.get("address", "").strip()
                    key     = (name.lower(), address.lower())

                    if key not in seen:
                        seen[key] = {
                            "name":          name,
                            "phone":         biz.get("phone", ""),
                            "website":       biz.get("website", ""),
                            "address":       address,
                            "rating":        biz.get("rating", ""),
                            "reviews":       biz.get("reviews", 0),
                            "distance_mi":   round(dist, 1),
                            "lat":           blat,
                            "lng":           blng,
                        }

                time.sleep(0.3)   # be polite to the API

    print(f"\n  API credits used this run: {total_credits}")
    return list(seen.values())

# =========================================================================
# Website status checker
# =========================================================================

SOCIAL_DOMAINS = ("facebook.com", "instagram.com", "twitter.com",
                  "tiktok.com", "linkedin.com", "linktree.com")
OUTDATED_YEARS = 3

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}


def check_website(url):
    """
    Returns (status, notes).
    status: 'none' | 'social_only' | 'outdated' | 'error' | 'active'
    """
    if not url:
        return "none", "No website listed"

    if any(d in url.lower() for d in SOCIAL_DOMAINS):
        domain = next(d for d in SOCIAL_DOMAINS if d in url.lower())
        return "social_only", f"Only a {domain} page"

    try:
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=12, allow_redirects=True)
    except requests.exceptions.SSLError:
        return "outdated", "Broken SSL certificate"
    except requests.exceptions.ConnectionError:
        return "error", "Cannot connect"
    except requests.exceptions.Timeout:
        return "error", "Timed out"
    except Exception as exc:
        return "error", str(exc)[:80]

    if resp.status_code >= 400:
        return "error", f"HTTP {resp.status_code}"

    current_year = datetime.now().year
    text = resp.text

    # Last-Modified header
    lm = resp.headers.get("Last-Modified", "")
    if lm:
        try:
            from email.utils import parsedate
            parsed = parsedate(lm)
            if parsed and current_year - parsed[0] >= OUTDATED_YEARS:
                return "outdated", f"Last-Modified header says {parsed[0]}"
        except Exception:
            pass

    # Copyright year in source
    year_hits = (
        re.findall(r'copyright[^\d]{0,10}(\d{4})', text, re.I)
        + re.findall(r'[©]\s*(\d{4})', text)
        + re.findall(r'&copy;\s*(\d{4})', text)
    )
    valid = [int(y) for y in year_hits if 2000 <= int(y) <= current_year + 1]
    if valid and current_year - max(valid) >= OUTDATED_YEARS:
        return "outdated", f"Copyright year: {max(valid)}"

    # Old WordPress via meta generator
    soup = BeautifulSoup(text, "lxml")
    gen  = soup.find("meta", {"name": "generator"})
    if gen:
        content = gen.get("content", "").lower()
        wp = re.search(r"wordpress\s+([\d.]+)", content)
        if wp:
            try:
                if float(wp.group(1)) < 5.0:
                    return "outdated", f"Old WordPress {wp.group(1)}"
            except ValueError:
                pass

    # Table-heavy = old-school layout
    all_tags = soup.find_all()
    if all_tags and len(soup.find_all("table")) / len(all_tags) > 0.12:
        return "outdated", "Table-based layout (very old site)"

    return "active", "Website looks current"

# =========================================================================
# Contact scraper (email + WhatsApp)
# =========================================================================

EMAIL_RE   = re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b')
SKIP_EMAIL = {"noreply", "no-reply", "example", "test", "wordpress", "sentry",
              "privacy", "support@serpapi", "abuse", "postmaster"}
WA_HREF_RE = re.compile(r'wa\.me/(\+?[\d]+)|whatsapp\.com/send\?phone=([\d+]+)', re.I)
WA_TEXT_RE = re.compile(r'whatsapp[\s:]*[\+]?[\d\s\-()‬‭]{9,18}', re.I)


def _get_html(url, timeout=10):
    try:
        r = requests.get(url, headers=BROWSER_HEADERS, timeout=timeout, allow_redirects=True)
        if r.status_code == 200:
            return r.text
    except Exception:
        pass
    return ""


def scrape_contacts(url):
    """Return (email, whatsapp) by scraping the business website."""
    if not url or any(d in url.lower() for d in SOCIAL_DOMAINS):
        return "", ""

    email    = ""
    whatsapp = ""

    pages = [url] + [urljoin(url, slug) for slug in ("/contact", "/contact-us", "/about")]

    for page_url in pages:
        if email and whatsapp:
            break
        html = _get_html(page_url)
        if not html:
            continue
        soup = BeautifulSoup(html, "lxml")

        # Email – prefer mailto links, fall back to regex
        if not email:
            for tag in soup.find_all("a", href=re.compile(r'^mailto:', re.I)):
                m = re.search(r'mailto:([^\?&\s]+)', tag["href"])
                if m:
                    c = m.group(1).strip().lower()
                    if not any(s in c for s in SKIP_EMAIL):
                        email = c
                        break
        if not email:
            for c in EMAIL_RE.findall(html):
                if not any(s in c.lower() for s in SKIP_EMAIL):
                    email = c.lower()
                    break

        # WhatsApp – prefer wa.me links
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

# =========================================================================
# Excel output
# =========================================================================

COLS = [
    ("Business Name",       30),
    ("Phone Number",        18),
    ("Email Address",       32),
    ("WhatsApp Number",     18),
    ("Website Status",      16),
    ("Website / Social URL",42),
    ("Address",             45),
    ("Rating",              10),
    ("Reviews",             10),
    ("Notes",               36),
    ("Distance (miles)",    16),
]

FILL_HEADER   = PatternFill("solid", fgColor="1A2035")
FILL_NONE     = PatternFill("solid", fgColor="FFD6D6")   # red   – no website
FILL_SOCIAL   = PatternFill("solid", fgColor="D6EAFF")   # blue  – social only
FILL_OUTDATED = PatternFill("solid", fgColor="FFF2CC")   # amber – outdated
FILL_ERROR    = PatternFill("solid", fgColor="E8E8E8")   # grey  – error
FILL_ALT      = PatternFill("solid", fgColor="F7F7F7")

STATUS_ORDER = {"none": 0, "social_only": 1, "outdated": 2, "error": 3, "active": 4}

THIN = Border(
    **{s: Side(style="thin", color="CCCCCC")
       for s in ("left", "right", "top", "bottom")}
)


def _row_fill(status, idx):
    return {
        "none":        FILL_NONE,
        "social_only": FILL_SOCIAL,
        "outdated":    FILL_OUTDATED,
        "error":       FILL_ERROR,
    }.get(status, FILL_ALT if idx % 2 == 0 else PatternFill(fill_type=None))


def save_spreadsheet(leads):
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"wigan_hair_leads_{ts}.xlsx"
    wb       = openpyxl.Workbook()

    # ── Leads sheet ───────────────────────────────────────────────────────
    ws = wb.active
    ws.title = "Leads"

    for col, (hdr, width) in enumerate(COLS, 1):
        c = ws.cell(1, col, hdr)
        c.fill      = FILL_HEADER
        c.font      = Font(color="FFFFFF", bold=True, size=10)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border    = THIN
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.row_dimensions[1].height = 32

    sorted_leads = sorted(
        leads,
        key=lambda b: (STATUS_ORDER.get(b["status"], 9), b["distance_mi"]),
    )

    for ri, biz in enumerate(sorted_leads, 2):
        fill   = _row_fill(biz["status"], ri)
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
            biz["distance_mi"],
        ]
        for col, val in enumerate(values, 1):
            c = ws.cell(ri, col, val)
            c.fill      = fill
            c.alignment = Alignment(vertical="center")
            c.border    = THIN
        ws.row_dimensions[ri].height = 18

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    # ── Summary sheet ─────────────────────────────────────────────────────
    ws2  = wb.create_sheet("Summary")
    cnts = {s: sum(1 for b in leads if b["status"] == s)
            for s in ("none", "social_only", "outdated", "error")}
    rows = [
        ("Search area",          f"50-mile radius of Wigan, UK"),
        ("Date generated",       datetime.now().strftime("%d/%m/%Y %H:%M")),
        ("",                     ""),
        ("Total leads",          len(leads)),
        ("No website",           cnts["none"]),
        ("Social media only",    cnts["social_only"]),
        ("Outdated website",     cnts["outdated"]),
        ("Site unreachable",     cnts["error"]),
        ("",                     ""),
        ("Have email",           sum(1 for b in leads if b["email"])),
        ("Have WhatsApp",        sum(1 for b in leads if b["whatsapp"])),
        ("Have phone",           sum(1 for b in leads if b["phone"])),
        ("",                     ""),
        ("Colour key",           ""),
        ("RED  = No website",    "Best leads – no online presence"),
        ("BLUE = Social only",   "Only Facebook/Instagram"),
        ("AMBER = Outdated",     "Site exists but old/broken"),
        ("GREY = Unreachable",   "Site down or erroring"),
    ]
    for r, (label, val) in enumerate(rows, 1):
        ws2.cell(r, 1, label).font = Font(bold=True, size=10)
        ws2.cell(r, 2, val)
    ws2.column_dimensions["A"].width = 26
    ws2.column_dimensions["B"].width = 40

    wb.save(filename)
    return filename, sorted_leads

# =========================================================================
# Main
# =========================================================================

def main():
    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║   Barber & Hairdresser Lead Finder – 50 miles of Wigan      ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print()

    if SERPAPI_KEY == "YOUR_KEY_HERE":
        print("  ERROR: No API key set.\n")
        print("  1. Sign up FREE at https://serpapi.com")
        print("  2. Copy your key from the dashboard")
        print("  3. Open find_leads.py and paste it where it says YOUR_KEY_HERE")
        print("  4. Run again.\n")
        input("  Press Enter to exit …")
        sys.exit(1)

    # ── 1. Find businesses via SerpAPI ────────────────────────────────────
    print("[1/3] Searching Google Maps via SerpAPI …\n")
    raw = fetch_all_businesses()
    print(f"\n  {len(raw)} unique businesses found within {RADIUS_MI} miles of Wigan.")

    if not raw:
        print("\n  No results. Check your API key or try increasing MAX_PAGES.")
        input("  Press Enter to exit …")
        sys.exit(1)

    # ── 2. Check websites & scrape contacts ───────────────────────────────
    print(f"\n[2/3] Checking websites and scraping contact info …\n")
    leads = []

    for idx, biz in enumerate(raw, 1):
        name    = biz["name"]
        website = biz["website"]
        print(f"  [{idx}/{len(raw)}] {name}")

        status, notes = check_website(website)
        print(f"         → {status}  {notes}")

        if status == "active":
            continue   # skip businesses with a working modern website

        email, whatsapp = "", ""
        if website and status not in ("none",):
            email, whatsapp = scrape_contacts(website)
            if email:    print(f"         email:    {email}")
            if whatsapp: print(f"         whatsapp: {whatsapp}")

        leads.append({**biz, "status": status, "notes": notes,
                      "email": email, "whatsapp": whatsapp})

    # ── 3. Save ───────────────────────────────────────────────────────────
    print(f"\n[3/3] Saving {len(leads)} leads to spreadsheet …")
    filename, sorted_leads = save_spreadsheet(leads)

    cnts = {s: sum(1 for b in sorted_leads if b["status"] == s)
            for s in ("none", "social_only", "outdated", "error")}

    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print(f"║  Done!  →  {filename:<49}║")
    print("╠══════════════════════════════════════════════════════════════╣")
    print(f"║  Total leads        : {len(sorted_leads):<38}║")
    print(f"║  No website         : {cnts['none']:<38}║")
    print(f"║  Social media only  : {cnts['social_only']:<38}║")
    print(f"║  Outdated website   : {cnts['outdated']:<38}║")
    print(f"║  With email found   : {sum(1 for b in sorted_leads if b['email']):<38}║")
    print(f"║  With WhatsApp      : {sum(1 for b in sorted_leads if b['whatsapp']):<38}║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print()
    input("  Press Enter to exit …")


if __name__ == "__main__":
    main()
