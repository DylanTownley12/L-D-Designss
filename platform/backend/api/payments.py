"""
Stripe payment endpoints
POST /api/payments/create-checkout/{lead_id} — creates a £75 deposit checkout session
GET  /api/payments/link/{lead_id}            — returns a shareable checkout URL
"""
import logging
from fastapi import APIRouter, HTTPException
from db.client import get_db
from config import settings
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])


def _stripe():
    try:
        import stripe as _stripe
        _stripe.api_key = settings.STRIPE_SECRET_KEY
        return _stripe
    except ImportError:
        raise HTTPException(status_code=503, detail="Stripe not installed")


@router.post("/create-checkout/{lead_id}")
async def create_checkout(lead_id: str):
    """Create a Stripe Checkout session for the £75 deposit for a specific lead."""
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="STRIPE_SECRET_KEY not configured — add it to Railway Variables")

    db = get_db()
    lead = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not lead.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    lead = lead.data
    stripe = _stripe()

    try:
        session_params = {
            "mode": "payment",
            "success_url": settings.STRIPE_SUCCESS_URL + f"&lead={lead_id}",
            "cancel_url": settings.STRIPE_CANCEL_URL,
            "metadata": {
                "lead_id": lead_id,
                "business_name": lead.get("business_name", ""),
                "city": lead.get("city", ""),
            },
            "payment_method_types": ["card"],
            "billing_address_collection": "auto",
        }

        if settings.STRIPE_PRICE_ID:
            session_params["line_items"] = [{"price": settings.STRIPE_PRICE_ID, "quantity": 1}]
        else:
            # Fallback: ad-hoc £175 deposit
            session_params["line_items"] = [{
                "price_data": {
                    "currency": "gbp",
                    "unit_amount": 17500,
                    "product_data": {
                        "name": "Website Deposit — L&D Designs",
                        "description": f"£175 deposit for {lead.get('business_name', 'your barber website')} — full build starts immediately",
                    },
                },
                "quantity": 1,
            }]

        session = stripe.checkout.Session.create(**session_params)

        db.table("leads").update({"notes": f"stripe_session:{session.id}"}).eq("id", lead_id).execute()
        log_agent_action(db, "payments", "checkout_created", lead_id, "success", {"session_id": session.id})

        return {
            "checkout_url": session.url,
            "session_id": session.id,
            "lead_id": lead_id,
            "business_name": lead.get("business_name"),
        }
    except Exception as e:
        logger.error(f"Stripe checkout failed for lead {lead_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{lead_id}")
async def get_payment_status(lead_id: str):
    """Return the Stripe payment status for a lead, or null if no checkout exists yet."""
    db = get_db()
    lead = db.table("leads").select("id, notes, status").eq("id", lead_id).single().execute()
    if not lead.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    notes = lead.data.get("notes") or ""
    session_id = None
    for part in notes.split(";"):
        part = part.strip()
        if part.startswith("stripe_session:"):
            session_id = part.split(":", 1)[1].strip()
            break

    if not session_id:
        return {"session_id": None, "payment_status": None, "stripe_status": None}

    if not settings.STRIPE_SECRET_KEY:
        return {"session_id": session_id, "payment_status": "unknown", "stripe_status": "unknown"}

    try:
        stripe = _stripe()
        session = stripe.checkout.Session.retrieve(session_id)
        return {
            "session_id": session_id,
            "stripe_status": session.status,
            "payment_status": session.payment_status,
            "amount_total": session.amount_total,
            "currency": session.currency,
            "created": session.created,
            "url": session.url,
        }
    except Exception as e:
        logger.warning(f"Could not retrieve Stripe session {session_id}: {e}")
        return {"session_id": session_id, "payment_status": "unknown", "stripe_status": "unknown"}


@router.get("/link/{lead_id}")
async def get_payment_link(lead_id: str):
    """Quick redirect — creates a checkout and returns the URL."""
    result = await create_checkout(lead_id)
    return {"url": result["checkout_url"]}


@router.get("/link-by-phone/{phone}")
async def get_payment_link_by_phone(phone: str):
    """Baz calls this with the barber's phone number to get a Stripe checkout URL."""
    db = get_db()
    clean = phone.replace("+44", "0").replace("+", "").replace(" ", "").replace("-", "")
    result = db.table("leads").select("id, business_name").ilike("phone", f"%{clean[-9:]}%").limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No lead found for this phone number")
    lead_id = result.data[0]["id"]
    checkout = await create_checkout(lead_id)
    return {"url": checkout["checkout_url"], "business_name": result.data[0]["business_name"]}
