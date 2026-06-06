"""
api/team.py — coordination API for the 9-agent OpenClaw team.

The OpenClaw agents (scout, gap, judge, maker, reach, executor, closer, profit,
chief) have no direct database access. They talk to Supabase the same way Baz
already does: by calling clean HTTP endpoints here. This keeps all writes
server-side and validated, and means nothing an agent does can bypass the
approval gate — anything that would send or spend is staged as an approval row
for the founder, never executed by an agent.

Routes (all under /api/team):
  Leads      GET  /leads
             POST /leads/{lead_id}/score
  Tasks      GET  /tasks          POST /tasks
             POST /tasks/{id}/claim   POST /tasks/{id}/complete
  Messages   GET  /messages       POST /messages   POST /messages/{id}/read
  Approvals  GET  /approvals      POST /approvals  POST /approvals/{id}/decide
  Knowledge  GET  /knowledge      POST /knowledge
  Overview   GET  /summary
"""
import os
from datetime import datetime, date, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db.client import get_db

MAX_WHATSAPP_PER_DAY = int(os.getenv("MAX_WHATSAPP_PER_DAY", "10"))

router = APIRouter(prefix="/team", tags=["team"])

VALID_AGENTS = {"scout", "gap", "judge", "maker", "reach",
                "executor", "closer", "profit", "chief"}

# Ordered for the control-room roster (matches the daily handoff chain).
TEAM_AGENTS = ["scout", "gap", "judge", "maker", "reach",
               "executor", "closer", "profit", "chief"]

AGENT_ROLES = {
    "scout":    "Triage new leads + find the angle",
    "gap":      "Rank opportunity 0–10",
    "judge":    "Sceptical GO / HOLD / REJECT",
    "maker":    "Plan the preview site",
    "reach":    "Write outreach + marketing",
    "executor": "Assemble + stage for approval",
    "closer":   "Draft replies — never sends",
    "profit":   "Analytics + one A/B test",
    "chief":    "Coordinate + founder summary",
}

AGENT_SCHEDULE = {
    "scout": "06:00", "gap": "06:20", "judge": "06:40", "maker": "07:00",
    "reach": "07:20", "executor": "07:40", "closer": "hourly 9–8",
    "profit": "20:00", "chief": "07:00 & 20:00",
}

