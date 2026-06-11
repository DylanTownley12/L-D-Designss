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
from utils import telegram, notify
from models.validate import clean as validate_clean, ValidationError

logger = logging.getLogger(__name__)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _ai_triage(client: dict, lead: dict):
    """One Claude call → (summary, suggested_reply). Deterministic fallback so it
    never depends on Anthropic. JARVIS/agents never SEND this — it's a draft."""
    job = lead.get("job_type") or ""
    urg = lead.get("urgency") or ""
    desc = lead.get("job_description") or ""
    pc = lead.get("postcode") or ""
    first = (lead.get("name") or "").split()[0] if lead.get("name") else ""
    if settings.ANTHROPIC_API_KEY:
        try:
            import json as _json
            import re as _re
            from agents.trades import _claude
            system = ("You triage inbound job enquiries for a UK trade business. Reply ONLY with JSON "
                      '{"summary": "<one tight sentence>", "reply": "<one friendly UK-tone SMS the trade '
                      'could send back, confirming receipt and asking the best time to call>"}.')
            user = (f"Trade: {client.get('trade')}. Job type: {job}. Urgency: {urg}. "
                    f"Postcode: {pc}. Notes: {desc}. Caller: {lead.get('name') or 'homeowner'}.")
            raw = _claude(system, user, max_tokens=250, agent="capture_triage")
            if raw:
                m = _re.search(r"\{.*\}", raw, _re.S)
                if m:
                    d = _json.loads(m.group(0))
                    if d.get("summary"):
                        return d.get("summary"), d.get("reply")
        except Exception as e:
            logger.warning(f"[lead_capture] AI triage failed, using fallback: {e}")
    biz = client.get("business_name") or "the team"
    summary = (f"{(job or 'Job').title()} enquiry"
               + (f" — {urg}" if urg else "")
               + (f" ({pc})" if pc else "")
               + (f": {desc[:120]}" if desc else "")).strip()
    reply = (f"Hi{(' ' + first) if first else ''}, thanks for contacting {biz}. We've got your "
             f"{job or 'enquiry'} and will be in touch shortly — what's the best time to reach you?")
    return summary, reply


def enrich_and_notify(lead_id: str) -> None:
    """Background half of capture: AI triage + founder/client notification AFTER the
    homeowner already got their instant 'Booking sent!'. Never raises."""
    db = get_db()
    try:
        lead = db.table("captured_leads").select("*").eq("id", lead_id).single().execute().data
        if not lead:
            return
        client = None
        if lead.get("client_id"):
            client = db.table("textback_clients").select("*").eq("id", lead["client_id"]).single().execute().data
        elif lead.get("prospect_id"):
            p = db.table("prospects").select("*").eq("id", lead["prospect_id"]).single().execute().data or {}
            client = {"business_name": p.get("business_name"), "trade": p.get("trade"),
                      "town": p.get("town"), "dashboard_token": None, "telegram_chat_id": None}
        if not client:
            return
        summary, suggested = _ai_triage(client, lead)
        db.table("captured_leads").update({"ai_summary": summary,
                                           "suggested_reply": suggested}).eq("id", lead_id).execute()
        lead["ai_summary"], lead["suggested_reply"] = summary, suggested
        if _notify_founders(client, lead, lead.get("source") or "web_form"):
            db.table("captured_leads").update({"notified": True}).eq("id", lead_id).execute()
        _notify_client(client, lead)
    except Exception as e:
        logger.error(f"[lead_capture] enrich_and_notify failed for {lead_id}: {e}")


