"""
CEO Agent — runs every 2 hours.
Checks system health, auto-coordinates targeted fixes, and sends an 8am briefing.
"""
import logging
import smtplib
from email.mime.text import MIMEText
from datetime import datetime, timedelta, date, timezone

logger = logging.getLogger(__name__)

MAX_RETRIES_PER_AGENT_PER_DAY = 3
FOUNDER_PHONE = "07301181878"


# ── Entry point ───────────────────────────────────────────────────────────────

def run() -> dict:
    from db.client import get_db
    db = get_db()

    now = datetime.now(timezone.utc)
    two_hours_ago = (now - timedelta(hours=2)).isoformat()
    seven_days_ago = (now - timedelta(days=7)).isoformat()

    issues = []
    warnings = []
    stats = {}
    decisions = []

    # 1. Lead pipeline counts — per-status count queries
    try:
        statuses = ["new", "analyzing", "preview_ready", "outreach_queued",
                    "outreach_sent", "replied", "interested", "converted",
                    "not_interested", "do_not_contact"]
        pipeline = {}
        for s in statuses:
            pipeline[s] = db.table("leads").select("id", count="exact").eq("status", s).execute().count or 0
        stats["pipeline"] = pipeline

        if pipeline.get("new", 0) > 50:
            warnings.append(f"{pipeline['new']} leads stuck in 'new' — website analyzer running behind")
    except Exception as e:
        issues.append(f"Could not read lead pipeline: {e}")

    # 2. Recent agent errors (last 2h)
    try:
        error_logs = (
            db.table("agent_logs")
            .select("agent_name, action, created_at")
            .eq("status", "error")
            .neq("agent_name", "ceo_agent")
            .gte("created_at", two_hours_ago)
            .execute().data or []
        )
        stats["recent_errors"] = len(error_logs)
        if error_logs:
            agents_with_errors = list({l["agent_name"] for l in error_logs})
            issues.append(f"{len(error_logs)} error(s) in last 2h: {', '.join(agents_with_errors)}")
    except Exception as e:
        issues.append(f"Could not read agent errors: {e}")

    # 3. WhatsApp queue depth
    try:
        wa_queued = (
            db.table("outreach_messages")
            .select("id", count="exact")
            .eq("status", "queued")
            .eq("channel", "whatsapp")
            .execute().count or 0
        )
        stats["whatsapp_queued"] = wa_queued
        if wa_queued == 0:
            warnings.append("WhatsApp queue is empty — no messages ready to send")
    except Exception as e:
        issues.append(f"Could not read WhatsApp queue: {e}")

    # 4. Preview health — count query, no row scan
    try:
        total_previews = db.table("previews").select("id", count="exact").execute().count or 0
        valid_previews = (
            db.table("previews").select("id", count="exact")
            .ilike("preview_url", "%/previews/serve/%")
            .execute().count or 0
        )
        stats["previews_total"] = total_previews
        stats["previews_valid"] = valid_previews
        if total_previews > 0 and valid_previews / total_previews < 0.8:
            warnings.append(f"Only {valid_previews}/{total_previews} previews have valid URLs")
    except Exception as e:
        issues.append(f"Could not check previews: {e}")

    # 5. Stalled leads (outreach_sent 7+ days, no reply)
    try:
        stalled = (
            db.table("leads")
            .select("id", count="exact")
            .eq("status", "outreach_sent")
            .lt("updated_at", seven_days_ago)
            .execute().count or 0
        )
        stats["stalled_leads"] = stalled
        if stalled > 10:
            warnings.append(f"{stalled} leads stalled in outreach_sent for 7+ days")
    except Exception as e:
        issues.append(f"Could not check stalled leads: {e}")

    # Coordinate: targeted auto-fixes based on what's detected
    coord_decisions = _coordinate(db, stats, pipeline=stats.get("pipeline", {}))
    decisions.extend(coord_decisions)

    # Retry failed agents (with cap)
    retry_decisions = _retry_failed(db, two_hours_ago)
    decisions.extend(retry_decisions)

    # Legacy auto-fix (WA queue + new leads backlog)
    fix_decisions = _auto_fix(db, stats, warnings)
    decisions.extend(fix_decisions)

    all_actions = decisions

    # P1 alert to Dylan if unfixable issues exist
    if issues:
        _alert_dylan(db, issues)

    overall = "error" if issues else ("warning" if warnings else "ok")

    report = {
        "overall": overall,
        "issues": issues,
        "warnings": warnings,
        "actions_taken": all_actions,
        "stats": stats,
        "checked_at": now.isoformat(),
    }

    label_map = {
        "ok":      "All systems operational",
        "warning": "Systems check — warnings found",
        "error":   "Systems check — issues detected",
    }

    try:
        db.table("agent_logs").insert({
            "agent_name": "ceo_agent",
            "action": label_map[overall],
            "status": "success",
            "details": report,
        }).execute()
    except Exception as e:
        logger.error(f"CEO agent could not write log: {e}")

    logger.info(f"[ceo_agent] {overall.upper()} — {len(issues)} issues, {len(warnings)} warnings, {len(all_actions)} actions")
    return report


