"""
Webhooks endpoint
Handles inbound replies from email (Gmail polling), SMS (Twilio), and Stripe payments.
"""
from fastapi import APIRouter, Request, HTTPException, Form
from db.client import get_db
from agents import notification_agent, followup_agent
from config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/twilio/sms")
async def twilio_sms_webhook(
    request: Request,
    From: str = Form(...),
    Body: str = Form(...),
    MessageSid: str = Form(default=""),
):
    """
    Twilio sends POST to this URL when an SMS is received.
    Set your Twilio webhook URL to: https://your-backend.com/webhooks/twilio/sms
    """
    db = get_db()
    incoming_phone = From.strip()

    # Find the lead by phone number
    clean = incoming_phone.replace("+44", "0").replace("+", "")
    result = db.table("leads").select("*").ilike("phone", f"%{clean[-9:]}%").execute()

    if result.data:
        lead = result.data[0]
        lead_id = lead["id"]

        # Log inbound message
        db.table("outreach_messages").insert({
            "lead_id": lead_id,
            "channel": "sms",
            "direction": "inbound",
            "body": Body,
            "status": "replied",
            "twilio_sid": MessageSid,
        }).execute()

        # Trigger notification
        notification_agent.notify_reply_received(lead_id, Body)

        # Stop follow-up sequence
        followup_agent.stop_sequence(lead_id, reason="replied")

    # Twilio expects a TwiML response (empty is fine)
    return {"message": "OK"}


@router.post("/inbound-email")
async def inbound_email_webhook(request: Request):
    """
    Called by your email parsing service when a reply is detected.
    Can be used with Gmail polling or a service like Mailgun/SendGrid inbound.
    Simple implementation: poll Gmail for replies on a schedule instead.
    """
    body = await request.json()
    lead_id = body.get("lead_id")
    message = body.get("message", "")

    if not lead_id:
        raise HTTPException(status_code=400, detail="lead_id required")

    db = get_db()

    # Log inbound message
    db.table("outreach_messages").insert({
        "lead_id": lead_id,
        "channel": "email",
        "direction": "inbound",
        "body": message,
        "status": "replied",
    }).execute()

    notification_agent.notify_reply_received(lead_id, message)
    followup_agent.stop_sequence(lead_id, reason="replied")

    return {"status": "ok"}


_INTEREST_KEYWORDS = [
    "yes", "yeah", "yep", "interested", "sounds good", "go ahead", "do it",
    "how much", "price", "cost", "how do i pay", "how to pay", "pay",
    "send me", "send the link", "link", "sort it", "let's do it", "lets do it",
    "i want", "sign me up", "book me in",
]


def _is_buying_intent(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in _INTEREST_KEYWORDS)


@router.post("/whatsapp-reply")
async def whatsapp_reply(request: Request):
    """
    Called by OpenClaw when a barber replies on WhatsApp.
    Looks up the lead by phone number, marks them as replied,
    and if the message shows buying intent, queues a payment link reply.
    """
    body = await request.json()
    phone = (body.get("phone") or "").strip()
    message = body.get("message", "")

    if not phone:
        raise HTTPException(status_code=400, detail="phone required")

    db = get_db()

    # Normalise to last 9 digits for matching (handles +44/07 variants)
    clean = phone.replace("+44", "0").replace("+", "").replace(" ", "").replace("-", "")
    result = db.table("leads").select("*").ilike("phone", f"%{clean[-9:]}%").execute()

    if not result.data:
        return {"status": "lead_not_found", "phone": phone}

    lead = result.data[0]
    lead_id = lead["id"]

    payment_queued = False

    # Only update if not already replied/interested/converted
    if lead.get("status") not in ("replied", "interested", "converted"):
        db.table("outreach_messages").insert({
            "lead_id": lead_id,
            "channel": "whatsapp",
            "direction": "inbound",
            "body": message,
            "status": "replied",
        }).execute()

        notification_agent.notify_reply_received(lead_id, message)
        followup_agent.stop_sequence(lead_id, reason="replied")

    # If the barber is showing buying intent, queue a payment link reply
    if _is_buying_intent(message) and lead.get("status") not in ("converted",):
        try:
            import stripe as _stripe_lib
            _stripe_lib.api_key = settings.STRIPE_SECRET_KEY
            session = _stripe_lib.checkout.Session.create(
                mode="payment",
                success_url=settings.STRIPE_SUCCESS_URL + f"&lead={lead_id}",
                cancel_url=settings.STRIPE_CANCEL_URL,
                metadata={"lead_id": lead_id, "business_name": lead.get("business_name", "")},
                payment_method_types=["card"],
                line_items=[{
                    "price_data": {
                        "currency": "gbp",
                        "unit_amount": 7500,
                        "product_data": {
                            "name": "Website Deposit — L&D Designs",
                            "description": f"£75 deposit for {lead.get('business_name', 'your barber website')}",
                        },
                    },
                    "quantity": 1,
                }],
            )
            reply_body = (
                f"Brilliant! To get started I just need a £75 deposit — "
                f"pay securely here: {session.url} 🔥 "
                f"Once it's done I'll crack on straight away."
            )
            db.table("outreach_messages").insert({
                "lead_id": lead_id,
                "channel": "whatsapp",
                "direction": "outbound",
                "body": reply_body,
                "status": "queued",
                "approved_by_founder": False,
            }).execute()
            db.table("leads").update({"notes": f"stripe_session:{session.id}"}).eq("id", lead_id).execute()
            payment_queued = True
            logger.info(f"Payment link reply queued for {lead.get('business_name')} (lead {lead_id})")
        except Exception as e:
            logger.warning(f"Could not queue payment link for lead {lead_id}: {e}")

    return {
        "status": "ok",
        "lead_id": lead_id,
        "business_name": lead.get("business_name"),
        "payment_queued": payment_queued,
    }


