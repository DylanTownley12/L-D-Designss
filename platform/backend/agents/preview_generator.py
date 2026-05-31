"""
Preview Generator Agent
Creates a personalized barber website preview for each lead.
Uses Jinja2 to fill in the HTML template with real lead data.
The preview URL is what we send in outreach — "here's what your site could look like."
"""
import os
import logging
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from db.client import get_db
from config import settings
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"

jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)

# Default gallery images (Unsplash — free, no attribution required for preview)
DEFAULT_GALLERY = [
    {"url": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400", "alt": "Fresh haircut"},
    {"url": "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400", "alt": "Barber at work"},
    {"url": "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400", "alt": "Classic cut"},
    {"url": "https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=400", "alt": "Styling session"},
    {"url": "https://images.unsplash.com/photo-1621605815971-8ca28ed73af1?w=400", "alt": "Fade cut"},
    {"url": "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400", "alt": "Barber shop"},
    {"url": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400", "alt": "Premium cut"},
    {"url": "https://images.unsplash.com/photo-1559771561-0caf62b5a8a5?w=400", "alt": "Style finish"},
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

DEFAULT_TESTIMONIALS = [
    {"rating": 5, "text": "Best barbers in the area by far. Always leave looking fresh and the lads are sound.", "author": "James M."},
    {"rating": 5, "text": "Been coming here for years. Wouldn't go anywhere else. Proper quality cuts every time.", "author": "Ryan T."},
    {"rating": 5, "text": "Brilliant service, really friendly atmosphere. Kids love coming here too!", "author": "Sarah K."},
]


def _build_context(lead: dict) -> dict:
    """Build the Jinja2 template context from lead data."""
    name = lead.get("business_name", "Your Barbers")
    city = lead.get("city", "Your Town")
    phone = lead.get("phone", "")
    address = lead.get("address", city)

    whatsapp_number = (phone or "").replace(" ", "").replace("+", "").replace("-", "")
    if whatsapp_number.startswith("0"):
        whatsapp_number = "44" + whatsapp_number[1:]

    return {
        "business_name": name,
        "city": city,
        "phone": phone or "Call us",
        "address": address,
        "postcode": lead.get("postcode", ""),
        "email": lead.get("email", ""),
        "google_rating": lead.get("google_rating"),
        "google_reviews": lead.get("google_reviews") or 0,
        "instagram_url": lead.get("instagram_url", ""),
        "facebook_url": lead.get("facebook_url", ""),
        "meta_description": f"Book your haircut at {name} in {city}. Professional barbers, walk-ins welcome.",
        "tagline": f"Professional barbers serving {city} and the surrounding area.",
        "hero_image_url": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200",
        "barber_image_url": "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600",
        "booking_url": f"https://wa.me/{whatsapp_number}?text=Hi%2C%20I%27d%20like%20to%20book%20an%20appointment",
        "whatsapp_url": f"https://wa.me/{whatsapp_number}",
        "about_heading": f"Your Local Barbers in {city}",
        "about_text": (
            f"{name} is a trusted local barbershop serving the {city} community. "
            "We pride ourselves on quality cuts, a welcoming atmosphere, and making sure every client "
            "leaves looking and feeling their best."
        ),
        "highlights": [
            f"Serving {city} and surrounding areas",
            "Walk-ins always welcome",
            "Friendly, experienced barbers",
            "Competitive prices, no hidden fees",
        ],
        "years_experience": "5",
        "happy_clients": "500",
        "services": DEFAULT_SERVICES,
        "gallery_images": DEFAULT_GALLERY,
        "testimonials": DEFAULT_TESTIMONIALS,
        "opening_hours": DEFAULT_HOURS,
        "google_maps_embed": "",
        "social_links": {
            "instagram": lead.get("instagram_url", ""),
            "facebook": lead.get("facebook_url", ""),
        },
        # Watermark/credit
        "agency_name": settings.BUSINESS_NAME,
        "agency_url": settings.BUSINESS_WEBSITE,
        # Preview notice (shown at top)
        "is_preview": True,
        "preview_message": (
            f"👋 Hi {name}! This is a FREE preview website I built for you. "
            "Want it live? Reply to my message and I'll get it sorted."
        ),
    }


def run(lead_id: str, force: bool = False) -> dict:
    """Generate a preview website for a lead and save it.
    force=True overwrites existing html_content even if it looks complete.
    """
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
        if not force and len(html_stored) > 10000 and "/previews/serve/" in existing_url:
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
        context = _build_context(lead)
        template = jinja_env.get_template("barber_site.html")
        html = template.render(**context)

        base = settings.preview_base_url_resolved.replace("/previews", "").rstrip("/")
        personalization = {
            "business_name": lead.get("business_name"),
            "city": lead.get("city"),
            "phone": lead.get("phone"),
        }

        if existing_id:
            # Update existing row with full HTML
            preview_url = f"{base}/previews/serve/{existing_id}"
            db.table("previews").update({
                "preview_url": preview_url,
                "html_content": html,
                "personalization_data": personalization,
            }).eq("id", existing_id).execute()
        else:
            # Insert new row — let Supabase generate the UUID, then update the URL
            insert_result = db.table("previews").insert({
                "lead_id": lead_id,
                "html_content": html,
                "personalization_data": personalization,
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
