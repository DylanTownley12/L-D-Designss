"""
Missed Call Text-Back Agent
When a tradesperson misses a call, fires an SMS back to the caller within seconds.
This is the product we sell to tradespeople — £49/mo.
"""
import logging
from datetime import datetime
from db.client import get_db
from config import settings

logger = logging.getLogger(__name__)

DEFAULT_MESSAGES = {
    "plumber": "Hi, sorry I missed your call! I'm currently on a job. I'll call you back as soon as I'm free — usually within the hour. If it's urgent, reply with your postcode and I'll do my best. — {name}",
    "electrician": "Hi, sorry I missed your call! I'm on a job right now but I'll call you back shortly. If it's urgent, reply to this message. — {name}",
    "builder": "Hi, missed your call — sorry about that! I'm out on site at the moment. I'll ring you back as soon as I can. Feel free to reply here if easier. — {name}",
    "carpenter": "Hi, just missed your call! Busy on a job right now. I'll call you back soon. Reply here if you'd prefer. — {name}",
    "painter": "Hi, sorry I missed your call! I'll call you back as soon as I wrap up. Reply here if you need anything. — {name}",
    "default": "Hi, sorry I missed your call! I'm busy at the moment but I'll call you back as soon as I can. — {name}",
}


def get_textback_message(client: dict) -> str:
    """Build the SMS text-back message for a client."""
    template = DEFAULT_MESSAGES.get(
        (client.get("trade") or "default").lower(),
        DEFAULT_MESSAGES["default"]
    )
    custom = client.get("custom_message")
    if custom:
        template = custom
    return template.format(name=client.get("business_name", "").split()[0] or "the team")


def handle_missed_call(client_id: str, caller_number: str) -> dict:
    """
    Fire a text-back SMS when a client misses a call.
    Called by webhook when Twilio/TextMagic detects a missed call.
    """
    db = get_db()
    start = datetime.now()

    # Load client
    client_result = db.table("textback_clients").select("*").eq("id", client_id).single().execute()
    if not client_result.data:
        return {"success": False, "error": "Client not found"}

    client = client_result.data

    if not client.get("active"):
        return {"success": False, "error": "Client subscription is not active"}

    # Build message
    message = get_textback_message(client)

    # Send via TextMagic (preferred) or Twilio
    result = _send_sms(caller_number, message)

    # Log the event
    db.table("textback_events").insert({
        "client_id": client_id,
        "caller_number": caller_number,
        "message_sent": message,
        "success": result["success"],
        "error": result.get("error"),
        "provider_sid": result.get("sid"),
        "fired_at": datetime.now().isoformat(),
    }).execute()

    # Update client stats
    if result["success"]:
        db.table("textback_clients").update({
            "total_textbacks_sent": (client.get("total_textbacks_sent") or 0) + 1,
            "last_textback_at": datetime.now().isoformat(),
        }).eq("id", client_id).execute()

    # Record it as a captured lead too — so the missed call shows on the client's
    # dashboard, counts toward their trial, and pings the founders on Telegram.
    # (source != 'form', so this never re-texts the caller — the text-back above is
    # the only message they get.) Never let this break the text-back itself.
    try:
        from agents import lead_capture
        lead_capture.record_lead(client_id, caller_number, source="missed_call")
    except Exception as e:
        logger.warning(f"[textback] captured_lead record failed (non-critical): {e}")

    duration_ms = int((datetime.now() - start).total_seconds() * 1000)
    logger.info(
        f"Textback {'sent' if result['success'] else 'FAILED'} for client {client.get('business_name')} "
        f"→ {caller_number} in {duration_ms}ms"
    )

    return result


def _send_sms(to_phone: str, body: str) -> dict:
    from agents.outreach_sender import _format_uk_phone, _send_sms_textmagic, _send_sms_twilio
    formatted = _format_uk_phone(to_phone)

    if settings.sms_provider == "textmagic":
        return _send_sms_textmagic(formatted, body)
    elif settings.sms_provider == "twilio":
        return _send_sms_twilio(formatted, body)
    return {"success": False, "error": "No SMS provider configured"}


def get_client_stats(client_id: str) -> dict:
    """Get stats for a single client's text-back service."""
    db = get_db()
    from datetime import date, timedelta

    today = date.today().isoformat()
    week_ago = (date.today() - timedelta(days=7)).isoformat()

    client = db.table("textback_clients").select("*").eq("id", client_id).single().execute().data
    if not client:
        return {}

    events_today = (
        db.table("textback_events")
        .select("id", count="exact")
        .eq("client_id", client_id)
        .eq("success", True)
        .gte("fired_at", f"{today}T00:00:00")
        .execute()
    ).count or 0

    events_week = (
        db.table("textback_events")
        .select("id", count="exact")
        .eq("client_id", client_id)
        .eq("success", True)
        .gte("fired_at", f"{week_ago}T00:00:00")
        .execute()
    ).count or 0

    recent = (
        db.table("textback_events")
        .select("*")
        .eq("client_id", client_id)
        .order("fired_at", desc=True)
        .limit(10)
        .execute()
    ).data or []

    return {
        **client,
        "events_today": events_today,
        "events_this_week": events_week,
        "recent_events": recent,
    }