def record_lead(client_id: str = None, phone: str = None, name: str = None, postcode: str = None,
                job_description: str = None, source: str = "web_form",
                job_type: str = None, urgency: str = None, photo_urls=None,
                notify_founders: bool = True, prospect_id: str = None,
                defer_heavy: bool = False) -> dict:
    """Insert a captured_lead (with AI summary + suggested reply), ping founders
    ALWAYS, optionally the client. Works for a real client OR a prospect's on-demand
    preview (client_id None + prospect_id set) — the demo form captures a real lead."""
    db = get_db()

    client, prospect, data_mode = None, None, "real"
    if client_id:
        try:
            client = db.table("textback_clients").select("*").eq("id", client_id).single().execute().data
        except Exception:
            client = None
        if not client:
            return {"ok": False, "error": "client_not_found"}
        data_mode = client.get("data_mode") or "real"
    elif prospect_id:
        try:
            prospect = db.table("prospects").select("*").eq("id", prospect_id).single().execute().data
        except Exception:
            prospect = None
        if not prospect:
            return {"ok": False, "error": "prospect_not_found"}
        data_mode = prospect.get("data_mode") or "real"
        # A prospect acts as a light "client" for branding + triage only.
        client = {"business_name": prospect.get("business_name"), "trade": prospect.get("trade"),
                  "town": prospect.get("town"), "dashboard_token": None, "telegram_chat_id": None}
    else:
        return {"ok": False, "error": "no_target"}

    lead_row = {
        "client_id": client_id,
        "prospect_id": prospect_id,
        "name": (name or "").strip() or None,
        "phone": (phone or "").strip(),
        "postcode": (postcode or "").strip() or None,
        "job_type": (job_type or "").strip() or None,
        "urgency": (urgency or "").strip() or None,
        "job_description": (job_description or "").strip() or None,
        "photo_urls": list(photo_urls or []),
        "source": source,
        "status": "new",
        "notified": False,
        "data_mode": data_mode,
    }
    if defer_heavy:
        # Fast path (the live booking widget): write the row NOW, respond instantly;
        # enrich_and_notify() runs in the background and fills triage + sends pings.
        pass
    else:
        summary, suggested = _ai_triage(client, lead_row)
        lead_row["ai_summary"] = summary
        lead_row["suggested_reply"] = suggested
    try:
        lead_row = validate_clean("captured_leads", lead_row)
    except ValidationError as ve:
        return {"ok": False, "error": str(ve)}
    res = db.table("captured_leads").insert(lead_row).execute()
    lead = res.data[0] if res.data else lead_row

    try:
        from agents import trades as _tr
        _tr.log_event("lead_capture",
                      f"📥 new lead for {client.get('business_name','client')} ({source}) "
                      f"— {(lead.get('name') or '').strip()} {lead.get('phone','')}".strip(),
                      "success", {"client_id": client_id, "source": source, "lead_id": lead.get("id")})
    except Exception:
        pass

    notified = False
    if notify_founders and not defer_heavy:
        notified = _notify_founders(client, lead, source)   # founders ALWAYS
        _notify_client(client, lead)                        # client if chat id set
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
    src = {"web_form": "web form", "form": "web form", "missed_call": "missed call",
           "manual": "manual"}.get(source, source)
    jt = " · ".join(b for b in [lead.get("job_type"), lead.get("urgency")] if b)
    parts = [
        f"📞 NEW LEAD for {client.get('business_name','client')} ({src})",
        f"{(lead.get('name') or '').strip()} {lead.get('phone','')}".strip(),
    ]
    if jt:
        parts.append(f"🔧 {jt}")
    if lead.get("postcode"):
        parts.append(f"📍 {lead['postcode']}")
    if lead.get("ai_summary"):
        parts.append(f"🧠 {lead['ai_summary']}")
    elif lead.get("job_description"):
        parts.append(f"“{lead['job_description'][:300]}”")
    if lead.get("photo_urls"):
        parts.append(f"📷 {len(lead['photo_urls'])} photo(s) attached")
    if dash:
        parts.append(f"Dashboard: {link}")
    return notify.notify_founders("\n".join(parts), kind="new_lead").get("ok", False)


def _notify_client(client: dict, lead: dict) -> bool:
    """If the client has a Telegram chat id, ping them too (founders always get it)."""
    chat = client.get("telegram_chat_id")
    if not chat:
        return False
    jt = " · ".join(b for b in [lead.get("job_type"), lead.get("urgency")] if b)
    msg = (f"📞 New enquiry — {(lead.get('name') or '').strip()} {lead.get('phone','')}".strip()
           + (f"\n🔧 {jt}" if jt else "")
           + (f"\n🧠 {lead.get('ai_summary')}" if lead.get("ai_summary") else "")
           + (f"\n✍️ Suggested reply: {lead.get('suggested_reply')}" if lead.get("suggested_reply") else ""))
    try:
        return telegram.send_message(chat, msg)
    except Exception:
        return False
