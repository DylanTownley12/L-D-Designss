"""
N8N Revenue War Machine — 6 action endpoints + 6 read endpoints.
Action endpoints (POST) are called by n8n workflows on schedule.
Read endpoints (GET) power the dashboard intent/scoring panels.
"""
import logging
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import APIRouter, BackgroundTasks

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/n8n", tags=["n8n"])

BACKEND_URL = "https://l-d-designss-production.up.railway.app/api"

_RUNNABLE = {
    "lead_finder":          "agents.lead_finder",
    "website_analyzer":     "agents.website_analyzer",
    "preview_generator":    "agents.preview_generator",
    "whatsapp_campaign":    "agents.outreach_writer",
    "instagram_campaign":   "agents.outreach_writer",
    "followup_agent":       "agents.followup_agent",
    "lead_enricher":        "agents.lead_enricher",
    "ceo_agent":            "agents.ceo_agent",
    "sales_agent":          "agents.sales_agent",
    "analyst_agent":        "agents.analyst_agent",
    "cmo_agent":            "agents.cmo_agent",
}


def _now():
    return datetime.now(timezone.utc)


def _today_start():
    return _now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _run_agent_bg(name: str):
    """Import and call an agent by name. Runs in BackgroundTasks."""
    try:
        if name == "lead_finder":
            from agents.lead_finder import run; return run()
        if name == "website_analyzer":
            from agents.website_analyzer import run; return run(batch_size=50)
        if name == "preview_generator":
            from agents.preview_generator import run_batch; return run_batch(limit=50)
        if name == "whatsapp_campaign":
            from agents.outreach_writer import generate_whatsapp_campaign; return generate_whatsapp_campaign(limit=15)
        if name == "instagram_campaign":
            from agents.outreach_writer import generate_instagram_campaign; return generate_instagram_campaign(limit=15)
        if name == "followup_agent":
            from agents.followup_agent import run; return run()
        if name == "lead_enricher":
            from agents.lead_enricher import run; return run()
        if name == "ceo_agent":
            from agents.ceo_agent import run; return run()
        if name == "sales_agent":
            from agents.sales_agent import run; return run()
        if name == "analyst_agent":
            from agents.analyst_agent import run; return run()
        if name == "cmo_agent":
            from agents.cmo_agent import run; return run()
    except Exception as e:
        logger.error(f"[n8n] _run_agent_bg({name}) failed: {e}")


def _score_lead(lead: dict, has_preview: bool, view_count: int) -> int:
    score = 0
    if lead.get("website_status") == "none":
        score += 25
    if lead.get("status") in ("replied", "interested"):
        score += 20
    if view_count > 0:
        score += 15
    if lead.get("instagram_url"):
        score += 15
    if lead.get("phone"):
        score += 10
    if lead.get("email"):
        score += 10
    if has_preview:
        score += 10
    if (lead.get("quality_score") or 0) >= 70:
        score += 10
    try:
        created = lead.get("created_at") or ""
        age_days = (_now() - datetime.fromisoformat(created.replace("Z", "+00:00"))).days
        if age_days <= 7:
            score += 5
    except Exception:
        pass
    return min(score, 100)


# ── LOOP 1 — Discovery Engine ─────────────────────────────────────────────────

@router.post("/run-discovery")
async def run_discovery(background_tasks: BackgroundTasks):
    """
    Loop 1 — called every 4h.
    Scores leads, triggers enrichment + preview generation for best opportunities.
    """
    from db.client import get_db
    db = get_db()

    triggered = []

    # Score current leads and identify gaps
    leads_data = db.table("leads").select(
        "id,status,website_status,phone,email,instagram_url,quality_score,created_at"
    ).not_.in_("status", ["converted", "not_interested", "do_not_contact"]).limit(500).execute().data or []

    preview_rows = db.table("previews").select("lead_id").execute().data or []
    leads_with_previews = {r["lead_id"] for r in preview_rows}

    preview_ready_count = sum(1 for l in leads_data if l["status"] == "preview_ready")
    new_count = sum(1 for l in leads_data if l["status"] == "new")
    analyzing_count = sum(1 for l in leads_data if l["status"] == "analyzing")

    # Always run enricher — it's fast and safe
    background_tasks.add_task(_run_agent_bg, "lead_enricher")
    triggered.append("lead_enricher")

    # Run website analyzer if leads are backed up in 'new'
    if new_count > 10:
        background_tasks.add_task(_run_agent_bg, "website_analyzer")
        triggered.append("website_analyzer")

    # Run preview generator if leads are preview_ready but have no preview
    needs_preview = [l["id"] for l in leads_data if l["status"] == "preview_ready" and l["id"] not in leads_with_previews]
    if needs_preview or preview_ready_count > 20:
        background_tasks.add_task(_run_agent_bg, "preview_generator")
        triggered.append("preview_generator")

    # Run lead finder if total active leads low
    if len(leads_data) < 100:
        background_tasks.add_task(_run_agent_bg, "lead_finder")
        triggered.append("lead_finder")

    try:
        db.table("agent_logs").insert({
            "agent_name": "n8n_discovery",
            "action": f"Discovery loop ran — triggered: {', '.join(triggered)}",
            "status": "success",
            "details": {
                "triggered": triggered,
                "new_leads": new_count,
                "preview_ready": preview_ready_count,
                "total_active": len(leads_data),
            },
        }).execute()
    except Exception:
        pass

    return {
        "loop": "discovery",
        "triggered": triggered,
        "stats": {
            "total_active_leads": len(leads_data),
            "new_leads_backlog": new_count,
            "preview_ready": preview_ready_count,
            "analyzing": analyzing_count,
            "needs_preview": len(needs_preview),
        },
        "ran_at": _now().isoformat(),
    }


