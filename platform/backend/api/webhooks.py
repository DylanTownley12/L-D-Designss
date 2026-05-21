"""
Webhooks endpoint
Handles inbound replies from Twilio SMS, email parsing services,
and n8n workflow callbacks.
"""
import logging
from datetime import date

from fastapi import APIRouter, Request, HTTPException, Form
from db.client import get_db
from agents import notification_agent, followup_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ── Shared helper ─────────────────────────────────────────────────────────────

def _verify_n8n_secret(request: Request) -> None:
    from config import settings
    received = request.headers.get("X-N8N-Secret", "")
    if received != settings.N8N_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Twilio SMS ────────────────────────────────────────────────────────────────

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

        db.table("outreach_messages").insert({
            "lead_id": lead_id,
            "channel": "sms",
            "direction": "inbound",
            "body": Body,
            "status": "replied",
            "twilio_sid": MessageSid,
        }).execute()

        notification_agent.notify_reply_received(lead_id, Body)
        followup_agent.stop_sequence(lead_id, reason="replied")

        from utils import n8n
        n8n.trigger("lead-reply-alert", {"lead_id": lead_id, "channel": "sms", "message": Body})

    return {"message": "OK"}


# ── Inbound email ─────────────────────────────────────────────────────────────

@router.post("/inbound-email")
async def inbound_email_webhook(request: Request):
    """
    Called by your email parsing service when a reply is detected.
    Can be used with Gmail polling or Mailgun/SendGrid inbound.
    """
    body = await request.json()
    lead_id = body.get("lead_id")
    message = body.get("message", "")

    if not lead_id:
        raise HTTPException(status_code=400, detail="lead_id required")

    db = get_db()
    db.table("outreach_messages").insert({
        "lead_id": lead_id,
        "channel": "email",
        "direction": "inbound",
        "body": message,
        "status": "replied",
    }).execute()

    notification_agent.notify_reply_received(lead_id, message)
    followup_agent.stop_sequence(lead_id, reason="replied")

    from utils import n8n
    n8n.trigger("lead-reply-alert", {"lead_id": lead_id, "channel": "email", "message": message})

    return {"status": "ok"}


# ── Manual reply ──────────────────────────────────────────────────────────────

@router.post("/manual-reply/{lead_id}")
async def log_manual_reply(lead_id: str, request: Request):
    """
    Founder manually logs a reply when they get a WhatsApp/call.
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

    from utils import n8n
    n8n.trigger("lead-reply-alert", {"lead_id": lead_id, "channel": "whatsapp", "message": message})

    return {"status": "logged", "lead_id": lead_id}


# ── n8n callbacks ─────────────────────────────────────────────────────────────

@router.post("/n8n/daily-summary")
async def n8n_daily_summary(request: Request):
    """
    n8n calls this on its daily schedule to send the founder a stats email.
    The backend handles email sending so n8n doesn't need Gmail credentials.
    """
    _verify_n8n_secret(request)

    from config import settings
    import smtplib
    from email.mime.text import MIMEText

    db = get_db()
    today = date.today().isoformat()

    def count(table, **filters):
        q = db.table(table).select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        return q.execute().count or 0

    total = count("leads")
    replied = count("leads", status="replied")
    interested = count("leads", status="interested")
    converted = count("leads", status="converted")
    queued = count("outreach_messages", status="queued", direction="outbound")
    emails_today = db.table("outreach_messages").select("id", count="exact").eq("channel", "email").eq("status", "sent").gte("sent_at", f"{today}T00:00:00").execute().count or 0

    subject = f"L&D Designs Daily Summary — {today}"
    body = (
        f"Good morning! Here's your daily pipeline update.\n\n"
        f"Total leads:       {total}\n"
        f"Replied:           {replied}\n"
        f"Interested:        {interested}\n"
        f"Converted:         {converted}\n"
        f"Emails sent today: {emails_today} / {settings.MAX_EMAILS_PER_DAY}\n"
        f"Queued messages:   {queued}\n\n"
        f"Keep going — L&D Designs Platform"
    )

    try:
        msg = MIMEText(body, "plain")
        msg["From"] = settings.GMAIL_ADDRESS
        msg["To"] = settings.FOUNDER_EMAIL or settings.GMAIL_ADDRESS
        msg["Subject"] = subject
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.GMAIL_ADDRESS, settings.GMAIL_APP_PASSWORD)
            server.sendmail(settings.GMAIL_ADDRESS, msg["To"], msg.as_string())
        logger.info("Daily summary email sent")
    except Exception as exc:
        logger.error("Daily summary email failed: %s", exc)

    return {"status": "ok", "stats": {"total": total, "replied": replied, "converted": converted}}


@router.get("/n8n/leads-export")
async def n8n_leads_export(request: Request, limit: int = 200):
    """
    n8n calls this to get all leads formatted for Airtable sync.
    Returns a flat list ready for the Airtable upsert node.
    """
    _verify_n8n_secret(request)

    db = get_db()
    result = (
        db.table("leads")
        .select("id,business_name,phone,email,city,postcode,website,status,quality_score,google_rating,google_reviews,source,created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    leads = []
    for lead in (result.data or []):
        leads.append({
            "Lead ID": lead["id"],
            "Business Name": lead.get("business_name", ""),
            "Phone": lead.get("phone", ""),
            "Email": lead.get("email", ""),
            "City": lead.get("city", ""),
            "Postcode": lead.get("postcode", ""),
            "Website": lead.get("website", ""),
            "Status": lead.get("status", ""),
            "Quality Score": lead.get("quality_score", 0),
            "Google Rating": lead.get("google_rating"),
            "Google Reviews": lead.get("google_reviews", 0),
            "Source": lead.get("source", ""),
            "Created At": lead.get("created_at", ""),
        })

    return {"leads": leads, "count": len(leads)}
