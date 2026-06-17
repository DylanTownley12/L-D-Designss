"""
Preview Generator Agent
Creates a personalized barber website preview for each lead.
Uses Jinja2 to fill in the HTML template with real lead data.
The preview URL is what we send in outreach — "here's what your site could look like."
"""
import os
import logging
from datetime import datetime, timezone
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from db.client import get_db
from config import settings
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"

# A successfully rendered v3 page is ~50KB. Anything well below this is a failed/
# legacy stub (head-only, no hero/gallery) — treat it as "not a real preview" so it
# gets rebuilt instead of served, and so the call board doesn't count it as working.
# Shared by api/previews.serve_preview and api/calls.call_board.
MIN_REAL_PREVIEW_BYTES = 8000

# Real Places photos are fetched by the standalone backfill (agents/places_photos.py)
# and stored on the lead as analysis_data.place_photos (resolved CDN urls). The
# generator just reads them — see _build_context — so regeneration stays free.

jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)

# Hero image pool — picked per lead so previews look different
HERO_IMAGE_POOL = [
    "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200",
    "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=1200",
    "https://images.unsplash.com/photo-1621605815971-8ca28ed73af1?w=1200",
    "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200",
    "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=1200",
    "https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=1200",
    "https://images.unsplash.com/photo-1536520002442-39284f7a4a43?w=1200",
    "https://images.unsplash.com/photo-1512864084360-7c0d0fd46562?w=1200",
]

BARBER_IMAGE_POOL = [
    "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600",
    "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600",
    "https://images.unsplash.com/photo-1621605815971-8ca28ed73af1?w=600",
    "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600",
]

