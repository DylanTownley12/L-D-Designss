"""
Webhooks endpoint
Handles inbound replies from email (Gmail polling) and SMS (Twilio webhook).
When a lead replies, the notification agent is triggered.
"""
from fastapi import APIRouter, Request, HTTPException, Form
from db.client import get_db
from agents import notification_agent, followup_agent

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
