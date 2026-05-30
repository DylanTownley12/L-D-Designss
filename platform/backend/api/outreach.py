from fastapi import APIRouter, HTTPException, BackgroundTasks
from db.client import get_db
from models.schemas import MessageCreate, MessageApprove
from agents import outreach_writer, qc_agent, outreach_sender, followup_agent
from agents import notification_agent

router = APIRouter(prefix="/outreach", tags=["outreach"])


@router.get("/queue")
async def get_queue(status: str = "queued", channel: str = None):
    db = get_db()
    q = (
        db.table("outreach_messages")
        .select("*, leads(business_name, city, email, phone, status)")
        .eq("status", status)
        .eq("direction", "outbound")
        .order("created_at")
    )
    if channel:
        q = q.eq("channel", channel)
    result = q.execute()
    return {"messages": result.data or []}


@router.get("/history")
async def get_history(limit: int = 50):
    db = get_db()
    result = (
        db.table("outreach_messages")
        .select("*, leads(business_name, city)")
        .eq("direction", "outbound")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"messages": result.data or []}


@router.post("/generate")
async def generate_outreach_message(
    lead_id: str,
    channel: str = "email",
    sequence_day: int = 1,
):
    """Generate and queue an AI outreach message for a lead."""
    db = get_db()

    lead_result = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = lead_result.data

    if lead.get("status") == "do_not_contact":
        raise HTTPException(status_code=400, detail="Lead is marked Do Not Contact")

    # Get preview URL if available
    preview_result = (
        db.table("previews")
        .select("preview_url")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    preview_url = preview_result.data[0]["preview_url"] if preview_result.data else None

    # Write message
    content = outreach_writer.generate_outreach(
        lead=lead,
        channel=channel,
        preview_url=preview_url,
        sequence_day=sequence_day,
    )

    # QC check
    qc = qc_agent.validate(
        channel=channel,
        subject=content.get("subject"),
        body=content["body"],
        preview_url=preview_url,
        lead=lead,
    )

    if not qc["passed"]:
        raise HTTPException(
            status_code=422,
            detail={"message": "QC check failed", "issues": qc["issues"]},
        )

    # Save to DB as queued (needs approval if REQUIRE_APPROVAL=true)
    from config import settings
    msg_result = db.table("outreach_messages").insert({
        "lead_id": lead_id,
        "channel": channel,
        "direction": "outbound",
        "subject": content.get("subject"),
        "body": content["body"],
        "status": "queued",
        "sequence_day": sequence_day,
        "ai_generated": True,
        "approved_by_founder": not settings.REQUIRE_APPROVAL,
    }).execute()

    # Update lead status
    if lead.get("status") in ("new", "analyzing", "preview_ready"):
        db.table("leads").update({"status": "outreach_queued"}).eq("id", lead_id).execute()

    return {
        "message": msg_result.data[0] if msg_result.data else {},
        "preview_url": preview_url,
        "qc": qc,
    }


@router.post("/approve/{message_id}")
async def approve_message(message_id: str, background_tasks: BackgroundTasks):
    """Approve and immediately send a queued message."""
    db = get_db()
    db.table("outreach_messages").update({
        "status": "approved",
        "approved_by_founder": True,
    }).eq("id", message_id).execute()

    # Send in background
    background_tasks.add_task(outreach_sender.send_message, message_id)

    return {"status": "approved", "sending": True}


@router.post("/mark-sent/{message_id}")
async def mark_manually_sent(message_id: str):
    """Mark a WhatsApp message as manually sent by the founder."""
    from datetime import datetime
    db = get_db()
    msg = db.table("outreach_messages").select("lead_id").eq("id", message_id).single().execute()
    db.table("outreach_messages").update({
        "status": "sent",
        "sent_at": datetime.utcnow().isoformat(),
        "approved_by_founder": True,
    }).eq("id", message_id).execute()
    if msg.data:
        db.table("leads").update({"status": "outreach_sent"}).eq("id", msg.data["lead_id"]).execute()
    return {"status": "sent"}


@router.post("/clear-invalid-whatsapp")
async def clear_invalid_whatsapp():
    """Delete queued WhatsApp messages with broken or localhost preview URLs."""
    db = get_db()
    result = (
        db.table("outreach_messages")
        .select("id,body")
        .eq("channel", "whatsapp")
        .eq("status", "queued")
        .execute()
    )
    deleted = 0
    for msg in (result.data or []):
        body = msg.get("body", "")
        should_delete = (
            "localhost" in body or
            (".html" in body and "/previews/serve/" not in body) or
            "(insert link)" in body.lower() or
            "[link]" in body.lower() or
            "/previews/serve/" not in body
        )
        if should_delete:
            db.table("outreach_messages").delete().eq("id", msg["id"]).execute()
            deleted += 1
    return {"deleted": deleted}


@router.post("/reject/{message_id}")
async def reject_message(message_id: str):
    db = get_db()
    db.table("outreach_messages").update({"status": "draft"}).eq("id", message_id).execute()
    return {"status": "rejected"}


@router.patch("/{message_id}")
async def edit_message(message_id: str, body: str, subject: str = None):
    """Edit a queued message before sending."""
    db = get_db()
    update = {"body": body, "ai_generated": False}
    if subject:
        update["subject"] = subject
    db.table("outreach_messages").update(update).eq("id", message_id).execute()
    return {"updated": True}


@router.post("/send-all-approved")
async def send_all_approved(background_tasks: BackgroundTasks):
    """Send all approved messages in the queue."""
    background_tasks.add_task(outreach_sender.process_queue, 20)
    return {"status": "processing", "message": "Sending approved messages in background"}


@router.get("/stats/today")
async def today_stats():
    from datetime import date
    db = get_db()
    today = date.today().isoformat()

    email_count = (
        db.table("outreach_messages")
        .select("id", count="exact")
        .eq("channel", "email")
        .eq("status", "sent")
        .gte("sent_at", f"{today}T00:00:00")
        .execute()
    ).count or 0

    sms_count = (
        db.table("outreach_messages")
        .select("id", count="exact")
        .eq("channel", "sms")
        .eq("status", "sent")
        .gte("sent_at", f"{today}T00:00:00")
        .execute()
    ).count or 0

    from config import settings
    return {
        "emails_sent_today": email_count,
        "sms_sent_today": sms_count,
        "email_limit": settings.MAX_EMAILS_PER_DAY,
        "sms_limit": settings.MAX_SMS_PER_DAY,
    }
