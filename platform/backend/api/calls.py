"""
Calls API — founder call workflow for tomorrow's 100 barber calls.
Simple endpoints: get call board, log a call outcome, update notes.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from db.client import get_db
from agents.preview_generator import MIN_REAL_PREVIEW_BYTES

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


def _preview_quality(lead: dict, preview_url: str, template_version: str, image_source: str) -> int:
    """Score 0-100 of how presentable this preview is for a live call."""
    score = 0
    if preview_url and "/previews/serve/" in preview_url:
        score += 30
    if image_source == "google_places":
        score += 35          # their OWN shop — the big conversion lever
    if lead.get("google_rating"):
        score += 10
    if template_version in ("v3", "v4"):
        score += 10
    if lead.get("business_name") and lead.get("city"):
        score += 10
    phone = (lead.get("phone") or "").replace(" ", "")
    if phone.startswith("07") or phone.startswith("+447") or phone.startswith("447"):
        score += 5
    return min(100, score)


@router.get("/board")
async def call_board(limit: int = 250, status: Optional[str] = None,
                     include_all: bool = False, min_quality: int = 50):
    """
    Returns CALL-READY leads only (phone + working preview + acceptable quality),
    with everything needed for the call. include_all=true also returns the
    excluded leads (with the reason) so nothing is silently lost.
    """
    db = get_db()

    if status:
        statuses = [status]
    else:
        statuses = ["interested", "replied", "follow_up_required", "called", "outreach_sent", "preview_ready"]

    result = (
        db.table("leads")
        .select("id, business_name, phone, city, address, notes, status, quality_score, "
                "website_status, google_rating, google_reviews, analysis_data, created_at, updated_at")
        .in_("status", statuses)
        .order("quality_score", desc=True)
        .limit(600)
        .execute()
    )

    leads_all = result.data or []
    lead_ids = [l["id"] for l in leads_all]

    # Batch-fetch previews for ALL leads in chunks (one query per ~100 leads, not one
    # per lead) — N+1 over hundreds of leads timed out Railway's gateway and made the
    # page unusable. Keep the latest preview per lead (rows come back created_at desc).
    preview_map = {}
    for i in range(0, len(lead_ids), 100):
        chunk = lead_ids[i:i + 100]
        try:
            prs = (db.table("previews").select("lead_id, preview_url, template_version, created_at, personalization_data")
                   .in_("lead_id", chunk).order("created_at", desc=True).limit(1000).execute().data or [])
            for p in prs:
                lid = p.get("lead_id")
                if lid and lid not in preview_map:
                    preview_map[lid] = p
        except Exception:
            pass

    ready, excluded = [], []
    for lead in leads_all:
        phone = lead.get("phone") or ""
        ad = lead.get("analysis_data") or {}
        image_source = ad.get("image_source") or "unsplash"

        p = preview_map.get(lead["id"]) or {}
        preview_url = p.get("preview_url")
        template_version = p.get("template_version") or "v1"

        # A stub (head-only ~5KB render) shouldn't count as a working preview. We know
        # the rendered size from personalization_data.html_len (written on every build).
        # Older rows have no html_len → don't regress them (assume working by URL).
        pdata = p.get("personalization_data") or {}
        html_len = pdata.get("html_len")
        is_real_size = html_len is None or html_len >= MIN_REAL_PREVIEW_BYTES
        preview_working = bool(preview_url and "/previews/serve/" in preview_url and is_real_size)
        quality = _preview_quality(lead, preview_url or "", template_version, image_source)

        wa_num = phone.replace(" ", "").replace("-", "").replace("+", "")
        if wa_num.startswith("0"):
            wa_num = "44" + wa_num[1:]

        # Strip heavy analysis_data from the row we return
        row = {k: v for k, v in lead.items() if k != "analysis_data"}
        website_status = lead.get("website_status")
        row.update({
            "preview_url": preview_url,
            "preview_working": preview_working,
            "preview_quality_score": quality,
            "image_source": image_source,
            "template_version": template_version,
            "has_real_photos": image_source == "google_places",
            "website_status": website_status,
            "no_website": website_status in ("none", "weak"),
            "call_ready": bool(phone and preview_working and quality >= min_quality),
            "trade": "Barber",
            "whatsapp_url": f"https://wa.me/{wa_num}" if wa_num else None,
            "call_url": f"tel:{phone}" if phone else None,
            "next_action": _next_action(lead["status"]),
        })

        # Call-ready gate — only exclude if no phone number
        reason = None
        if not phone:
            reason = "no phone"

        if reason and not include_all:
            row["excluded_reason"] = reason
            excluded.append(row)
        elif reason:
            row["excluded_reason"] = reason
            excluded.append(row)
        else:
            ready.append(row)

    ready = ready[:limit]
    groups = {}
    for lead in ready:
        groups.setdefault(lead["status"], []).append(lead)

    return {
        "leads": ready,
        "total": len(ready),
        "excluded_count": len(excluded),
        "excluded": excluded if include_all else excluded[:50],
        "groups": groups,
        "status_order": CALL_STATUSES,
    }


def _next_action(status: str) -> str:
    return {
        "preview_ready":      "Call — introduce yourself and offer to send the preview link",
        "outreach_sent":      "Call — follow up on the WhatsApp message you already sent",
        "called":             "Send preview link, or follow up if already sent",
        "interested":         "Send the £199 + £29/mo payment link",
        "follow_up_required": "Call again — they asked you to call back",
        "payment_link_sent":  "Chase payment — £199 to build, then £29/mo",
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