# ── Coordination — targeted fixes ─────────────────────────────────────────────

def _coordinate(db, stats: dict, pipeline: dict) -> list:
    """
    Targeted diagnosis and fix of specific pipeline problems.
    Returns list of human-readable decision strings.
    """
    decisions = []
    now = datetime.now(timezone.utc)

    # FIX 1: Leads stuck in outreach_queued with no actual queued message
    # These leads were moved to outreach_queued but the WA message never got written
    try:
        twelve_hours_ago = (now - timedelta(hours=12)).isoformat()
        stuck_leads = (
            db.table("leads")
            .select("id")
            .eq("status", "outreach_queued")
            .lt("updated_at", twelve_hours_ago)
            .limit(50)
            .execute().data or []
        )
        rescued = 0
        for lead in stuck_leads:
            lid = lead["id"]
            # Check if there's actually a queued message for this lead
            msg_check = (
                db.table("outreach_messages")
                .select("id")
                .eq("lead_id", lid)
                .in_("status", ["queued", "draft", "sent"])
                .execute().data or []
            )
            if not msg_check:
                # No message — move back to preview_ready so campaign re-picks it
                db.table("leads").update({"status": "preview_ready"}).eq("id", lid).execute()
                rescued += 1
        if rescued > 0:
            msg = f"DECISION: Rescued {rescued} leads stuck in outreach_queued with no message — moved back to preview_ready"
            decisions.append(msg)
            _log_decision(db, msg, {"fix": "stuck_outreach_queued", "count": rescued})
            logger.info(f"[ceo_agent] {msg}")
    except Exception as e:
        logger.error(f"[ceo_agent] FIX 1 (stuck queued leads) failed: {e}")

    # FIX 2: Preview orphans — leads marked preview_ready but no row in previews table
    try:
        preview_ready_count = pipeline.get("preview_ready", 0)
        if preview_ready_count > 0:
            # Sample up to 50 preview_ready leads and check for missing previews
            orphan_leads = (
                db.table("leads")
                .select("id")
                .eq("status", "preview_ready")
                .limit(100)
                .execute().data or []
            )
            orphan_ids = []
            for lead in orphan_leads:
                lid = lead["id"]
                prev = (
                    db.table("previews")
                    .select("id")
                    .eq("lead_id", lid)
                    .execute().data or []
                )
                if not prev:
                    orphan_ids.append(lid)
            if orphan_ids:
                # Re-queue for preview generation
                for lid in orphan_ids[:20]:
                    db.table("leads").update({"status": "analyzing"}).eq("id", lid).execute()
                msg = f"DECISION: Found {len(orphan_ids)} preview_ready leads with no preview — re-queued {min(len(orphan_ids), 20)} for generation"
                decisions.append(msg)
                _log_decision(db, msg, {"fix": "preview_orphans", "count": len(orphan_ids)})
                logger.info(f"[ceo_agent] {msg}")
    except Exception as e:
        logger.error(f"[ceo_agent] FIX 2 (preview orphans) failed: {e}")

    # FIX 3: Enrichment gap — preview_ready leads with no phone AND no email AND no instagram
    # These can never be contacted; flag count so we know how big the dead pool is
    try:
        if not stats.get("enrichment_gap_flagged"):
            dead_count = (
                db.table("leads")
                .select("id", count="exact")
                .eq("status", "preview_ready")
                .is_("email", "null")
                .is_("instagram_url", "null")
                .is_("phone", "null")
                .execute().count or 0
            )
            if dead_count > 50:
                msg = f"DECISION: {dead_count} preview_ready leads have no phone, email or Instagram — enricher needs GOOGLE_PLACES_API_KEY set"
                decisions.append(msg)
                _log_decision(db, msg, {"fix": "enrichment_gap", "dead_count": dead_count})
    except Exception as e:
        logger.error(f"[ceo_agent] FIX 3 (enrichment gap) failed: {e}")

    # FIX 4: Email queue blocked — messages in 'queued' for 2h+ that aren't WhatsApp
    # If REQUIRE_APPROVAL is True in Railway, emails sit forever. Flag it.
    try:
        two_hours_ago_str = (now - timedelta(hours=2)).isoformat()
        blocked_email = (
            db.table("outreach_messages")
            .select("id", count="exact")
            .in_("status", ["queued", "approved"])
            .neq("channel", "whatsapp")
            .eq("approved_by_founder", False)
            .lt("created_at", two_hours_ago_str)
            .execute().count or 0
        )
        if blocked_email > 10:
            msg = f"DECISION: {blocked_email} email messages stuck unapproved — set REQUIRE_APPROVAL=false in Railway Variables to unblock"
            decisions.append(msg)
            _log_decision(db, msg, {"fix": "approval_block", "count": blocked_email})
    except Exception as e:
        logger.error(f"[ceo_agent] FIX 4 (email approval block) failed: {e}")

    return decisions