@router.post("/manual-reply/{lead_id}")
async def log_manual_reply(lead_id: str, request: Request):
    """
    Founder manually logs a reply when they get a WhatsApp/call.
    Triggers all the same notification + follow-up stopping logic.
    """
    body = await request.json()
    message = body.get("message", "Manual reply logged")

    db = get_db()
    db.table("outreach_messages").insert({
        "lead_id": lead_id,
        "channel": "whatsapp",
        "direction": "inbound",
        "body": message,
        "status": "replied",
    }).execute()

    notification_agent.notify_reply_received(lead_id, message)
    followup_agent.stop_sequence(lead_id, reason="replied")

    return {"status": "logged", "lead_id": lead_id}


@router.post("/stripe")
async def stripe_webhook(request: Request):
    """
    Stripe sends payment events here.
    On checkout.session.completed: mark lead converted + notify Dylan.
    Set webhook URL in Stripe Dashboard → Webhooks → Add endpoint.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET not set — add it to Railway Variables")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.error(f"Stripe webhook signature error: {e}")
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        lead_id = session.get("metadata", {}).get("lead_id")
        business_name = session.get("metadata", {}).get("business_name", "Unknown")
        amount_gbp = session.get("amount_total", 7500) / 100

        if lead_id:
            db = get_db()

            # Mark lead converted
            db.table("leads").update({"status": "converted"}).eq("id", lead_id).execute()

            # Stop follow-up sequences
            followup_agent.stop_sequence(lead_id, reason="converted")

            # Notify Dylan
            db.table("notifications").insert({
                "lead_id": lead_id,
                "type": "payment_received",
                "title": f"💰 Deposit received from {business_name}!",
                "body": f"£{amount_gbp:.0f} deposit paid. Build their site — use the preview as the base. Aim for 3 days.",
                "action_url": f"/leads/{lead_id}",
            }).execute()

            # Auto-send onboarding message to lead via outreach queue
            db.table("outreach_messages").insert({
                "lead_id": lead_id,
                "channel": "whatsapp",
                "direction": "outbound",
                "body": (
                    f"Sorted! Deposit received — I'll get started on your site. "
                    f"Just need a couple of things from you whenever you get a minute: "
                    f"your opening hours, list of services, and any photos you'd like on it. "
                    f"Should be ready for your approval within 3 days. 🔥"
                ),
                "status": "queued",
                "approved_by_founder": True,
            }).execute()

            # Notify via email
            try:
                notification_agent._send_founder_email(
                    subject=f"💰 £{amount_gbp:.0f} deposit from {business_name} — L&D Designs",
                    body=(
                        f"Deposit received!\n\n"
                        f"Business: {business_name}\n"
                        f"Amount: £{amount_gbp:.0f}\n"
                        f"Lead ID: {lead_id}\n\n"
                        f"Onboarding message queued for WhatsApp.\n"
                        f"Build starts now. Use the preview as the base.\n\n"
                        f"L&D Designs Platform"
                    ),
                )
            except Exception as e:
                logger.warning(f"Email alert failed (non-critical): {e}")

            logger.info(f"Stripe payment processed: {business_name} → converted (lead {lead_id})")

    return {"received": True}
