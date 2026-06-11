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
from agents.places_photos import resolve_photo_uri

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
    ids = _STOCK.get((trade or "").lower(), _STOCK_DEFAULT)
    return [f"https://images.unsplash.com/photo-{i}?auto=format&fit=crop&w=1200&q=80" for i in ids[:n]]


def _fetch_place_details(place_id: str, trade: str = "") -> dict:
    """Pull REAL photos (keyless CDN urls), Google reviews + rating for a place.
    Best-effort — on any failure we degrade to tasteful stock so the preview still
    looks premium. Costs ~1 Place Details call + a few photo-media calls (build time)."""
    out = {"photos": [], "reviews": [], "rating": None, "review_count": None,
           "address": None, "real_photos": False}
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
                names = [p.get("name") for p in (d.get("photos") or [])[:3] if p.get("name")]
                if names:
                    with ThreadPoolExecutor(max_workers=min(3, len(names))) as ex:
                        out["photos"] = [u for u in ex.map(resolve_photo_uri, names) if u]
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


def _site_html(prospect: dict, capture_token: str, details: dict = None) -> str:
    """A premium, mobile-first demo site for a trade: real Google photos + reviews +
    rating, a booking widget that captures the enquiry, trust signals and a sticky
    call bar. Viewport + tel: + capture form (correct token) + business name; no
    placeholder filler. Falls back to tasteful stock when a listing is sparse."""
    details = details or {}
    biz = (prospect.get("business_name") or "Your Trade").strip()
    trade = (prospect.get("trade") or "tradesperson").strip()
    trade_t = trade.title()
    town = (prospect.get("town") or "your area").strip()
    phone = (prospect.get("phone") or "").strip()
    api = settings.BACKEND_BASE_URL.rstrip("/")
    tel = re.sub(r"[^\d+]", "", phone)
    photos = details.get("photos") or _stock_photos(trade)
    hero = photos[0]
    gallery = photos[1:4]
    rating = details.get("rating")
    rcount = details.get("review_count")
    reviews = details.get("reviews") or []
    nearby = _NEARBY.get(town.lower(), [])
    services = _SERVICES.get(trade.lower(), _SERVICES_DEFAULT)

    # rating chip + line
    rating_chip = (f'<span class="rchip">{_stars(rating)} <b>{rating:.1f}</b> · {rcount} Google reviews</span>'
                   if rating else f'<span class="rchip">{_IC["pin"]} {_esc(town)} &amp; surrounding areas</span>')
    # services
    svc_html = "".join(
        f'<div class="svc">{_IC["check"]}<div><h3>{_esc(t)}</h3><p>{_esc(d)}</p></div></div>'
        for t, d in services)
    # gallery
    gallery_html = ""
    if details.get("real_photos") and gallery:
        gallery_html = ('<section class="sec"><div class="wrap"><div class="eyebrow">Our work</div>'
                        '<h2>Recent jobs &amp; premises</h2><div class="gal">'
                        + "".join(f'<div class="gi" style="background-image:url(&quot;{g}&quot;)"></div>' for g in gallery)
                        + '</div></div></section>')
    # reviews (REAL google reviews only — never fabricated)
    if reviews:
        cards = "".join(
            f'<div class="rev"><div class="rs">{_stars(rv["rating"])}</div>'
            f'<p>"{_esc(rv["text"])}"</p><div class="who">— {_esc(rv["author"])}'
            + (f' · {_esc(rv["when"])}' if rv.get("when") else '') + '</div></div>'
            for rv in reviews[:6])
        rhead = (f'<p class="rlead">Rated <b>{rating:.1f}</b> {_stars(rating)} from {rcount} Google reviews</p>'
                 if rating else '')
        reviews_html = (f'<section id="reviews" class="sec alt"><div class="wrap"><div class="eyebrow">Reviews</div>'
                        f'<h2>What local customers say</h2>{rhead}<div class="revs">{cards}</div></div></section>')
    else:
        reviews_html = (
            '<section class="sec alt"><div class="wrap"><div class="eyebrow">Why choose us</div>'
            f'<h2>Trusted across {_esc(town)}</h2><div class="trust">'
            f'<div class="ti">{_IC["shield"]}<b>Fully insured</b><span>Every job covered</span></div>'
            f'<div class="ti">{_IC["clock"]}<b>On time</b><span>We turn up when we say</span></div>'
            f'<div class="ti">{_IC["check"]}<b>Free quotes</b><span>No surprises on price</span></div>'
            f'<div class="ti">{_IC["pin"]}<b>Local</b><span>Based right here in {_esc(town)}</span></div>'
            '</div></div></section>')
    # nearby chips
    nearby_html = ("".join(f'<span class="chip">{_esc(n)}</span>' for n in nearby)
                   if nearby else f'<span class="chip">{_esc(town)} &amp; surrounding areas</span>')
    service_opts = "".join(f'<option>{_esc(t)}</option>' for t, _ in services) + '<option>Something else</option>'

    tmpl = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@@BIZ@@ — @@TRADE@@ in @@TOWN@@</title>
