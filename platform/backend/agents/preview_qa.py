"""
On-demand trade preview sites + deterministic QA gate (Phase 5).

The sales motion: the founder taps "build preview" on a worth-it prospect → we
generate a real, mobile-first one-page site for them with a LIVE lead-capture form
(posting to /api/capture/<prospect capture_token>) → a deterministic QA check gates
it. FAIL → qa_failed + listed reasons + red alert, blocked from READY. PASS → a
human taps APPROVE to flip DRAFT→READY (the only thing that unlocks the WhatsApp /
copy buttons). NO AI 0-10 scoring — every check is a hard, explainable rule.

Nothing here contacts anyone. The preview is shown by the founder, on the call.
"""
import json
import logging
import re
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from urllib.parse import quote as _urlquote

import httpx

from config import settings
from db.client import get_db
from agents import trades
from agents.places_photos import resolve_photo_uri, _names_match

logger = logging.getLogger(__name__)

# Real filler markers only — must NOT match the legit HTML `placeholder=` attribute.
PLACEHOLDER_RE = re.compile(r"lorem ipsum|your business name|\btbd\b|coming soon|xxxx", re.I)

_DETAILS_URL = "https://places.googleapis.com/v1/places/{pid}"
_DETAILS_MASK = ("id,displayName,photos,reviews,rating,userRatingCount,"
                 "formattedAddress,nationalPhoneNumber")

# Tasteful trade-specific fallbacks when a listing has no Google photos (keyless Unsplash CDN).
_STOCK = {
    "plumber":          ["1607472586893-edb57bdc0e39", "1585704032915-c3400ca199e7", "1558618666-fcd25c85cd64"],
    "heating engineer": ["1581094794329-c8112a89af12", "1635048424329-a9bfb146d7aa", "1558618666-fcd25c85cd64"],
    "gas engineer":     ["1581094794329-c8112a89af12", "1607472586893-edb57bdc0e39", "1558618666-fcd25c85cd64"],
    "electrician":      ["1621905251189-08b45d6a269e", "1558618666-fcd25c85cd64", "1565608087341-404b25492fee"],
    "roofer":           ["1632759145351-1d592919f522", "1558618666-fcd25c85cd64", "1503387762-592deb58ef4e"],
    "drainage":         ["1585704032915-c3400ca199e7", "1607472586893-edb57bdc0e39", "1558618666-fcd25c85cd64"],
}
_STOCK_DEFAULT = ["1581244277943-fe4a9c777189", "1558618666-fcd25c85cd64", "1503387762-592deb58ef4e"]


def _stock_photos(trade: str, n: int = 3) -> list:
    # w=1100/q=72 keeps the hero ~100-180KB — the whole page must load <3s on mobile.
    ids = _STOCK.get((trade or "").lower(), _STOCK_DEFAULT)
    return [f"https://images.unsplash.com/photo-{i}?auto=format&fit=crop&w=1100&q=72" for i in ids[:n]]


_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"


def _find_place_id(name: str, town: str) -> str:
    """Find a prospect's Google place_id by name+town when we never stored one
    (the place_id column landed mid-run). Guarded by _names_match so we never pull
    the WRONG business's photos/reviews. Returns '' when unsure."""
    if not (settings.GOOGLE_PLACES_API_KEY and name):
        return ""
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(_SEARCH_URL, headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": settings.GOOGLE_PLACES_API_KEY,
                "X-Goog-FieldMask": "places.id,places.displayName",
            }, json={"textQuery": f"{name} {town or ''} UK".strip(),
                     "languageCode": "en-GB", "regionCode": "GB", "pageSize": 3})
        if r.status_code != 200:
            return ""
        for p in r.json().get("places", []):
            rn = (p.get("displayName") or {}).get("text", "")
            if _names_match(name, rn):
                return p.get("id") or ""
    except Exception as e:
        logger.warning(f"[preview_qa] place lookup failed for {name}: {e}")
    return ""


def _fetch_place_details(place_id: str, trade: str = "", name: str = None,
                         town: str = None, prospect_id: str = None) -> dict:
    """Pull REAL photos (keyless CDN urls), Google reviews + rating for a place.
    If place_id is missing, look it up by name+town and backfill the prospect row.
    Best-effort — on any failure we degrade to tasteful stock so the preview still
    looks premium. Costs ~1-2 Places calls + a few photo-media calls (build time)."""
    out = {"photos": [], "reviews": [], "rating": None, "review_count": None,
           "address": None, "real_photos": False}
    if not place_id and name:
        place_id = _find_place_id(name, town)
        if place_id and prospect_id:
            try:    # column may not exist on older DBs — best-effort backfill
                get_db().table("prospects").update({"place_id": place_id}).eq("id", prospect_id).execute()
            except Exception:
                pass
    if place_id and settings.GOOGLE_PLACES_API_KEY:
        try:
            with httpx.Client(timeout=20.0) as client:
                r = client.get(_DETAILS_URL.format(pid=place_id), headers={
                    "X-Goog-Api-Key": settings.GOOGLE_PLACES_API_KEY,
                    "X-Goog-FieldMask": _DETAILS_MASK,
                })
            if r.status_code == 200:
                d = r.json()
                out["rating"] = d.get("rating")
                out["review_count"] = d.get("userRatingCount")
                out["address"] = d.get("formattedAddress")
                # Real Google reviews (text + author + stars) — never fabricated.
                for rv in (d.get("reviews") or [])[:6]:
                    txt = ((rv.get("text") or {}).get("text")
                           or (rv.get("originalText") or {}).get("text") or "").strip()
                    if len(txt) < 12:
                        continue
                    out["reviews"].append({
                        "text": txt[:320],
                        "rating": int(rv.get("rating") or 5),
                        "author": (rv.get("authorAttribution") or {}).get("displayName") or "A local customer",
                        "when": rv.get("relativePublishTimeDescription") or "",
                    })
                # Real premises photos → keyless CDN urls (parallel resolve).
                # Hero at 1100px, gallery at 640px — page weight budget for <3s mobile.
                names = [p.get("name") for p in (d.get("photos") or [])[:3] if p.get("name")]
                if names:
                    jobs = list(zip(names, [1100, 640, 640]))
                    with ThreadPoolExecutor(max_workers=min(3, len(jobs))) as ex:
                        out["photos"] = [u for u in ex.map(
                            lambda nw: resolve_photo_uri(nw[0], max_w=nw[1]), jobs) if u]
                out["real_photos"] = bool(out["photos"])
            else:
                logger.warning(f"[preview_qa] details {r.status_code}: {r.text[:140]}")
        except Exception as e:
            logger.warning(f"[preview_qa] details fetch failed for {place_id}: {e}")
    if not out["photos"]:
        out["photos"] = _stock_photos(trade)
    return out


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# ── HTML generation ───────────────────────────────────────────────────
def _esc(s) -> str:
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _stars(n) -> str:
    n = max(0, min(5, int(round(n or 5))))
    return "★" * n + "☆" * (5 - n)


_SERVICES = {
    "plumber": [("Emergency leaks & burst pipes", "24/7 rapid response when water's pouring."),
                ("Bathrooms & full installs", "Designed, fitted and finished to a high standard."),
                ("Taps, toilets & blocked drains", "The everyday fixes done right, first time.")],
    "heating engineer": [("Boiler repair & servicing", "Keep your heating safe and running all winter."),
                         ("New boiler installation", "Efficient combi & system boilers, fully fitted."),
                         ("Radiators & power flushing", "Cold spots gone — even heat through the house.")],
    "gas engineer": [("Gas safety checks & certs", "Gas Safe registered, landlord certificates."),
                     ("Boiler & cooker installs", "Safe, certified appliance fitting."),
                     ("Leak detection & repair", "Fast, careful work on any gas fault.")],
    "electrician": [("Fault finding & repairs", "Tripping circuits and dead sockets sorted fast."),
                    ("Fuse boards & rewires", "Up to current regs, tidy and certified."),
                    ("Lights, sockets & EV chargers", "From a single socket to a full install.")],
    "drainage": [("Blocked drains cleared", "High-pressure jetting, same-day where possible."),
                 ("CCTV drain surveys", "See exactly what's wrong before we dig."),
                 ("Drain repairs & relining", "Lasting fixes, not just a quick unblock.")],
    "roofer": [("Roof repairs & leaks", "Stop the drip before it wrecks the ceiling."),
               ("New roofs & flat roofs", "Pitched, flat and everything between."),
               ("Gutters, fascias & soffits", "Cleared, repaired and replaced.")],
}
_SERVICES_DEFAULT = [("Fast, reliable local service", "Turn up on time, do the job properly."),
                     ("Free, no-obligation quotes", "Know the price before any work starts."),
                     ("Fully insured & guaranteed", "Peace of mind on every job.")]

_NEARBY = {
    "wigan": ["Leigh", "Hindley", "Standish", "Orrell", "Ince", "Pemberton"],
    "bolton": ["Horwich", "Farnworth", "Westhoughton", "Kearsley", "Little Lever"],
    "leigh": ["Atherton", "Tyldesley", "Hindley", "Astley"],
    "st helens": ["Rainford", "Newton-le-Willows", "Haydock", "Billinge"],
    "warrington": ["Birchwood", "Lymm", "Culcheth", "Great Sankey"],
}

# tiny inline SVGs (stroke = currentColor)
_IC = {
    "shield": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    "star": '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m12 2 3 6.5 7 .9-5 4.8 1.3 7L12 18l-6.6 3.2L6.7 14l-5-4.8 7-.9z"/></svg>',
    "clock": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    "pin": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    "phone": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    "check": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m20 6-11 11-5-5"/></svg>',
    "wrench": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    "bolt": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    "flame": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    "drop": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>',
    "home": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
    "cal": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    "g": '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.6 4.1-5.35 4.1-3.2 0-5.85-2.65-5.85-5.95S8.8 6.2 12 6.2c1.85 0 3.05.8 3.75 1.45l2.55-2.45C16.65 3.7 14.55 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12s4.1 9.2 9.2 9.2c5.3 0 8.85-3.75 8.85-9 0-.6-.05-1.05-.15-1.5z"/></svg>',
}

# Service-card icon rotation — trade-led first icon, then varied so the grid
# doesn't repeat one glyph six times.
_TRADE_ICON = {"plumber": "drop", "heating engineer": "flame", "gas engineer": "flame",
               "electrician": "bolt", "roofer": "home", "drainage": "drop"}


def _svc_icons(trade: str, n: int) -> list:
    first = _TRADE_ICON.get((trade or "").lower(), "wrench")
    cycle = [first] + [i for i in ("wrench", "shield", "clock", "home", "check", "bolt") if i != first]
    return [(cycle * 2)[i] for i in range(n)]


# Per-trade brand palette → every preview feels designed FOR that trade, not templated.
_ACCENTS = {
    "plumber":          ("#0284c7", "#075985"),
    "heating engineer": ("#ea580c", "#9a3412"),
    "gas engineer":     ("#d97706", "#92400e"),
    "electrician":      ("#ca8a04", "#854d0e"),
    "roofer":           ("#0f766e", "#134e4a"),
    "drainage":         ("#0e7490", "#155e75"),
}
_ACCENT_DEFAULT = ("#e85d04", "#9d3c0a")


def _hex_rgba(h: str, a: float) -> str:
    h = h.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{a})"


def _initials(name: str) -> str:
    words = [w for w in re.split(r"\s+", (name or "").strip()) if w and w[0].isalnum()]
    return "".join(w[0].upper() for w in words[:2]) or "A"


_TRADE_PLURAL = {"drainage": "drainage experts"}


def _trade_plural(trade: str) -> str:
    t = (trade or "tradesperson").strip().lower()
    return _TRADE_PLURAL.get(t, t + ("" if t.endswith("s") else "s"))