def _log_decision(db, message: str, details: dict):
    """Write a CEO decision to agent_logs so the dashboard can display it."""
    try:
        db.table("agent_logs").insert({
            "agent_name": "ceo_agent",
            "action": message,
            "status": "success",
            "details": details,
        }).execute()
    except Exception as e:
        logger.error(f"[ceo_agent] Could not log decision: {e}")


def _alert_dylan(db, issues: list):
    """Send a WhatsApp alert to Dylan when there are unfixable issues."""
    try:
        from config import settings
        phone = settings.FOUNDER_PHONE or FOUNDER_PHONE
        # Normalise
        p = phone.strip().replace(" ", "")
        if p.startswith("0"):
            p = "+44" + p[1:]
        elif not p.startswith("+"):
            p = "+44" + p

        summary = "; ".join(issues[:3])
        body = f"⚠️ L&D Designs — CEO Alert: {summary}. Check dashboard: https://l-d-designss.vercel.app"

        # Check we haven't already alerted in the last 4 hours
        four_hours_ago = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
        recent_alert = (
            db.table("outreach_messages")
            .select("id")
            .eq("channel", "whatsapp")
            .eq("direction", "outbound")
            .ilike("body", "%CEO Alert%")
            .gte("created_at", four_hours_ago)
            .execute().data or []
        )
        if recent_alert:
            return

        db.table("outreach_messages").insert({
            "channel": "whatsapp",
            "direction": "outbound",
            "body": body,
            "status": "queued",
            "approved_by_founder": True,
        }).execute()
        logger.info(f"[ceo_agent] P1 alert queued for Dylan: {summary[:80]}")
    except Exception as e:
        logger.error(f"[ceo_agent] Failed to alert Dylan: {e}")


# ── Agent retries ─────────────────────────────────────────────────────────────

_RETRYABLE = {
    "website_analyzer",
    "preview_generator",
    "whatsapp_campaign",
    "instagram_campaign",
    "followup_agent",
    "lead_enricher",
    "lead_finder",
}


