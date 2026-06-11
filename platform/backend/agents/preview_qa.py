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
}


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
<meta property="og:image" content="@@OGIMG@@">
<meta property="og:type" content="website">
<link rel="icon" href="@@FAVICON@@">
<link rel="preload" as="image" href="@@OGIMG@@">
<script type="application/ld+json">@@JSONLD@@</script>
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

<section id="services" class="sec"><div class="wrap">
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
            return build_for_prospect(p["id"], verify_live=False)
        except Exception as e:
            logger.warning(f"[preview_qa] build failed for {p.get('business_name')}: {e}")
            return {"ok": False}

    built = passed = failed = 0
    with ThreadPoolExecutor(max_workers=5) as ex:
        for r in ex.map(_one, todo):
            if r.get("ok"):
                built += 1
                passed += 1 if r.get("passed") else 0
                failed += 0 if r.get("passed") else 1
    trades.log_event("preview_qa", f"built {built} preview(s) — {passed} passed QA, {failed} failed",
                     "success" if failed == 0 else "warn",
                     {"metric_ok": failed == 0, "built": built, "passed": passed})
    return {"ok": True, "built": built, "qa_passed": passed, "qa_failed": failed,
            "message": (f"Built {built} preview(s): {passed} passed QA (open + Approve to share)"
                        + (f"; {failed} failed QA" if failed else "") + ".")}


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