# ── LOOP 2 — Outreach Execution ───────────────────────────────────────────────

@router.post("/run-outreach-queue")
async def run_outreach_queue(background_tasks: BackgroundTasks):
    """
    Loop 2 — called at 9am.
    Ensures WA + IG queues are full, runs follow-ups.
    """
    from db.client import get_db
    db = get_db()

    wa_queued = db.table("outreach_messages").select("id", count="exact").eq("channel", "whatsapp").in_("status", ["queued", "draft"]).eq("direction", "outbound").execute().count or 0
    ig_queued = db.table("outreach_messages").select("id", count="exact").eq("channel", "instagram").in_("status", ["queued", "draft"]).eq("direction", "outbound").execute().count or 0

    triggered = []

    if wa_queued < 10:
        background_tasks.add_task(_run_agent_bg, "whatsapp_campaign")
        triggered.append("whatsapp_campaign")

    if ig_queued < 10:
        background_tasks.add_task(_run_agent_bg, "instagram_campaign")
        triggered.append("instagram_campaign")

    background_tasks.add_task(_run_agent_bg, "followup_agent")
    triggered.append("followup_agent")

    # Get action brief inline (fast read only)
    hot_count = db.table("leads").select("id", count="exact").in_("status", ["replied", "interested"]).execute().count or 0

    try:
        db.table("agent_logs").insert({
            "agent_name": "n8n_outreach",
            "action": f"Outreach queue built — WA:{wa_queued} IG:{ig_queued} — triggered: {', '.join(triggered)}",
            "status": "success",
            "details": {"triggered": triggered, "wa_before": wa_queued, "ig_before": ig_queued, "hot_leads": hot_count},
        }).execute()
    except Exception:
        pass

    return {
        "loop": "outreach_queue",
        "wa_was_queued": wa_queued,
        "ig_was_queued": ig_queued,
        "triggered": triggered,
        "hot_leads": hot_count,
        "ran_at": _now().isoformat(),
    }


# ── LOOP 3 — Intent Detection ─────────────────────────────────────────────────