def _run_agent(name: str):
    if name == "website_analyzer":
        from agents.website_analyzer import run
        return run(batch_size=50)
    if name == "preview_generator":
        from agents.preview_generator import run_batch
        return run_batch(limit=50)
    if name == "whatsapp_campaign":
        from agents.outreach_writer import generate_whatsapp_campaign
        return generate_whatsapp_campaign(limit=10)
    if name == "instagram_campaign":
        from agents.outreach_writer import generate_instagram_campaign
        return generate_instagram_campaign(limit=30)
    if name == "followup_agent":
        from agents.followup_agent import run
        return run()
    if name == "lead_enricher":
        from agents.lead_enricher import run
        return run()
    if name == "lead_finder":
        from agents.lead_finder import run
        return run()
    return None


def _retry_failed(db, two_hours_ago: str) -> list:
    """Find agents that errored in the last 2h without recovering. Capped at 3/day."""
    actions = []
    try:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

        error_logs = (
            db.table("agent_logs").select("agent_name")
            .eq("status", "error")
            .gte("created_at", two_hours_ago)
            .execute().data or []
        )
        errored = {l["agent_name"] for l in error_logs if l["agent_name"] in _RETRYABLE}
        if not errored:
            return []

        success_logs = (
            db.table("agent_logs").select("agent_name")
            .eq("status", "success")
            .gte("created_at", two_hours_ago)
            .execute().data or []
        )
        recovered = {l["agent_name"] for l in success_logs}

        retry_logs = (
            db.table("agent_logs").select("details")
            .eq("agent_name", "ceo_agent")
            .gte("created_at", today_start)
            .execute().data or []
        )
        retry_counts: dict = {}
        for log in retry_logs:
            d = log.get("details") or {}
            retried = d.get("auto_retry")
            if retried:
                retry_counts[retried] = retry_counts.get(retried, 0) + 1

        to_retry = errored - recovered

        for name in to_retry:
            if retry_counts.get(name, 0) >= MAX_RETRIES_PER_AGENT_PER_DAY:
                msg = f"DECISION: {name} hit retry cap (3/day) — needs manual check"
                actions.append(msg)
                logger.warning(f"[ceo_agent] Retry cap reached for {name}")
                continue
            try:
                result = _run_agent(name)
                msg = f"DECISION: Auto-retried {name} after failure — recovered"
                actions.append(msg)
                db.table("agent_logs").insert({
                    "agent_name": "ceo_agent",
                    "action": msg,
                    "status": "success",
                    "details": {"auto_retry": name, "result": str(result)[:200]},
                }).execute()
                logger.info(f"[ceo_agent] Retried {name}")
            except Exception as e:
                logger.error(f"[ceo_agent] Retry of {name} failed: {e}")
                msg = f"DECISION: Retry of {name} attempted but still failing — manual check needed"
                actions.append(msg)

    except Exception as e:
        logger.error(f"[ceo_agent] _retry_failed error: {e}")

    return actions


# ── Legacy auto-fix ───────────────────────────────────────────────────────────

def _auto_fix(db, stats: dict, warnings: list) -> list:
    actions = []
    pipeline = stats.get("pipeline", {})
    wa_queued = stats.get("whatsapp_queued", 0)
    new_count = pipeline.get("new", 0)
    preview_ready = pipeline.get("preview_ready", 0)

    if wa_queued == 0 and preview_ready > 0:
        try:
            from agents.outreach_writer import generate_whatsapp_campaign
            result = generate_whatsapp_campaign(limit=10)
            generated = result.get("generated", 0)
            if generated > 0:
                msg = f"DECISION: Auto-generated {generated} WhatsApp messages (queue was empty)"
                actions.append(msg)
                _log_decision(db, msg, {"auto_fix": "whatsapp_campaign", "result": result})
        except Exception as e:
            logger.error(f"[ceo_agent] Auto-fix WA campaign failed: {e}")

    if new_count > 50:
        try:
            from agents.website_analyzer import run as analyze
            result = analyze(batch_size=50)
            analyzed = result.get("analyzed", 0)
            if analyzed > 0:
                msg = f"DECISION: Auto-analyzed {analyzed} backed-up new leads"
                actions.append(msg)
                _log_decision(db, msg, {"auto_fix": "website_analyzer", "result": result})
        except Exception as e:
            logger.error(f"[ceo_agent] Auto-fix website analyzer failed: {e}")

    return actions


