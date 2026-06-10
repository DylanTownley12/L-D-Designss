"""
Lead capture — the product spine. A homeowner enquiry (from the capture form OR
a missed call) becomes a row the trade client sees on their dashboard, and the
founders get pinged on Telegram. This is the 'phone → Telegram → dashboard' flow.

Single source of truth so the form and the missed-call webhook behave identically.
"""
import logging
from datetime import datetime, timezone

from config import settings
from db.client import get_db
from utils import telegram

logger = logging.getLogger(__name__)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def record_lead(client_id: str, phone: str, name: str = None, postcode: str = None,
                job_description: str = None, source: str = "form",
                notify: bool = True) -> dict:
    """Insert a captured_lead, ping founders on Telegram, and (opt-in) send the
    homeowner a confirmation SMS. Returns the created lead + notification status."""
    db = get_db()

    client = None
    try:
        client = db.table("textback_clients").select("*").eq("id", client_id).single().execute().data
    except Exception:
        client = None
    if not client:
        return {"ok": False, "error": "client_not_found"}

    lead_row = {
        "client_id": client_id,
        "name": (name or "").strip() or None,
        "phone": (phone or "").strip(),
        "postcode": (postcode or "").strip() or None,
        "job_description": (job_description or "").strip() or None,
        "source": source,
        "status": "new",
        "notified": False,
    }
    res = db.table("captured_leads").insert(lead_row).execute()
    lead = res.data[0] if res.data else lead_row

    notified = False
    if notify:
        notified = _notify_founders(client, lead, source)
        if notified and lead.get("id"):
            try:
                db.table("captured_leads").update({"notified": True}).eq("id", lead["id"]).execute()
            except Exception:
                pass

    # Opt-in: confirm to the homeowner that the trade will be in touch (form only;
    # the missed-call path already texts them the text-back). Never required.
    if source == "form" and client.get("notify_homeowner") and phone:
        try:
            from agents.missed_call_textback import _send_sms
            biz = client.get("business_name") or "the team"
            _send_sms(phone, f"Thanks for your enquiry — {biz} has it and will be in touch shortly.")
        except Exception as e:
            logger.warning(f"[lead_capture] homeowner confirmation SMS failed: {e}")

    return {"ok": True, "lead": lead, "notified": notified}


def _notify_founders(client: dict, lead: dict, source: str) -> bool:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    dash = client.get("dashboard_token")
    link = f"{base}/d/{dash}" if dash else "(no dashboard link)"
    src = {"form": "web form", "missed_call": "missed call", "manual": "manual"}.get(source, source)
    parts = [
        f"📞 NEW LEAD for {client.get('business_name','client')} ({src})",
        f"{(lead.get('name') or '').strip()} {lead.get('phone','')}".strip(),
    ]
    if lead.get("postcode"):
        parts.append(f"📍 {lead['postcode']}")
    if lead.get("job_description"):
        parts.append(f"“{lead['job_description'][:300]}”")
    parts.append(f"Dashboard: {link}")
    return telegram.broadcast_founders("\n".join(parts)) > 0
