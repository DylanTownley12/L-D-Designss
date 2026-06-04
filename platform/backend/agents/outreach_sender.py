"""
Outreach Sender Agent
Sends emails via Gmail SMTP and SMS via Twilio.
Has rate limiting, retry logic, and full logging.
"""
import smtplib
import logging
import time
from datetime import datetime, date, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from config import settings
from db.client import get_db
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)


# ── Rate limit tracking ────────────────────────────────────────────────

def _get_today_send_count(db, channel: str) -> int:
    """Count messages sent today for rate limiting."""
    today = date.today().isoformat()
    result = (
        db.table("outreach_messages")
        .select("id", count="exact")
        .eq("channel", channel)
        .eq("direction", "outbound")
        .eq("status", "sent")
        .gte("sent_at", f"{today}T00:00:00")
        .execute()
    )
    return result.count or 0


def _is_rate_limited(db, channel: str) -> bool:
    count = _get_today_send_count(db, channel)
    limit = settings.MAX_EMAILS_PER_DAY if channel == "email" else settings.MAX_SMS_PER_DAY
    return count >= limit


# ── Gmail SMTP ─────────────────────────────────────────────────────────

def _send_email(to_email: str, subject: str, body: str) -> dict:
    """Send an email via Gmail SMTP. Returns {'success': bool, 'error': str|None, 'gmail_message_id': str|None}."""
    try:
        msg = MIMEMultipart()
        msg["From"] = settings.GMAIL_ADDRESS
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        # Capture the generated Message-ID before sending so we can detect replies later
        gmail_message_id = msg.get("Message-ID")

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.GMAIL_ADDRESS, settings.GMAIL_APP_PASSWORD)
            server.sendmail(settings.GMAIL_ADDRESS, to_email, msg.as_string())

        return {"success": True, "error": None, "gmail_message_id": gmail_message_id}

    except smtplib.SMTPAuthenticationError:
        return {"success": False, "error": "Gmail auth failed — check App Password in .env", "gmail_message_id": None}
    except smtplib.SMTPRecipientsRefused:
        return {"success": False, "error": f"Email address rejected: {to_email}", "gmail_message_id": None}
    except Exception as e:
        return {"success": False, "error": str(e), "gmail_message_id": None}


# ── SMS Sending (TextMagic preferred, Twilio fallback) ─────────────────

def _format_uk_phone(phone: str) -> str:
    p = phone.strip()
    if p.startswith("0"):
        return "+44" + p[1:]
    if not p.startswith("+"):
        return "+" + p
    return p


def _send_sms_textmagic(to_phone: str, body: str) -> dict:
    try:
        import textmagic.rest
        from textmagic.rest import TextmagicRestClient
        client = TextmagicRestClient(settings.TEXTMAGIC_USERNAME, settings.TEXTMAGIC_API_KEY)
        formatted = _format_uk_phone(to_phone)
        response = client.messages.create(phones=formatted, text=body)
        return {"success": True, "sid": str(response.id), "error": None}
    except Exception as e:
        return {"success": False, "sid": None, "error": str(e)}


def _send_sms_twilio(to_phone: str, body: str) -> dict:
    try:
        from twilio.rest import Client as TwilioClient
        client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        message = client.messages.create(
            body=body,
            from_=settings.TWILIO_FROM_NUMBER,
            to=_format_uk_phone(to_phone),
        )
        return {"success": True, "sid": message.sid, "error": None}
    except Exception as e:
        return {"success": False, "sid": None, "error": str(e)}


def _send_sms(to_phone: str, body: str) -> dict:
    """Send SMS via TextMagic (preferred) or Twilio (fallback)."""
    if not settings.sms_enabled:
        return {"success": False, "error": "No SMS provider configured — add TEXTMAGIC_USERNAME and TEXTMAGIC_API_KEY to Railway Variables"}

    if settings.sms_provider == "textmagic":
        return _send_sms_textmagic(to_phone, body)
    return _send_sms_twilio(to_phone, body)


# ── Main send function ─────────────────────────────────────────────────

