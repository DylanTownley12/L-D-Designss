"""
Preview Generator Agent
Creates a personalized barber website preview for each lead.
Uses Jinja2 to fill in the HTML template with real lead data.
The preview URL is what we send in outreach — "here's what your site could look like."
"""
import os
import uuid
import logging
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from db.client import get_db
from config import settings
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"
PREVIEW_DIR = Path(__file__).parent.parent / "static" / "previews"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

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
    {"icon": "✂️", "name": "Classic Cut", "description": "A timeless cut tailored to your style. Includes wash and styling.", "price": "from £15", "duration": "30 min"},
    {"icon": "🪒", "name": "Skin Fade", "description": "Sharp fade down to the skin. Clean lines every time.", "price": "from £18", "duration": "40 min"},
    {"icon": "👶", "name": "Kids Cut", "description": "Patient and friendly cuts for the little ones.", "price": "from £10", "duration": "25 min"},
    {"icon": "🧔", "name": "Beard Trim", "description": "Shape and define your beard to perfection.", "price": "from £8", "duration": "20 min"},
    {"icon": "💆", "name": "Full Groom", "description": "Cut + beard combo for the full treatment.", "price": "from £25", "duration": "60 min"},
    {"icon": "💈", "name": "Hot Towel Shave", "description": "Traditional straight razor shave with hot towel finish.", "price": "from £20", "duration": "45 min"},
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


def run(lead_id: str) -> dict:
    """Generate a preview website for a lead and save it."""
    start = datetime.now()
    db = get_db()

    result = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not result.data:
        return {"status": "error", "message": "Lead not found"}

    lead = result.data

    try:
        context = _build_context(lead)
        template = jinja_env.get_template("barber_site.html")
        html = template.render(**context)

        # Save HTML file
        preview_id = str(uuid.uuid4())[:8]
        filename = f"{preview_id}.html"
        filepath = PREVIEW_DIR / filename
        filepath.write_text(html, encoding="utf-8")

        preview_url = f"{settings.PREVIEW_BASE_URL}/{filename}"

        # Save to database
        db.table("previews").insert({
            "lead_id": lead_id,
            "preview_url": preview_url,
            "html_content": html[:5000],  # Store first 5KB for reference
            "personalization_data": {
                "business_name": lead.get("business_name"),
                "city": lead.get("city"),
                "phone": lead.get("phone"),
            },
        }).execute()

        # Update lead status
        db.table("leads").update({"status": "preview_ready"}).eq("id", lead_id).execute()

        duration_ms = int((datetime.now() - start).total_seconds() * 1000)
        log_agent_action(db, "preview_generator", "generate_preview", lead_id, "success",
                         {"preview_url": preview_url, "filename": filename}, duration_ms)

        return {
            "status": "success",
            "preview_url": preview_url,
            "filename": filename,
            "lead_id": lead_id,
        }

    except Exception as e:
        logger.error(f"Preview generation failed for lead {lead_id}: {e}")
        log_agent_action(db, "preview_generator", "generate_preview", lead_id, "error",
                         {}, 0, str(e))
        return {"status": "error", "message": str(e)}


def run_batch(limit: int = 20) -> dict:
    """Generate previews for a batch of preview_ready leads with no website."""
    db = get_db()
    result = (
        db.table("leads")
        .select("id")
        .eq("status", "preview_ready")
        .eq("website_status", "none")
        .limit(limit)
        .execute()
    )
    leads = result.data or []
    generated = 0
    errors = 0
    for lead in leads:
        outcome = run(lead["id"])
        if outcome["status"] == "success":
            generated += 1
        else:
            errors += 1
    logger.info(f"Preview batch: {generated} generated, {errors} errors")
    return {"generated": generated, "errors": errors}
