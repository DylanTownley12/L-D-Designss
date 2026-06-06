from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, timezone
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

from utils.revenue import AGENT_SCHEDULE


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


@router.get("/ceo/decisions")
async def ceo_decisions(limit: int = 20):
    """Return recent CEO decisions — auto-fixes, retries, alerts. Powers the Agents dashboard feed."""
    from db.client import get_db
    db = get_db()
    result = (
        db.table("agent_logs")
        .select("action, details, created_at, status")
        .eq("agent_name", "ceo_agent")
        .ilike("action", "DECISION:%")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    decisions = []
    for log in (result.data or []):
        action = log.get("action", "")
        label = action.replace("DECISION: ", "")
        decisions.append({
            "label": label,
            "details": log.get("details") or {},
            "at": log.get("created_at"),
            "status": log.get("status"),
        })
    return {"decisions": decisions, "count": len(decisions)}


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

    Ban protection: hard-capped at MAX_WHATSAPP_PER_DAY/day — never serves more
    than the daily allowance minus what has already gone out today.
    """
    from db.client import get_db
    from config import settings
    import safety
    db = get_db()

    # Only serve up to the remaining daily WhatsApp allowance.
    sent_today = safety.outreach_count_today("whatsapp")
    remaining = max(0, settings.MAX_WHATSAPP_PER_DAY - sent_today)
    effective_limit = max(0, min(limit, remaining))
    if effective_limit == 0:
        return {
            "messages": [], "count": 0, "capped": True,
            "reason": f"daily WhatsApp cap reached ({sent_today}/{settings.MAX_WHATSAPP_PER_DAY})",
        }

    result = (
        db.table("outreach_messages")
        .select("id, body, leads(business_name, phone)")
        .in_("status", ["queued", "draft"])
        .eq("channel", "whatsapp")
        .eq("direction", "outbound")
        .order("created_at")
        .limit(effective_limit)
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


@router.post("/admin/fix-preview-urls")
async def fix_preview_urls(background_tasks: BackgroundTasks):
    """
    Fixes preview records with NULL/empty preview_url by reconstructing the URL
    from the preview's own ID. Also fixes any remaining localhost URLs.
    Runs in background to avoid timeout. Safe to run multiple times.
    """
    background_tasks.add_task(_run_fix_preview_urls)
    return {"status": "started", "message": "Fix running in background — check agent logs"}


def _run_fix_preview_urls():
    from db.client import get_db
    db = get_db()

    PROD = "https://l-d-designss-production.up.railway.app"
    fixed = 0

    # Fix 1: records with NULL preview_url — reconstruct from ID
    result = (
        db.table("previews")
        .select("id")
        .is_("preview_url", "null")
        .limit(2000)
        .execute()
    )
    for row in (result.data or []):
        new_url = f"{PROD}/previews/serve/{row['id']}"
        db.table("previews").update({"preview_url": new_url}).eq("id", row["id"]).execute()
        fixed += 1

    # Fix 2: records with empty string preview_url
    result2 = (
        db.table("previews")
        .select("id")
        .eq("preview_url", "")
        .limit(2000)
        .execute()
    )
    for row in (result2.data or []):
        new_url = f"{PROD}/previews/serve/{row['id']}"
        db.table("previews").update({"preview_url": new_url}).eq("id", row["id"]).execute()
        fixed += 1

    # Fix 3: any remaining localhost URLs
    result3 = (
        db.table("previews")
        .select("id, preview_url")
        .ilike("preview_url", "%localhost%")
        .limit(2000)
        .execute()
    )
    for row in (result3.data or []):
        old_url = row.get("preview_url") or ""
        new_url = old_url.replace("http://localhost:8000", PROD).replace("http://localhost", PROD)
        if new_url != old_url:
            db.table("previews").update({"preview_url": new_url}).eq("id", row["id"]).execute()
            fixed += 1

    total = db.table("previews").select("id", count="exact").execute().count or 0
    valid = (
        db.table("previews").select("id", count="exact")
        .ilike("preview_url", "%/previews/serve/%")
        .execute().count or 0
    )

    try:
        db.table("agent_logs").insert({
            "agent_name": "admin",
            "action": f"fix_preview_urls: fixed {fixed} broken URLs",
            "status": "success",
            "details": {"fixed": fixed, "total": total, "valid_after": valid},
        }).execute()
    except Exception:
        pass

    return {
        "fixed": fixed,
        "total_previews": total,
        "valid_urls_after": valid,
        "message": f"Fixed {fixed} broken preview URLs. {valid}/{total} now valid.",
    }


class WaSentRequest(BaseModel):
    message_ids: list[str]


@router.post("/wa-sent")
async def mark_wa_sent(req: WaSentRequest):
    """Mark WhatsApp messages as sent after Baz delivers them."""
    message_ids = req.message_ids
    from db.client import get_db
    from datetime import datetime
    from agents import followup_agent
    import logging
    logger = logging.getLogger(__name__)
    db = get_db()

    updated = 0
    for mid in message_ids:
        try:
            # Get message + lead before updating
            msg = db.table("outreach_messages").select("lead_id, channel").eq("id", mid).single().execute()
            if not msg.data:
                continue

            lead_id = msg.data["lead_id"]
            channel = msg.data.get("channel", "whatsapp")

            # Mark message as sent
            db.table("outreach_messages").update({
                "status": "sent",
                "sent_at": datetime.utcnow().isoformat(),
            }).eq("id", mid).execute()

            # Update lead status if first outreach
            lead = db.table("leads").select("status").eq("id", lead_id).single().execute()
            if lead.data and lead.data.get("status") in ("new", "preview_ready", "outreach_queued"):
                db.table("leads").update({"status": "outreach_sent"}).eq("id", lead_id).execute()

            # Start follow-up sequence
            followup_agent.start_sequence(lead_id, channel)

            updated += 1
        except Exception as e:
            logger.error(f"wa-sent failed for {mid}: {e}")

    return {"updated": updated}


@router.post("/admin/re-engage-broken-links")
async def re_engage_broken_links():
    """
    Finds the 68 leads that received outreach with a localhost preview link,
    and generates a new WhatsApp re-engagement message with the working preview URL.
    Messages are queued as 'draft' for Dylan to review and send manually.
    """
    from db.client import get_db
    from agents import outreach_writer, preview_generator
    import logging
    logger = logging.getLogger(__name__)
    db = get_db()

    # Find all sent outbound WA messages that contain a localhost URL
    result = (
        db.table("outreach_messages")
        .select("id, lead_id, body")
        .eq("status", "sent")
        .eq("channel", "whatsapp")
        .eq("direction", "outbound")
        .ilike("body", "%localhost%")
        .limit(200)
        .execute()
    )

    queued = 0
    skipped = 0
    errors = 0
    leads_processed = set()

    for msg in (result.data or []):
        lead_id = msg.get("lead_id")
        if not lead_id or lead_id in leads_processed:
            skipped += 1
            continue

        leads_processed.add(lead_id)

        try:
            # Get lead details + their current preview URL
            lead = db.table("leads").select("*").eq("id", lead_id).single().execute().data
            if not lead:
                skipped += 1
                continue

            # Skip leads that have already replied or been converted
            if lead.get("status") in ("replied", "interested", "converted", "not_interested", "do_not_contact"):
                skipped += 1
                continue

            # Get their preview URL
            preview_row = (
                db.table("previews")
                .select("preview_url")
                .eq("lead_id", lead_id)
                .limit(1)
                .execute()
            )
            preview_url = (preview_row.data or [{}])[0].get("preview_url") or ""

            if not preview_url or "localhost" in preview_url:
                skipped += 1
                continue

            name = lead.get("business_name", "the shop")
            body = (
                f"Hiya, Dylan here — sorry about this, the link I sent you the other day was broken on my end. "
                f"Here's the working one for {name}: {preview_url}\n\n"
                f"Let me know what you think — still got a spot available if you want it live."
            )

            # Queue as draft so Dylan reviews before sending
            db.table("outreach_messages").insert({
                "lead_id": lead_id,
                "channel": "whatsapp",
                "direction": "outbound",
                "body": body,
                "status": "draft",
                "sequence_day": 2,
                "ai_generated": False,
                "approved_by_founder": False,
            }).execute()

            queued += 1

        except Exception as e:
            logger.error(f"re-engage failed for lead {lead_id}: {e}")
            errors += 1

    return {
        "queued": queued,
        "skipped": skipped,
        "errors": errors,
        "message": f"Queued {queued} re-engagement messages. Review them in the Outreach page before sending.",
    }


@router.post("/admin/backfill-followups")
async def backfill_followup_sequences():
    """One-time backfill: start follow-up sequences for all outreach_sent leads that don't have one."""
    from db.client import get_db
    from agents import followup_agent
    db = get_db()

    # Get all outreach_sent leads
    leads = db.table("leads").select("id").eq("status", "outreach_sent").execute()
    started = 0
    skipped = 0

    for lead in (leads.data or []):
        lead_id = lead["id"]
        # Check if sequence already exists
        existing = db.table("follow_up_sequences").select("id").eq("lead_id", lead_id).execute()
        if existing.data:
            skipped += 1
            continue
        # Find the channel from their last sent message
        msg = db.table("outreach_messages").select("channel").eq("lead_id", lead_id).eq("status", "sent").order("sent_at", desc=True).limit(1).execute()
        channel = msg.data[0]["channel"] if msg.data else "whatsapp"
        followup_agent.start_sequence(lead_id, channel)
        started += 1

    return {"started": started, "skipped": skipped, "total_leads": len(leads.data or [])}


# ── Agent heartbeat ──────────────────────────────────────────────────────────

class HeartbeatRequest(BaseModel):
    agent: str


@router.post("/heartbeat")
async def agent_heartbeat(req: HeartbeatRequest):
    """Agents call this at the start of each run so the status endpoint shows RUNNING."""
    from db.client import get_db
    try:
        get_db().table("agent_logs").insert({
            "agent_name": req.agent,
            "action": "heartbeat",
            "status": "running",
        }).execute()
    except Exception:
        pass
    return {"ok": True, "agent": req.agent}


# ── Unified agent status (all 21 agents) ────────────────────────────────────

@router.get("/status")
async def all_agent_status():
    """
    Returns status for all 21 agents (12 backend Python + 9 OpenClaw).
    Status: running | active | error | stale | idle
      running — heartbeat in last 5m
      active  — last log < 1h ago, status=success
      error   — last log status=error
      stale   — expected to have run but hasn't (based on AGENT_SCHEDULE)
      idle    — no schedule expectation or not yet run today
    """
    from db.client import get_db
    db = get_db()
    now = datetime.now(timezone.utc)

    # Fetch recent logs for all backend agents (last 48h)
    cutoff = (now - timedelta(hours=48)).isoformat()
    logs = (
        db.table("agent_logs")
        .select("agent_name, action, status, created_at, details")
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(1000)
        .execute().data or []
    )

    # Most recent log per agent
    latest: dict = {}
    for log in logs:
        latest.setdefault(log["agent_name"], log)

    def _compute_status(name: str, log: dict | None) -> str:
        if log is None:
            return "idle"
        age_h = (now - datetime.fromisoformat(log["created_at"].replace("Z", "+00:00"))).total_seconds() / 3600
        if log.get("action") == "heartbeat" and age_h < 0.083:  # <5min
            return "running"
        if log.get("status") == "error":
            return "error"
        sched = AGENT_SCHEDULE.get(name)
        if sched and age_h > sched["window_h"]:
            return "stale"
        if age_h < 1:
            return "active"
        return "idle"

    # Build backend Python agent list
    backend_agents = []
    for name, sched in AGENT_SCHEDULE.items():
        log = latest.get(name)
        s = _compute_status(name, log)
        backend_agents.append({
            "name": name,
            "group": "backend",
            "status": s,
            "last_seen": log["created_at"] if log else None,
            "last_action": log["action"] if log else None,
            "last_log_status": log["status"] if log else None,
            "schedule_label": sched["label"],
            "interval_h": sched["interval_h"],
        })

    # OpenClaw team agents — pull from agent_tasks + agent_messages
    TEAM_AGENTS = ["scout", "gap", "judge", "maker", "reach", "executor", "closer", "profit", "chief"]
    tasks = (
        db.table("agent_tasks").select("assigned_to, type, status, completed_at, created_at")
        .order("created_at", desc=True).limit(300).execute().data or []
    )
    msgs = (
        db.table("agent_messages").select("from_agent, message, created_at")
        .order("created_at", desc=True).limit(100).execute().data or []
    )
    today = now.date().isoformat()

    team_agents = []
    for name in TEAM_AGENTS:
        a_tasks = [t for t in tasks if t.get("assigned_to") == name]
        a_msgs = [m for m in msgs if m.get("from_agent") == name]

        last_at, last_action = None, None
        if a_tasks:
            last_at = a_tasks[0].get("completed_at") or a_tasks[0].get("created_at")
            last_action = a_tasks[0].get("type")
        if a_msgs:
            msg_at = a_msgs[0].get("created_at")
            if not last_at or (msg_at and msg_at > last_at):
                last_at = msg_at
                last_action = a_msgs[0].get("message", "")[:80]

        stuck = any(t.get("status") in ("failed", "blocked") for t in a_tasks)
        working = any(t.get("status") == "in_progress" for t in a_tasks)
        done_today = last_at and last_at[:10] == today

        if working:
            s = "running"
        elif stuck:
            s = "error"
        elif done_today:
            s = "active"
        else:
            s = "idle"

        team_agents.append({
            "name": name,
            "group": "openclaw",
            "status": s,
            "last_seen": last_at,
            "last_action": last_action,
            "last_log_status": None,
            "schedule_label": "Via openclaw cron",
            "interval_h": None,
        })

    all_agents = backend_agents + team_agents

    # Summary counts
    counts = {"running": 0, "active": 0, "error": 0, "stale": 0, "idle": 0}
    for a in all_agents:
        counts[a["status"]] = counts.get(a["status"], 0) + 1

    health = "ok"
    if counts["error"] > 0 or counts["stale"] > 0:
        health = "warning"
    if counts["error"] >= 3:
        health = "critical"

    return {
        "agents": all_agents,
        "counts": counts,
        "health": health,
        "total": len(all_agents),
        "checked_at": now.isoformat(),
    }