@router.post("/check-intent")
async def check_intent(background_tasks: BackgroundTasks):
    """
    Loop 3 — called every 20min.
    Detects replies/preview views/status changes. Auto-creates Stripe links for interested leads.
    """
    from db.client import get_db
    db = get_db()
    since = (_now() - timedelta(minutes=25)).isoformat()
    alerts = []
    stripe_links_created = []

    # New inbound messages
    try:
        replies = db.table("outreach_messages").select("lead_id,body,channel,created_at").eq("direction", "inbound").gte("created_at", since).execute().data or []
        for r in replies:
            lead = db.table("leads").select("id,business_name,city,phone,instagram_url,status").eq("id", r["lead_id"]).limit(1).execute().data
            if lead:
                alerts.append({
                    "type": "reply",
                    "priority": 1,
                    "lead_id": r["lead_id"],
                    "lead_name": lead[0]["business_name"],
                    "city": lead[0].get("city"),
                    "channel": r["channel"],
                    "snippet": (r.get("body") or "")[:100],
                    "detected_at": r["created_at"],
                    "action": "reply_immediately",
                    "phone": lead[0].get("phone"),
                })
    except Exception as e:
        logger.error(f"[n8n/check-intent] replies: {e}")

    # Preview views
    try:
        views = db.table("agent_logs").select("details,created_at").eq("agent_name", "preview_beacon").gte("created_at", since).execute().data or []
        for v in views:
            lid = (v.get("details") or {}).get("lead_id")
            if not lid:
                continue
            lead = db.table("leads").select("id,business_name,city,phone,instagram_url,status").eq("id", lid).limit(1).execute().data
            if lead and lead[0]["status"] not in ("converted", "not_interested", "do_not_contact"):
                alerts.append({
                    "type": "preview_viewed",
                    "priority": 2,
                    "lead_id": lid,
                    "lead_name": lead[0]["business_name"],
                    "city": lead[0].get("city"),
                    "channel": "whatsapp",
                    "snippet": "Viewed their preview website",
                    "detected_at": v["created_at"],
                    "action": "send_payment_link",
                    "phone": lead[0].get("phone"),
                })
    except Exception as e:
        logger.error(f"[n8n/check-intent] views: {e}")

    # Interested leads without Stripe link — auto-create
    try:
        interested = db.table("leads").select("id,business_name,notes").eq("status", "interested").execute().data or []
        for lead in interested:
            notes = lead.get("notes") or ""
            if "stripe_session:" not in notes:
                # Create Stripe link in background
                background_tasks.add_task(_auto_create_stripe_link, lead["id"], lead["business_name"])
                stripe_links_created.append(lead["id"])
    except Exception as e:
        logger.error(f"[n8n/check-intent] stripe auto-create: {e}")

    # Status changes to replied/interested
    try:
        hot = db.table("leads").select("id,business_name,city,phone,instagram_url,status,updated_at").in_("status", ["replied", "interested"]).gte("updated_at", since).execute().data or []
        for lead in hot:
            alerts.append({
                "type": "status_change",
                "priority": 1 if lead["status"] == "interested" else 2,
                "lead_id": lead["id"],
                "lead_name": lead["business_name"],
                "city": lead.get("city"),
                "channel": "whatsapp",
                "snippet": f"Status → {lead['status']}",
                "detected_at": lead["updated_at"],
                "action": "create_stripe_link" if lead["status"] == "interested" else "reply",
                "phone": lead.get("phone"),
            })
    except Exception as e:
        logger.error(f"[n8n/check-intent] status changes: {e}")

    # Dedup by lead_id, keep highest priority
    seen: dict = {}
    for alert in sorted(alerts, key=lambda x: x["priority"]):
        if alert["lead_id"] not in seen:
            seen[alert["lead_id"]] = alert
    deduped = sorted(seen.values(), key=lambda x: x["priority"])

    has_urgent = any(a["priority"] == 1 for a in deduped)

    if deduped or stripe_links_created:
        try:
            from db.client import get_db as _get_db
            _db = _get_db()
            _db.table("agent_logs").insert({
                "agent_name": "n8n_intent",
                "action": f"Intent check — {len(deduped)} signals, {len(stripe_links_created)} Stripe links queued",
                "status": "success",
                "details": {"alerts": len(deduped), "stripe_links_queued": stripe_links_created, "urgent": has_urgent},
            }).execute()
        except Exception:
            pass

    return {
        "loop": "intent_detection",
        "alerts": deduped,
        "count": len(deduped),
        "has_urgent": has_urgent,
        "stripe_links_queued": stripe_links_created,
        "checked_at": _now().isoformat(),
    }


def _auto_create_stripe_link(lead_id: str, lead_name: str):
    """Background task — creates a Stripe checkout link for an interested lead."""
    try:
        from config import settings
        if not settings.STRIPE_SECRET_KEY:
            return
        import stripe as _stripe_lib
        _stripe_lib.api_key = settings.STRIPE_SECRET_KEY
        from db.client import get_db
        db = get_db()

        session_params = {
            "mode": "payment",
            "success_url": settings.STRIPE_SUCCESS_URL + f"&lead={lead_id}",
            "cancel_url": settings.STRIPE_CANCEL_URL,
            "metadata": {"lead_id": lead_id, "business_name": lead_name},
            "payment_method_types": ["card"],
        }
        if settings.STRIPE_PRICE_ID:
            session_params["line_items"] = [{"price": settings.STRIPE_PRICE_ID, "quantity": 1}]
        else:
            session_params["line_items"] = [{
                "price_data": {
                    "currency": "gbp", "unit_amount": 7500,
                    "product_data": {"name": "Website Deposit — L&D Designs"},
                },
                "quantity": 1,
            }]

        session = _stripe_lib.checkout.Session.create(**session_params)
        # Append to notes so it doesn't overwrite existing data
        existing = db.table("leads").select("notes").eq("id", lead_id).single().execute().data or {}
        notes_str = (existing.get("notes") or "") + f";stripe_session:{session.id}"
        db.table("leads").update({"notes": notes_str.lstrip(";")}).eq("id", lead_id).execute()
        db.table("agent_logs").insert({
            "agent_name": "n8n_intent",
            "action": f"Auto-created Stripe link for {lead_name}",
            "status": "success",
            "details": {"lead_id": lead_id, "session_id": session.id, "url": session.url},
        }).execute()
        logger.info(f"[n8n/intent] Stripe link created for {lead_name}: {session.url}")
    except Exception as e:
        logger.error(f"[n8n/intent] auto Stripe link failed for {lead_id}: {e}")


