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

from utils.revenue import revenue_score as _revenue_score


def _now():
    return datetime.now(timezone.utc)


@router.get("/ops/action-queue")
def get_action_queue(limit: int = 50):
    from db.client import get_db
    from config import settings
    db = get_db()
    items = []

    # 1. Inbound replies / interested (highest priority — close these)
    try:
        hot = db.table("leads").select(
            "id,business_name,city,phone,instagram_url,status,notes,updated_at"
        ).in_("status", ["replied", "interested"]).limit(20).execute().data or []
    except Exception as e:
        logger.warning(f"[action-queue] hot-lead query failed: {e}")
        hot = []

    for lead in hot:
      try:
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

        last_contact_at = last_msg["sent_at"] if last_msg else lead["updated_at"]
        hours_since = (
            (_now() - datetime.fromisoformat((last_contact_at or "").replace("Z", "+00:00"))).total_seconds() / 3600
            if last_contact_at else 999
        )

        items.append({
            "type": "hot_lead",
            "priority": 1 if lead["status"] == "interested" else 2,
            "revenue_score": _revenue_score(lead["status"], hours_since, bool(lead.get("phone")), bool(lead.get("instagram_url"))),
            "lead_id": lead["id"],
            "lead_name": lead["business_name"],
            "city": lead["city"],
            "channel": last_msg["channel"] if last_msg else "whatsapp",
            "suggested_message": None,
            "preview_url": preview_url,
            "instagram_url": lead.get("instagram_url"),
            "phone": phone or lead.get("phone"),
            "last_contact_at": last_contact_at,
            "followup_due_at": None,
            "payment_status": payment_status,
            "reasons": reasons,
        })
      except Exception as e:
        logger.warning(f"[action-queue] hot lead row failed: {e}")
        continue

    # 2. Follow-ups due — uses actual schema: stopped bool + per-day sent timestamps
    try:
        sequences = db.table("follow_up_sequences").select(
            "lead_id,channel,initial_sent_at,day_3_sent_at,day_7_sent_at,day_14_sent_at"
        ).eq("stopped", False).limit(30).execute().data or []

        now = _now()
        for f in sequences:
            sent_at_raw = f.get("initial_sent_at") or ""
            if not sent_at_raw:
                continue
            try:
                sent_at = datetime.fromisoformat(sent_at_raw.replace("Z", "+00:00"))
            except Exception:
                continue

            days_since = (now - sent_at).total_seconds() / 86400

            # Determine which step is due next
            if not f.get("day_3_sent_at") and days_since >= 3:
                step_label, step_days = "Day 3", 3
            elif not f.get("day_7_sent_at") and days_since >= 7:
                step_label, step_days = "Day 7", 7
            elif not f.get("day_14_sent_at") and days_since >= 14:
                step_label, step_days = "Day 14", 14
            else:
                continue  # no step due yet

            lead_row = db.table("leads").select("id,business_name,city,phone,instagram_url,status").eq("id", f["lead_id"]).limit(1).execute().data
            if not lead_row:
                continue
            lead = lead_row[0]
            if lead["status"] in ["replied", "interested", "converted", "not_interested", "do_not_contact"]:
                continue
            prev = db.table("previews").select("preview_url").eq("lead_id", lead["id"]).order("created_at", desc=True).limit(1).execute().data
            hours_overdue = (days_since - step_days) * 24
            items.append({
                "type": "followup_due",
                "priority": 3,
                "revenue_score": _revenue_score(lead["status"], hours_overdue, bool(lead.get("phone")), bool(lead.get("instagram_url"))),
                "lead_id": lead["id"],
                "lead_name": lead["business_name"],
                "city": lead["city"],
                "channel": f.get("channel", "whatsapp"),
                "suggested_message": None,
                "preview_url": prev[0]["preview_url"] if prev else None,
                "instagram_url": lead.get("instagram_url"),
                "phone": lead.get("phone"),
                "last_contact_at": None,
                "followup_due_at": sent_at_raw,
                "payment_status": None,
                "reasons": [f"Follow-up {step_label} overdue ({int(hours_overdue)}h)"],
            })
    except Exception as e:
        logger.warning(f"[action-queue] followup query failed: {e}")

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

    # Sort by revenue_score desc, then priority asc, then deduplicate by lead_id
    seen = set()
    deduped = []
    for item in sorted(items, key=lambda x: (-x.get("revenue_score", 0), x["priority"])):
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