# ── Daily briefing ────────────────────────────────────────────────────────────

def send_daily_briefing() -> bool:
    """Send 8am briefing email to the founder with overnight stats and system status."""
    from db.client import get_db
    from config import settings

    db = get_db()
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    try:
        statuses = ["new", "analyzing", "preview_ready", "outreach_queued",
                    "outreach_sent", "replied", "interested", "converted"]
        pipeline = {}
        for s in statuses:
            pipeline[s] = db.table("leads").select("id", count="exact").eq("status", s).execute().count or 0

        replies_24h = (
            db.table("leads").select("id", count="exact")
            .gte("updated_at", f"{yesterday}T00:00:00")
            .in_("status", ["replied", "interested"])
            .execute().count or 0
        )

        wa_queued = (
            db.table("outreach_messages").select("id", count="exact")
            .eq("status", "queued").eq("channel", "whatsapp")
            .execute().count or 0
        )

        # Last CEO decisions (overnight)
        last_log = (
            db.table("agent_logs").select("details, created_at")
            .eq("agent_name", "ceo_agent")
            .order("created_at", desc=True)
            .limit(1)
            .execute().data or []
        )
        system_status = "Unknown"
        actions_overnight = []
        if last_log:
            rpt = last_log[0].get("details") or {}
            overall = rpt.get("overall", "unknown")
            system_status = {"ok": "✅ All systems operational", "warning": "⚠️ Warnings", "error": "❌ Issues detected"}.get(overall, overall)
            actions_overnight = rpt.get("actions_taken", [])

        converted = pipeline.get("converted", 0)
        interested = pipeline.get("interested", 0)
        replied = pipeline.get("replied", 0)
        recurring = converted * 15

        actions_section = ""
        if actions_overnight:
            lines = [a.replace("DECISION: ", "") for a in actions_overnight]
            actions_section = "\nOVERNIGHT ACTIONS\n" + "\n".join(f"  • {l}" for l in lines) + "\n"

        body = f"""Morning Dylan 👋

Your L&D Designs update for {today}.

SYSTEM STATUS
  {system_status}
{actions_section}
PIPELINE
  New leads:        {pipeline.get('new', 0)}
  Preview ready:    {pipeline.get('preview_ready', 0)}
  Outreach sent:    {pipeline.get('outreach_sent', 0)}
  Replied:          {replied}
  Interested:       {interested}
  Converted:        {converted}

LAST 24 HOURS
  New replies:      {replies_24h}
  WA queue:         {wa_queued} messages ready to send

MONEY
  Recurring:        {converted} clients × £15 = £{recurring}/mo
  Hot leads:        {interested} interested — chase these today

Dashboard → https://l-d-designss.vercel.app

— L&D Designs CEO Agent"""

        to_email = settings.FOUNDER_EMAIL or settings.GMAIL_ADDRESS
        msg = MIMEText(body, "plain")
        msg["From"] = settings.GMAIL_ADDRESS
        msg["To"] = to_email
        msg["Subject"] = f"L&D Designs — Morning Briefing {today}"

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.GMAIL_ADDRESS, settings.GMAIL_APP_PASSWORD)
            server.sendmail(settings.GMAIL_ADDRESS, to_email, msg.as_string())

        db.table("agent_logs").insert({
            "agent_name": "ceo_agent",
            "action": f"Daily briefing sent — {replies_24h} replies overnight, {wa_queued} WA queued",
            "status": "success",
            "details": {"type": "daily_briefing", "date": today, "to": to_email},
        }).execute()

        logger.info(f"[ceo_agent] Daily briefing sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"[ceo_agent] Daily briefing failed: {e}")
        return False