# ── LOOP 4 — Closing Loop ─────────────────────────────────────────────────────

@router.post("/run-closing-loop")
async def run_closing_loop(background_tasks: BackgroundTasks):
    """
    Loop 4 — called every 30min.
    Processes replied/interested leads, runs sales agent, identifies who is closest to paying.
    """
    from db.client import get_db
    db = get_db()

    hot_leads = db.table("leads").select("id,business_name,city,phone,instagram_url,email,status,notes,updated_at").in_("status", ["replied", "interested"]).order("updated_at", desc=True).limit(20).execute().data or []

    if not hot_leads:
        return {"loop": "closing", "hot_leads": 0, "actions": [], "ran_at": _now().isoformat()}

    closing_actions = []
    for lead in hot_leads:
        notes = lead.get("notes") or ""
        has_stripe = "stripe_session:" in notes
        phone = (lead.get("phone") or "").replace(" ", "").replace("-", "").lstrip("0")
        if phone:
            phone = "+44" + phone

        if lead["status"] == "interested" and not has_stripe:
            action = "URGENT: Send payment link — lead is ready to buy"
            action_type = "send_payment_link"
        elif lead["status"] == "interested" and has_stripe:
            action = "Follow up on payment link — sent but not paid"
            action_type = "chase_payment"
        elif lead["status"] == "replied":
            action = "Keep conversation going — reply personally"
            action_type = "personal_reply"
        else:
            continue

        prev = db.table("previews").select("preview_url").eq("lead_id", lead["id"]).order("created_at", desc=True).limit(1).execute().data
        preview_url = prev[0]["preview_url"] if prev else None

        closing_actions.append({
            "lead_id": lead["id"],
            "lead_name": lead["business_name"],
            "city": lead.get("city"),
            "status": lead["status"],
            "phone": phone or lead.get("phone"),
            "instagram_url": lead.get("instagram_url"),
            "action": action,
            "action_type": action_type,
            "has_payment_link": has_stripe,
            "preview_url": preview_url,
            "payment_link_url": f"{BACKEND_URL}/payments/link/{lead['id']}" if not has_stripe else None,
            "last_activity": lead["updated_at"],
        })

    # Run sales agent in background to generate closing messages
    if hot_leads:
        background_tasks.add_task(_run_agent_bg, "sales_agent")

    try:
        db.table("agent_logs").insert({
            "agent_name": "n8n_closing",
            "action": f"Closing loop — {len(hot_leads)} hot leads, {len(closing_actions)} actions identified",
            "status": "success",
            "details": {"hot_leads": len(hot_leads), "actions": len(closing_actions)},
        }).execute()
    except Exception:
        pass

    top = closing_actions[0] if closing_actions else None
    return {
        "loop": "closing",
        "hot_leads": len(hot_leads),
        "actions": closing_actions,
        "top_action": top["action"] if top else None,
        "top_lead": top["lead_name"] if top else None,
        "sales_agent_triggered": bool(hot_leads),
        "ran_at": _now().isoformat(),
    }


# ── LOOP 5 — Self-Healing ─────────────────────────────────────────────────────

