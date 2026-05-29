from fastapi import APIRouter, HTTPException, BackgroundTasks
from models.schemas import AgentRunRequest, AgentRunResult
from agents import (
    lead_finder,
    website_analyzer,
    preview_generator,
    outreach_writer,
    followup_agent,
    notification_agent,
    outreach_sender,
)

router = APIRouter(prefix="/agents", tags=["agents"])

AGENTS = {
    "lead_finder": lead_finder.run,
    "website_analyzer": website_analyzer.run,
    "preview_generator": preview_generator.run,
    "outreach_writer": outreach_writer.run_batch,
    "followup_agent": followup_agent.run,
    "outreach_queue": outreach_sender.process_queue,
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

    # Preview generator: single lead or batch
    if req.agent == "preview_generator":
        if req.lead_id:
            background_tasks.add_task(fn, req.lead_id)
        else:
            background_tasks.add_task(preview_generator.run_batch)
        return AgentRunResult(agent=req.agent, status="started", message="Generating previews in background")

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
