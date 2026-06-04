from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from db.client import get_db
from models.schemas import MessageCreate, MessageApprove
from agents import outreach_writer, qc_agent, outreach_sender, followup_agent
from agents import notification_agent

router = APIRouter(prefix="/outreach", tags=["outreach"])


@router.get("/queue")
async def get_queue(status: str = "queued", channel: str = None):
    db = get_db()
    # Support comma-separated statuses e.g. "queued,draft"
    statuses = [s.strip() for s in status.split(",")]
    all_messages = []
    for s in statuses:
        q = (
            db.table("outreach_messages")
            .select("*, leads(business_name, city, email, phone, status, instagram_url)")
            .eq("status", s)
            .eq("direction", "outbound")
            .order("created_at")
        )
        if channel:
            q = q.eq("channel", channel)
        result = q.execute()
        all_messages.extend(result.data or [])
    return {"messages": all_messages}


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
            "(insert link)" in body.lower() or
            "[link]" in body.lower()
        )
        if should_delete:
            db.table("outreach_messages").delete().eq("id", msg["id"]).execute()
            deleted += 1
    return {"deleted": deleted}


@router.post("/log-reply/{message_id}")
async def log_reply(message_id: str, request: Request):
    """Log a reply from a lead. Saves reply text, updates lead to replied, creates notification."""
    body = await request.json()
    reply_text = body.get("reply_text", "Reply received")

    db = get_db()
    msg_result = db.table("outreach_messages").select("lead_id, channel").eq("id", message_id).single().execute()
    if not msg_result.data:
        raise HTTPException(status_code=404, detail="Message not found")

    lead_id = msg_result.data["lead_id"]
    channel = msg_result.data.get("channel", "whatsapp")

    # Save inbound reply as a new message row
    db.table("outreach_messages").insert({
        "lead_id": lead_id,
        "channel": channel,
        "direction": "inbound",
        "body": reply_text,
        "status": "replied",
    }).execute()

    # Update lead status
    db.table("leads").update({"status": "replied"}).eq("id", lead_id).execute()

    # Notify + stop follow-up
    notification_agent.notify_reply_received(lead_id, reply_text)
    followup_agent.stop_sequence(lead_id, reason="replied")

    return {"status": "logged", "lead_id": lead_id}


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


@router.post("/generate-whatsapp-campaign")
async def generate_whatsapp_campaign(background_tasks: BackgroundTasks, limit: int = 50):
    """Generate WhatsApp messages for all preview_ready leads with mobile numbers."""
    background_tasks.add_task(outreach_writer.generate_whatsapp_campaign, limit)
    return {"status": "started", "message": "Generating WhatsApp messages in background — refresh in a few seconds"}


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


@router.get("/conversations")
async def recent_conversations(limit: int = 5):
    """Last N inbound replies with the outbound message that preceded them."""
    db = get_db()
    inbound = db.table("outreach_messages").select(
        "id, lead_id, body, created_at, leads(business_name, city, phone)"
    ).eq("direction", "inbound").order("created_at", desc=True).limit(limit).execute()

    convos = []
    for msg in (inbound.data or []):
        lead_id = msg.get("lead_id")
        outbound = db.table("outreach_messages").select("body, sent_at").eq(
            "lead_id", lead_id).eq("direction", "outbound").eq("status", "sent"
        ).order("sent_at", desc=True).limit(1).execute()
        convos.append({
            "lead": msg.get("leads") or {},
            "barber_said": msg.get("body", ""),
            "we_sent": outbound.data[0]["body"] if outbound.data else "",
            "at": msg.get("created_at", ""),
        })
    return {"conversations": convos}


@router.get("/template-stats")
async def template_stats():
    """A/B test reply rates per WhatsApp opener template."""
    from agents.outreach_writer import _WHATSAPP_TEMPLATES
    db = get_db()

    # All sent WhatsApp outbound messages with lead status
    result = (
        db.table("outreach_messages")
        .select("body, leads(status)")
        .eq("channel", "whatsapp")
        .eq("direction", "outbound")
        .eq("status", "sent")
        .execute()
    )
    messages = result.data or []

    # Match each sent message to a template variant by checking which template it came from
    def identify_variant(body: str) -> int | None:
        for i, tmpl in enumerate(_WHATSAPP_TEMPLATES):
            # Compare first 30 chars of the template (before any {placeholders})
            prefix = tmpl.split("{")[0][:30].strip()
            if body.startswith(prefix):
                return i
        return None

    counts = {i: {"sent": 0, "replied": 0} for i in range(len(_WHATSAPP_TEMPLATES))}
    unmatched = 0

    for msg in messages:
        variant = identify_variant(msg.get("body", ""))
        if variant is None:
            unmatched += 1
            continue
        counts[variant]["sent"] += 1
        lead_status = (msg.get("leads") or {}).get("status", "")
        if lead_status in ("replied", "interested", "converted"):
            counts[variant]["replied"] += 1

    stats = []
    for i, data in counts.items():
        sent = data["sent"]
        replied = data["replied"]
        preview = _WHATSAPP_TEMPLATES[i][:60] + "..."
        stats.append({
            "variant": i + 1,
            "preview": preview,
            "sent": sent,
            "replied": replied,
            "reply_rate": round(replied / sent * 100, 1) if sent > 0 else None,
        })

    return {"variants": stats, "unmatched": unmatched}