@router.post("/run-self-healing")
async def run_self_healing(background_tasks: BackgroundTasks):
    """
    Loop 5 — called every 2h.
    Health check + auto-fix + CEO escalation if needed.
    """
    from db.client import get_db
    db = get_db()
    today = _today_start()
    checks = []
    fixes_triggered = []

    def chk(name, passed, detail, fix_agent=None):
        checks.append({"name": name, "passed": passed, "detail": detail})
        if not passed and fix_agent:
            background_tasks.add_task(_run_agent_bg, fix_agent)
            fixes_triggered.append(fix_agent)

    try:
        leads_today = db.table("leads").select("id", count="exact").gte("created_at", today).execute().count or 0
        chk("lead_finder_ran", leads_today > 0, f"{leads_today} leads found today", "lead_finder" if leads_today == 0 else None)
    except Exception as e:
        chk("lead_finder_ran", False, str(e), "lead_finder")

    try:
        wa_q = db.table("outreach_messages").select("id", count="exact").eq("channel", "whatsapp").in_("status", ["queued", "draft"]).eq("direction", "outbound").execute().count or 0
        chk("wa_queue_healthy", wa_q > 0, f"{wa_q} WA messages queued", "whatsapp_campaign" if wa_q == 0 else None)
    except Exception as e:
        chk("wa_queue_healthy", False, str(e), "whatsapp_campaign")

    try:
        ig_q = db.table("outreach_messages").select("id", count="exact").eq("channel", "instagram").in_("status", ["queued", "draft"]).eq("direction", "outbound").execute().count or 0
        chk("ig_queue_healthy", ig_q > 0, f"{ig_q} IG scripts queued", "instagram_campaign" if ig_q == 0 else None)
    except Exception as e:
        chk("ig_queue_healthy", False, str(e), "instagram_campaign")

    try:
        prev_today = db.table("previews").select("id", count="exact").gte("created_at", today).execute().count or 0
        chk("preview_generator_ran", prev_today > 0, f"{prev_today} previews built today", "preview_generator" if prev_today == 0 else None)
    except Exception as e:
        chk("preview_generator_ran", False, str(e), "preview_generator")

    try:
        fu_today = db.table("agent_logs").select("id", count="exact").eq("agent_name", "followup_agent").gte("created_at", today).execute().count or 0
        chk("followup_ran", fu_today > 0, f"follow-up ran {fu_today}x today", "followup_agent" if fu_today == 0 else None)
    except Exception as e:
        chk("followup_ran", False, str(e), "followup_agent")

    failed = [c for c in checks if not c["passed"]]

    # If fixes needed, also run CEO agent for additional coordination
    if fixes_triggered:
        background_tasks.add_task(_run_agent_bg, "ceo_agent")
        fixes_triggered.append("ceo_agent")

    try:
        db.table("agent_logs").insert({
            "agent_name": "n8n_self_healing",
            "action": f"Self-healing — {len(failed)}/{len(checks)} checks failed, triggered: {', '.join(fixes_triggered) or 'none'}",
            "status": "success",
            "details": {"checks": checks, "fixes_triggered": fixes_triggered, "failed_count": len(failed)},
        }).execute()
    except Exception:
        pass

    return {
        "loop": "self_healing",
        "checks": checks,
        "passed": len(checks) - len(failed),
        "failed": len(failed),
        "healthy": len(failed) == 0,
        "fixes_triggered": fixes_triggered,
        "ran_at": _now().isoformat(),
    }


# ── LOOP 6 — Daily Optimisation ───────────────────────────────────────────────

@router.post("/run-daily-optimisation")
async def run_daily_optimisation(background_tasks: BackgroundTasks):
    """
    Daily at 11pm — run performance analysis, update strategy, set tomorrow's priorities.
    """
    from db.client import get_db
    db = get_db()
    today = _today_start()

    def count_sent(ch):
        return db.table("outreach_messages").select("id", count="exact").eq("channel", ch).eq("status", "sent").eq("direction", "outbound").gte("created_at", today).execute().count or 0

    wa_sent = count_sent("whatsapp")
    ig_sent = count_sent("instagram")
    email_sent = count_sent("email")
    total_sent = wa_sent + ig_sent + email_sent

    replies_today = db.table("outreach_messages").select("id", count="exact").eq("direction", "inbound").gte("created_at", today).execute().count or 0
    interested_today = db.table("leads").select("id", count="exact").eq("status", "interested").gte("updated_at", today).execute().count or 0
    preview_views = db.table("agent_logs").select("id", count="exact").eq("agent_name", "preview_beacon").gte("created_at", today).execute().count or 0
    leads_found = db.table("leads").select("id", count="exact").gte("created_at", today).execute().count or 0

    # Determine best channel (highest reply rate)
    wa_replies = db.table("outreach_messages").select("id", count="exact").eq("direction", "inbound").eq("channel", "whatsapp").gte("created_at", today).execute().count or 0
    ig_replies = db.table("outreach_messages").select("id", count="exact").eq("direction", "inbound").eq("channel", "instagram").gte("created_at", today).execute().count or 0

    wa_rate = round((wa_replies / wa_sent * 100), 1) if wa_sent > 0 else 0
    ig_rate = round((ig_replies / ig_sent * 100), 1) if ig_sent > 0 else 0
    best_channel = "whatsapp" if wa_rate >= ig_rate else "instagram"

    # Run AI agents for deeper optimisation
    background_tasks.add_task(_run_agent_bg, "analyst_agent")
    background_tasks.add_task(_run_agent_bg, "cmo_agent")

    # Also trigger strategy brief
    try:
        from api.strategy import generate_brief as _gen_brief
        background_tasks.add_task(_gen_brief)
    except Exception:
        pass

    stats = {
        "wa_sent": wa_sent, "ig_sent": ig_sent, "email_sent": email_sent,
        "total_sent": total_sent, "replies": replies_today,
        "reply_rate": round((replies_today / total_sent * 100), 1) if total_sent > 0 else 0,
        "interested": interested_today, "preview_views": preview_views,
        "leads_found": leads_found, "wa_reply_rate": wa_rate, "ig_reply_rate": ig_rate,
        "best_channel": best_channel,
    }

    try:
        db.table("agent_logs").insert({
            "agent_name": "n8n_optimisation",
            "action": f"Daily optimisation — {total_sent} sent, {replies_today} replies, best channel: {best_channel}",
            "status": "success",
            "details": stats,
        }).execute()
    except Exception:
        pass

    return {
        "loop": "daily_optimisation",
        "stats": stats,
        "triggered": ["analyst_agent", "cmo_agent", "strategy_brief"],
        "tomorrow_priority": best_channel,
        "ran_at": _now().isoformat(),
    }


