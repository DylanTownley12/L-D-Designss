"""
Ops API — Action Queue + System Blockers
GET /api/ops/action-queue   — prioritised list of what to do next
GET /api/ops/blockers       — revenue-stopping issues with fix buttons
"""
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger(__name__)


def _now():
    return datetime.now(timezone.utc)


@router.get("/ops/action-queue")
def get_action_queue(limit: int = 50):
    from db.client import get_db
    from config import settings
    db = get_db()
    items = []

    # 1. Inbound replies / interested (highest priority — close these)
    hot = db.table("leads").select(
        "id,business_name,city,phone,instagram_url,status,notes,updated_at"
    ).in_("status", ["replied", "interested"]).limit(20).execute().data or []

    for lead in hot:
        phone = (lead.get("phone") or "").replace(" ", "").replace("-", "").replace("+", "").lstrip("0")
        if phone.startswith("44"): phone = "+" + phone
        elif phone: phone = "+44" + phone

        # Get latest outreach message for suggested reply
        msg_row = db.table("outreach_messages").select("body,channel,sent_at").eq("lead_id", lead["id"]) \
            .eq("direction", "outbound").order("created_at", desc=True).limit(1).execute().data
        last_msg = msg_row[0] if msg_row else None

        # Get preview URL
        prev = db.table("previews").select("preview_url").eq("lead_id", lead["id"]) \
            .order("created_at", desc=True).limit(1).execute().data
        preview_url = (prev[0]["preview_url"] if prev else None)

        # Payment status
        payment_status = "unknown"
        if lead.get("notes") and "stripe_session:" in (lead.get("notes") or ""):
            payment_status = "link_sent"
        if lead["status"] == "converted":
            payment_status = "paid"

        reasons = []
        if lead["status"] == "interested":
            reasons.append("Lead marked interested — send payment link now")
        if lead["status"] == "replied":
            reasons.append("Lead replied — follow up immediately")

        items.append({
            "type": "hot_lead",
            "priority": 1 if lead["status"] == "interested" else 2,
            "lead_id": lead["id"],
            "lead_name": lead["business_name"],
            "city": lead["city"],
            "channel": last_msg["channel"] if last_msg else "whatsapp",
            "suggested_message": None,
            "preview_url": preview_url,
            "instagram_url": lead.get("instagram_url"),
            "phone": phone or lead.get("phone"),
            "last_contact_at": last_msg["sent_at"] if last_msg else lead["updated_at"],
            "followup_due_at": None,
            "payment_status": payment_status,
            "reasons": reasons,
        })

    # 2. Follow-ups due
    now_iso = _now().isoformat()
    followups = db.table("follow_up_sequences").select(
        "lead_id,next_followup_at,current_step"
    ).lte("next_followup_at", now_iso).eq("status", "active").limit(20).execute().data or []

    for f in followups:
        lead_row = db.table("leads").select("id,business_name,city,phone,instagram_url,status").eq("id", f["lead_id"]).limit(1).execute().data
        if not lead_row:
            continue
        lead = lead_row[0]
        if lead["status"] in ["replied", "interested", "converted", "not_interested", "do_not_contact"]:
            continue
        prev = db.table("previews").select("preview_url").eq("lead_id", lead["id"]).order("created_at", desc=True).limit(1).execute().data
        items.append({
            "type": "followup_due",
            "priority": 3,
            "lead_id": lead["id"],
            "lead_name": lead["business_name"],
            "city": lead["city"],
            "channel": "whatsapp",
            "suggested_message": None,
            "preview_url": prev[0]["preview_url"] if prev else None,
            "instagram_url": lead.get("instagram_url"),
            "phone": lead.get("phone"),
            "last_contact_at": None,
            "followup_due_at": f["next_followup_at"],
            "payment_status": None,
            "reasons": [f"Follow-up day {f['current_step']} overdue"],
        })

    # 3. Queued WA messages ready to send (up to daily target)
    wa_queue = db.table("outreach_messages").select(
        "id,lead_id,body,channel,created_at"
    ).eq("channel", "whatsapp").in_("status", ["queued", "draft"]) \
     .eq("direction", "outbound").limit(15).execute().data or []

    for msg in wa_queue:
        lead_row = db.table("leads").select("id,business_name,city,phone,instagram_url").eq("id", msg["lead_id"]).limit(1).execute().data
        if not lead_row:
            continue
        lead = lead_row[0]
        phone = (lead.get("phone") or "").replace(" ", "").replace("-", "").lstrip("0")
        if phone: phone = "+44" + phone
        prev = db.table("previews").select("preview_url").eq("lead_id", lead["id"]).order("created_at", desc=True).limit(1).execute().data
        items.append({
            "type": "wa_queued",
            "priority": 4,
            "lead_id": lead["id"],
            "lead_name": lead["business_name"],
            "city": lead["city"],
            "channel": "whatsapp",
            "suggested_message": msg["body"],
            "preview_url": prev[0]["preview_url"] if prev else None,
            "instagram_url": lead.get("instagram_url"),
            "phone": phone or lead.get("phone"),
            "last_contact_at": None,
            "followup_due_at": None,
            "payment_status": None,
            "reasons": ["WhatsApp message ready to send"],
            "message_id": msg["id"],
        })

    # 4. Queued IG messages
    ig_queue = db.table("outreach_messages").select(
        "id,lead_id,body,channel,created_at"
    ).eq("channel", "instagram").in_("status", ["queued", "draft"]) \
     .eq("direction", "outbound").limit(15).execute().data or []

    for msg in ig_queue:
        lead_row = db.table("leads").select("id,business_name,city,phone,instagram_url").eq("id", msg["lead_id"]).limit(1).execute().data
        if not lead_row:
            continue
        lead = lead_row[0]
        prev = db.table("previews").select("preview_url").eq("lead_id", lead["id"]).order("created_at", desc=True).limit(1).execute().data
        items.append({
            "type": "ig_queued",
            "priority": 4,
            "lead_id": lead["id"],
            "lead_name": lead["business_name"],
            "city": lead["city"],
            "channel": "instagram",
            "suggested_message": msg["body"],
            "preview_url": prev[0]["preview_url"] if prev else None,
            "instagram_url": lead.get("instagram_url"),
            "phone": lead.get("phone"),
            "last_contact_at": None,
            "followup_due_at": None,
            "payment_status": None,
            "reasons": ["Instagram DM script ready to send"],
            "message_id": msg["id"],
        })

    # Sort by priority then deduplicate by lead_id (keep highest priority per lead)
    seen = set()
    deduped = []
    for item in sorted(items, key=lambda x: x["priority"]):
        if item["lead_id"] not in seen:
            seen.add(item["lead_id"])
            deduped.append(item)

    return {"items": deduped[:limit], "total": len(deduped)}