def send_message(message_id: str, retry: bool = False) -> dict:
    """
    Send a queued/approved outreach message.
    Looks up the message by ID, validates it, then sends.
    """
    start = datetime.now()
    db = get_db()

    msg_result = db.table("outreach_messages").select("*, leads(*)").eq("id", message_id).single().execute()
    if not msg_result.data:
        return {"success": False, "error": "Message not found"}

    msg = msg_result.data
    lead = msg.get("leads") or {}

    # Check approval requirement
    if settings.REQUIRE_APPROVAL and not msg.get("approved_by_founder"):
        return {"success": False, "error": "Message not yet approved by founder"}

    # Rate limiting
    if _is_rate_limited(db, msg["channel"]):
        db.table("outreach_messages").update({"status": "queued"}).eq("id", message_id).execute()
        return {"success": False, "error": f"Daily {msg['channel']} limit reached. Message stays queued."}

    # WhatsApp messages are sent manually — skip automated sending
    if msg["channel"] == "whatsapp":
        return {"success": False, "error": "WhatsApp messages are sent manually"}

    # Send
    result = {"success": False, "error": "Unknown channel"}
    extra_data = {}

    if msg["channel"] == "email":
        to_email = lead.get("email") or msg.get("to_email")
        if not to_email:
            return {"success": False, "error": "No email address for lead"}
        result = _send_email(to_email, msg.get("subject", ""), msg["body"])
        if result.get("gmail_message_id"):
            extra_data["gmail_message_id"] = result["gmail_message_id"]

    elif msg["channel"] == "sms":
        to_phone = lead.get("phone")
        if not to_phone:
            return {"success": False, "error": "No phone number for lead"}
        result = _send_sms(to_phone, msg["body"])
        if result.get("sid"):
            extra_data["twilio_sid"] = result["sid"]

    # Update message status in DB
    update_data = {
        "status": "sent" if result["success"] else "failed",
        "sent_at": datetime.now(timezone.utc).isoformat() if result["success"] else None,
        **extra_data,
    }
    db.table("outreach_messages").update(update_data).eq("id", message_id).execute()

    # Update lead status if first outreach
    if result["success"] and lead.get("status") in ("new", "preview_ready", "outreach_queued"):
        db.table("leads").update({"status": "outreach_sent"}).eq("id", lead["id"]).execute()
        # Start follow-up sequence so Day 3/7/14 messages fire automatically
        from agents import followup_agent
        followup_agent.start_sequence(lead["id"], msg["channel"])

    duration_ms = int((datetime.now() - start).total_seconds() * 1000)
    log_agent_action(
        db, "outreach_sender", f"send_{msg['channel']}", lead.get("id"),
        "success" if result["success"] else "error",
        {"message_id": message_id, **extra_data},
        duration_ms, result.get("error"),
    )

    return result


def process_queue(max_send: int = 10) -> dict:
    """
    Process the outreach queue — send email/SMS messages.
    Picks up status 'queued' OR 'approved'. WhatsApp is handled by Baz via OpenClaw.
    Called by the scheduler every 30 mins.
    """
    db = get_db()
    sent = 0
    failed = 0
    skipped = 0

    result = (
        db.table("outreach_messages")
        .select("id, channel, approved_by_founder")
        .in_("status", ["queued", "approved"])
        .neq("channel", "whatsapp")
        .order("created_at")
        .limit(max_send)
        .execute()
    )

    for msg in (result.data or []):
        if _is_rate_limited(db, msg["channel"]):
            skipped += 1
            continue

        # Auto-approve AI-generated messages if REQUIRE_APPROVAL is off
        if not msg.get("approved_by_founder") and not settings.REQUIRE_APPROVAL:
            db.table("outreach_messages").update({"approved_by_founder": True}) \
                .eq("id", msg["id"]).execute()

        outcome = send_message(msg["id"])
        if outcome["success"]:
            sent += 1
        else:
            failed += 1

        time.sleep(3)  # 3s delay between sends to avoid spam flags

    return {"sent": sent, "failed": failed, "skipped": skipped}