# ── READ ENDPOINTS — Dashboard / n8n data ────────────────────────────────────

@router.get("/opportunity-scores")
def get_opportunity_scores(limit: int = 50):
    """Live opportunity scores for all active leads — ranked per best channel."""
    from db.client import get_db
    db = get_db()

    leads_data = db.table("leads").select(
        "id,business_name,city,phone,email,instagram_url,status,website_status,quality_score,created_at"
    ).not_.in_("status", ["converted", "not_interested", "do_not_contact"]).limit(500).execute().data or []

    if not leads_data:
        return {"wa_leads": [], "ig_leads": [], "email_leads": [], "close_now": [], "total_scored": 0}

    lead_ids = [l["id"] for l in leads_data]
    preview_rows = db.table("previews").select("lead_id").in_("lead_id", lead_ids).execute().data or []
    leads_with_previews = {r["lead_id"] for r in preview_rows}

    thirty_ago = (_now() - timedelta(days=30)).isoformat()
    view_logs = db.table("agent_logs").select("details").eq("agent_name", "preview_beacon").gte("created_at", thirty_ago).limit(2000).execute().data or []
    view_counts: dict = defaultdict(int)
    for log in view_logs:
        lid = (log.get("details") or {}).get("lead_id")
        if lid:
            view_counts[lid] += 1

    scored = []
    for lead in leads_data:
        lid = lead["id"]
        s = _score_lead(lead, lid in leads_with_previews, view_counts.get(lid, 0))
        scored.append({**lead, "opportunity_score": s, "preview_views": view_counts.get(lid, 0)})

    scored.sort(key=lambda x: x["opportunity_score"], reverse=True)
    close_now = [l for l in scored if l["status"] in ("replied", "interested")]
    wa_leads = [l for l in scored if l.get("phone") and l["status"] not in ("outreach_sent", "replied", "interested")][:limit]
    ig_leads = [l for l in scored if l.get("instagram_url") and l["status"] not in ("outreach_sent", "replied", "interested")][:limit]
    email_leads = [l for l in scored if l.get("email")][:limit]

    return {
        "wa_leads": wa_leads, "ig_leads": ig_leads,
        "email_leads": email_leads, "close_now": close_now[:10],
        "total_scored": len(scored), "scored_at": _now().isoformat(),
    }


@router.get("/intent-alerts")
def get_intent_alerts(minutes: int = 25):
    """Intent signals from last N minutes — read-only version for dashboard."""
    from db.client import get_db
    db = get_db()
    since = (_now() - timedelta(minutes=minutes)).isoformat()
    alerts = []

    try:
        replies = db.table("outreach_messages").select("lead_id,channel,created_at").eq("direction", "inbound").gte("created_at", since).execute().data or []
        for r in replies:
            lead = db.table("leads").select("id,business_name,city,phone").eq("id", r["lead_id"]).limit(1).execute().data
            if lead:
                alerts.append({"type": "reply", "priority": 1, "lead_id": r["lead_id"], "lead_name": lead[0]["business_name"], "channel": r["channel"], "detected_at": r["created_at"], "action": "reply_immediately"})
    except Exception:
        pass

    try:
        views = db.table("agent_logs").select("details,created_at").eq("agent_name", "preview_beacon").gte("created_at", since).execute().data or []
        for v in views:
            lid = (v.get("details") or {}).get("lead_id")
            if lid:
                lead = db.table("leads").select("id,business_name,city,status").eq("id", lid).limit(1).execute().data
                if lead and lead[0]["status"] not in ("converted", "not_interested", "do_not_contact"):
                    alerts.append({"type": "preview_viewed", "priority": 2, "lead_id": lid, "lead_name": lead[0]["business_name"], "detected_at": v["created_at"], "action": "send_payment_link"})
    except Exception:
        pass

    seen: dict = {}
    for a in sorted(alerts, key=lambda x: x["priority"]):
        if a["lead_id"] not in seen:
            seen[a["lead_id"]] = a

    deduped = sorted(seen.values(), key=lambda x: x["priority"])
    return {"alerts": deduped, "count": len(deduped), "has_urgent": any(a["priority"] == 1 for a in deduped), "window_minutes": minutes}