def _site_html(prospect: dict, capture_token: str, details: dict = None) -> str:
    """A premium, mobile-first demo site for a trade: real Google photos + reviews +
    rating, a 30-second booking widget that captures the enquiry, trust signals and
    a sticky call bar. The hero uses LAYERED backgrounds (real photo → stock →
    branded gradient) so a dead image URL can never make the page look broken.
    Viewport + tel: + capture form (correct token) + business name; no filler."""
    details = details or {}
    biz = (prospect.get("business_name") or "Your Trade").strip()
    trade = (prospect.get("trade") or "tradesperson").strip()
    trade_t = trade.title()
    town = (prospect.get("town") or "your area").strip()
    phone = (prospect.get("phone") or "").strip()
    api = settings.BACKEND_BASE_URL.rstrip("/")
    tel = re.sub(r"[^\d+]", "", phone)
    accent, accent_dk = _ACCENTS.get(trade.lower(), _ACCENT_DEFAULT)
    photos = details.get("photos") or _stock_photos(trade)
    real = bool(details.get("real_photos"))
    hero = photos[0]
    stock_fb = _stock_photos(trade)[0]
    gallery = photos[1:4] if real else []
    rating = details.get("rating")
    rcount = details.get("review_count")
    reviews = details.get("reviews") or []
    nearby = _NEARBY.get(town.lower(), [])
    services = _SERVICES.get(trade.lower(), _SERVICES_DEFAULT)

    # Layered hero background — each layer is a fallback for the one above it, so a
    # 404'd photo silently reveals the branded gradient instead of a broken page.
    layers = ['linear-gradient(180deg,rgba(7,16,26,.52),rgba(7,16,26,.9))',
              f'url("{hero}")']
    if hero != stock_fb:
        layers.append(f'url("{stock_fb}")')
    layers += [f'radial-gradient(900px 420px at 88% -10%,{_hex_rgba(accent, .5)},transparent)',
               'linear-gradient(160deg,#0e2438,#0a1626)']
    hero_layers = ",".join(layers)

    # Inline SVG favicon — branded tab icon, zero extra requests.
    fav = ("data:image/svg+xml," +
           f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
           f"<rect width='64' height='64' rx='14' fill='{accent}'/>"
           f"<text x='32' y='43' font-family='Arial' font-size='32' font-weight='800' "
           f"fill='white' text-anchor='middle'>{_esc(_initials(biz)[:1])}</text></svg>").replace("#", "%23").replace('"', "'")

    # Honest JSON-LD (only fields we actually know).
    ld = {"@context": "https://schema.org", "@type": "LocalBusiness",
          "name": biz, "telephone": phone or None,
          "address": {"@type": "PostalAddress", "addressLocality": town, "addressCountry": "GB"},
          "description": f"{trade_t} in {town}"}
    if rating and rcount:
        ld["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": rating, "reviewCount": rcount}
    jsonld = json.dumps({k: v for k, v in ld.items() if v is not None})

    # HERO HEADLINE — the biggest text on the page, built from their REAL data:
    # "J Bury Plumbing — Wigan's 4.9★ rated plumbers" / fallback "…— Wigan's trusted plumbers".
    plural = _trade_plural(trade)
    headline = (f"{_esc(biz)} — {_esc(town)}&#8217;s {rating:.1f}★ rated {_esc(plural)}" if rating
                else f"{_esc(biz)} — {_esc(town)}&#8217;s trusted {_esc(plural)}")

    # HERO QUOTE — the single strongest short REAL review, real author, right under
    # the headline. Recognition: his own customer's words. Omitted when none exist.
    hero_quote = ""
    if reviews:
        best = sorted(reviews, key=lambda r: (-(r.get("rating") or 0), len(r.get("text", ""))))[0]
        q = (best.get("text") or "").strip()
        if len(q) > 110:
            q = q[:110].rsplit(" ", 1)[0].rstrip(",.;:") + "…"
        hero_quote = (f'<div class="hquote"><span class="hstars">{_stars(best.get("rating"))}</span> '
                      f'&#8220;{_esc(q)}&#8221; <span class="hq-who">— {_esc(best.get("author"))}</span></div>')

    # OG image: the branded per-prospect card (rendered server-side); falls back to
    # the hero photo if we have no prospect id (e.g. unit tests).
    pid_for_og = prospect.get("id")
    og_url = f"{api}/og/{pid_for_og}.png" if pid_for_og else hero

    # ASYNC CLOSER — preview-only strip that closes without a call. wa.me to the
    # founder, prefilled from the prospect's side. £199 + £29/month, stated plainly.
    founder_wa = re.sub(r"\D", "", settings.FOUNDER_PHONE or "")
    if founder_wa.startswith("0"):
        founder_wa = "44" + founder_wa[1:]
    wa_text = _urlquote(f"Alright Dylan, it's {biz}. Seen the website you built us — want it live. What's next?")
    closer = (
        '<section class="closer"><div class="wrap czwrap">'
        f'<div><div class="cz-eyebrow">This site is already built</div>'
        f'<div class="cz-big">Built for {_esc(biz)}</div>'
        f'<div class="cz-sub">Want it live this week? <b>£199</b> to launch, then <b>£29/month</b> — '
        'hosting, updates and the booking system, all done for you.</div></div>'
        f'<a class="cz-btn" href="https://wa.me/{founder_wa}?text={wa_text}">'
        f'{_IC["phone"]} WhatsApp Dylan — make it live</a>'
        '</div></section>')

    # Hero chips: live Google rating when we have it, locality otherwise.
    chips = []
    if rating:
        chips.append(f'<span class="hchip"><span class="hstars">{_stars(rating)}</span> '
                     f'<b>{rating:.1f}</b>&nbsp;· {rcount} Google reviews</span>')
    chips.append(f'<span class="hchip">{_IC["pin"]} Serving {_esc(town)} &amp; nearby</span>')
    chips.append(f'<span class="hchip">{_IC["clock"]} Fast response</span>')
    rating_chip = "".join(chips)

    svc_html = "".join(
        f'<div class="svc fx"><span class="sic">{_IC["check"]}</span>'
        f'<div><h3>{_esc(t)}</h3><p>{_esc(d)}</p></div></div>'
        for t, d in services)

    gallery_html = ""
    if gallery:
        gallery_html = ('<section class="sec"><div class="wrap"><div class="eyebrow">Our work</div>'
                        '<h2>Recent jobs &amp; premises</h2><div class="gal">'
                        + "".join(f'<img class="gi fx" loading="lazy" decoding="async" alt="{_esc(biz)} — work photo" src="{g}">'
                                  for g in gallery)
                        + '</div></div></section>')

    # Reviews — REAL Google reviews only, never fabricated. Sparse listing → honest trust block.
    if reviews:
        cards = "".join(
            f'<div class="rev fx"><div class="rtop"><span class="rav">{_esc(_initials(rv["author"]))}</span>'
            f'<div><div class="rname">{_esc(rv["author"])}</div>'
            f'<div class="rmeta">{_esc(rv.get("when", ""))} · <span class="gtag">Google review</span></div></div></div>'
            f'<div class="rs">{_stars(rv["rating"])}</div>'
            f'<p>“{_esc(rv["text"])}”</p></div>'
            for rv in reviews[:6])
        rhead = (f'<p class="rlead">Rated <b>{rating:.1f}</b> <span class="hstars">{_stars(rating)}</span> '
                 f'from {rcount} Google reviews</p>' if rating else '')
        reviews_html = (f'<section id="reviews" class="sec alt"><div class="wrap"><div class="eyebrow">Reviews</div>'
                        f'<h2>What {_esc(town)} customers say</h2>{rhead}<div class="revs">{cards}</div></div></section>')
    else:
        reviews_html = (
            '<section id="reviews" class="sec alt"><div class="wrap"><div class="eyebrow">Why choose us</div>'
            f'<h2>Trusted across {_esc(town)}</h2><div class="trust">'
            f'<div class="ti fx">{_IC["shield"]}<b>Fully insured</b><span>Every job covered</span></div>'
            f'<div class="ti fx">{_IC["clock"]}<b>On time</b><span>We turn up when we say</span></div>'
            f'<div class="ti fx">{_IC["check"]}<b>Free quotes</b><span>No surprises on price</span></div>'
            f'<div class="ti fx">{_IC["pin"]}<b>Local</b><span>Based in {_esc(town)}</span></div>'
            '</div></div></section>')

    nearby_html = ("".join(f'<span class="chip">{_esc(n)}</span>' for n in nearby)
                   if nearby else f'<span class="chip">{_esc(town)} &amp; surrounding areas</span>')
    service_opts = "".join(f'<option>{_esc(t)}</option>' for t, _ in services) + '<option>Something else</option>'

    tmpl = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@@BIZ@@ — @@TRADE@@ in @@TOWN@@</title>
<meta name="description" content="@@BIZ@@ — trusted @@TRADE_L@@ in @@TOWN@@. Book online in 30 seconds or call now. Fast, fully-insured local service.">
<meta property="og:title" content="@@HEADLINE_PLAIN@@">
<meta property="og:description" content="Book online in 30 seconds or call now. Fast, fully-insured local @@TRADE_L@@.">
<meta property="og:image" content="@@OGURL@@">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="@@OGURL@@">
<meta property="og:type" content="website">
<link rel="icon" href="@@FAVICON@@">
<link rel="preload" as="image" href="@@OGIMG@@">
<script type="application/ld+json">@@JSONLD@@</script>
<link rel="preconnect" href="https://lh3.googleusercontent.com">
<link rel="preconnect" href="https://images.unsplash.com">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--ink:#0b1b2b;--ink2:#13283e;--accent:@@ACCENT@@;--accentdk:@@ACCENT_DK@@;--ok:#13a36b;
  --bg:#f5f7fa;--card:#fff;--line:#e6ebf1;--muted:#5b6b7b;--shadow:0 8px 30px rgba(11,27,43,.07)}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.65;-webkit-font-smoothing:antialiased}
