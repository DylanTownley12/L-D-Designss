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


@router.post("/whatsapp-reply")
async def whatsapp_reply(request: Request):
    """
    Called by OpenClaw when a barber replies on WhatsApp.
    Looks up the lead by phone number and marks them as replied.
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

    return {"status": "ok", "lead_id": lead_id, "business_name": lead.get("business_name")}


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
        meta = session.get("metadata", {}) or {}
        lead_id = meta.get("lead_id")
        business_name = meta.get("business_name", "Unknown")
        amount_gbp = (session.get("amount_total") or 7500) / 100

        # TRADES: £199 build + £29/mo paid → prospect WON + loud alert (Herald
        # relays it to Dylan's WhatsApp within minutes).
        if meta.get("kind") == "trades_build" and meta.get("prospect_id"):
            try:
                from agents import trades
                from datetime import datetime, timezone
                pid = meta["prospect_id"]
                get_db().table("prospects").update({
                    "status": "won",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", pid).execute()
                trades.log_event("payments",
                                 f"💰 PAID — {business_name} paid £{amount_gbp:.0f} (£199 build + £29/mo live)",
                                 "success", {"metric_ok": True, "prospect_id": pid})
                trades.raise_alert("payment", f"💰 {business_name} PAID £{amount_gbp:.0f} — build their real site!",
                                   "success", entity="prospect", entity_id=pid)
                # Onboarding: provision the client (once), mark the build paid, and
                # drop the build task on D's list — paid customers never wait on memory.
                pr = (get_db().table("prospects").select("converted_client_id")
                      .eq("id", pid).single().execute().data or {})
                cid = pr.get("converted_client_id")
                if not cid:
                    conv = trades.convert_prospect_to_client(pid, monthly_fee=29.0)
                    cid = conv.get("client_id")
                if cid:
                    get_db().table("textback_clients").update({
                        "build_paid": True,
                        "build_paid_at": datetime.now(timezone.utc).isoformat(),
                        "plan_status": "active",
                    }).eq("id", cid).execute()
                trades.create_task(f"Build {business_name}'s real site — PAID £{amount_gbp:.0f}",
                                   owner="D", created_by="stripe_webhook")
            except Exception as e:
                logger.error(f"trades payment handling failed (payment IS captured in Stripe): {e}")
            return {"status": "processed", "kind": "trades_build"}

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