@router.get("/closing-priorities")
def get_closing_priorities():
    """Leads ranked by closeness to paying — read-only."""
    from db.client import get_db
    db = get_db()

    leads_data = db.table("leads").select("id,business_name,city,phone,instagram_url,email,status,notes,updated_at").in_("status", ["replied", "interested"]).order("updated_at", desc=True).limit(20).execute().data or []
    results = []

    for lead in leads_data:
        lid = lead["id"]
        has_stripe = "stripe_session:" in (lead.get("notes") or "")
        phone = (lead.get("phone") or "").replace(" ", "").replace("-", "").lstrip("0")
        if phone:
            phone = "+44" + phone
        prev = db.table("previews").select("preview_url").eq("lead_id", lid).order("created_at", desc=True).limit(1).execute().data
        closeness = (50 if lead["status"] == "interested" else 30) + (20 if has_stripe else 0) + (10 if lead.get("phone") else 0)

        results.append({
            "lead_id": lid, "lead_name": lead["business_name"], "city": lead.get("city"),
            "status": lead["status"], "phone": phone or lead.get("phone"),
            "instagram_url": lead.get("instagram_url"), "email": lead.get("email"),
            "payment_status": "link_sent" if has_stripe else "no_link",
            "preview_url": prev[0]["preview_url"] if prev else None,
            "closeness_score": closeness,
            "action_type": "send_payment_link" if (lead["status"] == "interested" and not has_stripe) else ("chase_payment" if has_stripe else "reply"),
            "payment_link_url": f"{BACKEND_URL}/payments/link/{lid}" if not has_stripe else None,
        })

    results.sort(key=lambda x: x["closeness_score"], reverse=True)
    top = results[0] if results else None
    return {"leads": results, "count": len(results), "top_lead": top["lead_name"] if top else None}


@router.get("/health-check")
def get_health_check():
    """Pipeline health — every step pass/fail with auto-fix suggestions."""
    from db.client import get_db
    db = get_db()
    today = _today_start()
    checks = []

    def chk(name, passed, detail, fix_agent=None):
        checks.append({"name": name, "passed": passed, "detail": detail, "fix_agent": fix_agent})

    try:
        n = db.table("leads").select("id", count="exact").gte("created_at", today).execute().count or 0
        chk("lead_finder_ran", n > 0, f"{n} leads today", "lead_finder" if n == 0 else None)
    except Exception as e:
        chk("lead_finder_ran", False, str(e), "lead_finder")

    try:
        n = db.table("outreach_messages").select("id", count="exact").eq("channel", "whatsapp").in_("status", ["queued", "draft"]).eq("direction", "outbound").execute().count or 0
        chk("wa_queue_healthy", n > 0, f"{n} WA queued", "whatsapp_campaign" if n == 0 else None)
    except Exception as e:
        chk("wa_queue_healthy", False, str(e), "whatsapp_campaign")

    try:
        n = db.table("outreach_messages").select("id", count="exact").eq("channel", "instagram").in_("status", ["queued", "draft"]).eq("direction", "outbound").execute().count or 0
        chk("ig_queue_healthy", n > 0, f"{n} IG queued", "instagram_campaign" if n == 0 else None)
    except Exception as e:
        chk("ig_queue_healthy", False, str(e), "instagram_campaign")

    try:
        n = db.table("previews").select("id", count="exact").gte("created_at", today).execute().count or 0
        chk("previews_built_today", n > 0, f"{n} previews today", "preview_generator" if n == 0 else None)
    except Exception as e:
        chk("previews_built_today", False, str(e), "preview_generator")

    try:
        n = db.table("agent_logs").select("id", count="exact").eq("agent_name", "followup_agent").gte("created_at", today).execute().count or 0
        chk("followup_ran_today", n > 0, f"ran {n}x today", "followup_agent" if n == 0 else None)
    except Exception as e:
        chk("followup_ran_today", False, str(e), "followup_agent")

    failed = [c for c in checks if not c["passed"]]
    auto_fixes = [{"agent": c["fix_agent"], "reason": c["name"]} for c in failed if c.get("fix_agent")]

    return {"checks": checks, "passed": len(checks) - len(failed), "failed": len(failed), "healthy": not failed, "auto_fixes": auto_fixes, "needs_attention": bool(auto_fixes)}