@router.get("/ops/blockers")
def get_blockers():
    from db.client import get_db
    from config import settings
    db = get_db()
    blockers = []

    # Stripe keys missing
    if not settings.STRIPE_SECRET_KEY:
        blockers.append({
            "key": "stripe_missing",
            "title": "Stripe not configured",
            "impact": "Cannot collect payments — no £75 deposits possible",
            "severity": "critical",
            "fix_type": "human",
            "human_steps": ["Go to Railway → your backend service → Variables", "Add STRIPE_SECRET_KEY (live key starting your_live_stripe_key)", "Add STRIPE_PRICE_ID (create a £75 product in Stripe dashboard)"],
        })
    elif "test" in (settings.STRIPE_SECRET_KEY or ""):
        blockers.append({
            "key": "stripe_test_mode",
            "title": "Stripe in test mode",
            "impact": "Payment links created but no real money collected",
            "severity": "warning",
            "fix_type": "human",
            "human_steps": ["Go to Railway → Variables → update STRIPE_SECRET_KEY to live key (your_live_stripe_key)"],
        })

    # Preview URL is localhost in production
    if "localhost" in settings.PREVIEW_BASE_URL:
        blockers.append({
            "key": "preview_url_localhost",
            "title": "Preview URLs point to localhost",
            "impact": "Barbers can't open preview links — every message looks broken",
            "severity": "critical",
            "fix_type": "human",
            "human_steps": ["Go to Railway → Variables → set PREVIEW_BASE_URL to https://l-d-designss-production.up.railway.app/previews"],
        })

    # No WA messages queued
    wa_count = db.table("outreach_messages").select("id", count="exact") \
        .eq("channel", "whatsapp").in_("status", ["queued", "draft"]).execute().count or 0
    if wa_count == 0:
        blockers.append({
            "key": "wa_queue_empty",
            "title": "WhatsApp queue empty",
            "impact": "Nothing to send today — no conversations started",
            "severity": "warning",
            "fix_type": "button",
            "fix_button": {"label": "Generate WhatsApp Messages", "method": "POST", "path": "/api/agents/run", "body": {"agent": "whatsapp_campaign"}},
        })

    # No IG scripts queued
    ig_count = db.table("outreach_messages").select("id", count="exact") \
        .eq("channel", "instagram").in_("status", ["queued", "draft"]).execute().count or 0
    if ig_count == 0:
        blockers.append({
            "key": "ig_queue_empty",
            "title": "Instagram queue empty",
            "impact": "No Instagram outreach ready for your friend to send",
            "severity": "info",
            "fix_type": "button",
            "fix_button": {"label": "Generate Instagram DMs", "method": "POST", "path": "/api/agents/run", "body": {"agent": "instagram_campaign"}},
        })

    # Invalid preview URLs
    try:
        invalid = db.table("previews").select("id", count="exact") \
            .like("preview_url", "%localhost%").execute().count or 0
        if invalid > 0:
            blockers.append({
                "key": "invalid_previews",
                "title": f"{invalid} previews have broken URLs",
                "impact": "Leads receiving dead links — looks unprofessional",
                "severity": "warning",
                "fix_type": "button",
                "fix_button": {"label": "Fix Preview URLs", "method": "POST", "path": "/api/previews/fix-urls"},
            })
    except Exception:
        pass

    # No leads in replied/interested (informational)
    hot = db.table("leads").select("id", count="exact").in_("status", ["replied", "interested"]).execute().count or 0
    if hot == 0:
        blockers.append({
            "key": "no_hot_leads",
            "title": "No replies yet",
            "impact": "Outreach running but no conversations started — check opener copy",
            "severity": "info",
            "fix_type": "human",
            "human_steps": ["Review WhatsApp opener messages — are they personalised enough?", "Check preview links are working (see preview URL blocker above)", "Increase daily send volume if WA ban has lifted"],
        })

    return {"blockers": blockers, "has_critical": any(b["severity"] == "critical" for b in blockers)}