# Gallery image pool — 10 unique images, pick 6 per lead
GALLERY_POOL = [
    {"url": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400", "alt": "Fresh haircut"},
    {"url": "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400", "alt": "Barber at work"},
    {"url": "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400", "alt": "Classic cut"},
    {"url": "https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=400", "alt": "Styling session"},
    {"url": "https://images.unsplash.com/photo-1621605815971-8ca28ed73af1?w=400", "alt": "Fade cut"},
    {"url": "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400", "alt": "Barber shop"},
    {"url": "https://images.unsplash.com/photo-1559771561-0caf62b5a8a5?w=400", "alt": "Style finish"},
    {"url": "https://images.unsplash.com/photo-1536520002442-39284f7a4a43?w=400", "alt": "Sharp lines"},
    {"url": "https://images.unsplash.com/photo-1512864084360-7c0d0fd46562?w=400", "alt": "Premium finish"},
    {"url": "https://images.unsplash.com/photo-1593702288056-f9454ce28b07?w=400", "alt": "Clean fade"},
]

DEFAULT_SERVICES = [
    {"icon": "✂️", "name": "Classic Cut", "description": "Sharp, clean cut that works for any occasion. We'll work with your hair type, sort the shape, and finish with a wash and style. You leave looking proper.", "price": "from £15", "duration": "30 min"},
    {"icon": "🪒", "name": "Skin Fade", "description": "Faded tight to the skin with crisp, clean lines. No guess work — just a sharp fade done properly every single time.", "price": "from £18", "duration": "40 min"},
    {"icon": "👶", "name": "Kids Cut", "description": "Relaxed, no-fuss cuts for kids of all ages. We're patient, friendly, and we make it easy for them — and for you.", "price": "from £10", "duration": "25 min"},
    {"icon": "🧔", "name": "Beard Trim", "description": "We'll shape your beard to suit your face — clean edges, defined lines, and a proper finish. Makes a bigger difference than you think.", "price": "from £8", "duration": "20 min"},
    {"icon": "💆", "name": "Full Groom", "description": "The works. Fresh cut, beard shaped, the lot. Leave looking and feeling your absolute best. Ideal before a big occasion or just because.", "price": "from £25", "duration": "60 min"},
    {"icon": "💈", "name": "Hot Towel Shave", "description": "Old school straight razor shave with a steaming hot towel and premium products. Proper luxury — the kind you can't do at home.", "price": "from £20", "duration": "45 min"},
]

DEFAULT_HOURS = [
    {"day": "Monday", "hours": "9:00 AM – 6:00 PM", "closed": False},
    {"day": "Tuesday", "hours": "9:00 AM – 6:00 PM", "closed": False},
    {"day": "Wednesday", "hours": "9:00 AM – 6:00 PM", "closed": False},
    {"day": "Thursday", "hours": "9:00 AM – 7:00 PM", "closed": False},
    {"day": "Friday", "hours": "9:00 AM – 7:00 PM", "closed": False},
    {"day": "Saturday", "hours": "8:00 AM – 5:00 PM", "closed": False},
    {"day": "Sunday", "hours": "Closed", "closed": True},
]

TESTIMONIAL_POOL = [
    {"rating": 5, "text": "Best barbers round here by a mile. Always leave looking proper fresh. The lads know what they're doing.", "author": "Jake M."},
    {"rating": 5, "text": "Been coming here years and wouldn't go anywhere else. Consistent quality every single time.", "author": "Aaron T."},
    {"rating": 5, "text": "Great atmosphere, friendly staff and a brilliant cut. My son loves coming here too.", "author": "Dean W."},
    {"rating": 5, "text": "Walked in not knowing what I wanted and left looking class. Proper skilled barbers.", "author": "Liam H."},
    {"rating": 5, "text": "Reasonable prices and top quality. Never had a bad cut here. Highly recommend.", "author": "Marcus B."},
    {"rating": 5, "text": "Always on time and always delivers. The fade is immaculate every visit.", "author": "Kyle R."},
    {"rating": 5, "text": "Friendly, quick and genuinely talented. Best shop in the area without question.", "author": "Tom G."},
    {"rating": 5, "text": "First time in and they smashed it. Will definitely be back. Really welcoming place.", "author": "Josh P."},
]


# Premium accent palette — one picked per lead so previews feel bespoke, never samey.
# (hex, "r,g,b") — the rgb string powers translucent rgba() layers in the template.
ACCENT_PALETTE = [
    ("#C9A227", "201,162,39"),   # gold        — default, reads "premium"
    ("#C0392B", "192,57,43"),    # crimson     — classic barber red
    ("#B87333", "184,115,51"),   # copper      — warm, upscale
    ("#3E7CB1", "62,124,177"),   # steel blue  — modern, clean
    ("#1F8A70", "31,138,112"),   # deep teal   — fresh, distinctive
]


def _pick(pool: list, seed: str, offset: int = 0) -> object:
    """Deterministically pick from a pool based on a string seed."""
    idx = (hash(seed + str(offset)) & 0x7FFFFFFF) % len(pool)
    return pool[idx]


def _pick_n(pool: list, seed: str, n: int) -> list:
    """Pick n unique items from pool deterministically."""
    indices = sorted(range(len(pool)), key=lambda i: hash(seed + str(i)) & 0x7FFFFFFF)
    return [pool[i] for i in indices[:n]]


def _build_context(lead: dict) -> dict:
    """Build the Jinja2 template context from lead data."""
    # NB: lead.get(k, default) returns None when the column exists but is null,
    # so use `or` to coerce null → sensible value (prevents "None" rendering).
    name = lead.get("business_name") or "Your Barbers"
    city = lead.get("city") or "Your Town"
    phone = lead.get("phone") or ""
    address = lead.get("address") or city
    seed = name + city

    whatsapp_number = (phone or "").replace(" ", "").replace("+", "").replace("-", "")
    if whatsapp_number.startswith("0"):
        whatsapp_number = "44" + whatsapp_number[1:]
    has_phone = bool(whatsapp_number and len(whatsapp_number) >= 10)

    accent_hex, accent_rgb = _pick(ACCENT_PALETTE, seed, offset=7)

    import urllib.parse
    _preview_msg = urllib.parse.quote(f"Hi Dylan, I just saw the preview site you built for {name} — I'm interested in getting it live.")
    dylan_whatsapp_url = f"https://wa.me/447504683058?text={_preview_msg}"

    taglines = [
        f"Trusted by {city}'s finest — fresh cuts, no compromises.",
        f"The go-to barbers in {city}. Walk in, leave looking class.",
        f"Quality cuts in the heart of {city}. Walk-ins always welcome.",
        f"{city}'s favourite barbers. Sharp fades, clean lines, every time.",
        f"Serving {city} with premium cuts since day one.",
    ]

    about_texts = [
        (f"{name} has been cutting hair for the {city} community for years. "
         f"We know what it takes to keep our regulars coming back — great cuts, fair prices, and a shop you actually want to spend time in."),
        (f"We're {name} — a proper barber shop in {city} that does things the right way. "
         f"No waiting around, no disappointing cuts. Just skilled barbers who take pride in every single client."),
        (f"At {name} we keep it simple: great haircuts, honest prices, friendly service. "
         f"That's why {city} keeps coming back to us week after week."),
    ]

    # Real barber photos from Google Places (resolved CDN urls stored on the lead by
    # the photo backfill). Their OWN shop converts far better than stock.
    analysis = lead.get("analysis_data") or {}
    real_photos = [u for u in (analysis.get("place_photos") or []) if u]
    place_id = analysis.get("google_place_id") or lead.get("google_place_id") or ""

    if real_photos:
        image_source = "google_places"
        hero_image_url = real_photos[0]
        barber_image_url = real_photos[1] if len(real_photos) > 1 else _pick(BARBER_IMAGE_POOL, seed, offset=1)
        # Gallery: remaining real photos first, then fill with varied fallback up to 6
        real_gallery = [{"url": u, "alt": f"Inside {name}"} for u in real_photos[2:8]]
        if len(real_gallery) < 6:
            real_gallery += _pick_n(GALLERY_POOL, seed, 6 - len(real_gallery))
        gallery_images = real_gallery[:6]
    else:
        image_source = "unsplash"
        hero_image_url = _pick(HERO_IMAGE_POOL, seed)
        barber_image_url = _pick(BARBER_IMAGE_POOL, seed, offset=1)
        gallery_images = _pick_n(GALLERY_POOL, seed, 6)

    return {
        "business_name": name,
        "city": city,
        "phone": phone or "Call us",
        "address": address,
        "postcode": lead.get("postcode") or "",
        "email": lead.get("email") or "",
        "google_rating": lead.get("google_rating"),
        "google_reviews": lead.get("google_reviews") or 0,
        "instagram_url": lead.get("instagram_url") or "",
        "facebook_url": lead.get("facebook_url") or "",
        "meta_description": f"Book your haircut at {name} in {city}. Professional barbers, walk-ins welcome.",
        "tagline": _pick(taglines, seed),
        "hero_image_url": hero_image_url,
        "barber_image_url": barber_image_url,
        "image_source": image_source,
        "booking_url": f"https://wa.me/{whatsapp_number}?text=Hi%2C%20I%27d%20like%20to%20book%20an%20appointment",
        "whatsapp_url": f"https://wa.me/{whatsapp_number}",
        "whatsapp_number": whatsapp_number,
        "has_phone": has_phone,
        "dylan_whatsapp_url": dylan_whatsapp_url,
        "accent_hex": accent_hex,
        "accent_rgb": accent_rgb,
        "price_build": "199",
        "price_monthly": "29",
        "price_deposit": "199",
        "about_heading": f"The Barbers {city} Trusts",
        "about_text": _pick(about_texts, seed, offset=2),
        "highlights": [
            f"Serving {city} and the surrounding area",
            "Walk-ins welcome — no appointment needed",
            "Experienced barbers who care about the finish",
            "Honest prices, no hidden extras",
        ],
        "years_experience": str(_pick([5, 6, 7, 8, 10], seed, offset=3)),
        "happy_clients": str(_pick([400, 500, 600, 750, 1000], seed, offset=4)),
        "services": DEFAULT_SERVICES,
        "gallery_images": gallery_images,
        "testimonials": _pick_n(TESTIMONIAL_POOL, seed, 3),
        "opening_hours": DEFAULT_HOURS,
        "google_maps_embed": "",
        "social_links": {
            "instagram": lead.get("instagram_url") or "",
            "facebook": lead.get("facebook_url") or "",
        },
        "google_place_id": place_id,
        "agency_name": settings.BUSINESS_NAME,
        "agency_url": settings.BUSINESS_WEBSITE,
        "is_preview": True,
        "preview_message": (
            f"👋 This is a free preview site I built for {name}. "
            "Like what you see? WhatsApp me and I'll get it live — Dylan"
        ),
    }


def _ensure_photos(db, lead: dict) -> None:
    """Fetch the lead's REAL Google Places photos before rendering, if we haven't
    already. Mirrors the /previews/backfill-photos endpoint: store the resolved CDN
    urls on analysis_data so _build_context picks them up. Idempotent (skips once
    checked) and never raises — preview generation must survive any photo failure.
    """
    ad = lead.get("analysis_data") or {}
    if ad.get("place_photos") or ad.get("photos_checked_at"):
        return  # already have real photos, or already checked and Google had none
    name = lead.get("business_name") or ""
    if not name:
        return
    try:
        from agents import places_photos
        res = places_photos.fetch_photos_for_lead(name, lead.get("city") or "", want=6, max_w=1280)
        ad["place_photos"] = res["photo_urls"]
        ad["google_place_id"] = res["place_id"]
        ad["place_match_name"] = res["matched_name"]
        ad["image_source"] = "google_places" if res["photo_urls"] else "fallback"
        ad["photos_checked_at"] = datetime.now(timezone.utc).isoformat()
        lead["analysis_data"] = ad  # so _build_context sees them this run
        db.table("leads").update({"analysis_data": ad}).eq("id", lead["id"]).execute()
    except Exception as e:
        logger.warning(f"[preview_generator] photo fetch failed for {name}: {e}")


def run(lead_id: str, force: bool = False) -> dict:
    """Generate a preview website for a lead and save it.
    force=True overwrites existing html_content even if it looks complete.
    Real Google photos are fetched automatically (once) before rendering.
    """
    try:
        get_db().table("agent_logs").insert({"agent_name": "preview_generator", "action": "heartbeat", "status": "running"}).execute()
    except Exception:
        pass
    start = datetime.now()
    db = get_db()

    result = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not result.data:
        return {"status": "error", "message": "Lead not found"}

    lead = result.data

    # Check if a full preview already exists (html_content longer than 10KB means it's complete)
    existing = (
        db.table("previews")
        .select("id,preview_url,html_content")
        .eq("lead_id", lead_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        html_stored = existing.data[0].get("html_content") or ""
        existing_url = existing.data[0].get("preview_url") or ""
        if not force and len(html_stored) >= MIN_REAL_PREVIEW_BYTES and "/previews/serve/" in existing_url:
            # Full HTML already stored — skip unless force=True
            logger.info(f"Full preview already exists for lead {lead_id} — skipping")
            return {
                "status": "skipped",
                "preview_url": existing_url,
                "lead_id": lead_id,
            }
        existing_id = existing.data[0]["id"]
    else:
        existing_id = None

    try:
        _ensure_photos(db, lead)
        context = _build_context(lead)
        template = jinja_env.get_template("barber_site.html")
        html = template.render(**context)

        base = settings.preview_base_url_resolved.replace("/previews", "").rstrip("/")
        personalization = {
            "business_name": lead.get("business_name"),
            "city": lead.get("city"),
            "phone": lead.get("phone"),
            # Rendered size — lets the call board flag stubs without re-downloading HTML.
            "html_len": len(html),
            "image_source": context.get("image_source"),
        }

        if existing_id:
            # Update existing row with full HTML
            preview_url = f"{base}/previews/serve/{existing_id}"
            db.table("previews").update({
                "preview_url": preview_url,
                "html_content": html,
                "personalization_data": personalization,
                "template_version": "v3",
            }).eq("id", existing_id).execute()
        else:
            # Insert new row — let Supabase generate the UUID, then update the URL
            insert_result = db.table("previews").insert({
                "lead_id": lead_id,
                "html_content": html,
                "personalization_data": personalization,
                "template_version": "v3",
            }).execute()
            new_id = insert_result.data[0]["id"]
            preview_url = f"{base}/previews/serve/{new_id}"
            db.table("previews").update({"preview_url": preview_url}).eq("id", new_id).execute()

        db.table("leads").update({"status": "preview_ready"}).eq("id", lead_id).execute()

        duration_ms = int((datetime.now() - start).total_seconds() * 1000)
        log_agent_action(db, "preview_generator", "generate_preview", lead_id, "success",
                         {"preview_url": preview_url}, duration_ms)

        return {
            "status": "success",
            "preview_url": preview_url,
            "lead_id": lead_id,
        }

    except Exception as e:
        logger.error(f"Preview generation failed for lead {lead_id}: {e}")
        log_agent_action(db, "preview_generator", "generate_preview", lead_id, "error",
                         {}, 0, str(e))
        return {"status": "error", "message": str(e)}


def run_batch(limit: int = 100, force: bool = False) -> dict:
    """Generate previews for leads.
    force=True regenerates ALL leads that have any preview (re-applies the current template).
    force=False (default) only generates missing/broken previews.
    """
    db = get_db()
    if force:
        # Get lead IDs that already have a preview row — regenerate all of them
        result = (
            db.table("previews")
            .select("lead_id")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        lead_ids = list({r["lead_id"] for r in (result.data or []) if r.get("lead_id")})
    else:
        result = (
            db.table("leads")
            .select("id")
            .eq("status", "preview_ready")
            .limit(limit)
            .execute()
        )
        lead_ids = [r["id"] for r in (result.data or [])]

    generated = 0
    skipped = 0
    errors = 0
    for lead_id in lead_ids:
        outcome = run(lead_id, force=force)
        if outcome["status"] == "success":
            generated += 1
        elif outcome["status"] == "skipped":
            skipped += 1
        else:
            errors += 1
    logger.info(f"Preview batch (force={force}): {generated} regenerated, {skipped} skipped, {errors} errors")
    return {"generated": generated, "skipped": skipped, "errors": errors}