@router.post("/action-brief")
def get_action_brief():
    """
    Full daily brief — Dylan's task list, mate's task list, hot leads, revenue health.
    Called by Loop 2 and by the dashboard DO NEXT page.
    """
    from db.client import get_db
    from config import settings
    db = get_db()

    pipeline = {}
    for s in ["preview_ready", "outreach_sent", "replied", "interested", "converted"]:
        pipeline[s] = db.table("leads").select("id", count="exact").eq("status", s).execute().count or 0

    wa_q = db.table("outreach_messages").select("id", count="exact").eq("channel", "whatsapp").in_("status", ["queued", "draft"]).eq("direction", "outbound").execute().count or 0
    ig_q = db.table("outreach_messages").select("id", count="exact").eq("channel", "instagram").in_("status", ["queued", "draft"]).eq("direction", "outbound").execute().count or 0

    hot_data = db.table("leads").select("id,business_name,city,phone,instagram_url,status,notes").in_("status", ["replied", "interested"]).limit(10).execute().data or []
    hot_leads = []
    for lead in hot_data:
        has_link = "stripe_session:" in (lead.get("notes") or "")
        phone = (lead.get("phone") or "").replace(" ", "").replace("-", "").lstrip("0")
        if phone:
            phone = "+44" + phone
        hot_leads.append({
            "lead_id": lead["id"], "name": lead["business_name"], "city": lead.get("city"),
            "status": lead["status"], "phone": phone or lead.get("phone"),
            "instagram_url": lead.get("instagram_url"), "has_payment_link": has_link,
            "action": "Send Stripe link" if (lead["status"] == "interested" and not has_link) else "Follow up",
        })

    stripe_ok = bool(settings.STRIPE_SECRET_KEY and "test" not in (settings.STRIPE_SECRET_KEY or ""))
    can_make_money = stripe_ok and (pipeline["interested"] > 0 or pipeline["replied"] > 0)

    dylan_tasks = []
    for lead in [l for l in hot_leads if l["status"] == "interested" and not l["has_payment_link"]]:
        dylan_tasks.append({"priority": 1, "action": f"Send payment link to {lead['name']} ({lead['city']})", "type": "payment_link", "lead_id": lead["lead_id"], "contact": lead["phone"]})
    for lead in [l for l in hot_leads if l["status"] == "replied"]:
        dylan_tasks.append({"priority": 2, "action": f"Reply to {lead['name']} — they responded", "type": "reply", "lead_id": lead["lead_id"], "contact": lead["phone"]})
    if not dylan_tasks:
        dylan_tasks.append({"priority": 3, "action": f"Send today's WhatsApp batch ({wa_q} ready)", "type": "send_wa", "lead_id": None, "contact": None})

    mate_tasks = []
    if ig_q > 0:
        mate_tasks.append({"priority": 1, "action": f"Send {min(ig_q, 15)} Instagram DMs from the queue", "type": "send_ig", "count": min(ig_q, 15)})
    mate_tasks.append({"priority": 2, "action": "Reply to any Instagram DM responses", "type": "reply_ig"})

    blockers = []
    if not stripe_ok:
        blockers.append({"key": "stripe_test", "title": "Stripe in test mode — no real money", "severity": "critical"})
    if wa_q == 0:
        blockers.append({"key": "wa_empty", "title": "WhatsApp queue empty", "severity": "warning", "fix": "POST /api/agents/run {agent: whatsapp_campaign}"})

    top_action = dylan_tasks[0]["action"] if dylan_tasks else (f"Fix: {blockers[0]['title']}" if blockers else f"Send outreach — {wa_q} WA + {ig_q} IG ready")

    return {
        "can_make_money_now": can_make_money,
        "revenue_status": "READY" if can_make_money else ("STRIPE_TEST" if not stripe_ok else "NO_HOT_LEADS"),
        "top_action": top_action,
        "pipeline": pipeline,
        "wa_queued": wa_q, "ig_queued": ig_q,
        "hot_leads": hot_leads,
        "dylan_tasks": dylan_tasks[:5],
        "mate_tasks": mate_tasks[:5],
        "blockers": blockers,
        "generated_at": _now().isoformat(),
    }


@router.get("/daily-stats")
def get_daily_stats():
    """Today's performance numbers."""
    from db.client import get_db
    db = get_db()
    today = _today_start()

    def cnt_sent(ch):
        return db.table("outreach_messages").select("id", count="exact").eq("channel", ch).eq("status", "sent").eq("direction", "outbound").gte("created_at", today).execute().count or 0

    wa = cnt_sent("whatsapp"); ig = cnt_sent("instagram"); em = cnt_sent("email")
    total = wa + ig + em
    replies = db.table("outreach_messages").select("id", count="exact").eq("direction", "inbound").gte("created_at", today).execute().count or 0
    interested = db.table("leads").select("id", count="exact").eq("status", "interested").gte("updated_at", today).execute().count or 0
    views = db.table("agent_logs").select("id", count="exact").eq("agent_name", "preview_beacon").gte("created_at", today).execute().count or 0
    leads = db.table("leads").select("id", count="exact").gte("created_at", today).execute().count or 0

    return {"wa_sent": wa, "ig_sent": ig, "email_sent": em, "total_sent": total, "replies": replies, "reply_rate": round(replies / total * 100, 1) if total else 0, "interested": interested, "preview_views": views, "leads_found": leads, "date": today[:10]}