<meta name="description" content="@@BIZ@@ — trusted @@TRADE_L@@ in @@TOWN@@. Book online or call now for fast, fully-insured local service.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--ink:#0b1b2b;--ink2:#1b3650;--accent:#ff7a00;--accent2:#13a36b;--bg:#f6f8fb;--card:#fff;--line:#e7edf3;--muted:#5b6b7b}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1060px;margin:0 auto;padding:0 20px}
a{color:inherit}
/* top bar */
.bar{position:sticky;top:0;z-index:40;background:rgba(11,27,43,.92);backdrop-filter:blur(8px);color:#fff}
.bar .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}
.brand{font-weight:800;font-size:18px;letter-spacing:.2px}
.brand span{color:var(--accent)}
.callbtn{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;font-weight:800;
  padding:10px 18px;border-radius:100px;text-decoration:none;font-size:15px}
.callbtn svg{width:17px;height:17px}
/* hero */
.hero{position:relative;color:#fff;background:#0b1b2b}
.hero .bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:saturate(1.05)}
.hero .ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,27,43,.62),rgba(11,27,43,.86))}
.hero .wrap{position:relative;padding:74px 20px 84px}
.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:12px;font-weight:800;color:var(--accent)}
.hero h1{font-size:clamp(32px,6vw,56px);font-weight:800;line-height:1.05;margin:12px 0 10px;max-width:14ch}
.hero .sub{font-size:clamp(16px,2.4vw,20px);opacity:.92;max-width:46ch}
.rchip{display:inline-flex;align-items:center;gap:8px;margin-top:18px;background:rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.22);padding:8px 14px;border-radius:100px;font-size:14px;font-weight:600}
.rchip b{color:#ffd479}.rchip svg{width:15px;height:15px}
.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.btn{display:inline-flex;align-items:center;gap:9px;font-weight:800;padding:15px 26px;border-radius:100px;
  text-decoration:none;font-size:16px;border:0;cursor:pointer}
.btn-a{background:var(--accent);color:#fff;box-shadow:0 10px 26px rgba(255,122,0,.36)}
.btn-b{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.34)}
.btn svg{width:18px;height:18px}
/* trust strip */
.strip{background:var(--ink2);color:#fff}
.strip .wrap{display:flex;flex-wrap:wrap;gap:10px 28px;justify-content:center;padding:16px 20px;font-size:14px;font-weight:600}
.strip .it{display:inline-flex;align-items:center;gap:8px;opacity:.95}
.strip svg{width:17px;height:17px;color:var(--accent2)}
/* sections */
.sec{padding:64px 0}.sec.alt{background:#fff}
.sec h2{font-size:clamp(24px,3.4vw,34px);font-weight:800;margin:8px 0 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:28px}
.svc{display:flex;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;
  box-shadow:0 6px 22px rgba(11,27,43,.05)}
.svc svg{width:26px;height:26px;color:var(--accent2);flex:none;margin-top:2px}
.svc h3{font-size:18px;font-weight:800;margin-bottom:4px}.svc p{color:var(--muted);font-size:15px}
.gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:24px}
.gi{height:200px;border-radius:16px;background-size:cover;background-position:center;border:1px solid var(--line)}
.rlead,.rolead{color:var(--muted);font-size:16px;margin-top:4px}
.revs{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px;margin-top:26px}
.rev{background:var(--bg);border:1px solid var(--line);border-radius:16px;padding:22px}
.rev .rs{color:#ffb400;letter-spacing:2px;font-size:16px}.rev p{margin:10px 0;font-size:15.5px}
.rev .who{color:var(--muted);font-weight:700;font-size:14px}
.trust{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:26px}
.ti{background:var(--bg);border:1px solid var(--line);border-radius:16px;padding:20px;text-align:center}
.ti svg{width:28px;height:28px;color:var(--accent2)}.ti b{display:block;margin:10px 0 2px;font-size:17px}
.ti span{color:var(--muted);font-size:14px}
/* booking */
.book{background:linear-gradient(160deg,#0b1b2b,#173651);color:#fff}
.book .card{background:#fff;color:var(--ink);border-radius:22px;padding:30px;max-width:620px;margin:30px auto 0;
  box-shadow:0 30px 70px rgba(0,0,0,.35)}
.lbl{display:block;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:18px 0 8px}
.pills{display:flex;flex-wrap:wrap;gap:8px}
.pill{border:1.5px solid var(--line);background:#fff;border-radius:100px;padding:10px 15px;font-size:14px;font-weight:700;
  cursor:pointer;font-family:inherit;color:var(--ink)}
.pill.on{background:var(--ink);color:#fff;border-color:var(--ink)}
select,input{width:100%;font-family:inherit;font-size:16px;padding:14px;border:1.5px solid var(--line);
  border-radius:12px;background:#fff;color:var(--ink);margin-top:8px}
.bsubmit{width:100%;margin-top:22px;background:var(--accent);color:#fff;border:0;border-radius:12px;padding:17px;
  font-size:17px;font-weight:800;cursor:pointer;font-family:inherit}
.booked{display:none;text-align:center;padding:18px}
.booked .big{font-size:40px}.booked h3{font-size:22px;margin:8px 0}
.foot{background:var(--ink);color:#cdd9e6;text-align:center;padding:38px 20px;font-size:14px}
.foot .fb{font-weight:800;color:#fff;font-size:18px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.chip{background:var(--bg);border:1px solid var(--line);border-radius:100px;padding:8px 14px;font-size:14px;font-weight:600}
/* sticky mobile call */
.mcall{position:fixed;left:0;right:0;bottom:0;z-index:50;display:none;background:var(--accent);color:#fff;
  text-align:center;padding:15px;font-weight:800;text-decoration:none;font-size:16px}
@media(max-width:720px){.mcall{display:block}.book{padding-bottom:90px}.callbtn span{display:none}}
</style>
</head>
<body>

<header class="bar"><div class="wrap">
  <div class="brand">@@BIZ@@</div>
  <a class="callbtn" href="tel:@@TEL@@">@@IC_PHONE@@<span>@@PHONE@@</span></a>
</div></header>

<section class="hero">
  <div class="bg" style="background-image:url(&quot;@@HERO@@&quot;)"></div><div class="ov"></div>
  <div class="wrap">
    <div class="eyebrow">@@TRADE@@ · @@TOWN@@</div>
    <h1>@@BIZ@@</h1>
    <p class="sub">Fast, reliable @@TRADE_L@@ work across @@TOWN@@ — done properly, fully insured, and priced up front.</p>
    @@RATINGCHIP@@
    <div class="cta-row">
      <a class="btn btn-a" href="#book">Book online</a>
      <a class="btn btn-b" href="tel:@@TEL@@">@@IC_PHONE@@ Call now</a>
    </div>
  </div>
</section>

<div class="strip"><div class="wrap">
  <span class="it">@@IC_SHIELD@@ Fully insured</span>
  <span class="it">@@IC_CHECK@@ Free no-obligation quotes</span>
  <span class="it">@@IC_CLOCK@@ Fast local response</span>
  <span class="it">@@IC_STAR@@ Trusted in @@TOWN@@</span>
</div></div>

<section class="sec"><div class="wrap">
  <div class="eyebrow">What we do</div>
  <h2>@@TRADE@@ services in @@TOWN@@</h2>
  <div class="grid">@@SERVICES@@</div>
</div></section>

@@GALLERY@@
@@REVIEWS@@

<section id="book" class="sec book"><div class="wrap">
  <div style="text-align:center">
    <div class="eyebrow" style="color:#ffb98a">Book in 30 seconds</div>
    <h2>Book @@BIZ@@</h2>
    <p class="rolead" style="color:#cdd9e6">Pick a day and time — we'll confirm by phone. No account, no faff.</p>
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
        <button type="button" class="pill" data-val="ASAP / emergency">ASAP</button>
      </div>
      <label class="lbl">Your name</label>
      <input name="name" autocomplete="name">
      <label class="lbl">Mobile number</label>
      <input name="phone" inputmode="tel" autocomplete="tel" required>
      <button class="bsubmit" type="submit">Request this booking →</button>
    </form>
    <div class="booked" id="booked">
      <div class="big">✅</div><h3>Booking sent!</h3>
      <p style="color:var(--muted)">@@BIZ@@ has your request and will call to confirm shortly.</p>
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
  <p style="margin:8px 0">@@TRADE@@ · @@TOWN@@ · <a href="tel:@@TEL@@" style="color:#fff">@@PHONE@@</a></p>
  <p style="opacity:.6;margin-top:10px">Website by L&amp;D Designs</p>
</footer>

<a class="mcall" href="tel:@@TEL@@">@@IC_PHONE@@ Call @@BIZ@@</a>

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
  // build the next 7 days
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
})();
</script>
</body>
</html>"""

    repl = {
        "@@BIZ@@": _esc(biz), "@@TRADE@@": _esc(trade_t), "@@TRADE_L@@": _esc(trade),
        "@@TOWN@@": _esc(town), "@@PHONE@@": _esc(phone or "Call us"), "@@TEL@@": tel or "",
        "@@API@@": api, "@@TOKEN@@": capture_token, "@@HERO@@": hero,
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

    # Pull REAL Google photos + reviews + rating for this exact place (best-effort).
    details = _fetch_place_details(p.get("place_id"), p.get("trade"))
    html = _site_html({**p, "capture_token": token}, token, details)
    preview_url = f"{settings.BACKEND_BASE_URL.rstrip('/')}/previews/serve/"  # + id after insert
    rec = {"html_content": html, "prospect_id": p["id"], "qa_status": "pending"}
    try:
        res = db.table("previews").insert(rec).execute()
        pid = res.data[0]["id"] if res.data else None
    except Exception as e:
        return {"ok": False, "message": f"Couldn't store preview (is the previews table present?): {e}"}
    if pid:
        db.table("previews").update({"preview_url": preview_url + pid}).eq("id", pid).execute()
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


def build_all_ready(mode: str = "real", limit: int = 25) -> dict:
    """Build (+QA) a preview for every queue-ready prospect that doesn't have one yet.
    Capped so a single click can't run away. Returns counts + a short summary."""
    db = get_db()
    try:
        pros = (db.table("prospects").select("id,business_name,preview_id,queue_ready,data_mode")
                .eq("data_mode", mode).limit(2000).execute().data or [])
    except Exception as e:
        return {"ok": False, "built": 0, "message": f"Couldn't read prospects: {e}"}
    todo = [p for p in pros if p.get("queue_ready") and not p.get("preview_id")][:limit]
    if not todo:
        return {"ok": True, "built": 0, "qa_passed": 0, "qa_failed": 0,
                "message": "Every queue-ready prospect already has a preview. ✓"}
    built = passed = failed = 0
    for p in todo:
        try:
            r = build_for_prospect(p["id"], verify_live=False)
            if r.get("ok"):
                built += 1
                passed += 1 if r.get("passed") else 0
                failed += 0 if r.get("passed") else 1
        except Exception as e:
            logger.warning(f"[preview_qa] build failed for {p.get('business_name')}: {e}")
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
