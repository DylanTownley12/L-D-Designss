"""
Orchestrator — decides which agents run, in what order, and logs every handoff.
All decisions are written to agent_logs with a shared session_id so the frontend
can render the full conversation timeline.
"""
import logging
import time
import uuid

logger = logging.getLogger(__name__)

AGENT_LABELS = {
    "lead_finder":       "Lead Finder",
    "website_analyzer":  "Website Analyzer",
    "preview_generator": "Preview Generator",
    "outreach_writer":   "Outreach Writer",
    "followup_agent":    "Follow-up Agent",
    "orchestrator":      "Orchestrator",
}


def _log(db, session_id: str, agent: str, action: str, status: str = "success", details: dict = None):
    try:
        db.table("agent_logs").insert({
            "agent_name": agent,
            "action": action,
            "status": status,
            "details": {"session_id": session_id, **(details or {})},
        }).execute()
    except Exception as e:
        logger.error(f"Orchestrator log write failed: {e}")


def run(task: str = "auto") -> dict:
    from db.client import get_db
    from agents import lead_finder, website_analyzer, preview_generator, outreach_writer, followup_agent

    db = get_db()
    session_id = str(uuid.uuid4())[:8]

    def log(agent, action, status="success", details=None):
        _log(db, session_id, agent, action, status, details)

    log("orchestrator", f"Session {session_id} — task: {task}")

    # Read pipeline state
    all_leads = db.table("leads").select("status").execute().data or []
    counts = {}
    for lead in all_leads:
        s = lead.get("status", "unknown")
        counts[s] = counts.get(s, 0) + 1

    new_count      = counts.get("new", 0)
    preview_ready  = counts.get("preview_ready", 0)
    sent_count     = counts.get("outreach_sent", 0)
    replied_count  = counts.get("replied", 0)

    log("orchestrator",
        f"Pipeline: {new_count} new, {preview_ready} preview_ready, "
        f"{sent_count} sent, {replied_count} replied")

    # Decide plan
    plan = _build_plan(task, new_count, preview_ready)

    if not plan:
        log("orchestrator", "Nothing to do — pipeline is up to date")
        return {"session_id": session_id, "results": [], "message": "Nothing to do"}

    log("orchestrator", "Plan: " + " → ".join(AGENT_LABELS.get(a, a) for a in plan))

    agent_fns = {
        "lead_finder":       lead_finder.run,
        "website_analyzer":  website_analyzer.run,
        "preview_generator": preview_generator.run_batch,
        "whatsapp_campaign": outreach_writer.generate_whatsapp_campaign,
        "followup_agent":    followup_agent.run,
    }

    results = []
    for i, agent_name in enumerate(plan):
        fn = agent_fns.get(agent_name)
        if not fn:
            continue

        log(agent_name, "Starting...", status="pending")
        try:
            t0 = time.time()
            result = fn()
            duration_ms = int((time.time() - t0) * 1000)

            summary = _summarize(agent_name, result)
            log(agent_name, summary, details={"result": result, "duration_ms": duration_ms})

            # Handoff to next agent
            if i + 1 < len(plan):
                next_label = AGENT_LABELS.get(plan[i + 1], plan[i + 1])
                log(agent_name, f"Done → handing off to {next_label}")

            results.append({"agent": agent_name, "result": result})

        except Exception as e:
            log(agent_name, f"Failed: {e}", status="error")
            logger.error(f"Orchestrator: {agent_name} failed: {e}")

    log("orchestrator", f"Complete — {len(results)}/{len(plan)} agents succeeded")
    return {"session_id": session_id, "results": results, "message": "Pipeline complete"}


def _build_plan(task: str, new_count: int, preview_ready: int) -> list:
    if task == "find_leads":
        return ["lead_finder"]
    if task == "generate_previews":
        return ["website_analyzer", "preview_generator"]
    if task == "send_outreach":
        return ["whatsapp_campaign"]
    if task == "followup":
        return ["followup_agent"]
    # auto / full_pipeline — run whatever the pipeline needs
    plan = []
    if new_count > 0:
        plan.append("website_analyzer")
    if new_count > 0 or preview_ready > 0:
        plan.append("preview_generator")
    plan.append("whatsapp_campaign")
    return plan


def _summarize(agent_name: str, result) -> str:
    if not result or not isinstance(result, dict):
        return "Completed"
    if agent_name == "lead_finder":
        return f"Found {result.get('found', 0)} leads, {result.get('saved', 0)} saved to DB"
    if agent_name == "website_analyzer":
        return f"Analyzed {result.get('analyzed', 0)} leads"
    if agent_name == "preview_generator":
        return f"Generated {result.get('generated', 0)} previews, {result.get('skipped', 0)} skipped"
    if agent_name == "whatsapp_campaign":
        return f"Queued {result.get('generated', 0)} WhatsApp messages, {result.get('skipped', 0)} already done"
    if agent_name == "followup_agent":
        return f"Sent {result.get('sent', 0)} follow-ups"
    return "Completed"