# ── PROOF: single source of truth ──────────────────────────────────────────────
# One endpoint that answers "is the system actually working, and what did it do
# today?" with REAL DB counts (not status guesses). Every query is independently
# guarded so a slow/failing one degrades to null instead of 500-ing the whole call.

BACKEND_AGENTS = [
    "lead_finder", "website_analyzer", "lead_enricher", "preview_generator",
    "outreach_writer", "outreach_sender", "followup_agent", "ceo_agent",
    "self_heal", "preview_refresher",
]
TEAM_AGENTS = ["scout", "gap", "judge", "maker", "reach", "executor", "closer", "profit", "chief"]


@router.get("/ops/proof")
async def system_proof(include_logs: bool = False):
    """Prove what the system did today + agent health, all from real DB rows.

    Built for SPEED on the current (un-indexed) DB:
      • Reuses the proven-fast dashboard stats for leads/pipeline/queues/today-sends.
      • Avoids agent_logs entirely by default (it's un-indexed → ~60s/scan); proves
        backend-agent liveness from EFFECTS (rows produced today) instead.
      • Replaces per-status COUNT fan-out with single bounded fetches tallied in
        Python (one round-trip instead of dozens of count='exact' calls).
    Pass ?include_logs=1 for the raw agent_logs run-log view (slow until the
    agent_logs index from /api/ops/db-maintenance-sql is applied)."""
    from db.client import get_db
    from api.dashboard import get_stats
    db = get_db()
    now = _now()
    today = now.date().isoformat()
    t0 = f"{today}T00:00:00"
    notes: list = []

    def cnt(table, gte=None, **filters):
        """Exact COUNT — used only on SMALL tables (leads, previews)."""
        try:
            q = db.table(table).select("id", count="exact")
            for k, v in filters.items():
                q = q.in_(k, v) if isinstance(v, list) else q.eq(k, v)
            if gte:
                q = q.gte(gte[0], gte[1])
            return q.execute().count or 0
        except Exception as e:
            notes.append(f"count {table}({filters}) failed: {str(e)[:120]}")
            return None

    # ── Reuse dashboard stats (one proven-fast call) ──────────────────────────
    try:
        stats = await get_stats()
    except Exception as e:
        stats = {}
        notes.append(f"dashboard stats failed: {str(e)[:120]}")

    wa_today = stats.get("whatsapp_today") or 0
    em_today = stats.get("emails_today") or 0

    # ── TODAY: the numbers that prove revenue motion ──────────────────────────
    today_metrics = {
        "new_leads_today":        cnt("leads", gte=("created_at", t0)),
        "new_previews_today":     cnt("previews", gte=("created_at", t0)),
        "whatsapp_sent_today":    wa_today,
        "email_sent_today":       em_today,
        "outreach_sent_today":    wa_today + em_today,
        "leads_to_replied_today": cnt("leads", gte=("updated_at", t0), status=["replied", "interested"]),
        "converted_today":        cnt("leads", gte=("updated_at", t0), status="converted"),
    }
    # Real money — revenue_logs is small, fetch once and sum in Python.
    try:
        rev = db.table("revenue_logs").select("amount,recorded_at").limit(5000).execute().data or []
        today_metrics["revenue_today_gbp"] = round(sum(float(r.get("amount") or 0) for r in rev if (r.get("recorded_at") or "") >= t0), 2)
        today_metrics["revenue_total_gbp"] = round(sum(float(r.get("amount") or 0) for r in rev), 2)
    except Exception as e:
        notes.append(f"revenue sum failed: {str(e)[:120]}")

    # ── PIPELINE (from stats) + QUEUES (from stats) ───────────────────────────
    pipeline = {p["label"]: p["count"] for p in (stats.get("pipeline") or [])}
    pipeline["TOTAL"] = stats.get("total_leads")
    queues = {
        "whatsapp_queued": stats.get("whatsapp_queued"),
        "instagram_ready": stats.get("instagram_ready"),
        "outreach_queued": stats.get("outreach_queued"),
    }

    # ── BACKEND AGENT LIVENESS (by effect, not by log) ────────────────────────
    agents_health = {
        "lead_finder":       {"worked_today": (today_metrics.get("new_leads_today") or 0) > 0,
                              "evidence": f"{today_metrics.get('new_leads_today')} new leads today"},
        "preview_generator": {"worked_today": (today_metrics.get("new_previews_today") or 0) > 0,
                              "evidence": f"{today_metrics.get('new_previews_today')} new previews today"},
        "outreach_sender":   {"worked_today": (today_metrics.get("outreach_sent_today") or 0) > 0,
                              "evidence": f"{today_metrics.get('outreach_sent_today')} sent today (WA {wa_today} + email {em_today})"},
    }
    if include_logs:
        # Raw run-log view — spam-proof (exclude high-volume preview_generator from
        # the bulk fetch, look it up once). SLOW until agent_logs is indexed.
        latest_log: dict = {}
        try:
            bulk = (db.table("agent_logs")
                    .select("agent_name,created_at,status,action")
                    .neq("agent_name", "preview_generator")
                    .order("created_at", desc=True).limit(500).execute().data or [])
            for l in bulk:
                latest_log.setdefault(l["agent_name"], l)
            pg = (db.table("agent_logs").select("agent_name,created_at,status,action")
                  .eq("agent_name", "preview_generator")
                  .order("created_at", desc=True).limit(1).execute().data or [])
            if pg:
                latest_log["preview_generator"] = pg[0]
        except Exception as e:
            notes.append(f"agent log fetch failed (add agent_logs index): {str(e)[:120]}")
        for name in BACKEND_AGENTS:
            r = latest_log.get(name)
            agents_health.setdefault(name, {})
            agents_health[name]["last_run"] = (r or {}).get("created_at")
            agents_health[name]["last_status"] = (r or {}).get("status")
            agents_health[name]["ran_today"] = ((r or {}).get("created_at") or "")[:10] == today if r else False

    # ── OPENCLAW TEAM: one bounded fetch, tallied in Python ───────────────────
    openclaw = {}
    try:
        from collections import Counter
        tasks = (db.table("agent_tasks")
                 .select("assigned_to,status,created_at,completed_at")
                 .order("created_at", desc=True).limit(1000).execute().data or [])
        openclaw["tasks_total_recent"] = len(tasks)
        openclaw["by_status"] = dict(Counter(t.get("status") for t in tasks))
        openclaw["created_today"] = sum(1 for t in tasks if (t.get("created_at") or "") >= t0)
        openclaw["completed_today"] = sum(1 for t in tasks if t.get("status") == "completed" and (t.get("completed_at") or "") >= t0)
        chain = {a: {"created": 0, "completed": 0} for a in TEAM_AGENTS}
        for t in tasks:
            a = t.get("assigned_to")
            if a in chain and (t.get("created_at") or "") >= t0:
                chain[a]["created"] += 1
                if t.get("status") == "completed":
                    chain[a]["completed"] += 1
        openclaw["handoff_chain_today"] = chain
    except Exception as e:
        notes.append(f"openclaw tasks failed: {str(e)[:120]}")

    # ── FAILURES TODAY (only with include_logs — agent_logs scan is slow) ──────
    failures = []
    failures_available = include_logs
    if include_logs:
        try:
            errs = (db.table("agent_logs")
                    .select("agent_name,action,status,error_message,created_at")
                    .eq("status", "error").gte("created_at", t0)
                    .order("created_at", desc=True).limit(25).execute().data or [])
            for e in errs:
                failures.append({
                    "agent": e.get("agent_name"),
                    "action": (e.get("action") or "")[:60],
                    "error": (e.get("error_message") or "")[:140],
                    "at": e.get("created_at"),
                })
        except Exception as e:
            notes.append(f"failures query failed (add agent_logs index): {str(e)[:120]}")
            failures_available = False

    # ── AWAITING FOUNDER + payment links (one fetch on small approvals table) ──
    awaiting = {}
    try:
        appr = (db.table("agent_approvals").select("status,action,created_at")
                .order("created_at", desc=True).limit(500).execute().data or [])
        awaiting["approvals_pending"] = sum(1 for a in appr if a.get("status") == "pending")
        today_metrics["payment_links_today"] = sum(
            1 for a in appr if a.get("action") == "send_payment_link" and (a.get("created_at") or "") >= t0)
    except Exception as e:
        notes.append(f"approvals fetch failed: {str(e)[:120]}")
        awaiting["approvals_pending"] = None

    # ── VERDICT: quick machine-readable "do I need to act?" ───────────────────
    sent = today_metrics.get("outreach_sent_today") or 0
    wa_sent = today_metrics.get("whatsapp_sent_today") or 0
    verdict = {
        "outreach_moving_today": (sent + wa_sent) > 0,
        "failures_today": len(failures) if failures_available else "unknown (pass ?include_logs=1)",
        "leads_in_pipeline": (pipeline.get("preview_ready") or 0) + (pipeline.get("outreach_queued") or 0),
        "hot_leads_waiting": (pipeline.get("replied") or 0) + (pipeline.get("interested") or 0),
        "needs_founder": (awaiting.get("approvals_pending") or 0) > 0,
    }

    return {
        "generated_at": now.isoformat(),
        "build": "audit-proof-v3",
        "verdict": verdict,
        "today": today_metrics,
        "pipeline": pipeline,
        "queues": queues,
        "backend_agents": agents_health,
        "openclaw_team": openclaw,
        "failures_today": failures if failures_available else "pass ?include_logs=1 (slow until agent_logs indexed)",
        "awaiting_founder": awaiting,
        "notes": notes,
    }