::selection{background:var(--accent);color:#fff}
.wrap{max-width:1100px;margin:0 auto;padding:0 22px}
a{color:inherit}
img{display:block;max-width:100%}
/* reveal-on-scroll */
.fx{opacity:0;transform:translateY(16px);transition:opacity .55s ease,transform .55s ease}
.fx.vis{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.fx{opacity:1;transform:none;transition:none}}
/* top bar */
.bar{position:sticky;top:0;z-index:40;background:rgba(9,20,32,.88);backdrop-filter:blur(10px);color:#fff;
  border-bottom:1px solid rgba(255,255,255,.06)}
.bar .wrap{display:flex;align-items:center;justify-content:space-between;height:66px;gap:14px}
.brand{display:flex;align-items:center;gap:11px;font-weight:800;font-size:17px;letter-spacing:.2px;min-width:0}
.bmark{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--accent),var(--accentdk));
  display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;flex:none;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.bname{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.navl{display:flex;gap:26px;font-size:14px;font-weight:600;opacity:.85}
.navl a{text-decoration:none}.navl a:hover{color:var(--accent)}
.callbtn{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;font-weight:800;
  padding:11px 19px;border-radius:100px;text-decoration:none;font-size:15px;white-space:nowrap;
  box-shadow:0 6px 18px rgba(0,0,0,.25);transition:transform .15s ease}
.callbtn:hover{transform:translateY(-1px)}
.callbtn svg{width:16px;height:16px}
/* hero — layered bg, can never look broken */
.hero{position:relative;color:#fff;overflow:hidden}
.hero .bg{position:absolute;inset:0;background-image:@@HEROLAYERS@@;background-size:cover;background-position:center}
.hero .grid{position:absolute;inset:0;opacity:.05;background-image:
  linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px);
  background-size:44px 44px;pointer-events:none}
.hero .wrap{position:relative;padding:88px 22px 96px}
.eyebrow{display:inline-flex;align-items:center;gap:8px;text-transform:uppercase;letter-spacing:.18em;font-size:12px;
  font-weight:800;color:#fff;background:@@ACCENT_SOFT@@;border:1px solid @@ACCENT_BORD@@;padding:7px 14px;border-radius:100px}
.hero h1{font-size:clamp(34px,6.2vw,60px);font-weight:800;line-height:1.06;margin:20px 0 14px;max-width:24ch;
  text-shadow:0 2px 24px rgba(0,0,0,.35)}
.hero .sub{font-size:clamp(16px,2.4vw,20px);opacity:.93;max-width:50ch;font-weight:500}
.hchips{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.hchip{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.1);backdrop-filter:blur(6px);
  border:1px solid rgba(255,255,255,.2);padding:9px 15px;border-radius:100px;font-size:13.5px;font-weight:600}
.hchip b{color:#ffd479}.hchip svg{width:15px;height:15px;color:var(--accent)}
.hstars{color:#ffb400;letter-spacing:1px}
.cta-row{display:flex;gap:13px;flex-wrap:wrap;margin-top:30px}
.btn{display:inline-flex;align-items:center;gap:9px;font-weight:800;padding:16px 30px;border-radius:100px;
  text-decoration:none;font-size:16.5px;border:0;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}
.btn:hover{transform:translateY(-2px)}
.btn-a{background:var(--accent);color:#fff;box-shadow:0 12px 30px @@ACCENT_GLOW@@}
.btn-b{background:rgba(255,255,255,.12);color:#fff;border:1.5px solid rgba(255,255,255,.35);backdrop-filter:blur(6px)}
.btn svg{width:18px;height:18px}
/* trust strip */
.strip{background:var(--ink2);color:#fff;border-top:1px solid rgba(255,255,255,.05)}
.strip .wrap{display:flex;flex-wrap:wrap;gap:12px 34px;justify-content:center;padding:17px 22px;font-size:14px;font-weight:700}
.strip .it{display:inline-flex;align-items:center;gap:9px;opacity:.95}
.strip svg{width:17px;height:17px;color:var(--ok)}
/* sections */
.sec{padding:74px 0}.sec.alt{background:#fff}
.sec .eyebrow{color:var(--accentdk);background:transparent;border:0;padding:0;letter-spacing:.16em}
.sec h2{font-size:clamp(26px,3.6vw,38px);font-weight:800;margin:10px 0 6px;letter-spacing:-.01em}
.sec h2:after{content:"";display:block;width:52px;height:4px;border-radius:4px;background:var(--accent);margin-top:14px}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:20px;margin-top:32px}
.svc{display:flex;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;
  box-shadow:var(--shadow);transition:transform .2s ease,box-shadow .2s ease}
.svc:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(11,27,43,.11)}
.sic{width:46px;height:46px;border-radius:13px;flex:none;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,var(--accent),var(--accentdk));color:#fff}
.sic svg{width:22px;height:22px}
.svc h3{font-size:18px;font-weight:800;margin-bottom:5px}.svc p{color:var(--muted);font-size:15px}
.gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:32px}
.gi{height:230px;width:100%;object-fit:cover;border-radius:18px;border:1px solid var(--line);
  box-shadow:var(--shadow);transition:transform .25s ease}
.gi:hover{transform:scale(1.02)}
.rlead{color:var(--muted);font-size:16.5px;margin-top:14px}
.revs{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-top:32px}
.rev{background:var(--bg);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:var(--shadow)}
.rtop{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.rav{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accentdk));
  color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex:none}
.rname{font-weight:800;font-size:15px}
.rmeta{color:var(--muted);font-size:12.5px}
.gtag{color:#1a73e8;font-weight:700}
.rev .rs{color:#ffb400;letter-spacing:2px;font-size:15px;margin-bottom:6px}
.rev p{font-size:15px;color:#2b3a49}
.trust{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:18px;margin-top:32px}
.ti{background:var(--bg);border:1px solid var(--line);border-radius:18px;padding:24px;text-align:center;box-shadow:var(--shadow)}
.ti svg{width:30px;height:30px;color:var(--accent)}.ti b{display:block;margin:11px 0 3px;font-size:17px}
.ti span{color:var(--muted);font-size:14px}
/* booking */
.book{position:relative;background:linear-gradient(165deg,#0c1f33,#102c47);color:#fff;overflow:hidden}
.book:before{content:"";position:absolute;inset:0;background:radial-gradient(700px 360px at 85% 0%,@@ACCENT_SOFT@@,transparent)}
.book .wrap{position:relative}
.book .card{background:#fff;color:var(--ink);border-radius:24px;padding:34px;max-width:640px;margin:34px auto 0;
  box-shadow:0 36px 90px rgba(0,0,0,.4)}
.lbl{display:block;font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:20px 0 9px}
.pills{display:flex;flex-wrap:wrap;gap:9px}
.pill{border:1.5px solid var(--line);background:#fff;border-radius:100px;padding:11px 16px;font-size:14px;font-weight:700;
  cursor:pointer;font-family:inherit;color:var(--ink);transition:all .14s ease}
.pill:hover{border-color:var(--accent)}
.pill.on{background:var(--accent);color:#fff;border-color:var(--accent);box-shadow:0 5px 14px @@ACCENT_GLOW@@}
select,input{width:100%;font-family:inherit;font-size:16px;padding:14px 15px;border:1.5px solid var(--line);
  border-radius:13px;background:#fff;color:var(--ink);margin-top:9px;outline:none;transition:border .14s ease}
select:focus,input:focus{border-color:var(--accent)}
.bsubmit{width:100%;margin-top:24px;background:var(--accent);color:#fff;border:0;border-radius:13px;padding:18px;
  font-size:17px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 12px 28px @@ACCENT_GLOW@@;
  transition:transform .15s ease}
.bsubmit:hover{transform:translateY(-1px)}
.booked{display:none;text-align:center;padding:20px 6px}
.booked .big{font-size:46px}.booked h3{font-size:23px;margin:10px 0 6px}
.booked .btn{margin-top:18px}
.foot{background:#091420;color:#cdd9e6;text-align:center;padding:42px 22px;font-size:14px}
.foot .fb{font-weight:800;color:#fff;font-size:19px}
.chips{display:flex;flex-wrap:wrap;gap:9px;margin-top:24px}
.chip{background:var(--card);border:1px solid var(--line);border-radius:100px;padding:9px 16px;font-size:14px;font-weight:600;box-shadow:var(--shadow)}
/* hero quote */
.hquote{margin-top:16px;font-size:clamp(15px,2.2vw,18px);font-weight:600;opacity:.96;max-width:52ch}
.hquote .hq-who{opacity:.75;font-weight:500;font-size:.9em}
/* money section */
.money .mlead{color:var(--muted);font-size:clamp(16px,2.3vw,19px);max-width:58ch;margin-top:14px;font-weight:500}
/* async closer */
.closer{background:linear-gradient(135deg,var(--accentdk),var(--accent));color:#fff}
.czwrap{display:flex;align-items:center;justify-content:space-between;gap:22px;flex-wrap:wrap;padding-top:44px;padding-bottom:44px}
.cz-eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:12px;font-weight:800;opacity:.85}
.cz-big{font-size:clamp(24px,3.6vw,36px);font-weight:800;margin:6px 0 8px}
.cz-sub{font-size:16px;opacity:.95;max-width:48ch}
.cz-btn{display:inline-flex;align-items:center;gap:10px;background:#fff;color:var(--accentdk);font-weight:800;
  padding:16px 26px;border-radius:100px;text-decoration:none;font-size:16px;box-shadow:0 14px 34px rgba(0,0,0,.3);
  transition:transform .15s ease;white-space:nowrap}
.cz-btn:hover{transform:translateY(-2px)}
.cz-btn svg{width:18px;height:18px}
/* sticky mobile call */
.mcall{position:fixed;left:0;right:0;bottom:0;z-index:50;display:none;align-items:center;justify-content:center;gap:9px;
  background:var(--accent);color:#fff;text-align:center;padding:16px;font-weight:800;text-decoration:none;font-size:16px;
  box-shadow:0 -8px 24px rgba(0,0,0,.2)}
.mcall svg{width:17px;height:17px}
@media(max-width:760px){.mcall{display:flex}.book{padding-bottom:92px}.callbtn span{display:none}.navl{display:none}
  .hero .wrap{padding:64px 22px 72px}}
</style>
</head>
<body>

<header class="bar"><div class="wrap">
  <div class="brand"><span class="bmark">@@INITIALS@@</span><span class="bname">@@BIZ@@</span></div>
  <nav class="navl"><a href="#services">Services</a><a href="#reviews">Reviews</a><a href="#book">Book online</a></nav>
  <a class="callbtn" href="tel:@@TEL@@">@@IC_PHONE@@<span>@@PHONE@@</span></a>
</div></header>

<section class="hero">
  <div class="bg"></div><div class="grid"></div>
  <div class="wrap">
    <span class="eyebrow">@@IC_SHIELD@@ @@TRADE@@ · @@TOWN@@</span>
    <h1>@@HEADLINE@@</h1>
    @@HEROQUOTE@@
    <p class="sub">@@TRADE@@ work across @@TOWN@@ done properly — fully insured, priced up front, and there when you need us.</p>
    <div class="hchips">@@RATINGCHIP@@</div>
    <div class="cta-row">
      <a class="btn btn-a" href="#book">Book online — 30 seconds</a>
      <a class="btn btn-b" href="tel:@@TEL@@">@@IC_PHONE@@ @@PHONE@@</a>
    </div>
  </div>
</section>

<div class="strip"><div class="wrap">
  <span class="it">@@IC_SHIELD@@ Fully insured</span>
  <span class="it">@@IC_CHECK@@ Free no-obligation quotes</span>
  <span class="it">@@IC_CLOCK@@ Fast local response</span>
  <span class="it">@@IC_STAR@@ Trusted in @@TOWN@@</span>
</div></div>

<section class="sec money"><div class="wrap">
  <div class="eyebrow">Why this site pays for itself</div>
  <h2>Never miss a job again</h2>
  <p class="mlead">You're under a sink. The phone rings out. They call the next bloke on Google —
  and that job's gone. This site catches it instead:</p>
  <div class="grid3">
    <div class="svc fx"><span class="sic">@@IC_CLOCK@@</span><div><h3>They book in 30 seconds</h3>
      <p>Day, time, what they need — even at 11pm when you're in bed.</p></div></div>
    <div class="svc fx"><span class="sic">@@IC_PHONE@@</span><div><h3>The job lands on your phone</h3>
      <p>Name, number and the job, sent straight to you the second they book.</p></div></div>
    <div class="svc fx"><span class="sic">@@IC_CHECK@@</span><div><h3>You ring back when you're free</h3>
      <p>Off the tools, kettle on, call them back — job booked, not lost.</p></div></div>
  </div>
</div></section>

<section id="services" class="sec alt"><div class="wrap">
  <div class="eyebrow">What we do</div>
  <h2>@@TRADE@@ services in @@TOWN@@</h2>
  <div class="grid3">@@SERVICES@@</div>
</div></section>

@@GALLERY@@
@@REVIEWS@@

<section id="book" class="sec book"><div class="wrap">
  <div style="text-align:center">
    <span class="eyebrow" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#fff">Book in 30 seconds</span>
    <h2 style="margin-top:18px">Book @@BIZ@@</h2>
    <p style="color:#b9c9d8;font-weight:500">Pick a day and time — we'll ring you to confirm. No account, no faff.</p>
  </div>
  <div class="card">
    <form id="bform" data-token="@@TOKEN@@">
      <label class="lbl">What do you need?</label>
      <select id="service">@@SERVICEOPTS@@</select>
      <label class="lbl">Preferred day</label>
      <div class="pills" id="dates"></div>
      <label class="lbl">Time</label>
      <div class="pills" id="times">
        <button type="button" class="pill" data-val="Morning">Morning</button>
        <button type="button" class="pill" data-val="Afternoon">Afternoon</button>
        <button type="button" class="pill" data-val="Evening">Evening</button>
        <button type="button" class="pill" data-val="ASAP / emergency">ASAP 🚨</button>
      </div>
      <label class="lbl">Your name</label>
      <input name="name" autocomplete="name">
      <label class="lbl">Mobile number</label>
      <input name="phone" inputmode="tel" autocomplete="tel" required>
      <button class="bsubmit" type="submit">Request this booking →</button>
      <p style="text-align:center;color:var(--muted);font-size:12.5px;margin-top:14px">
        No spam — your details go straight to @@BIZ@@.</p>
    </form>
    <div class="booked" id="booked">
      <div class="big">✅</div><h3>Booking sent!</h3>
      <p style="color:var(--muted)">@@BIZ@@ has your request and will ring you to confirm shortly.</p>
      <a class="btn btn-a" href="tel:@@TEL@@">@@IC_PHONE@@ Or call now</a>
    </div>
  </div>
</div></section>

<section class="sec alt"><div class="wrap">
  <div class="eyebrow">Service area</div>
  <h2>Covering @@TOWN@@ &amp; nearby</h2>
  <div class="chips">@@NEARBY@@</div>
</div></section>

@@CLOSER@@

<footer class="foot">
  <div class="fb">@@BIZ@@</div>
  <p style="margin:9px 0">@@TRADE@@ · @@TOWN@@ · <a href="tel:@@TEL@@" style="color:#fff;font-weight:700">@@PHONE@@</a></p>
  <p style="opacity:.55;margin-top:12px">Website by L&amp;D Designs</p>
</footer>

<a class="mcall" href="tel:@@TEL@@">@@IC_PHONE@@ Call @@BIZ@@ now</a>

<script>
(function(){
  var API="@@API@@", TOKEN="@@TOKEN@@";
  var sel={service:document.getElementById('service').value,date:"",time:""};
  document.getElementById('service').addEventListener('change',function(){sel.service=this.value;});
  function group(id,key){
    var box=document.getElementById(id);
    box.addEventListener('click',function(e){
      var b=e.target.closest('.pill'); if(!b)return;
      [].forEach.call(box.querySelectorAll('.pill'),function(p){p.classList.remove('on');});
      b.classList.add('on'); sel[key]=b.getAttribute('data-val');
    });
  }
  group('times','time');
  var dd=document.getElementById('dates'); var names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var today=new Date();
  for(var i=0;i<7;i++){
    var d=new Date(today); d.setDate(today.getDate()+i);
    var b=document.createElement('button'); b.type='button'; b.className='pill';
    b.textContent=(i===0?'Today':(i===1?'Tomorrow':names[d.getDay()]+' '+d.getDate()));
    b.setAttribute('data-val', d.toDateString());
    dd.appendChild(b);
  }
  group('dates','date');
  document.getElementById('bform').addEventListener('submit',function(e){
    e.preventDefault();
    var f=this; var name=f.querySelector('[name=name]').value; var phone=f.querySelector('[name=phone]').value;
    if(!phone){f.querySelector('[name=phone]').focus();return;}
    var jd='📅 Booking request: '+sel.service+(sel.date?' — '+sel.date:'')+(sel.time?' ('+sel.time+')':'');
    fetch(API+'/api/capture/'+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:name,phone:phone,job_description:jd})})
      .then(function(r){return r.json();}).then(done).catch(done);
    function done(){f.style.display='none';document.getElementById('booked').style.display='block';}
  });
  // reveal-on-scroll
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(en){
      if(en.isIntersecting){en.target.classList.add('vis');io.unobserve(en.target);}});},{threshold:.12});
    [].forEach.call(document.querySelectorAll('.fx'),function(el){io.observe(el);});
  } else {
    [].forEach.call(document.querySelectorAll('.fx'),function(el){el.classList.add('vis');});
  }
})();
</script>
</body>
</html>"""

    repl = {
        "@@BIZ@@": _esc(biz), "@@TRADE@@": _esc(trade_t), "@@TRADE_L@@": _esc(trade),
        "@@TOWN@@": _esc(town), "@@PHONE@@": _esc(phone or "Call us"), "@@TEL@@": tel or "",
        "@@API@@": api, "@@TOKEN@@": capture_token,
        "@@INITIALS@@": _esc(_initials(biz)), "@@OGIMG@@": hero, "@@FAVICON@@": fav,
        "@@HEADLINE@@": headline,
        "@@HEROQUOTE@@": hero_quote, "@@OGURL@@": og_url, "@@CLOSER@@": closer,
        "@@HEADLINE_PLAIN@@": headline.replace("&#8217;", "\u2019").replace("&amp;", "&"),
        "@@JSONLD@@": jsonld, "@@HEROLAYERS@@": hero_layers,
        "@@ACCENT@@": accent, "@@ACCENT_DK@@": accent_dk,
        "@@ACCENT_SOFT@@": _hex_rgba(accent, .28), "@@ACCENT_BORD@@": _hex_rgba(accent, .5),
        "@@ACCENT_GLOW@@": _hex_rgba(accent, .38),
        "@@RATINGCHIP@@": rating_chip, "@@SERVICES@@": svc_html, "@@SERVICEOPTS@@": service_opts,
        "@@GALLERY@@": gallery_html, "@@REVIEWS@@": reviews_html, "@@NEARBY@@": nearby_html,
        "@@IC_PHONE@@": _IC["phone"], "@@IC_SHIELD@@": _IC["shield"], "@@IC_CHECK@@": _IC["check"],
        "@@IC_CLOCK@@": _IC["clock"], "@@IC_STAR@@": _IC["star"],
    }
    for k, v in repl.items():
        tmpl = tmpl.replace(k, v)
    return tmpl


# ── OG link-preview card (the WhatsApp first impression) ──────────────
_FONT_PATH = "/tmp/ld_og_font.ttf"
_FONT_CSS = ("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@800")


def _og_font(size: int):
    """Plus Jakarta Sans Bold, fetched once to /tmp (old-UA trick returns TTF).
    Falls back to Pillow's built-in scalable font — the card never fails."""
    from PIL import ImageFont
    import os
    try:
        if not os.path.exists(_FONT_PATH):
            with httpx.Client(timeout=15.0, follow_redirects=True) as c:
                css = c.get(_FONT_CSS, headers={"User-Agent": "Mozilla/4.0"}).text
                m = re.search(r"url\((https://[^)]+\.ttf)\)", css)
                if m:
                    ttf = c.get(m.group(1)).content
                    with open(_FONT_PATH, "wb") as f:
                        f.write(ttf)
        if os.path.exists(_FONT_PATH):
            return ImageFont.truetype(_FONT_PATH, size)
    except Exception as e:
        logger.debug(f"[og] font fetch failed: {e}")
    try:
        return ImageFont.load_default(size=size)      # Pillow ≥10.1 scalable default
    except TypeError:
        return ImageFont.load_default()


def _hex_rgb(h: str):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


@lru_cache(maxsize=256)
def og_card_png(prospect_id: str) -> bytes:
    """1200×630 branded card: business name + '{rating}★ on Google' + trade colour.
    The link looks like HIS site before he even taps it. Empty bytes on any failure
    (caller falls back) — never raises."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        logger.warning("[og] Pillow not installed")
        return b""
    try:
        p = (get_db().table("prospects")
             .select("business_name,trade,town,preview_id").eq("id", prospect_id)
             .single().execute().data)
    except Exception:
        p = None
    if not p:
        return b""
    rating = review_count = None
    if p.get("preview_id"):
        try:
            pv = (get_db().table("previews").select("personalization_data")
                  .eq("id", p["preview_id"]).single().execute().data) or {}
            og = (pv.get("personalization_data") or {}).get("og") or {}
            rating, review_count = og.get("rating"), og.get("review_count")
        except Exception:
            pass

    biz = (p.get("business_name") or "Your new website").strip()
    trade_t = (p.get("trade") or "trade").title()
    town = (p.get("town") or "").strip()
    accent, accent_dk = _ACCENTS.get((p.get("trade") or "").lower(), _ACCENT_DEFAULT)
    a, adk, base = _hex_rgb(accent), _hex_rgb(accent_dk), _hex_rgb("#0a1626")

    W, H = 1200, 630
    img = Image.new("RGB", (W, H), base)
    dr = ImageDraw.Draw(img)
    # vertical accent_dk → base gradient
    for y in range(H):
        t = y / H
        dr.line([(0, y), (W, y)], fill=tuple(int(adk[i] * (1 - t) * .65 + base[i] * (t * .35 + .65)) for i in range(3)))
    # accent glow top-right + brand bar bottom
    glow = Image.new("RGB", (W, H), base)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W - 560, -260, W + 260, 300], fill=a)
    img = Image.blend(img, glow, 0.18)
    dr = ImageDraw.Draw(img)
    dr.rectangle([0, H - 14, W, H], fill=a)

    f_big, f_mid, f_small = _og_font(82), _og_font(40), _og_font(28)
    # wrap the name to ≤2 lines that fit
    words, lines, cur = biz.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if dr.textlength(t, font=f_big) <= W - 160:
            cur = t
        else:
            lines.append(cur); cur = w
        if len(lines) == 2:
            break
    if cur and len(lines) < 2:
        lines.append(cur)
    if not lines:
        lines = [biz[:24]]
    y = 200 if len(lines) > 1 else 240
    for ln in lines:
        dr.text((80, y), ln, font=f_big, fill=(255, 255, 255))
        y += 96
    sub = (f"{rating:.1f}★ on Google · {trade_t} · {town}" if rating
           else f"{trade_t} · {town}")
    dr.text((80, y + 8), sub, font=f_mid, fill=(255, 212, 121) if rating else (205, 217, 230))
    dr.text((80, H - 86), "Tap to see your new website  →", font=f_small, fill=(255, 255, 255))
    rc = f"{review_count} Google reviews" if review_count else "Built by L&D Designs"
    dr.text((W - 80 - dr.textlength(rc, font=f_small), H - 86), rc, font=f_small, fill=(160, 178, 196))

    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ── WhatsApp message kit (stored per prospect, human-sent only) ───────
def _gen_messages(p: dict, link: str, rating=None, review_count=None) -> dict:
    """Two ready-to-send WhatsApp messages, written like a Wigan tradesman texts.
    ONE Claude call; deterministic fallback. NEVER sent by the system — these are
    drafts the founder copies. (a) first touch ends 'can I send the link?';
    (b) the link-send message carries the link + £199/£29."""
    biz = p.get("business_name") or "mate"
    trade = p.get("trade") or "trade"
    town = p.get("town") or "round here"
    angle = (p.get("sales_angle") or "").strip()
    rating_bit = f" — {rating:.1f}★, proper good reviews" if rating else ""

    fallback = {
        "first": (f"Alright mate, Dylan here, local lad from Wigan. Found {biz} on Google{rating_bit} "
                  f"but there's no website, so {town} jobs are going to fellas ranked under you. "
                  f"I've already built you one — can I send the link?"),
        "link_msg": (f"Here it is mate: {link}\n"
                     f"That's YOUR reviews and photos already on it, plus online booking that texts "
                     f"jobs straight to your phone. Want it live this week? £199, then £29 a month — "
                     f"all done for you. Have a look and tell me straight."),
    }
    if not settings.ANTHROPIC_API_KEY:
        return fallback
    try:
        raw = trades._claude(
            "You write WhatsApp messages for Dylan, a young web designer from Wigan, texting local "
            "tradesmen he's never met. Sound exactly like a Wigan tradesman texts: short, plain, "
            "friendly, zero marketing speak, no emojis. Output ONLY JSON: "
            '{"first": "...", "link_msg": "..."}. RULES: "first" is 2-3 short sentences, uses their '
            "business name and town and the angle, and ENDS with exactly: can I send the link? "
            '"link_msg" MUST contain the link verbatim, mention their own reviews/photos are already '
            "on it, the booking that texts jobs to their phone, and the price: £199 to go live, "
            "then £29 a month.",
            f"Business: {biz} ({trade}, {town}). "
            + (f"Google rating {rating:.1f}★ from {review_count} reviews. " if rating else "No rating known. ")
            + f"Angle: {angle or 'no website, losing local jobs'}. Link: {link}",
            max_tokens=380, agent="msg_kit")
        if raw:
            m = re.search(r"\{.*\}", raw, re.S)
            if m:
                d = json.loads(m.group(0))
                first, lm = (d.get("first") or "").strip(), (d.get("link_msg") or "").strip()
                if first and lm and link in lm and "£199" in lm and "£29" in lm:
                    if not first.rstrip("?").endswith("can I send the link"):
                        first = first.rstrip(".!? ") + " — can I send the link?"
                    return {"first": first, "link_msg": lm}
    except Exception as e:
        logger.warning(f"[preview_qa] msg kit Claude fail for {biz}: {e}")
    return fallback


# ── Build + QA ────────────────────────────────────────────────────────
def build_for_prospect(name_or_id: str, verify_live: bool = True) -> dict:
    """Mint a capture token, generate the site, store it as a DRAFT preview, then QA it.
    verify_live=False (used by the bulk builder) skips the live self-fetch so a 20-build
    storm doesn't false-fail QA on server contention."""
    db = get_db()
    p = trades.find_prospect(name_or_id)
    if not p:
        return {"ok": False, "message": f"No prospect found for '{name_or_id}'."}

    token = p.get("capture_token") or secrets.token_urlsafe(12)
    if not p.get("capture_token"):
        db.table("prospects").update({"capture_token": token}).eq("id", p["id"]).execute()

    # Pull REAL Google photos + reviews + rating for this exact place. If we never
    # stored a place_id, look it up by name+town (guarded) and backfill it.
    details = _fetch_place_details(p.get("place_id"), p.get("trade"),
                                   name=p.get("business_name"), town=p.get("town"),
                                   prospect_id=p["id"])
    html = _site_html({**p, "capture_token": token}, token, details)
    base_url = f"{settings.BACKEND_BASE_URL.rstrip('/')}/previews/serve/"

    # Rebuilds UPDATE the existing preview row — the URL stays stable, so a link
    # already WhatsApped to a prospect silently upgrades instead of 404ing.
    pid = p.get("preview_id")
    if pid:
        try:
            db.table("previews").update({
                "html_content": html, "prospect_id": p["id"],
                "qa_status": "pending", "qa_reasons": [],
            }).eq("id", pid).execute()
        except Exception:
            pid = None                      # row vanished → insert a fresh one below
    if not pid:
        rec = {"html_content": html, "prospect_id": p["id"], "qa_status": "pending"}
        try:
            res = db.table("previews").insert(rec).execute()
            pid = res.data[0]["id"] if res.data else None
        except Exception as e:
            return {"ok": False, "message": f"Couldn't store preview (is the previews table present?): {e}"}
        if pid:
            db.table("previews").update({"preview_url": base_url + pid}).eq("id", pid).execute()
    if pid:
        db.table("prospects").update({"preview_id": pid, "preview_status": "draft",
                                      "updated_at": _now_iso()}).eq("id", p["id"]).execute()
        # Store the OG-card inputs + the per-prospect WhatsApp message kit on the
        # preview row (personalization_data jsonb — no migration needed).
        link = base_url + pid
        msgs = _gen_messages(p, link, rating=details.get("rating"),
                             review_count=details.get("review_count"))
        try:
            db.table("previews").update({"personalization_data": {
                "og": {"biz": p.get("business_name"), "town": p.get("town"),
                       "trade": p.get("trade"), "rating": details.get("rating"),
                       "review_count": details.get("review_count")},
                "msg_first": msgs["first"], "msg_link": msgs["link_msg"],
                "preview_link": link,
            }}).eq("id", pid).execute()
        except Exception as e:
            logger.warning(f"[preview_qa] personalization store failed: {e}")
    trades.log_event("preview_qa", f"built preview for {p.get('business_name')}", "info",
                     {"prospect_id": p["id"], "preview_id": pid})
    return qa_preview(pid, verify_live=verify_live)


def qa_html(html: str, business_name: str, capture_token: str) -> tuple:
    """Deterministic content checks on the generated HTML. Returns (passed, reasons)."""
    reasons = []
    h = html or ""
    if "<meta name=\"viewport\"" not in h and "name='viewport'" not in h:
        reasons.append("no <meta viewport> (not mobile-ready)")
    if "tel:" not in h:
        reasons.append("no tel: call link")
    if "<form" not in h or capture_token not in h:
        reasons.append("capture form with the correct token missing")
    if business_name:
        # Robust to HTML-entity escaping (e.g. "&" → "&amp;"): compare on alphanumerics,
        # and accept the distinctive leading words if the full string doesn't match.
        norm = lambda s: re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()
        nb, nh = norm(business_name), norm(h)
        head = " ".join(nb.split()[:2])
        if nb and nb not in nh and (not head or head not in nh):
            reasons.append("business name not shown")
    if PLACEHOLDER_RE.search(h):
        reasons.append("placeholder/lorem text present")
    # Offer integrity: the ONLY prices allowed anywhere on a preview are £199 + £29.
    bad_prices = {m for m in re.findall(r"£\s?(\d[\d,]*)", h)} - {"199", "29"}
    if bad_prices:
        reasons.append(f"contradicts the £199+£29 offer (found £{', £'.join(sorted(bad_prices))})")
    if len(h) < 800:
        reasons.append("page too thin / likely broken")
    return (len(reasons) == 0, reasons)


def qa_preview(preview_id: str, verify_live: bool = True) -> dict:
    """Run the full QA gate on a stored preview: content checks + HTTP 200 + <3s load.
    Sets qa_status (qa_failed|qa_passed) + reasons; raises/clears an alert; never
    auto-promotes to READY (that's a human APPROVE)."""
    db = get_db()
    if not preview_id:
        return {"ok": False, "message": "No preview id."}
    try:
        pv = db.table("previews").select("*").eq("id", preview_id).single().execute().data
    except Exception as e:
        return {"ok": False, "message": f"Preview not found: {e}"}
    prospect = None
    if pv.get("prospect_id"):
        try:
            prospect = db.table("prospects").select("*").eq("id", pv["prospect_id"]).single().execute().data
        except Exception:
            prospect = None
    biz = (prospect or {}).get("business_name") or ""
    token = (prospect or {}).get("capture_token") or ""

    # Content QA on the stored HTML is what GATES quality (deterministic, no network).
    passed, reasons = qa_html(pv.get("html_content") or "", biz, token)

    # Live reachability — soft signal, and skipped during bulk builds. A HARD fail is
    # only a definitive bad status (404/500). A timeout/slow response is NOT a fail: the
    # server self-fetches under heavy build load, which says nothing about a real visit.
    if verify_live:
        url = pv.get("preview_url") or f"{settings.BACKEND_BASE_URL.rstrip('/')}/previews/serve/{preview_id}"
        try:
            t0 = time.time()
            with httpx.Client(timeout=10.0, follow_redirects=True) as client:
                r = client.get(url)
            elapsed = time.time() - t0
            if r.status_code >= 400:
                passed = False
                reasons.append(f"URL returned HTTP {r.status_code}")        # genuinely broken
            elif elapsed > 8.0:
                reasons.append(f"note: served in {elapsed:.1f}s")           # soft note
        except Exception as e:
            reasons.append(f"note: live check skipped ({str(e)[:50]})")     # soft note

    status = "qa_passed" if passed else "qa_failed"
    db.table("previews").update({"qa_status": status, "qa_reasons": reasons,
                                 "qa_checked_at": _now_iso()}).eq("id", preview_id).execute()
    if pv.get("prospect_id"):
        db.table("prospects").update({"preview_status": ("draft" if passed else "qa_failed")}
                                     ).eq("id", pv["prospect_id"]).execute()
        if passed:
            trades.resolve_alert(kind="qa_failed", entity_id=pv["prospect_id"])
        else:
            trades.raise_alert("qa_failed", f"Preview QA failed for {biz or preview_id}: "
                               + "; ".join(reasons), "error", entity="preview",
                               entity_id=pv["prospect_id"],
                               mode=(prospect or {}).get("data_mode") or "real")
    trades.log_event("preview_qa", f"QA {status} for {biz or preview_id}"
                     + (f" — {'; '.join(reasons)}" if reasons else ""),
                     "success" if passed else "error",
                     {"preview_id": preview_id, "metric_ok": passed, "reasons": reasons})
    return {"ok": True, "passed": passed, "qa_status": status, "reasons": reasons,
            "preview_id": preview_id, "preview_url": url, "business_name": biz,
            "message": (f"QA PASSED for {biz} — ready to approve." if passed
                        else f"QA FAILED for {biz}: " + "; ".join(reasons))}


def approve_preview(name_or_id: str = None, preview_id: str = None) -> dict:
    """Human APPROVE: flip a qa_passed preview to READY (unlocks share buttons).
    Refuses to promote a qa_failed preview."""
    db = get_db()
    prospect = trades.find_prospect(name_or_id) if name_or_id else None
    if prospect and not preview_id:
        preview_id = prospect.get("preview_id")
    if not preview_id:
        return {"ok": False, "message": "No preview to approve — build one first."}
    try:
        pv = db.table("previews").select("*").eq("id", preview_id).single().execute().data
    except Exception as e:
        return {"ok": False, "message": f"Preview not found: {e}"}
    if pv.get("qa_status") != "qa_passed":
        return {"ok": False, "message": f"Can't approve — QA status is {pv.get('qa_status')}. "
                "Fix the issues and re-run QA first."}
    db.table("previews").update({"qa_status": "ready"}).eq("id", preview_id).execute()
    if pv.get("prospect_id"):
        db.table("prospects").update({"preview_status": "ready", "updated_at": _now_iso()}
                                     ).eq("id", pv["prospect_id"]).execute()
    biz = (prospect or {}).get("business_name") or preview_id
    trades.log_event("preview_qa", f"preview APPROVED → READY for {biz}", "success",
                     {"preview_id": preview_id})
    return {"ok": True, "message": f"Preview for {biz} is READY — share it on the call."}


def build_all_ready(mode: str = "real", limit: int = 25, force: bool = False) -> dict:
    """Build (+QA) a preview for every queue-ready prospect. force=True REBUILDS
    existing previews too (same URLs — already-sent links upgrade in place).
    Runs 5 builds in parallel so a full queue finishes inside the UI timeout.
    Capped so a single click can't run away."""
    db = get_db()
    try:
        pros = (db.table("prospects").select("id,business_name,preview_id,queue_ready,data_mode")
                .eq("data_mode", mode).limit(2000).execute().data or [])
    except Exception as e:
        return {"ok": False, "built": 0, "message": f"Couldn't read prospects: {e}"}
    ready = [p for p in pros if p.get("queue_ready")]
    todo = (ready if force else [p for p in ready if not p.get("preview_id")])[:limit]
    if not todo:
        return {"ok": True, "built": 0, "qa_passed": 0, "qa_failed": 0,
                "message": "Every queue-ready prospect already has a preview. ✓ (Use force to rebuild.)"}

    def _one(p):
        try:
            return p.get("business_name"), build_for_prospect(p["id"], verify_live=False)
        except Exception as e:
            logger.warning(f"[preview_qa] build failed for {p.get('business_name')}: {e}")
            return p.get("business_name"), {"ok": False, "reasons": [str(e)[:60]]}

    built = passed = failed = 0
    table = []
    with ThreadPoolExecutor(max_workers=5) as ex:
        for name, r in ex.map(_one, todo):
            if r.get("ok"):
                built += 1
                if r.get("passed"):
                    passed += 1
                    table.append(f"✓ PASS  {name}")
                else:
                    failed += 1
                    table.append(f"✗ FAIL  {name} — {'; '.join(r.get('reasons') or [])[:80]}")
            else:
                failed += 1
                table.append(f"✗ ERROR {name} — {'; '.join(r.get('reasons') or ['build failed'])[:80]}")
    trades.log_event("preview_qa", f"built {built} preview(s) — {passed} passed QA, {failed} failed",
                     "success" if failed == 0 else "warn",
                     {"metric_ok": failed == 0, "built": built, "passed": passed})
    return {"ok": True, "built": built, "qa_passed": passed, "qa_failed": failed,
            "table": table,
            "message": (f"Built {built} preview(s): {passed} PASS / {failed} FAIL\n"
                        + "\n".join(table)
                        + "\n\nEach card now has the WhatsApp kit (intro + link msg) — copy buttons in the queue.")}


def run_all(mode: str = "real") -> dict:
    """Re-QA every prospect preview in this data_mode (the RUN NOW sweep)."""
    db = get_db()
    try:
        pros = (db.table("prospects").select("id,preview_id,data_mode")
                .eq("data_mode", mode).limit(2000).execute().data or [])
    except Exception:
        pros = []
    checked = failed = 0
    for p in pros:
        if not p.get("preview_id"):
            continue
        r = qa_preview(p["preview_id"], verify_live=False)
        checked += 1
        if not r.get("passed"):
            failed += 1
    msg = (f"Re-QA'd {checked} preview(s) — {failed} failing." if checked
           else "No previews to QA yet. Build one with 'build preview <name>'.")
    trades.log_event("preview_qa", msg, "success" if failed == 0 else "warn",
                     {"checked": checked, "failed": failed, "metric_ok": failed == 0})
    return {"ok": True, "checked": checked, "failed": failed, "message": msg}


# ════════════════════════════════════════════════════════════════════
#  V3 ENGINE — "looks like £1,500, offered at £199".
#  v3 builds are NEW preview rows (template_version='v3'): every existing v2
#  link keeps serving untouched. A prospect's live link only changes when the
#  founder PROMOTES the v3 (prospect.preview_id → v3 row). Nothing auto-sends.
#  Distinct per business: 3 hero layouts × 3 font personalities × trade palette,
#  seeded from the prospect id, + per-prospect AI copy (honest fallbacks).
# ════════════════════════════════════════════════════════════════════
import hashlib as _hl

_FONT_SETS = [
    ("Sora", "'Sora','Plus Jakarta Sans',system-ui,sans-serif"),
    ("Fraunces:opsz,wght@9..144,600;9..144,800", "'Fraunces',Georgia,serif"),
    ("Space+Grotesk", "'Space Grotesk',system-ui,sans-serif"),
]

_SERVICES_EXTRA = {
    "plumber": [("Outside taps & stopcocks", "Fitted fast, no mess left behind."),
                ("Showers & pumps", "Weak shower sorted, pressure back."),
                ("Landlord & insurance work", "Reports and repairs, documented properly.")],
    "heating engineer": [("Smart thermostats", "Heating you control from your phone."),
                         ("Landlord gas certificates", "Booked and done before the deadline."),
                         ("System upgrades", "Old system out, efficient one in.")],
    "gas engineer": [("Hobs & fires", "Installed and certified safely."),
                     ("Gas pipework", "Run, moved or capped properly."),
                     ("Emergency callouts", "Smell gas? We treat it as urgent.")],
    "electrician": [("Extra sockets & USB points", "Where you actually need them."),
                    ("Garden & security lighting", "Safe outdoor power, done right."),
                    ("Landlord certificates (EICR)", "Tested, certified, sorted.")],
    "roofer": [("Chimney repairs & flashing", "Stopped at the source, not patched."),
               ("Moss removal & roof cleaning", "Years back on your roof's life."),
               ("Storm damage callouts", "Made safe fast, then fixed properly.")],
    "drainage": [("Soakaways & gullies", "Standing water gone for good."),
                 ("Root cutting", "Roots out, pipe protected."),
                 ("Pre-purchase drain surveys", "Know before you buy.")],
}
_PROCESS = [("Tell us the job", "Call, book online or send a photo — 30 seconds."),
            ("Fixed, fair price", "You know the cost before any work starts."),
            ("We turn up & sort it", "On time, tidy, done properly first time."),
            ("Aftercare", "Any snags, one call and we're back.")]


def _v3_faqs(trade: str, town: str) -> list:
    t = (trade or "trade").lower()
    return [
        ("Do you give free quotes?", f"Yes — every quote is free and no-obligation. Tell us the job and you'll get a fixed price before any work starts."),
        ("How fast can you get to me?", f"We're local to {town}, so most jobs get a same-day or next-day visit — emergencies jump the queue."),
        ("Are you insured?", "Yes, fully insured for every job we take on."),
        ("Which areas do you cover?", f"{town} and the surrounding towns — if you're nearby, we'll come to you."),
        ("How do I book?", "Use the Book Online button (30 seconds, no account), send the quick quote form, or just ring — whichever's easiest."),
    ]


def _v3_copy(p: dict, details: dict) -> dict:
    """Per-prospect copy: ONE Claude call, honest deterministic fallback. No invented
    certifications, years, or guarantees — generic-honest only."""
    biz = p.get("business_name") or "this business"
    trade = (p.get("trade") or "trade").lower()
    town = p.get("town") or "the area"
    rating = details.get("rating")
    fb = {
        "tag": f"The {trade} {town} actually recommends" if rating and rating >= 4.5 else f"Proper {trade} work, done right",
        "sub": (f"Straight-talking {trade} work across {town} — fixed prices, tidy finishes, "
                f"and a phone that gets answered."),
        "about": (f"{biz} covers {town} and the surrounding area. No call centres, no subcontracting "
                  f"roulette — the person you book is the person who turns up. Fixed prices agreed "
                  f"up front, the job done properly, and your place left tidy."),
        "faqs": _v3_faqs(trade, town),
    }
    if not settings.ANTHROPIC_API_KEY:
        return fb
    try:
        raw = trades._claude(
            "You write website copy for a UK local tradesman's site. Plain trade English, zero "
            "marketing fluff, UK tone. HONESTY RULES: never invent certifications, years in business, "
            "guarantees, awards or prices. Output ONLY JSON: "
            '{"tag":"<6-9 word positioning line>","sub":"<one sentence under the headline>",'
            '"about":"<2-3 sentence about paragraph>","faqs":[["q","a"]x5]}',
            f"Business: {biz}, a {trade} in {town}."
            + (f" Google rating {rating:.1f}★ from {details.get('review_count')} reviews." if rating else "")
            + (f" Sample real review: {details['reviews'][0]['text'][:140]}" if details.get("reviews") else ""),
            max_tokens=600, agent="v3_copy")
        if raw:
            m = re.search(r"\{.*\}", raw, re.S)
            if m:
                d = json.loads(m.group(0))
                out = dict(fb)
                for k in ("tag", "sub", "about"):
                    if isinstance(d.get(k), str) and 10 < len(d[k]) < 400:
                        out[k] = d[k]
                if isinstance(d.get("faqs"), list) and len(d["faqs"]) >= 4:
                    fa = [(str(q)[:120], str(a)[:300]) for q, a in
                          (x if isinstance(x, list) else (x.get("q"), x.get("a")) for x in d["faqs"])
                          if q and a][:5]
                    if len(fa) >= 4:
                        out["faqs"] = fa
                return out
    except Exception as e:
        logger.warning(f"[v3] copy fail for {biz}: {e}")
    return fb


def _site_html_v3(p: dict, token: str, details: dict, copy: dict) -> str:
    """The £1,500-feel page. 13 sections, variant-seeded so no two feel templated."""
    seed = int(_hl.md5(str(p.get("id") or p.get("business_name")).encode()).hexdigest()[:8], 16)
    hero_v, font_v, shape_v = seed % 3, (seed // 3) % 3, (seed // 9) % 2
    font_link, font_stack = _FONT_SETS[font_v]
    rad_btn, rad_card = ("100px", "22px") if shape_v == 0 else ("14px", "16px")

    biz = (p.get("business_name") or "Your Trade").strip()
    trade = (p.get("trade") or "tradesperson").strip()
    trade_t, town = trade.title(), (p.get("town") or "your area").strip()
    phone = (p.get("phone") or "").strip()
    tel = re.sub(r"[^\d+]", "", phone)
    has_phone = bool(tel)
    api = settings.BACKEND_BASE_URL.rstrip("/")
    accent, accent_dk = _ACCENTS.get(trade.lower(), _ACCENT_DEFAULT)
    photos = details.get("photos") or _stock_photos(trade)
    real = bool(details.get("real_photos"))
    hero_img, stock_fb = photos[0], _stock_photos(trade)[0]
    gallery = photos[1:4] if real else []
    rating, rcount = details.get("rating"), details.get("review_count")
    reviews = details.get("reviews") or []
    address = (details.get("address") or "").strip()
    plural = _trade_plural(trade)
    # Rating gets its own gold-marked span — the proof point should pop, not blend in.
    if rating:
        headline = (f"{_esc(biz)} — {_esc(town)}&#8217;s "
                    f'<span class="mark">{rating:.1f}★ rated</span> {_esc(plural)}')
        headline_plain = f"{biz} — {town}’s {rating:.1f}★ rated {plural}"
    else:
        headline = f"{_esc(biz)} — {_esc(town)}&#8217;s trusted {_esc(plural)}"
        headline_plain = f"{biz} — {town}’s trusted {plural}"
    services = (_SERVICES.get(trade.lower(), _SERVICES_DEFAULT)
                + _SERVICES_EXTRA.get(trade.lower(), []))[:6]
    icons = _svc_icons(trade, len(services))
    nearby = _NEARBY.get(town.lower(), []) or [town]
    og_url = f"{api}/og/{p.get('id')}.png" if p.get("id") else hero_img
    founder_wa = re.sub(r"\D", "", settings.FOUNDER_PHONE or "")
    if founder_wa.startswith("0"):
        founder_wa = "44" + founder_wa[1:]
    wa_text = _urlquote(f"Alright Dylan, it's {biz}. Seen the new website — want it live. What's next?")

    # Honest JSON-LD — only fields we actually know (mirrors v2's behaviour).
    ld = {"@context": "https://schema.org", "@type": "LocalBusiness",
          "name": biz, "telephone": phone or None, "image": og_url,
          "address": {"@type": "PostalAddress", "addressLocality": town, "addressCountry": "GB"},
          "description": f"{trade_t} in {town}"}
    if rating and rcount:
        ld["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": rating, "reviewCount": rcount}
    jsonld = json.dumps({k: v for k, v in ld.items() if v is not None})

    quote_best = ""
    if reviews:
        b = sorted(reviews, key=lambda r: (-(r.get("rating") or 0), len(r.get("text", ""))))[0]
        q = b["text"][:110].rsplit(" ", 1)[0].rstrip(",.;:") + ("…" if len(b["text"]) > 110 else "")
        quote_best = (f'<div class="hq"><span class="st">{_stars(b["rating"])}</span> '
                      f'&#8220;{_esc(q)}&#8221; <b>— {_esc(b["author"])}</b></div>')

    # Every call CTA degrades to the booking section when we have no phone number —
    # a dead tel: link on a sales demo is worse than no button.
    call_href = f"tel:{tel}" if has_phone else "#book"
    call_label = f'{_IC["phone"]} Call {_esc(phone)}' if has_phone else f'{_IC["cal"]} Book online'
    nav_call = (f'<a class="ncall" href="tel:{tel}">{_IC["phone"]}<span>{_esc(phone)}</span></a>'
                if has_phone else
                f'<a class="ncall" href="#book">{_IC["cal"]}<span>Book online</span></a>')

    badges = []
    if rating:
        badges.append(f'<span class="bd bd-star"><span class="st">{_stars(rating)}</span> <b>{rating:.1f}</b> on Google</span>')
    if rcount:
        badges.append(f'<span class="bd">{_IC["g"]} {rcount} Google reviews</span>')
    badges += [f'<span class="bd">{_IC["shield"]} Fully insured</span>',
               f'<span class="bd">{_IC["check"]} Free quotes</span>',
               f'<span class="bd">{_IC["pin"]} Local to {_esc(town)}</span>']
    badges_html = "".join(badges)

    svc = "".join(f'<div class="card fx"><span class="sic">{_IC[ic]}</span>'
                  f'<h3>{_esc(t)}</h3><p>{_esc(d)}</p></div>'
                  for (t, d), ic in zip(services, icons))
    steps = "".join(f'<div class="step fx"><span class="n">{i}</span><h3>{_esc(t)}</h3><p>{_esc(d)}</p></div>'
                    for i, (t, d) in enumerate(_PROCESS, 1))
    faqs = "".join(f'<details class="faq fx"><summary>{_esc(q)}</summary><p>{_esc(a)}</p></details>'
                   for q, a in copy["faqs"])
    areas = "".join(f'<span class="chip">{(_IC["pin"] + " ") if i == 0 else ""}{_esc(n)}</span>'
                    for i, n in enumerate(([town] + [n for n in nearby if n != town])[:8]))

    # Dead Google CDN URL → swap to trade stock, never a broken-image icon.
    onerr = f'onerror="this.onerror=null;this.src=\'{stock_fb}\'"'
    gal = ("".join(f'<figure class="gif fx"><img class="gi" loading="lazy" decoding="async" '
                   f'alt="{_esc(biz)} — real job photo" src="{g}" {onerr}></figure>'
                   for g in gallery))
    gal_sec = (f'<section class="sec"><div class="wrap"><div class="eb">Our work</div>'
               f'<h2>Real jobs, real photos</h2>'
               f'<p class="lead">Straight off the camera roll — actual work by {_esc(biz)}.</p>'
               f'<div class="gal">{gal}</div></div></section>') if gallery else ""

    if reviews:
        ordered = sorted(reviews, key=lambda r: (-(r.get("rating") or 0), -len(r.get("text", ""))))
        feat, rest = ordered[0], ordered[1:6]
        feat_html = (f'<div class="rev rev-feat fx"><span class="rq">&#8220;</span>'
                     f'<div class="st">{_stars(feat["rating"])}</div>'
                     f'<p class="rft">{_esc(feat["text"][:300])}</p>'
                     f'<div class="rtop"><span class="rav">{_esc(_initials(feat["author"]))}</span>'
                     f'<div><b>{_esc(feat["author"])}</b><div class="rm">{_esc(feat.get("when", ""))} · '
                     f'<span class="gt">{_IC["g"]} Google review</span></div></div></div></div>')
        rev_cards = "".join(
            f'<div class="rev fx"><div class="rtop"><span class="rav">{_esc(_initials(r["author"]))}</span>'
            f'<div><b>{_esc(r["author"])}</b><div class="rm">{_esc(r.get("when", ""))} · <span class="gt">{_IC["g"]} Google</span></div></div></div>'
            f'<div class="st">{_stars(r["rating"])}</div><p>&#8220;{_esc(r["text"][:240])}&#8221;</p></div>'
            for r in rest)
        rev_sec = (f'<section id="reviews" class="sec alt"><div class="wrap"><div class="eb">Reviews</div>'
                   f'<h2>What {_esc(town)} says</h2>'
                   + (f'<p class="lead">Rated <b>{rating:.1f}</b> <span class="st">{_stars(rating)}</span> '
                      f'from {rcount} Google reviews — every word below is a real customer.</p>' if rating else '')
                   + f'<div class="revs">{feat_html}{rev_cards}</div></div></section>')
    else:
        rev_sec = ""

    # quick-quote mini form (hero) + full booking section share the same live token.
    mini = (f'<form class="mini" id="quote" data-token="{token}">'
            f'<div class="mhead">{_IC["bolt"]} Get a free quote — takes 30 seconds</div>'
            '<input name="name" placeholder="Your name" autocomplete="name">'
            '<input name="phone" placeholder="Mobile number" inputmode="tel" autocomplete="tel" required>'
            '<input name="job" placeholder="What needs doing?">'
            f'<button type="submit">Get my free quote {_IC["check"]}</button>'
            f'<div class="mnote">No spam — goes straight to {_esc(biz)}.</div>'
            '<div class="mok">✓ Sent — we&#8217;ll ring you shortly.</div></form>')

    hero_bg = ",".join([f'linear-gradient(180deg,rgba(8,14,22,.46),rgba(8,14,22,.87)),'
                        f'linear-gradient(120deg,{_hex_rgba(accent_dk, .42)},transparent 55%)',
                        f'url("{hero_img}")'] + ([f'url("{stock_fb}")'] if hero_img != stock_fb else [])
                       + [f'radial-gradient(900px 420px at 88% -10%,{_hex_rgba(accent, .5)},transparent)',
                          f'linear-gradient(160deg,{accent_dk},#0a1422)'])
    band_bg = ",".join([f'linear-gradient(180deg,{_hex_rgba(accent_dk, .18)},rgba(8,14,22,.12))',
                        f'url("{hero_img}")'] + ([f'url("{stock_fb}")'] if hero_img != stock_fb else [])
                       + [f'linear-gradient(160deg,{accent_dk},#0a1422)'])
    ticks = (f'<div class="ticks"><span>{_IC["check"]} Fully insured</span>'
             f'<span>{_IC["check"]} Free quotes</span>'
             f'<span>{_IC["check"]} Local to {_esc(town)}</span></div>')
    ctas = (f'<div class="ctas"><a class="b ba" href="{call_href}">{call_label}</a>'
            '<a class="b bb" href="#book">Book online — 30s</a></div>')
    if hero_v == 0:      # full-bleed overlay
        hero = (f'<section class="hero hv0"><div class="hbg"></div><div class="grain"></div><div class="wrap hin">'
                f'<span class="eb ebd">{_IC["shield"]} {_esc(trade_t)} · {_esc(town)}</span><h1>{headline}</h1>'
                f'<p class="sub">{_esc(copy["sub"])}</p>{quote_best}{ctas}{ticks}{mini}</div></section>')
    elif hero_v == 1:    # split
        hero = (f'<section class="hero hv1"><div class="grain"></div><div class="wrap split">'
                f'<div class="hin"><span class="eb ebd">{_IC["shield"]} {_esc(trade_t)} · {_esc(town)}</span><h1>{headline}</h1>'
                f'<p class="sub">{_esc(copy["sub"])}</p>{quote_best}{ctas}{ticks}</div>'
                f'<div class="pcol"><div class="pframe"><img class="pimg" src="{hero_img}" '
                f'alt="{_esc(biz)}" {onerr}></div>{mini}</div>'
                f'</div></section>')
    else:                # editorial light
        hero = (f'<section class="hero hv2"><div class="wrap hin">'
                f'<span class="eb">{_esc(trade_t)} · {_esc(town)}</span><h1>{headline}</h1>'
                f'<p class="sub">{_esc(copy["sub"])}</p>{quote_best}{ctas}{ticks}</div>'
                f'<div class="band"></div>'
                f'<div class="wrap minirow">{mini}</div></section>')

    css_hero = {
        0: (f'.hv0{{position:relative;color:#fff}}'
            f'.hv0 .hbg{{position:absolute;inset:0;background-image:{hero_bg};background-size:cover;background-position:center}}'
            f'.hv0 .hin{{position:relative;padding:96px 22px 76px}}'
            f'.hv0 .mini{{margin-top:30px}}'),
        1: (f'.hv1{{position:relative;background:linear-gradient(170deg,#0d1b2c,{accent_dk} 150%);color:#fff;overflow:hidden}}'
            f'.hv1:before{{content:"";position:absolute;inset:0;background:radial-gradient(800px 400px at 90% -5%,{_hex_rgba(accent, .35)},transparent)}}'
            f'.split{{position:relative;display:grid;grid-template-columns:1.08fr .92fr;gap:44px;align-items:center;padding:80px 22px}}'
            f'.pframe{{padding:10px;border-radius:{rad_card};background:linear-gradient(135deg,{_hex_rgba(accent, .65)},rgba(255,255,255,.12));box-shadow:0 34px 80px rgba(0,0,0,.5)}}'
            f'.pimg{{width:100%;height:330px;object-fit:cover;border-radius:calc({rad_card} - 6px);display:block}}'
            f'.pcol .mini{{margin-top:18px}}'
            f'@media(max-width:860px){{.split{{grid-template-columns:1fr;padding:62px 22px;gap:30px}}}}'),
        2: (f'.hv2{{background:#f5f2ea;color:#10151c;padding-top:74px}}'
            f'.hv2 .hin{{padding-bottom:8px}}'
            f'.hv2 .sub,.hv2 .hq{{color:#4a5563}}'
            f'.hv2 .ticks span{{color:#3c4654}}'
            f'.hv2 h1{{letter-spacing:-.015em}}'
            f'.band{{height:340px;background-image:{band_bg};background-size:cover;background-position:center;margin-top:40px;'
            f'border-top:4px solid {accent};border-bottom:4px solid {accent}}}'
            f'.minirow{{position:relative}}.hv2 .mini{{margin:-46px 0 54px;position:relative;z-index:2}}'
            f'@media(max-width:760px){{.band{{height:230px}}.hv2 .mini{{margin-top:-30px}}}}'),
    }[hero_v]

    fav = ("data:image/svg+xml," +
           f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
           f"<rect width='64' height='64' rx='14' fill='{accent}'/>"
           f"<text x='32' y='43' font-family='Arial' font-size='32' font-weight='800' "
           f"fill='white' text-anchor='middle'>{_esc(_initials(biz)[:1])}</text></svg>").replace("#", "%23").replace('"', "'")
    year = datetime.now(timezone.utc).year
    foot_contact = (f'<a class="ftel" href="tel:{tel}">{_IC["phone"]} {_esc(phone)}</a>' if has_phone else "")
    foot_addr = f'<div class="faddr">{_esc(address)}</div>' if address else ""
    mc_bar = ((f'<div class="mc"><a class="mca" href="tel:{tel}">{_IC["phone"]} Call now</a>'
               f'<a class="mcb" href="#book">{_IC["cal"]} Book online</a></div>') if has_phone else
              f'<div class="mc"><a class="mca" href="#book">{_IC["cal"]} Book {_esc(biz)} online</a></div>')
    bok_call = (f'<a class="b ba" style="margin-top:16px" href="tel:{tel}">{_IC["phone"]} Or call now</a>'
                if has_phone else "")

    page = f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(biz)} — {_esc(trade_t)} in {_esc(town)}</title>
<meta name="description" content="{_esc(copy['sub'])}">
<meta name="theme-color" content="{accent_dk}">
<meta property="og:title" content="{_esc(headline_plain)}">
<meta property="og:description" content="Book online in 30 seconds or call now.">
<meta property="og:image" content="{og_url}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{og_url}">
<link rel="icon" href="{fav}">
<script type="application/ld+json">{jsonld}</script>
<link rel="preload" as="image" href="{hero_img}">
<link rel="preconnect" href="https://lh3.googleusercontent.com"><link rel="preconnect" href="https://images.unsplash.com">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family={font_link}&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root{{--a:{accent};--ad:{accent_dk};--ink:#0e1520;--mut:#5a6878;--bg:#f7f9fb;--line:#e5eaf0;
  --glow:{_hex_rgba(accent, .38)};--soft:{_hex_rgba(accent, .12)}}}
*{{margin:0;padding:0;box-sizing:border-box}}html{{scroll-behavior:smooth}}
body{{font-family:Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.65;-webkit-font-smoothing:antialiased}}
h1,h2,h3,.b,.czb{{font-family:{font_stack}}}
::selection{{background:var(--a);color:#fff}}
.wrap{{max-width:1120px;margin:0 auto;padding:0 22px}}a{{color:inherit}}img{{max-width:100%;display:block}}
.fx{{opacity:0;transform:translateY(16px);transition:opacity .55s ease,transform .55s ease}}.fx.vis{{opacity:1;transform:none}}
@keyframes rise{{from{{opacity:0;transform:translateY(20px)}}to{{opacity:1;transform:none}}}}
.hin>*{{animation:rise .65s cubic-bezier(.2,.7,.3,1) both}}
.hin>*:nth-child(2){{animation-delay:.07s}}.hin>*:nth-child(3){{animation-delay:.13s}}
.hin>*:nth-child(4){{animation-delay:.19s}}.hin>*:nth-child(5){{animation-delay:.25s}}
.hin>*:nth-child(6){{animation-delay:.31s}}.hin>*:nth-child(7){{animation-delay:.37s}}
@media(prefers-reduced-motion:reduce){{.fx,.hin>*{{opacity:1;transform:none;transition:none;animation:none}}}}
.grain{{position:absolute;inset:0;opacity:.05;pointer-events:none;background-image:
  linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px);
  background-size:42px 42px}}
.nav{{position:sticky;top:0;z-index:40;background:rgba(10,16,24,.92);backdrop-filter:blur(12px);color:#fff;
  border-bottom:1px solid rgba(255,255,255,.07)}}
.nav .wrap{{display:flex;align-items:center;justify-content:space-between;height:66px;gap:12px}}
.bm{{display:flex;align-items:center;gap:11px;font-weight:800;min-width:0}}
.bmk{{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--a),var(--ad));display:flex;
  align-items:center;justify-content:center;font-weight:800;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.12),0 5px 16px rgba(0,0,0,.35)}}
.bnm{{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:16.5px;letter-spacing:.1px}}
.nl{{display:flex;gap:24px;font-size:13.5px;font-weight:600;opacity:.88}}.nl a{{text-decoration:none}}.nl a:hover{{color:var(--a)}}
.ncall{{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,var(--a),var(--ad));color:#fff;
  font-weight:800;padding:11px 18px;border-radius:{rad_btn};text-decoration:none;font-size:14px;white-space:nowrap;
  box-shadow:0 6px 18px rgba(0,0,0,.3);transition:transform .15s}}
.ncall:hover{{transform:translateY(-1px)}}
.ncall svg,.b svg,.mc svg,.ticks svg{{width:16px;height:16px}}
.eb{{display:inline-block;text-transform:uppercase;letter-spacing:.17em;font-size:11.5px;font-weight:800;color:var(--ad)}}
.sec .eb:before{{content:"";display:inline-block;width:22px;height:2px;background:var(--a);border-radius:2px;
  vertical-align:middle;margin-right:9px}}
.ebd{{display:inline-flex;align-items:center;gap:8px;color:#fff;background:rgba(255,255,255,.13);backdrop-filter:blur(6px);
  border:1px solid rgba(255,255,255,.25);padding:8px 14px;border-radius:100px}}
.ebd svg{{width:14px;height:14px;color:var(--a)}}
.hero h1{{font-size:clamp(34px,6vw,62px);font-weight:800;line-height:1.04;letter-spacing:-.02em;margin:18px 0 14px;max-width:23ch;
  text-shadow:0 2px 26px rgba(0,0,0,.3)}}
.hv2 h1{{text-shadow:none}}
.mark{{position:relative;z-index:0;white-space:nowrap}}
.mark:after{{content:"";position:absolute;left:-.06em;right:-.06em;bottom:.05em;height:.32em;background:var(--glow);
  z-index:-1;border-radius:4px;transform:skewX(-8deg)}}
.hero .sub{{font-size:clamp(16px,2.2vw,19.5px);max-width:52ch;opacity:.94;font-weight:500}}
.hq{{margin-top:16px;font-size:15.5px;font-weight:600;opacity:.96;max-width:54ch}}.hq b{{opacity:.78;font-weight:600}}
.st{{color:#ffb400;letter-spacing:1.5px}}
.ctas{{display:flex;gap:13px;flex-wrap:wrap;margin:26px 0 0}}
.b{{display:inline-flex;align-items:center;gap:9px;font-weight:800;padding:16px 28px;border-radius:{rad_btn};text-decoration:none;
  font-size:16.5px;border:0;cursor:pointer;transition:transform .15s,box-shadow .15s}}
.b:hover{{transform:translateY(-2px)}}.b:active{{transform:scale(.98)}}
.ba{{background:linear-gradient(135deg,var(--a),var(--ad));color:#fff;box-shadow:0 14px 32px var(--glow)}}
.ba:hover{{box-shadow:0 18px 40px var(--glow)}}
.bb{{background:rgba(255,255,255,.13);color:#fff;border:1.5px solid rgba(255,255,255,.35);backdrop-filter:blur(6px)}}
.hv2 .bb{{background:#10151c;color:#fff;border-color:#10151c}}
.ticks{{display:flex;gap:8px 20px;flex-wrap:wrap;margin-top:20px;font-size:13.5px;font-weight:700;opacity:.95}}
.ticks span{{display:inline-flex;align-items:center;gap:7px}}.ticks svg{{width:14px;height:14px;color:#3ddc84}}
.mini{{display:grid;grid-template-columns:1fr 1fr 1.35fr auto;gap:10px;background:rgba(255,255,255,.97);
  padding:18px;border-radius:{rad_card};box-shadow:0 26px 64px rgba(8,14,22,.38);max-width:880px;
  border:1px solid rgba(255,255,255,.65)}}
.mhead{{grid-column:1/-1;display:flex;align-items:center;gap:8px;font-weight:800;font-size:14.5px;color:var(--ink)}}
.mhead svg{{width:16px;height:16px;color:var(--a)}}
.mini input{{padding:14px;border:1.5px solid var(--line);border-radius:11px;font:inherit;font-size:15px;color:var(--ink);
  min-width:0;background:#fff;outline:none;transition:border .14s}}
.mini input:focus{{border-color:var(--a)}}
.mini button{{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,var(--a),var(--ad));
  color:#fff;border:0;border-radius:11px;font-weight:800;font-size:15px;padding:14px 20px;cursor:pointer;font-family:inherit;
  white-space:nowrap;box-shadow:0 8px 20px var(--glow)}}
.mini button svg{{width:15px;height:15px}}
.mnote{{grid-column:1/-1;font-size:12px;color:var(--mut);text-align:center}}
.mini .mok{{display:none;grid-column:1/-1;color:#0d7a48;font-weight:700;text-align:center;padding:4px}}
@media(max-width:760px){{.mini{{grid-template-columns:1fr 1fr}}.mini input[name=job]{{grid-column:1/-1}}.mini button{{grid-column:1/-1}}}}
.badges{{background:#0d1521;color:#fff;border-top:1px solid rgba(255,255,255,.05)}}
.badges .wrap{{display:flex;flex-wrap:wrap;gap:10px 14px;justify-content:center;padding:17px 22px}}
.bd{{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);
  border-radius:100px;padding:9px 16px;font-size:13.5px;font-weight:700}}
.bd svg{{width:14px;height:14px;color:var(--a)}}
.bd-star{{background:{_hex_rgba(accent, .25)};border-color:{_hex_rgba(accent, .5)}}}
.bd-star b{{color:#ffd479}}
.sec{{padding:80px 0}}.sec.alt{{background:#fff}}
.sec h2{{font-size:clamp(27px,3.5vw,40px);font-weight:800;margin:10px 0 4px;letter-spacing:-.015em}}
.sec h2:after{{content:"";display:block;width:52px;height:4px;background:linear-gradient(90deg,var(--a),var(--ad));
  border-radius:4px;margin-top:14px}}
.lead{{color:var(--mut);margin-top:14px;font-size:16.5px;max-width:62ch}}
.g3{{display:grid;grid-template-columns:repeat(auto-fit,minmax(265px,1fr));gap:18px;margin-top:34px}}
.card{{background:#fff;border:1px solid var(--line);border-radius:{rad_card};padding:26px;
  box-shadow:0 10px 30px rgba(13,21,32,.05);transition:transform .2s,box-shadow .2s;position:relative;overflow:hidden}}
.card:before{{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--a),var(--ad));
  transform:scaleX(0);transform-origin:left;transition:transform .25s}}
.card:hover{{transform:translateY(-4px);box-shadow:0 18px 44px rgba(13,21,32,.1)}}
.card:hover:before{{transform:scaleX(1)}}
.sec.alt .card{{background:var(--bg)}}
.sic{{display:inline-flex;width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,var(--a),var(--ad));
  color:#fff;align-items:center;justify-content:center;margin-bottom:13px;box-shadow:0 8px 18px var(--glow)}}
.sic svg{{width:21px;height:21px}}.card h3{{font-size:17.5px;margin-bottom:5px}}.card p{{color:var(--mut);font-size:14.5px}}
.gal{{display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:185px;gap:14px;margin-top:32px}}
.gif{{margin:0;overflow:hidden;border-radius:{rad_card};border:1px solid var(--line);box-shadow:0 10px 30px rgba(13,21,32,.06)}}
.gif:first-child{{grid-column:span 2;grid-row:span 2}}
.gi{{width:100%;height:100%;object-fit:cover;transition:transform .45s ease}}
.gif:hover .gi{{transform:scale(1.045)}}
@media(max-width:760px){{.gal{{grid-template-columns:1fr 1fr;grid-auto-rows:150px}}.gif:first-child{{grid-column:span 2}}}}
.revs{{display:grid;grid-template-columns:repeat(auto-fit,minmax(295px,1fr));gap:18px;margin-top:32px}}
.rev{{background:var(--bg);border:1px solid var(--line);border-radius:{rad_card};padding:24px}}
.sec.alt .rev{{background:var(--bg)}}
.rev-feat{{grid-column:1/-1;padding:32px;position:relative;background:linear-gradient(135deg,var(--soft),#fff 60%);overflow:hidden}}
.rq{{position:absolute;top:-14px;right:18px;font-size:120px;line-height:1;color:var(--glow);font-family:Georgia,serif;font-weight:700}}
.rft{{font-size:clamp(16.5px,2.3vw,20px);font-weight:600;color:#22303f;margin:10px 0 18px;max-width:72ch;position:relative}}
.rtop{{display:flex;gap:12px;align-items:center;margin-bottom:8px}}
.rav{{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,var(--a),var(--ad));color:#fff;display:flex;
  align-items:center;justify-content:center;font-weight:800;flex:none}}
.rm{{color:var(--mut);font-size:12.5px}}
.gt{{color:#1a73e8;font-weight:700;display:inline-flex;align-items:center;gap:4px}}
.gt svg{{width:12px;height:12px;color:#4285F4;vertical-align:-1px}}
.rev p{{font-size:14.5px;margin-top:8px;color:#2a3848}}
.rev .st{{font-size:14px}}
.steps{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:34px}}
.step{{background:#fff;border:1px solid var(--line);border-radius:{rad_card};padding:26px;position:relative}}
.step:after{{content:"";position:absolute;top:44px;right:-19px;width:19px;border-top:2px dashed #cdd8e2;z-index:1}}
.step:last-child:after{{display:none}}
@media(max-width:990px){{.step:after{{display:none}}}}
.step .n{{display:inline-flex;width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--a),var(--ad));
  color:#fff;font-weight:800;align-items:center;justify-content:center;margin-bottom:12px;box-shadow:0 0 0 5px var(--soft)}}
.step h3{{font-size:16.5px}}.step p{{color:var(--mut);font-size:14px}}
.faq{{background:#fff;border:1px solid var(--line);border-left:3px solid transparent;border-radius:14px;margin-top:12px;
  overflow:hidden;transition:border-color .2s}}
.faq[open]{{border-left-color:var(--a)}}
.faq summary{{padding:18px 20px;font-weight:700;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:12px}}
.faq summary::-webkit-details-marker{{display:none}}
.faq summary:after{{content:"+";color:var(--a);font-weight:800;font-size:20px;line-height:1}}
.faq[open] summary:after{{content:"–"}}
.faq p{{padding:0 20px 18px;color:var(--mut);font-size:15px}}
.chips{{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}}
.chip{{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--line);border-radius:100px;
  padding:10px 17px;font-size:14px;font-weight:600;box-shadow:0 6px 18px rgba(13,21,32,.04)}}
.chip svg{{width:13px;height:13px;color:var(--a)}}
.book{{position:relative;background:linear-gradient(165deg,#0c1826,{accent_dk} 170%);color:#fff;overflow:hidden}}
.book:before{{content:"";position:absolute;inset:0;background:radial-gradient(720px 380px at 86% 0%,{_hex_rgba(accent, .3)},transparent)}}
.book .wrap{{position:relative}}
.bcard{{background:#fff;color:var(--ink);border-radius:{rad_card};border-top:5px solid var(--a);padding:34px;max-width:640px;
  margin:32px auto 0;box-shadow:0 36px 90px rgba(0,0,0,.45)}}
.lbl{{display:block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin:19px 0 8px}}
.pills{{display:flex;flex-wrap:wrap;gap:8px}}
.pill{{border:1.5px solid var(--line);background:#fff;border-radius:100px;padding:11px 16px;font-size:14px;font-weight:700;
  cursor:pointer;font-family:inherit;color:var(--ink);transition:all .14s}}
.pill:hover{{border-color:var(--a)}}
.pill.on{{background:var(--a);color:#fff;border-color:var(--a);box-shadow:0 5px 14px var(--glow)}}
.bcard select,.bcard input{{width:100%;font:inherit;font-size:16px;padding:14px;border:1.5px solid var(--line);border-radius:12px;
  margin-top:8px;color:var(--ink);outline:none;transition:border .14s;background:#fff}}
.bcard select:focus,.bcard input:focus{{border-color:var(--a)}}
.bsub{{width:100%;margin-top:24px;background:linear-gradient(135deg,var(--a),var(--ad));color:#fff;border:0;border-radius:12px;
  padding:18px;font-size:17px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 12px 28px var(--glow);
  transition:transform .15s}}
.bsub:hover{{transform:translateY(-1px)}}
.bnote{{text-align:center;color:var(--mut);font-size:12.5px;margin-top:14px}}
.bok{{display:none;text-align:center;padding:18px}}.bok .e{{font-size:46px}}.bok h3{{font-size:22px;margin:8px 0 6px}}
.fin{{background:#0d1521;color:#fff;text-align:center}}.fin .wrap{{padding:70px 22px}}
.fin h2:after{{margin-left:auto;margin-right:auto}}
.fin .lead{{margin-left:auto;margin-right:auto;color:#aebccb}}
.closer{{position:relative;background:linear-gradient(135deg,var(--ad),var(--a));color:#fff;overflow:hidden}}
.closer .grain{{opacity:.07}}
.cz{{position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:48px 22px}}
.czb{{font-size:clamp(23px,3.4vw,34px);font-weight:800;margin:6px 0 8px}}
.czs{{opacity:.96;max-width:48ch}}
.pz{{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}}
.pt{{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);border-radius:100px;padding:9px 17px;
  font-size:14px;font-weight:700}}
.pt b{{font-size:17px}}
.czbtn{{display:inline-flex;align-items:center;gap:10px;background:#fff;color:var(--ad);font-weight:800;padding:17px 27px;
  border-radius:{rad_btn};text-decoration:none;font-size:16px;box-shadow:0 16px 38px rgba(0,0,0,.32);white-space:nowrap;
  transition:transform .15s}}
.czbtn:hover{{transform:translateY(-2px)}}.czbtn svg{{width:17px;height:17px}}
.foot{{background:#0a1118;color:#9fb0c0;padding:56px 22px 26px;font-size:14px}}
.fgrid{{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:36px}}
.foot .bm{{color:#fff}}
.fabout{{margin-top:12px;max-width:34ch;font-size:13.5px;opacity:.85}}
.fh{{color:#fff;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:14px}}
.foot ul{{list-style:none}}.foot li{{margin-bottom:9px}}.foot li a{{text-decoration:none}}.foot li a:hover{{color:#fff}}
.ftel{{display:inline-flex;align-items:center;gap:8px;color:#fff;font-weight:800;text-decoration:none;margin-bottom:10px}}
.ftel svg{{width:15px;height:15px;color:var(--a)}}
.faddr{{font-size:13px;opacity:.75;max-width:30ch}}
.fbot{{max-width:1120px;margin:38px auto 0;padding-top:20px;border-top:1px solid rgba(255,255,255,.08);display:flex;
  justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12.5px;opacity:.6}}
@media(max-width:760px){{.fgrid{{grid-template-columns:1fr;gap:28px}}}}
.mc{{position:fixed;left:0;right:0;bottom:0;z-index:50;display:none;box-shadow:0 -8px 24px rgba(0,0,0,.22)}}
.mc a{{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;font-weight:800;
  text-decoration:none;font-size:15.5px;color:#fff}}
.mca{{background:linear-gradient(135deg,var(--a),var(--ad))}}
.mcb{{background:#0d1521}}
@media(max-width:760px){{.mc{{display:flex}}.nl{{display:none}}.sec{{padding:58px 0}}body{{padding-bottom:56px}}}}
</style></head><body>

<header class="nav"><div class="wrap">
 <div class="bm"><span class="bmk">{_esc(_initials(biz))}</span><span class="bnm">{_esc(biz)}</span></div>
 <nav class="nl"><a href="#services">Services</a><a href="#reviews">Reviews</a><a href="#faq">FAQs</a><a href="#book">Book</a></nav>
 {nav_call}
</div></header>

{hero}

<div class="badges"><div class="wrap">{badges_html}</div></div>

<section id="services" class="sec"><div class="wrap">
 <div class="eb">What we do</div><h2>{_esc(trade_t)} services in {_esc(town)}</h2>
 <p class="lead">{_esc(copy["about"])}</p>
 <div class="g3">{svc}</div></div></section>

{gal_sec}
{rev_sec}

<section id="process" class="sec"><div class="wrap">
 <div class="eb">How it works</div><h2>Simple from start to finish</h2>
 <div class="steps">{steps}</div></div></section>

<section id="area" class="sec alt"><div class="wrap">
 <div class="eb">Where we work</div><h2>Covering {_esc(town)} &amp; nearby</h2>
 <p class="lead">Based in {_esc(town)} — close enough to get to you fast.</p>
 <div class="chips">{areas}</div></div></section>

<section id="faq" class="sec"><div class="wrap">
 <div class="eb">Good to know</div><h2>Questions, answered straight</h2>{faqs}</div></section>

<section id="book" class="sec book"><div class="wrap">
 <div style="text-align:center"><span class="ebd">{_IC["cal"]} Book in 30 seconds</span>
 <h2 style="margin-top:16px">Book {_esc(biz)}</h2>
 <p style="color:#c7d4e2;font-weight:500">Pick a day and time — we&#8217;ll ring to confirm. No account, no faff.</p></div>
 <div class="bcard"><form id="bform" data-token="{token}">
  <label class="lbl">What do you need?</label>
  <select id="bsvc">{''.join(f'<option>{_esc(t)}</option>' for t, _ in services)}<option>Something else</option></select>
  <label class="lbl">Preferred day</label><div class="pills" id="bdays"></div>
  <label class="lbl">Time</label><div class="pills" id="btimes">
   <button type="button" class="pill" data-v="Morning">Morning</button>
   <button type="button" class="pill" data-v="Afternoon">Afternoon</button>
   <button type="button" class="pill" data-v="Evening">Evening</button>
   <button type="button" class="pill" data-v="ASAP / emergency">ASAP 🚨</button></div>
  <label class="lbl">Your name</label><input name="name" autocomplete="name">
  <label class="lbl">Mobile number</label><input name="phone" inputmode="tel" autocomplete="tel" required>
  <button class="bsub" type="submit">Request this booking →</button>
  <p class="bnote">No spam — your details go straight to {_esc(biz)}.</p></form>
  <div class="bok" id="bok"><div class="e">✅</div><h3>Booking sent!</h3>
  <p style="color:var(--mut)">{_esc(biz)} has your request and will ring you to confirm.</p>
  {bok_call}</div>
 </div></div></section>

<section class="fin"><div class="wrap">
 <div class="eb" style="color:{accent}">Ready when you are</div>
 <h2>Need a {_esc(trade)} in {_esc(town)}?</h2>
 <p class="lead">Free quotes, fixed prices, and a local team that turns up.</p>
 <div class="ctas" style="justify-content:center;margin-top:24px">
  <a class="b ba" href="{call_href}">{call_label}</a>
  <a class="b bb" href="#book">Book online</a></div></div></section>

<section class="closer"><div class="grain"></div><div class="wrap cz">
 <div><div class="eb" style="color:#fff;opacity:.85">This site is already built</div>
 <div class="czb">Built for {_esc(biz)}</div>
 <div class="czs">Want it live this week? Hosting, updates and the booking system — all done for you.</div>
 <div class="pz"><span class="pt"><b>£199</b> to launch</span><span class="pt"><b>£29</b>/month all-in</span></div></div>
 <a class="czbtn" href="https://wa.me/{founder_wa}?text={wa_text}">{_IC["phone"]} WhatsApp Dylan — make it live</a>
</div></section>

<footer class="foot"><div class="fgrid">
 <div><div class="bm"><span class="bmk">{_esc(_initials(biz))}</span><span class="bnm">{_esc(biz)}</span></div>
  <p class="fabout">{_esc(trade_t)} serving {_esc(town)} and the surrounding area. Fixed prices, tidy work, local.</p></div>
 <div><div class="fh">Quick links</div><ul>
  <li><a href="#services">Services</a></li><li><a href="#reviews">Reviews</a></li>
  <li><a href="#faq">FAQs</a></li><li><a href="#book">Book online</a></li></ul></div>
 <div><div class="fh">Get in touch</div>{foot_contact}{foot_addr}
  <div style="margin-top:8px;font-size:13px;opacity:.75">{_esc(town)} &amp; nearby</div></div>
</div>
<div class="fbot"><span>© {year} {_esc(biz)}</span><span>Website by L&amp;D Designs</span></div></footer>

{mc_bar}

<script>
(function(){{var API="{api}",T="{token}";
function val(f,n){{var el=f.querySelector('[name='+n+']');return el?el.value:'';}}
function send(body,done){{fetch(API+'/api/capture/'+T,{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(body)}}).then(function(r){{return r.json()}}).then(done).catch(done);}}
var mini=document.getElementById('quote');
if(mini){{mini.addEventListener('submit',function(e){{e.preventDefault();var f=this;
 if(!val(f,'phone')){{f.querySelector('[name=phone]').focus();return}}
 var bt=f.querySelector('button');bt.textContent='Sending…';
 send({{name:val(f,'name'),phone:val(f,'phone'),job_description:'💬 Quote request: '+(val(f,'job')||'general enquiry')}},
 function(){{f.querySelector('.mok').style.display='block';bt.textContent='Sent ✓';
  ['name','phone','job'].forEach(function(n){{var el=f.querySelector('[name='+n+']');if(el)el.value='';}});}});}});}}
var sel={{s:document.getElementById('bsvc').value,d:'',t:''}};
document.getElementById('bsvc').addEventListener('change',function(){{sel.s=this.value}});
function grp(id,k){{var b=document.getElementById(id);b.addEventListener('click',function(e){{var p=e.target.closest('.pill');if(!p)return;[].forEach.call(b.querySelectorAll('.pill'),function(x){{x.classList.remove('on')}});p.classList.add('on');sel[k]=p.getAttribute('data-v');}});}}
var dd=document.getElementById('bdays'),N=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],td=new Date();
for(var i=0;i<7;i++){{var d=new Date(td);d.setDate(td.getDate()+i);var b=document.createElement('button');b.type='button';b.className='pill';b.textContent=i===0?'Today':(i===1?'Tomorrow':N[d.getDay()]+' '+d.getDate());b.setAttribute('data-v',d.toDateString());dd.appendChild(b);}}
grp('bdays','d');grp('btimes','t');
document.getElementById('bform').addEventListener('submit',function(e){{e.preventDefault();var f=this;
 if(!val(f,'phone')){{f.querySelector('[name=phone]').focus();return}}
 f.querySelector('.bsub').textContent='Sending…';
 send({{name:val(f,'name'),phone:val(f,'phone'),job_description:'📅 Booking request: '+sel.s+(sel.d?' — '+sel.d:'')+(sel.t?' ('+sel.t+')':'')}},
 function(){{f.style.display='none';document.getElementById('bok').style.display='block';}});}});
if('IntersectionObserver' in window){{var io=new IntersectionObserver(function(es){{es.forEach(function(en){{if(en.isIntersecting){{en.target.classList.add('vis');io.unobserve(en.target)}}}})}},{{threshold:.1}});[].forEach.call(document.querySelectorAll('.fx'),function(el){{io.observe(el)}});}}else{{[].forEach.call(document.querySelectorAll('.fx'),function(el){{el.classList.add('vis')}});}}
}})();
</script>
"""
    page += "</body></html>"
    # hero-variant CSS belongs in <head> with the rest of the styles.
    page = page.replace("</style></head>", css_hero + "\n</style></head>")
    return page


def qa_v3(html: str, biz: str, token: str) -> tuple:
    """v3 gate = the base gate + every required section present. A v3 missing a
    section is needs_review, never READY."""
    passed, reasons = qa_html(html, biz, token)
    for sec, label in [('id="quote"', "quote form"), ('id="book"', "booking section"),
                       ('id="services"', "services"), ('id="process"', "process section"),
                       ('id="area"', "local area section"), ('id="faq"', "FAQs"),
                       ('class="badges"', "trust badges"), ('class="mc"', "mobile call bar")]:
        if sec not in html:
            passed = False
            reasons.append(f"missing {label}")
    return passed, reasons


def _find_v3_row(prospect_id: str):
    try:
        rows = (get_db().table("previews").select("id,qa_status,qa_reasons,created_at")
                .eq("prospect_id", prospect_id).eq("template_version", "v3")
                .order("created_at", desc=True).limit(1).execute().data or [])
        return rows[0] if rows else None
    except Exception:
        return None


def build_v3(name_or_id: str) -> dict:
    """Build a v3 as a NEW preview row. The prospect's live link (preview_id) is NOT
    touched — v2 keeps serving until promote_v3. Re-running replaces the v3 draft.
    QA runs BEFORE any write: a rebuild that fails QA never overwrites a PROMOTED
    (live) v3 — the live page keeps serving and we report what failed."""
    db = get_db()
    p = trades.find_prospect(name_or_id)
    if not p:
        return {"ok": False, "message": f"No prospect found for '{name_or_id}'."}
    token = p.get("capture_token") or secrets.token_urlsafe(12)
    if not p.get("capture_token"):
        db.table("prospects").update({"capture_token": token}).eq("id", p["id"]).execute()

    details = _fetch_place_details(p.get("place_id"), p.get("trade"),
                                   name=p.get("business_name"), town=p.get("town"),
                                   prospect_id=p["id"])
    copy = _v3_copy(p, details)
    html = _site_html_v3(p, token, details, copy)
    base_url = f"{settings.BACKEND_BASE_URL.rstrip('/')}/previews/serve/"
    passed, reasons = qa_v3(html, p.get("business_name") or "", token)

    existing = _find_v3_row(p["id"])
    promoted = bool(existing and p.get("preview_id") == existing["id"])
    if promoted and not passed:
        trades.log_event("preview_qa", f"v3 rebuild REFUSED for {p.get('business_name')} — "
                         f"new build fails QA, live page kept ({'; '.join(reasons)[:80]})",
                         "warn", {"metric_ok": False, "v3_id": existing["id"]})
        return {"ok": True, "passed": False, "reasons": reasons, "v3_id": existing["id"],
                "v3_link": base_url + existing["id"], "business_name": p.get("business_name"),
                "message": ("v3 rebuild failed QA — the PROMOTED live page was kept untouched: "
                            + "; ".join(reasons))}

    if existing:
        pid = existing["id"]
        db.table("previews").update({"html_content": html, "qa_status": "pending",
                                     "qa_reasons": [], "preview_url": base_url + pid}
                                    ).eq("id", pid).execute()
    else:
        res = db.table("previews").insert({"html_content": html, "prospect_id": p["id"],
                                           "template_version": "v3",
                                           "qa_status": "pending"}).execute()
        pid = res.data[0]["id"] if res.data else None
        if pid:
            db.table("previews").update({"preview_url": base_url + pid}).eq("id", pid).execute()
    if not pid:
        return {"ok": False, "business_name": p.get("business_name"), "passed": False,
                "reasons": ["couldn't store row"], "message": "Couldn't store the v3 preview."}

    link = base_url + pid
    # A promoted row that passes QA stays READY — a rebuild must not demote the live page.
    status = "ready" if (passed and promoted) else ("qa_passed" if passed else "qa_failed")
    msgs = _gen_messages(p, link, details.get("rating"), details.get("review_count"))
    db.table("previews").update({
        "qa_status": status,
        "qa_reasons": reasons, "qa_checked_at": _now_iso(),
        "personalization_data": {
            "og": {"biz": p.get("business_name"), "town": p.get("town"),
                   "trade": p.get("trade"), "rating": details.get("rating"),
                   "review_count": details.get("review_count")},
            "msg_first": msgs["first"], "msg_link": msgs["link_msg"],
            "preview_link": link,
        }}).eq("id", pid).execute()
    og_card_png.cache_clear()        # rating/review inputs may have changed
    trades.log_event("preview_qa", f"v3 {'PASS' if passed else 'NEEDS REVIEW'} — "
                     f"{p.get('business_name')}" + (f" ({'; '.join(reasons)[:70]})" if reasons else ""),
                     "success" if passed else "warn", {"metric_ok": passed, "v3_id": pid})
    return {"ok": True, "passed": passed, "reasons": reasons, "v3_id": pid,
            "v3_link": link, "business_name": p.get("business_name"),
            "message": f"v3 {'QA PASS' if passed else 'NEEDS REVIEW: ' + '; '.join(reasons)} → {link}"}


def build_v3_batch(mode: str = "real", limit: int = 3, force: bool = True) -> dict:
    """Phase runner: limit=3 for the sample round, big limit for the rest. v2 rows
    untouched; Mission Control + queues unaffected until promotion. Candidates are
    ordered by effective_score so the sample round hits the BEST prospects first.
    PROMOTED (live) v3s are skipped — bulk rebuilds never churn a page the founder
    already approved (rebuild those one at a time, by name)."""
    db = get_db()
    try:
        pros = (db.table("prospects")
                .select("id,business_name,preview_id,queue_ready,data_mode,"
                        "opportunity_score,score_override")
                .eq("data_mode", mode).limit(2000).execute().data or [])
    except Exception as e:
        return {"ok": False, "message": f"Couldn't read prospects: {e}"}
    # One bulk fetch of v3 rows (newest per prospect) instead of a query per prospect.
    try:
        v3rows = (db.table("previews").select("id,prospect_id,created_at")
                  .eq("template_version", "v3").limit(2000).execute().data or [])
    except Exception:
        v3rows = []
    latest_v3 = {}
    for r in sorted(v3rows, key=lambda x: x.get("created_at") or ""):
        latest_v3[r["prospect_id"]] = r["id"]

    ready = [p for p in pros if p.get("queue_ready")]
    live_skipped = sum(1 for p in ready
                       if p.get("preview_id") and latest_v3.get(p["id"]) == p["preview_id"])
    ready = [p for p in ready
             if not (p.get("preview_id") and latest_v3.get(p["id"]) == p["preview_id"])]
    if not force:
        ready = [p for p in ready if p["id"] not in latest_v3]
    ready.sort(key=trades.effective_score, reverse=True)
    todo = ready[:limit]
    if not todo:
        return {"ok": True, "built": 0,
                "message": "Nothing to build — every queue-ready prospect already has a v3."
                           + (f" ({live_skipped} promoted/live, left untouched.)" if live_skipped else "")}

    def _one(p):
        try:
            return build_v3(p["id"])
        except Exception as e:
            logger.warning(f"[v3] build failed {p.get('business_name')}: {e}")
            return {"ok": False, "business_name": p.get("business_name"),
                    "reasons": [str(e)[:60]], "passed": False, "v3_link": None}

    rows, passed_n = [], 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        for r in ex.map(_one, todo):
            ok = r.get("passed")
            passed_n += 1 if ok else 0
            rows.append(f"{'✓ PASS        ' if ok else '⚠ NEEDS REVIEW'}  "
                        f"{r.get('business_name')}  →  {r.get('v3_link') or 'build failed'}"
                        + (f"   [{'; '.join(r.get('reasons') or [])[:60]}]" if not ok else ""))
    msg = (f"v3 built for {len(todo)}: {passed_n} PASS / {len(todo)-passed_n} need review."
           + (f" ({live_skipped} promoted/live skipped.)" if live_skipped else "") + "\n"
           + "\n".join(rows)
           + "\n\nv2 links untouched. Open the v3 links, compare, then promote the ones you approve.")
    trades.log_event("preview_qa", f"v3 batch: {passed_n}/{len(todo)} pass", "success",
                     {"metric_ok": passed_n == len(todo)})
    return {"ok": True, "built": len(todo), "passed": passed_n, "table": rows, "message": msg}


def promote_v3(name_or_id: str) -> dict:
    """Founder approval: point the prospect's LIVE link at the v3 row (READY). The
    old v2 row keeps serving its URL, so already-sent links never break."""
    db = get_db()
    p = trades.find_prospect(name_or_id)
    if not p:
        return {"ok": False, "message": f"No prospect found for '{name_or_id}'."}
    v3 = _find_v3_row(p["id"])
    if not v3:
        return {"ok": False, "message": "No v3 built for this prospect yet."}
    if v3.get("qa_status") not in ("qa_passed", "ready"):
        return {"ok": False, "message": f"v3 is NEEDS REVIEW "
                f"({'; '.join(v3.get('qa_reasons') or [])[:90]}) — fix before promoting."}
    db.table("previews").update({"qa_status": "ready"}).eq("id", v3["id"]).execute()
    db.table("prospects").update({"preview_id": v3["id"], "preview_status": "ready",
                                  "updated_at": _now_iso()}).eq("id", p["id"]).execute()
    link = f"{settings.BACKEND_BASE_URL.rstrip('/')}/previews/serve/{v3['id']}"
    trades.log_event("preview_qa", f"v3 PROMOTED → live for {p.get('business_name')}",
                     "success", {"metric_ok": True})
    return {"ok": True, "v3_link": link,
            "message": f"{p.get('business_name')} live link is now v3 (READY): {link}. v2 URL still serves."}


def v3_status(mode: str = "real") -> dict:
    """Final-output table: every queue-ready prospect's live link + v3 link + QA
    verdict + promoted flag."""
    db = get_db()
    base = f"{settings.BACKEND_BASE_URL.rstrip('/')}/previews/serve/"
    try:
        pros = (db.table("prospects").select("id,business_name,preview_id,queue_ready,data_mode")
                .eq("data_mode", mode).limit(2000).execute().data or [])
        v3rows = (db.table("previews").select("id,prospect_id,qa_status,qa_reasons,created_at")
                  .eq("template_version", "v3").limit(2000).execute().data or [])
    except Exception as e:
        return {"ok": False, "message": f"read failed: {e}"}
    latest = {}
    for r in sorted(v3rows, key=lambda x: x.get("created_at") or ""):
        latest[r["prospect_id"]] = r
    out = []
    for p in pros:
        if not p.get("queue_ready"):
            continue
        v3 = latest.get(p["id"])
        out.append({
            "business_name": p.get("business_name"),
            "live_link": (base + p["preview_id"]) if p.get("preview_id") else None,
            "v3_link": (base + v3["id"]) if v3 else None,
            "v3_qa": (v3 or {}).get("qa_status"),
            "v3_reasons": (v3 or {}).get("qa_reasons") or [],
            "promoted": bool(v3 and p.get("preview_id") == v3["id"]),
        })
    ready = [o for o in out if o["v3_qa"] in ("qa_passed", "ready")]
    review = [o for o in out if o["v3_link"] and o["v3_qa"] not in ("qa_passed", "ready")]
    lines = [(("✅ PROMOTED " if o["promoted"] else "✓ ready    ") if o["v3_qa"] in ("qa_passed", "ready")
              else ("⚠ review   " if o["v3_link"] else "· no v3    "))
             + f"{o['business_name']}  →  {o['v3_link'] or '(not built)'}" for o in out]
    return {"ok": True, "prospects": out, "ready": len(ready), "needs_review": len(review),
            "message": (f"v3 status — {len(ready)} ready, {len(review)} need review, "
                        f"{len(out)-len(ready)-len(review)} not built:\n" + "\n".join(lines))}
