from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from models.schemas import AgentRunRequest, AgentRunResult
from agents import (
    lead_finder,
    website_analyzer,
    preview_generator,
    outreach_writer,
    followup_agent,
    notification_agent,
    outreach_sender,
    orchestrator,
    lead_enricher,
    ceo_agent,
    research_agent,
    cmo_agent,
    sales_agent,
    dev_agent,
    analyst_agent,
    chat_agent,
)


class ChatRequest(BaseModel):
    agent: str
    message: str
    history: Optional[list] = []

router = APIRouter(prefix="/agents", tags=["agents"])

AGENTS = {
    "lead_finder": lead_finder.run,
    "website_analyzer": website_analyzer.run,
    "extract_emails": website_analyzer.extract_emails_batch,
    "preview_generator": preview_generator.run,
    "outreach_writer": outreach_writer.run_batch,
    "whatsapp_campaign": outreach_writer.generate_whatsapp_campaign,
    "instagram_campaign": outreach_writer.generate_instagram_campaign,
    "followup_agent": followup_agent.run,
    "outreach_queue": outreach_sender.process_queue,
    "lead_enricher": lead_enricher.run,
    "ceo_agent": ceo_agent.run,
    "research_agent": research_agent.run,
    "cmo_agent": cmo_agent.run,
    "sales_agent": sales_agent.run,
    "dev_agent": dev_agent.run,
    "analyst_agent": analyst_agent.run,
}


@router.post("/run", response_model=AgentRunResult)
async def run_agent(req: AgentRunRequest, background_tasks: BackgroundTasks):
    """Trigger an AI agent to run. Most run in the background."""
    if req.agent not in AGENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown agent: {req.agent}. Valid: {list(AGENTS.keys())}",
        )

    fn = AGENTS[req.agent]
    params = req.params or {}

    # Preview generator: single lead or force-regenerate all with latest template
    if req.agent == "preview_generator":
        if req.lead_id:
            background_tasks.add_task(fn, req.lead_id, True)
        else:
            background_tasks.add_task(preview_generator.run_batch, 1000, True)
        return AgentRunResult(agent=req.agent, status="started", message="Regenerating all previews with latest template in background")

    if req.agent == "website_analyzer" and req.lead_id:
        background_tasks.add_task(fn, req.lead_id)
        return AgentRunResult(agent=req.agent, status="started", message="Analyzing lead in background")

    # All others run with no arguments
    background_tasks.add_task(fn)
    return AgentRunResult(
        agent=req.agent,
        status="started",
        message=f"{req.agent} started in background. Check agent logs for results.",
    )


@router.get("/logs")
async def get_agent_logs(agent: str = None, limit: int = 50):
    from db.client import get_db
    db = get_db()
    q = db.table("agent_logs").select("*").order("created_at", desc=True).limit(limit)
    if agent:
        q = q.eq("agent_name", agent)
    result = q.execute()
    return {"logs": result.data or []}


@router.post("/full-pipeline/{lead_id}")
async def run_full_pipeline(lead_id: str, background_tasks: BackgroundTasks):
    """
    Run the complete pipeline for a single lead:
    1. Analyze website
    2. Generate preview
    3. Generate outreach
    4. Queue for approval
    """
    from agents import outreach_writer, qc_agent
    from db.client import get_db

    db = get_db()
    lead_result = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    async def _pipeline():
        # Step 1: Analyze
        website_analyzer.run(lead_id)

        # Step 2: Generate preview
        preview_result = preview_generator.run(lead_id)
        preview_url = preview_result.get("preview_url")

        # Reload lead after analysis
        lead = db.table("leads").select("*").eq("id", lead_id).single().execute().data

        # Step 3: Write outreach
        content = outreach_writer.generate_outreach(
            lead=lead,
            channel="email",
            preview_url=preview_url,
            sequence_day=1,
        )

        # Step 4: QC + queue
        qc = qc_agent.validate("email", content.get("subject"), content["body"], preview_url, lead)
        if qc["passed"]:
            from config import settings
            db.table("outreach_messages").insert({
                "lead_id": lead_id,
                "channel": "email",
                "direction": "outbound",
                "subject": content.get("subject"),
                "body": content["body"],
                "status": "queued",
                "sequence_day": 1,
                "ai_generated": True,
                "approved_by_founder": not settings.REQUIRE_APPROVAL,
            }).execute()
            db.table("leads").update({"status": "outreach_queued"}).eq("id", lead_id).execute()

    background_tasks.add_task(_pipeline)
    return {"status": "pipeline_started", "lead_id": lead_id}