# The existing leads.status CHECK constraint — agents may only set these.
ALLOWED_LEAD_STATUS = {"new", "analyzing", "preview_ready", "outreach_queued",
                       "outreach_sent", "replied", "interested", "converted",
                       "not_interested", "do_not_contact"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Request models ────────────────────────────────────────────────────────────

class TaskIn(BaseModel):
    lead_id: Optional[str] = None
    assigned_to: str
    type: str
    payload: dict = {}
    priority: int = 5
    needs_approval: bool = False


class TaskComplete(BaseModel):
    result: dict = {}
    # optional handoff — drop the next task in one call
    next_assigned_to: Optional[str] = None
    next_type: Optional[str] = None
    next_payload: dict = {}
    next_priority: int = 5
    next_lead_id: Optional[str] = None   # carry the lead through the chain


class ScoreIn(BaseModel):
    agent: str                      # 'gap' or 'judge'
    scores: dict = {}
    total_score: Optional[float] = None
    verdict: Optional[str] = None   # GO | HOLD | REJECT
    evidence: dict = {}
    set_lead_status: Optional[str] = None   # optionally advance the lead


class MessageIn(BaseModel):
    from_agent: str
    to_agent: Optional[str] = None  # null = broadcast
    lead_id: Optional[str] = None
    task_id: Optional[str] = None
    message: str


class ApprovalIn(BaseModel):
    task_id: Optional[str] = None
    lead_id: Optional[str] = None
    agent: Optional[str] = None
    action: str                     # what happens on approve
    reason: Optional[str] = None
    amount: float = 0
    preview: Optional[str] = None   # exact content that would go live/out


class DecisionIn(BaseModel):
    decision: str                   # 'approved' | 'rejected'


class KnowledgeIn(BaseModel):
    topic: Optional[str] = None
    content: str
    source: Optional[str] = None


# ── Leads ─────────────────────────────────────────────────────────────────────

@router.get("/leads")
async def list_leads(status: Optional[str] = None, limit: int = 10):
    """Leads for Scout/Gap/Judge to work through."""
    db = get_db()
    q = db.table("leads").select(
        "id, business_name, type, city, postcode, website, website_status, "
        "quality_score, status, phone, email, instagram_url"
    )
    if status:
        q = q.eq("status", status)
    rows = q.order("created_at", desc=True).limit(min(limit, 50)).execute().data or []
    return {"leads": rows, "count": len(rows)}


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str):
    """Fetch a single lead's full details — for agents that need to read before scoring."""
    db = get_db()
    rows = db.table("leads").select(
        "id, business_name, type, city, postcode, website, website_status, "
        "quality_score, status, phone, email, instagram_url, google_rating, "
        "google_reviews, analysis_data, notes"
    ).eq("id", lead_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(404, f"lead {lead_id} not found")
    return {"lead": rows[0]}


@router.post("/leads/{lead_id}/score")
async def score_lead(lead_id: str, body: ScoreIn):
    """Gap/Judge write their ranking; optionally advance the lead's status."""
    db = get_db()
    db.table("lead_scores").insert({
        "lead_id": lead_id,
        "agent": body.agent,
        "scores": body.scores,
        "total_score": body.total_score,
        "verdict": body.verdict,
        "evidence": body.evidence,
    }).execute()
    if body.set_lead_status and body.set_lead_status in ALLOWED_LEAD_STATUS:
        db.table("leads").update({"status": body.set_lead_status}).eq("id", lead_id).execute()
    return {"ok": True, "lead_id": lead_id}


# ── Tasks (the main handoff) ──────────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(assigned_to: Optional[str] = None, status: str = "queued", limit: int = 10):
    """An agent's inbox — next queued tasks, highest priority first."""
    db = get_db()
    q = db.table("agent_tasks").select("*")
    if assigned_to:
        q = q.eq("assigned_to", assigned_to)
    if status:
        q = q.eq("status", status)
    rows = q.order("priority", desc=True).limit(min(limit, 50)).execute().data or []
    return {"tasks": rows, "count": len(rows)}


@router.post("/tasks")
async def create_task(body: TaskIn):
    """Drop a task for the next agent (a handoff)."""
    if body.assigned_to not in VALID_AGENTS:
        raise HTTPException(400, f"unknown agent '{body.assigned_to}'")
    db = get_db()
    row = db.table("agent_tasks").insert({
        "lead_id": body.lead_id,
        "assigned_to": body.assigned_to,
        "type": body.type,
        "payload": body.payload,
        "priority": body.priority,
        "needs_approval": body.needs_approval,
    }).execute().data
    created = row[0] if isinstance(row, list) and row else row
    return {"ok": True, "task": created}


@router.post("/tasks/{task_id}/claim")
async def claim_task(task_id: str):
    db = get_db()
    db.table("agent_tasks").update({"status": "in_progress"}).eq("id", task_id).execute()
    return {"ok": True, "task_id": task_id}


@router.post("/tasks/{task_id}/complete")
async def complete_task(task_id: str, body: TaskComplete):
    """Mark a task done, store its result, and optionally hand off the next one."""
    db = get_db()
    db.table("agent_tasks").update({
        "status": "done",
        "result": body.result,
        "completed_at": _now(),
    }).eq("id", task_id).execute()

    next_task = None
    if body.next_assigned_to and body.next_type:
        if body.next_assigned_to not in VALID_AGENTS:
            raise HTTPException(400, f"unknown next agent '{body.next_assigned_to}'")
        row = db.table("agent_tasks").insert({
            "lead_id": body.next_lead_id,
            "assigned_to": body.next_assigned_to,
            "type": body.next_type,
            "payload": body.next_payload,
            "priority": body.next_priority,
        }).execute().data
        next_task = row[0] if isinstance(row, list) and row else row
    return {"ok": True, "task_id": task_id, "next_task": next_task}


# ── Message board ─────────────────────────────────────────────────────────────

@router.get("/messages")
async def list_messages(to_agent: Optional[str] = None, unread: bool = True, limit: int = 20):
    db = get_db()
    q = db.table("agent_messages").select("*")
    if to_agent:
        q = q.eq("to_agent", to_agent)
    if unread:
        q = q.eq("read", "false")          # string form — PostgREST boolean
    rows = q.order("created_at", desc=True).limit(min(limit, 100)).execute().data or []
    return {"messages": rows, "count": len(rows)}


@router.post("/messages")
async def post_message(body: MessageIn):
    db = get_db()
    db.table("agent_messages").insert({
        "from_agent": body.from_agent,
        "to_agent": body.to_agent,
        "lead_id": body.lead_id,
        "task_id": body.task_id,
        "message": body.message,
    }).execute()
    return {"ok": True}


@router.post("/messages/{message_id}/read")
async def mark_message_read(message_id: str):
    db = get_db()
    db.table("agent_messages").update({"read": True}).eq("id", message_id).execute()
    return {"ok": True}


# ── Approvals (the safety gate) ───────────────────────────────────────────────

@router.get("/approvals")
async def list_approvals(status: str = "pending", limit: int = 50):
    """Pending approvals for the founder (surfaced on the dashboard)."""
    db = get_db()
    rows = (db.table("agent_approvals").select("*")
            .eq("status", status).order("created_at", desc=True)
            .limit(min(limit, 100)).execute().data or [])
    return {"approvals": rows, "count": len(rows)}


@router.post("/approvals")
async def create_approval(body: ApprovalIn):
    """Stage an action for founder approval. Agents call this instead of acting."""
    db = get_db()
    row = db.table("agent_approvals").insert({
        "task_id": body.task_id,
        "lead_id": body.lead_id,
        "agent": body.agent,
        "action": body.action,
        "reason": body.reason,
        "amount": body.amount,
        "preview": body.preview,
    }).execute().data
    created = row[0] if isinstance(row, list) and row else row
    return {"ok": True, "approval": created}


@router.post("/approvals/{approval_id}/decide")
async def decide_approval(approval_id: str, body: DecisionIn):
    """Founder action (from the dashboard): approve or reject a staged item."""
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be 'approved' or 'rejected'")
    db = get_db()
    db.table("agent_approvals").update({
        "status": body.decision,
        "decided_at": _now(),
    }).eq("id", approval_id).execute()
    return {"ok": True, "approval_id": approval_id, "decision": body.decision}


# ── Knowledge base (lessons) ──────────────────────────────────────────────────

@router.get("/knowledge")
async def recall_knowledge(topic: Optional[str] = None, limit: int = 5):
    db = get_db()
    q = db.table("knowledge_base").select("topic, content, source, created_at")
    if topic:
        q = q.ilike("topic", f"%{topic}%")
    rows = q.order("created_at", desc=True).limit(min(limit, 25)).execute().data or []
    return {"lessons": rows, "count": len(rows)}


@router.post("/knowledge")
async def save_knowledge(body: KnowledgeIn):
    db = get_db()
    db.table("knowledge_base").insert({
        "topic": body.topic,
        "content": body.content,
        "source": body.source,
    }).execute()
    return {"ok": True}


# ── Overview (for Chief's morning pass) ───────────────────────────────────────

@router.get("/summary")
async def summary():
    """A compact snapshot for Chief: pipeline, work queue, approvals, revenue."""
    db = get_db()

    def count(table, **filters):
        q = db.table(table).select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        return q.execute().count or 0

    pipeline = {s: count("leads", status=s) for s in
                ["new", "preview_ready", "outreach_sent", "replied", "interested", "converted"]}

    queued_tasks = count("agent_tasks", status="queued")
    pending_approvals = count("agent_approvals", status="pending")

    # Recurring revenue = active clients' monthly hosting.
    clients = db.table("clients").select("monthly_hosting").eq("status", "active").execute().data or []
    mrr = round(sum(float(c.get("monthly_hosting") or 0) for c in clients), 2)

    # This month's booked revenue.
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    rev_rows = db.table("revenue_logs").select("amount").gte("recorded_at", month_start).execute().data or []
    revenue_this_month = round(sum(float(r.get("amount") or 0) for r in rev_rows), 2)

    return {
        "pipeline": pipeline,
        "active_clients": len(clients),
        "mrr_gbp": mrr,
        "revenue_this_month_gbp": revenue_this_month,
        "queued_tasks": queued_tasks,
        "pending_approvals": pending_approvals,
        "phase_targets": {"phase_1": 500, "phase_2": 2000, "phase_3": 5000},
    }


# ── Control room (powers the Agent Hub page in one call) ──────────────────────

@router.get("/control-room")
async def control_room():
    """Everything the War Room needs: the 9 agents + their last move, the
    cross-agent feed, pending approvals, and what's stuck (safe to retry)."""
    db = get_db()

    tasks = (db.table("agent_tasks").select("*")
             .order("created_at", desc=True).limit(300).execute().data or [])
    msgs = (db.table("agent_messages").select("*")
            .order("created_at", desc=True).limit(40).execute().data or [])
    approvals = (db.table("agent_approvals").select("*")
                 .eq("status", "pending").order("created_at", desc=True)
                 .limit(50).execute().data or [])

    today = datetime.now(timezone.utc).date().isoformat()

    agents = []
    for name in TEAM_AGENTS:
        a_tasks = [t for t in tasks if t.get("assigned_to") == name]
        a_msgs = [m for m in msgs if m.get("from_agent") == name]
        open_tasks = [t for t in a_tasks if t.get("status") in ("queued", "in_progress")]
        stuck = [t for t in a_tasks if t.get("status") in ("failed", "blocked")]

        last_action, last_at = None, None
        if a_tasks:
            last = a_tasks[0]
            last_action = last.get("type")
            last_at = last.get("completed_at") or last.get("created_at")
        if a_msgs and (not last_at or (a_msgs[0].get("created_at") or "") > (last_at or "")):
            last_action = a_msgs[0].get("message")
            last_at = a_msgs[0].get("created_at")

        if any(t.get("status") == "in_progress" for t in a_tasks):
            status = "working"
        elif stuck:
            status = "stuck"
        elif last_at and last_at[:10] == today:
            status = "done"
        else:
            status = "idle"

        agents.append({
            "name": name,
            "role": AGENT_ROLES.get(name, ""),
            "schedule": AGENT_SCHEDULE.get(name, ""),
            "status": status,
            "last_action": last_action,
            "last_at": last_at,
            "open_tasks": len(open_tasks),
            "stuck": len(stuck),
        })

    stuck_tasks = [t for t in tasks if t.get("status") in ("failed", "blocked")][:25]
    done_today = len([t for t in tasks
                      if t.get("status") == "done"
                      and (t.get("completed_at") or "")[:10] == today])

    return {
        "agents": agents,
        "messages": msgs,
        "approvals": approvals,
        "stuck_tasks": stuck_tasks,
        "counts": {
            "pending_approvals": len(approvals),
            "stuck": len(stuck_tasks),
            "queued": len([t for t in tasks if t.get("status") == "queued"]),
            "done_today": done_today,
        },
    }


# ── Safe retry (one-click fix for stuck handoffs) ─────────────────────────────

@router.post("/tasks/{task_id}/retry")
async def retry_task(task_id: str):
    """Re-queue a failed/blocked task so its agent picks it up next run.
    Safe: only moves a task back to 'queued', never sends or spends."""
    db = get_db()
    db.table("agent_tasks").update({"status": "queued", "result": {}}).eq("id", task_id).execute()
    return {"ok": True, "task_id": task_id}


@router.post("/retry-stuck")
async def retry_stuck():
    """Bulk re-queue every failed/blocked task. Safe — no send/spend."""
    db = get_db()
    rows = (db.table("agent_tasks").select("id")
            .in_("status", ["failed", "blocked"]).limit(100).execute().data or [])
    for r in rows:
        db.table("agent_tasks").update({"status": "queued"}).eq("id", r["id"]).execute()
    return {"ok": True, "retried": len(rows)}


# ── Backlog seeder (feeds the team work from existing preview_ready leads) ─────

def seed_backlog(limit: int = 8) -> dict:
    """Give the team work from the existing backlog.

    Drops a capped batch of 'rank_lead' tasks into Gap's inbox for the best
    preview_ready leads the team hasn't touched yet. Gap then ranks → Judge →
    Maker → Reach → Executor stages outreach for approval. Safe: only creates
    tasks — never sends, posts, or spends. Idempotent: skips any lead that
    already has a team task, so re-running won't duplicate work.
    """
    db = get_db()
    limit = max(1, min(limit, 25))

    existing = db.table("agent_tasks").select("lead_id").limit(2000).execute().data or []
    seen = {r["lead_id"] for r in existing if r.get("lead_id")}

    fetch = min(200, limit + len(seen) + 20)
    candidates = (db.table("leads")
                  .select("id, business_name, quality_score")
                  .eq("status", "preview_ready")
                  .order("quality_score", desc=True)
                  .limit(fetch).execute().data or [])

    seeded = []
    for lead in candidates:
        if lead["id"] in seen:
            continue
        qs = lead.get("quality_score") or 50
        priority = max(1, min(10, round(qs / 10)))
        db.table("agent_tasks").insert({
            "lead_id": lead["id"],
            "assigned_to": "gap",
            "type": "rank_lead",
            "priority": priority,
            "payload": {"source": "backlog_seed", "business_name": lead.get("business_name")},
        }).execute()
        seeded.append(lead["id"])
        if len(seeded) >= limit:
            break

    return {"seeded": len(seeded), "lead_ids": seeded}


@router.post("/seed-backlog")
async def seed_backlog_endpoint(limit: int = 8):
    """Manually top up the team's work queue from the backlog (also runs daily)."""
    return {"ok": True, **seed_backlog(limit)}


# ── Executor: direct queue (WA + email only, no approval gate) ────────────────

class ExecutorQueueIn(BaseModel):
    channel: str                     # 'whatsapp' or 'email'
    lead_id: Optional[str] = None
    body: str
    subject: Optional[str] = None   # email only


@router.post("/executor/queue")
async def executor_queue_message(body: ExecutorQueueIn):
    """Executor queues a WA or email message — no approval needed for these two channels.
    WA is capped at MAX_WHATSAPP_PER_DAY and deduplicated per lead.
    Instagram / Stripe / anything else must still go through /approvals."""
    if body.channel not in ("whatsapp", "email"):
        raise HTTPException(400, "channel must be 'whatsapp' or 'email' — use /approvals for other channels")

    db = get_db()
    today = date.today().isoformat()

    if body.channel == "whatsapp":
        # Exclude CEO alerts (subject='ceo_alert') from the outreach cap
        sent_or_queued_today = (
            db.table("outreach_messages").select("id", count="exact")
            .eq("channel", "whatsapp").eq("direction", "outbound")
            .in_("status", ["queued", "sent"])
            .neq("subject", "ceo_alert")
            .gte("created_at", f"{today}T00:00:00")
            .execute().count or 0
        )
        if sent_or_queued_today >= MAX_WHATSAPP_PER_DAY:
            return {"ok": False, "capped": True, "queued": 0,
                    "reason": f"WA daily cap reached ({sent_or_queued_today}/{MAX_WHATSAPP_PER_DAY})"}

        if body.lead_id:
            existing = (
                db.table("outreach_messages").select("id")
                .eq("lead_id", body.lead_id).eq("channel", "whatsapp")
                .in_("status", ["queued", "sent"]).execute().data or []
            )
            if existing:
                return {"ok": False, "capped": False, "queued": 0,
                        "reason": "lead already has a queued or sent WA message"}

    row = db.table("outreach_messages").insert({
        "lead_id": body.lead_id,
        "channel": body.channel,
        "direction": "outbound",
        "body": body.body,
        "subject": body.subject,
        "status": "queued",
        "approved_by_founder": True,
    }).execute().data
    created = row[0] if isinstance(row, list) and row else row
    return {"ok": True, "capped": False, "queued": 1, "message_id": (created or {}).get("id")}


# ── Chief: health snapshot + fix trigger ──────────────────────────────────────

@router.get("/chief/health")
async def chief_health():
    """Chief's hourly health check — what's broken, what's fixable, what to tell Dylan."""
    from datetime import timedelta
    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    today_str = datetime.now(timezone.utc).date().isoformat()

    logs = (db.table("agent_logs").select("agent_name, status, created_at")
            .gte("created_at", cutoff).order("created_at", desc=True)
            .limit(300).execute().data or [])

    latest: dict = {}
    for log in logs:
        latest.setdefault(log["agent_name"], log["status"])

    errors = [a for a, s in latest.items() if s == "error" and a != "ceo_agent"]

    wa_queued = (db.table("outreach_messages").select("id", count="exact")
                 .eq("channel", "whatsapp").eq("status", "queued")
                 .execute().count or 0)

    wa_sent_today = (db.table("outreach_messages").select("id", count="exact")
                     .eq("channel", "whatsapp").eq("status", "sent")
                     .gte("created_at", f"{today_str}T00:00:00")
                     .execute().count or 0)

    stuck = (db.table("agent_tasks").select("id", count="exact")
             .in_("status", ["failed", "blocked"]).execute().count or 0)

    pipeline = {s: (db.table("leads").select("id", count="exact").eq("status", s).execute().count or 0)
                for s in ["new", "preview_ready", "outreach_sent", "replied", "interested", "converted"]}

    problems = []
    if errors:
        problems.append(f"agents with errors: {', '.join(errors)}")
    if stuck > 0:
        problems.append(f"{stuck} stuck team task(s)")
    if wa_queued == 0 and pipeline.get("preview_ready", 0) > 0:
        problems.append("WA queue empty but preview_ready leads exist — Executor should queue messages")

    return {
        "ok": not problems,
        "problems": problems,
        "fixable": bool(errors or stuck),
        "errors": errors,
        "stuck_tasks": stuck,
        "wa_queued": wa_queued,
        "wa_sent_today": wa_sent_today,
        "pipeline": pipeline,
        "agent_statuses": latest,
    }


@router.post("/chief/fix")
async def chief_fix():
    """Chief triggers a full self-heal pass: retry errored agents + re-queue stuck tasks.
    If nothing is fixable, queues a WA alert to Dylan."""
    from datetime import timedelta
    from agents.ceo_agent import _retry_failed, _coordinate, _alert_dylan
    db = get_db()

    two_hours_ago = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

    retry_actions = _retry_failed(db, two_hours_ago)

    stuck = (db.table("agent_tasks").select("id")
             .in_("status", ["failed", "blocked"]).limit(100).execute().data or [])
    for t in stuck:
        db.table("agent_tasks").update({"status": "queued"}).eq("id", t["id"]).execute()

    pipeline = {s: (db.table("leads").select("id", count="exact").eq("status", s).execute().count or 0)
                for s in ["new", "preview_ready", "outreach_sent"]}
    coord_actions = _coordinate(db, {"pipeline": pipeline}, pipeline=pipeline)

    task_fix = [f"re-queued {len(stuck)} stuck task(s)"] if stuck else []
    all_actions = retry_actions + coord_actions + task_fix

    if not all_actions:
        _alert_dylan(db, ["Chief ran fix pass but found nothing auto-fixable — needs manual check"])

    db.table("agent_logs").insert({
        "agent_name": "chief",
        "action": f"self-heal: {len(all_actions)} fix(es)",
        "status": "success",
        "details": {"actions": all_actions},
    }).execute()

    return {"ok": True, "actions": all_actions, "fixed": len(all_actions)}
