"""
Calls API — founder call workflow for tomorrow's 100 barber calls.
Simple endpoints: get call board, log a call outcome, update notes.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from db.client import get_db

router = APIRouter(prefix="/calls", tags=["calls"])

CALL_STATUSES = [
    "preview_ready",
    "outreach_sent",
    "called",
    "interested",
    "follow_up_required",
    "payment_link_sent",
    "converted",
    "not_interested",
]


class CallLog(BaseModel):
    status: str
    notes: Optional[str] = None


@router.get("/board")
async def call_board(limit: int = 100, status: Optional[str] = None):
    """
    Returns leads ready for calling, with all info needed for the call.
    Sorted: interested first, then outreach_sent, then preview_ready — highest quality score first.
    """
    db = get_db()

    if status:
        statuses = [status]
    else:
        statuses = ["interested", "replied", "follow_up_required", "called", "outreach_sent", "preview_ready"]

    result = (
        db.table("leads")
        .select("id, business_name, phone, city, address, notes, status, quality_score, google_rating, google_reviews, created_at, updated_at")
        .in_("status", statuses)
        .order("quality_score", desc=True)
        .limit(limit)
        .execute()
    )

    # Filter to leads with a phone number (Python-side — custom client lacks NOT IS NULL)
    leads = [l for l in (result.data or []) if l.get("phone")]

    # Attach preview URLs
    lead_ids = [l["id"] for l in leads]
    enriched = []
    for lead in leads:
        preview_url = None
        try:
            pr = db.table("previews").select("preview_url").eq("lead_id", lead["id"]).order("created_at", desc=True).limit(1).execute()
            if pr.data:
                preview_url = pr.data[0]["preview_url"]
        except Exception:
            pass

        phone = lead.get("phone") or ""
        wa_num = phone.replace(" ", "").replace("-", "").replace("+", "")
        if wa_num.startswith("0"):
            wa_num = "44" + wa_num[1:]

        enriched.append({
            **lead,
            "preview_url": preview_url,
            "whatsapp_url": f"https://wa.me/{wa_num}" if wa_num else None,
            "call_url": f"tel:{phone}" if phone else None,
            "next_action": _next_action(lead["status"]),
        })

    # Group by status for the board view
    groups = {}
    for lead in enriched:
        s = lead["status"]
        groups.setdefault(s, []).append(lead)

    return {
        "leads": enriched,
        "total": len(enriched),
        "groups": groups,
        "status_order": CALL_STATUSES,
    }


def _next_action(status: str) -> str:
    return {
        "preview_ready":      "Call — introduce yourself and offer to send the preview link",
        "outreach_sent":      "Call — follow up on the WhatsApp message you already sent",
        "called":             "Send preview link, or follow up if already sent",
        "interested":         "Send Stripe payment link (£75 deposit to start)",
        "follow_up_required": "Call again — they asked you to call back",
        "payment_link_sent":  "Chase payment — ask if they have questions about the deposit",
        "replied":            "Respond to their message and move them to Interested or Dead",
        "converted":          "Build the site — collect content, images, booking link",
    }.get(status, "Review and decide next step")


@router.post("/{lead_id}/log")
async def log_call(lead_id: str, body: CallLog):
    """
    Update a lead's call status and notes after a call.
    Called from the Calls page after each conversation.
    """
    if body.status not in CALL_STATUSES + ["not_interested", "do_not_contact"]:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")

    db = get_db()

    lead = db.table("leads").select("id, status, notes").eq("id", lead_id).single().execute()
    if not lead.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    update = {"status": body.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if body.notes is not None:
        existing = lead.data.get("notes") or ""
        timestamp = datetime.now(timezone.utc).strftime("%d/%m %H:%M")
        new_note = f"[{timestamp}] {body.notes}"
        update["notes"] = f"{existing}\n{new_note}".strip() if existing else new_note

    db.table("leads").update(update).eq("id", lead_id).execute()

    # Log to agent_logs for visibility
    try:
        db.table("agent_logs").insert({
            "agent_name": "founder_call",
            "action": "call_logged",
            "lead_id": lead_id,
            "status": "success",
            "result_data": {"new_status": body.status, "has_notes": bool(body.notes)},
        }).execute()
    except Exception:
        pass

    return {"ok": True, "lead_id": lead_id, "status": body.status}


@router.get("/stats")
async def call_stats():
    """Quick pipeline stats for the call board header."""
    db = get_db()

    def count(status: str) -> int:
        try:
            return db.table("leads").select("id", count="exact").eq("status", status).execute().count or 0
        except Exception:
            return 0

    return {
        "preview_ready":      count("preview_ready"),
        "outreach_sent":      count("outreach_sent"),
        "called":             count("called"),
        "interested":         count("interested"),
        "follow_up_required": count("follow_up_required"),
        "payment_link_sent":  count("payment_link_sent"),
        "converted":          count("converted"),
        "not_interested":     count("not_interested"),
        "total_callable": (
            count("preview_ready") + count("outreach_sent") +
            count("called") + count("follow_up_required")
        ),
    }
