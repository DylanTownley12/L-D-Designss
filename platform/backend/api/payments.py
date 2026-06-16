"""
Stripe payment endpoints
POST /api/payments/create-checkout/{lead_id} — creates the £199 build + £29/mo checkout session
GET  /api/payments/link/{lead_id}            — returns a shareable checkout URL
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from db.client import get_db
from config import settings
from utils.helpers import log_agent_action
from api.sales import require_ops_key

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
    """Create a Stripe Checkout session for a lead: £199 one-off build + £29/month
    (hosting, updates, booking). One subscription session — the £199 build lands on the
    first invoice alongside the first £29, then £29/month recurs on the saved card.
    This is the ONLY allowed offer (£199 + £29); never the old £75/£175 deposit."""
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="STRIPE_SECRET_KEY not configured — add it to Railway Variables")

    db = get_db()
    lead = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not lead.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    lead = lead.data
    biz = lead.get("business_name") or "your business"
    stripe = _stripe()

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            success_url=settings.STRIPE_SUCCESS_URL + f"&lead={lead_id}",
            cancel_url=settings.STRIPE_CANCEL_URL,
            metadata={
                "lead_id": lead_id,
                "business_name": lead.get("business_name", ""),
                "city": lead.get("city", ""),
            },
            subscription_data={"metadata": {"lead_id": lead_id}},
            billing_address_collection="auto",
            line_items=[
                {"price_data": {
                    "currency": "gbp", "unit_amount": 19900,  # £199 one-off build
                    "product_data": {
                        "name": f"Website build — {biz}",
                        "description": "One-off build of your live website by L&D Designs",
                    }}, "quantity": 1},
                {"price_data": {
                    "currency": "gbp", "unit_amount": 2900,  # £29/month recurring
                    "recurring": {"interval": "month"},
                    "product_data": {
                        "name": f"Hosting, updates & booking system — {biz}",
                        "description": "All-in monthly: hosting, changes, online booking. Cancel any time.",
                    }}, "quantity": 1},
            ],
        )

        # Append the session id without clobbering existing call notes — get_payment_status
        # splits notes on ";" looking for "stripe_session:".
        existing = (lead.get("notes") or "").strip()
        notes = f"{existing}; stripe_session:{session.id}" if existing else f"stripe_session:{session.id}"
        db.table("leads").update({"notes": notes}).eq("id", lead_id).execute()
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


# ── TRADES: £199 build + £29/month, one checkout ──────────────────────
@router.post("/trades-checkout/{name_or_id}")
async def trades_checkout(name_or_id: str, _=Depends(require_ops_key)):
    """Founder-only: create the trades payment link for a prospect (fuzzy name or id).
    One Stripe Checkout in subscription mode — the one-time £199 build lands on the
    first invoice alongside the first £29, then £29/month recurs on the saved card.
    The founder forwards the link personally; the system never sends it to a prospect."""
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="STRIPE_SECRET_KEY not configured")
    from agents import trades
    p = trades.find_prospect(name_or_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"No prospect found for '{name_or_id}'")
    biz = p.get("business_name") or "your business"
    stripe = _stripe()
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            success_url=settings.STRIPE_SUCCESS_URL,
            cancel_url=settings.STRIPE_CANCEL_URL,
            metadata={"kind": "trades_build", "prospect_id": p["id"], "business_name": biz},
            subscription_data={"metadata": {"kind": "trades_build", "prospect_id": p["id"]}},
            billing_address_collection="auto",
            line_items=[
                {"price_data": {
                    "currency": "gbp", "unit_amount": 19900,
                    "product_data": {
                        "name": f"Website build — {biz}",
                        "description": "One-off build of your live website by L&D Designs",
                    }}, "quantity": 1},
                {"price_data": {
                    "currency": "gbp", "unit_amount": 2900,
                    "recurring": {"interval": "month"},
                    "product_data": {
                        "name": f"Hosting, updates & booking system — {biz}",
                        "description": "All-in monthly: hosting, changes, online booking. Cancel any time.",
                    }}, "quantity": 1},
            ],
        )
        trades.log_event("payments", f"💳 payment link created for {biz}", "info",
                         {"metric_ok": True, "session": session.id})
        return {"ok": True, "checkout_url": session.url, "session_id": session.id,
                "prospect_id": p["id"], "business_name": biz,
                "message": f"£199 + £29/mo link for {biz}: {session.url}"}
    except Exception as e:
        logger.error(f"trades checkout failed for {biz}: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)[:200]}")