@router.get("/ceo/status")
async def ceo_status():
    """Return the most recent CEO agent health check result."""
    from db.client import get_db
    db = get_db()
    result = (
        db.table("agent_logs")
        .select("*")
        .eq("agent_name", "ceo_agent")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    logs = result.data or []
    if not logs:
        return {"status": "never_run", "checked_at": None, "report": None}
    log = logs[0]
    return {
        "status": log.get("status"),
        "checked_at": log.get("created_at"),
        "report": log.get("details") or {},
    }


@router.post("/orchestrate")
async def run_orchestrator(background_tasks: BackgroundTasks, task: str = "auto"):
    """Run the orchestrator — it checks pipeline state and dispatches agents as needed."""
    background_tasks.add_task(orchestrator.run, task)
    return {"status": "started", "task": task}


@router.get("/orchestrate/sessions")
async def orchestrate_sessions(limit: int = 10):
    """Return recent orchestrator sessions grouped by session_id."""
    from db.client import get_db
    db = get_db()

    result = (
        db.table("agent_logs")
        .select("*")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    logs = result.data or []

    # Group by session_id (stored in details.session_id)
    sessions: dict = {}
    ungrouped = []
    for log in logs:
        details = log.get("details") or {}
        sid = details.get("session_id")
        if sid:
            if sid not in sessions:
                sessions[sid] = {"session_id": sid, "logs": [], "started_at": log["created_at"]}
            sessions[sid]["logs"].append(log)
        else:
            ungrouped.append(log)

    sorted_sessions = sorted(sessions.values(), key=lambda s: s["started_at"], reverse=True)
    return {"sessions": sorted_sessions[:limit], "recent_logs": logs[:100]}


@router.post("/chat")
async def agent_chat(req: ChatRequest):
    """Chat directly with any agent — they respond using live DB context."""
    reply = chat_agent.chat(req.agent, req.message, req.history or [])
    return {"reply": reply, "agent": req.agent}


@router.get("/wa-queue")
async def get_wa_queue(limit: int = 10):
    """
    Returns pending WhatsApp outreach messages for Baz to send.
    Called by Baz at 9am to get that day's batch.
    """
    from db.client import get_db
    db = get_db()

    result = (
        db.table("outreach_messages")
        .select("id, body, leads(business_name, phone)")
        .in_("status", ["queued", "draft"])
        .eq("channel", "whatsapp")
        .eq("direction", "outbound")
        .order("created_at")
        .limit(limit)
        .execute()
    )

    messages = []
    for msg in (result.data or []):
        lead = msg.get("leads") or {}
        phone = lead.get("phone", "")
        if not phone:
            continue
        # Normalise to +44 format
        p = phone.strip()
        if p.startswith("0"):
            p = "+44" + p[1:]
        elif not p.startswith("+"):
            p = "+44" + p
        messages.append({
            "id": msg["id"],
            "to": p,
            "business_name": lead.get("business_name", ""),
            "body": msg["body"],
        })

    return {"messages": messages, "count": len(messages)}


@router.post("/wa-sent")
async def mark_wa_sent(message_ids: list):
    """Mark WhatsApp messages as sent after Baz delivers them."""
    from db.client import get_db
    from datetime import datetime
    db = get_db()

    updated = 0
    for mid in message_ids:
        try:
            db.table("outreach_messages").update({
                "status": "sent",
                "sent_at": datetime.utcnow().isoformat(),
            }).eq("id", mid).execute()
            updated += 1
        except Exception:
            pass

    return {"updated": updated}
