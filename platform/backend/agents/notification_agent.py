"""
Notification Agent
Creates in-app notifications when important things happen.
Also sends founder alerts via email when a lead replies.
"""
import logging
import smtplib
from email.mime.text import MIMEText
from datetime import datetime
from db.client import get_db
from config import settings
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)


def _send_founder_email(subject: str, body: str) -> bool:
    """Email the founder directly when a lead replies."""
    try:
        msg = MIMEText(body, "plain")
        msg["From"] = settings.GMAIL_ADDRESS
        msg["To"] = settings.FOUNDER_EMAIL or settings.GMAIL_ADDRESS
        msg["Subject"] = subject

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.GMAIL_ADDRESS, settings.GMAIL_APP_PASSWORD)
            server.sendmail(
                settings.GMAIL_ADDRESS,
                msg["To"],
                msg.as_string(),
            )
        return True
    except Exception as e:
        logger.error(f"Founder alert email failed: {e}")
        return False


def _get_stripe_payment_url(lead_id: str) -> str | None:
    """Create a Stripe checkout session and return the URL, or None if Stripe isn't configured."""
    try:
        from config import settings as _s
        if not _s.STRIPE_SECRET_KEY:
            return None
        import stripe as _stripe
        _stripe.api_key = _s.STRIPE_SECRET_KEY

        db = get_db()
        lead = db.table("leads").select("business_name,city").eq("id", lead_id).single().execute().data or {}

        session_params = {
            "mode": "payment",
            "success_url": _s.STRIPE_SUCCESS_URL + f"&lead={lead_id}",
            "cancel_url": _s.STRIPE_CANCEL_URL,
            "metadata": {"lead_id": lead_id, "business_name": lead.get("business_name", ""), "city": lead.get("city", "")},
            "payment_method_types": ["card"],
        }
        if _s.STRIPE_PRICE_ID:
            session_params["line_items"] = [{"price": _s.STRIPE_PRICE_ID, "quantity": 1}]
        else:
            session_params["line_items"] = [{
                "price_data": {
                    "currency": "gbp",
                    "unit_amount": 7500,
                    "product_data": {
                        "name": "Website Deposit — L&D Designs",
                        "description": f"£75 deposit for {lead.get('business_name', 'your barber website')}",
                    },
                },
                "quantity": 1,
            }]
        session = _stripe.checkout.Session.create(**session_params)
        db.table("leads").update({"notes": f"stripe_session:{session.id}"}).eq("id", lead_id).execute()
        return session.url
    except Exception as e:
        logger.warning(f"Could not create Stripe link for reply notification: {e}")
        return None


def notify_reply_received(lead_id: str, message_body: str) -> None:
    """Called when a lead replies to outreach."""
    db = get_db()

    lead_result = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not lead_result.data:
        return
    lead = lead_result.data

    # Create in-app notification
    db.table("notifications").insert({
        "lead_id": lead_id,
        "type": "reply_received",
        "title": f"💬 {lead['business_name']} replied!",
        "body": message_body[:200] if message_body else "They responded to your outreach.",
        "action_url": f"/leads/{lead_id}",
    }).execute()

    # Update lead status
    db.table("leads").update({"status": "replied"}).eq("id", lead_id).execute()

    # Pre-generate Stripe payment link so Dylan can paste it straight into WhatsApp
    payment_url = _get_stripe_payment_url(lead_id)
    payment_section = (
        f"\nREADY-TO-SEND PAYMENT LINK (copy into WhatsApp):\n{payment_url}\n"
        if payment_url else
        "\n(Stripe not configured — send payment link manually from dashboard)\n"
    )

    # Alert founder via email
    subject = f"🔔 Reply from {lead['business_name']} — L&D Designs"
    body = (
        f"Great news! {lead['business_name']} replied to your outreach.\n\n"
        f"Business: {lead['business_name']}\n"
        f"City: {lead.get('city', 'Unknown')}\n"
        f"Phone: {lead.get('phone', 'Not provided')}\n"
        f"Email: {lead.get('email', 'Not provided')}\n\n"
        f"Their message:\n{message_body}\n"
        f"{payment_section}\n"
        f"Reply to them personally now while they're warm.\n\n"
        f"L&D Designs Platform"
    )
    _send_founder_email(subject, body)

    log_agent_action(db, "notification_agent", "reply_received", lead_id, "success",
                     {"business": lead["business_name"]})


def notify_new_leads(count: int) -> None:
    """Notify when a lead finder run completes."""
    db = get_db()
    db.table("notifications").insert({
        "type": "new_leads",
        "title": f"🎯 {count} new leads found",
        "body": f"Lead finder completed. {count} businesses with no website added to your pipeline.",
        "action_url": "/leads",
    }).execute()


def notify_outreach_sent(lead_id: str, channel: str) -> None:
    """Log when outreach is successfully sent."""
    db = get_db()
    lead_result = db.table("leads").select("business_name").eq("id", lead_id).single().execute()
    name = lead_result.data["business_name"] if lead_result.data else "Lead"
    db.table("notifications").insert({
        "lead_id": lead_id,
        "type": "outreach_sent",
        "title": f"📤 Outreach sent to {name}",
        "body": f"{channel.capitalize()} sent successfully.",
        "action_url": f"/leads/{lead_id}",
    }).execute()


def notify_preview_ready(lead_id: str, preview_url: str) -> None:
    """Notify when a preview website is generated."""
    db = get_db()
    lead_result = db.table("leads").select("business_name").eq("id", lead_id).single().execute()
    name = lead_result.data["business_name"] if lead_result.data else "Lead"
    db.table("notifications").insert({
        "lead_id": lead_id,
        "type": "preview_ready",
        "title": f"🌐 Preview ready for {name}",
        "body": f"Website preview generated: {preview_url}",
        "action_url": f"/leads/{lead_id}",
    }).execute()


def get_unread_count() -> int:
    db = get_db()
    result = db.table("notifications").select("id", count="exact").eq("read", False).execute()
    return result.count or 0


def mark_all_read() -> None:
    db = get_db()
    db.table("notifications").update({"read": True}).eq("read", False).execute()