# The one-time DB fix that makes agent_logs (and every endpoint that reads it)
# fast again. Surfaced as an endpoint so Dylan can copy-paste it into the Supabase
# SQL editor without hunting through the codebase.
AGENT_LOGS_INDEX_SQL = """-- 1) Index so "latest log per agent" stops full-scanning the table:
CREATE INDEX IF NOT EXISTS idx_agent_logs_name_created
  ON agent_logs (agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created
  ON agent_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_status_created
  ON agent_logs (status, created_at DESC);

-- 2) One-time prune of the backlog (keep 14 days). Safe: agent_logs is telemetry.
DELETE FROM agent_logs WHERE created_at < (NOW() - INTERVAL '14 days');

-- 3) Helpful indexes for the proof/action-queue counts too:
CREATE INDEX IF NOT EXISTS idx_outreach_sent_at ON outreach_messages (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_channel_status ON outreach_messages (channel, status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
"""


@router.get("/ops/db-maintenance-sql")
def db_maintenance_sql():
    """Returns the index+prune SQL to paste into Supabase → SQL Editor → Run.
    Fixes the ~60s agent_logs full-scans that make status/proof time out."""
    return {
        "why": "agent_logs has no index on created_at, so even SELECT ... LIMIT 1 "
               "full-scans the whole table (~60s). This makes /status and /proof "
               "time out and the 30-min self-heal job stall. Run this once.",
        "where": "Supabase dashboard → SQL Editor → paste → Run",
        "sql": AGENT_LOGS_INDEX_SQL,
    }
