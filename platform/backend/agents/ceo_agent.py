"""
CEO Agent — runs every 2 hours, checks system health and auto-fixes problems.
Also sends an 8am daily briefing email to the founder.
"""
import logging
import smtplib
from email.mime.text import MIMEText
from datetime import datetime, timedelta, date, timezone

logger = logging.getLogger(__name__)


def run() -> dict:
    from db.client import get_db
    db = get_db()

    now = datetime.now(timezone.utc)
    two_hours_ago = (now - timedelta(hours=2)).isoformat()
    seven_days_ago = (now - timedelta(days=7)).isoformat()

    issues = []
    warnings = []
    stats = {}

    # 1. Lead pipeline counts
    try:
        all_leads = db.table("leads").select("status").execute().data or []
        pipeline = {}
        for lead in all_leads:
            s = lead.get("status", "unknown")
            pipeline[s] = pipeline.get(s, 0) + 1
        stats["pipeline"] = pipeline

        if pipeline.get("new", 0) > 50:
            warnings.append(f"{pipeline['new']} leads stuck in 'new' — website analyzer may be behind")
    except Exception as e:
        issues.append(f"Could not read lead pipeline: {e}")

    # 2. Recent agent errors (last 2h) — exclude ceo_agent to avoid self-reporting
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

    # 4. Preview health (valid URL ratio)
    try:
        previews = db.table("previews").select("preview_url").execute().data or []
        total = len(previews)
        valid = sum(
            1 for p in previews
            if "railway" in (p.get("preview_url") or "") or "/previews/serve/" in (p.get("preview_url") or "")
        )
        stats["previews_total"] = total
        stats["previews_valid"] = valid
        if total > 0 and valid / total < 0.8:
            warnings.append(f"Only {valid}/{total} previews have valid URLs")
    except Exception as e:
        issues.append(f"Could not check previews: {e}")

    # 5. Stalled leads (outreach_sent for 7+ days)
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

    # Retry any agents that failed in the last 2h and haven't recovered
    retry_actions = _retry_failed(db, two_hours_ago)

    # Auto-fix any detected pipeline problems
    fix_actions = _auto_fix(db, stats, warnings)

    actions_taken = retry_actions + fix_actions

    # Overall status
    if issues:
        overall = "error"
    elif warnings:
        overall = "warning"
    else:
        overall = "ok"

    report = {
        "overall": overall,
        "issues": issues,
        "warnings": warnings,
        "actions_taken": actions_taken,
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
            "status": "success",  # always success so it doesn't trigger its own error check next run
            "details": report,
        }).execute()
    except Exception as e:
        logger.error(f"CEO agent could not write log: {e}")

    logger.info(f"[ceo_agent] {overall.upper()} — {len(issues)} issues, {len(warnings)} warnings, {len(actions_taken)} fixes")
    return report


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
        return generate_whatsapp_campaign(limit=30)
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
    """Find agents that errored in the last 2h without recovering, and re-run them."""
    actions = []
    try:
        # Agents that errored recently (excluding monitoring agents)
        error_logs = (
            db.table("agent_logs").select("agent_name")
            .eq("status", "error")
            .gte("created_at", two_hours_ago)
            .execute().data or []
        )
        errored = {l["agent_name"] for l in error_logs if l["agent_name"] in _RETRYABLE}
        if not errored:
            return []

        # Agents that have a success log in the same window (already recovered)
        success_logs = (
            db.table("agent_logs").select("agent_name")
            .eq("status", "success")
            .gte("created_at", two_hours_ago)
            .execute().data or []
        )
        recovered = {l["agent_name"] for l in success_logs}

        to_retry = errored - recovered

        for name in to_retry:
            try:
                result = _run_agent(name)
                msg = f"Auto-retried {name} after failure"
                actions.append(msg)
                db.table("agent_logs").insert({
                    "agent_name": "ceo_agent",
                    "action": f"Auto-retry: {name}",
                    "status": "success",
                    "details": {"auto_retry": name, "result": str(result)[:200]},
                }).execute()
                logger.info(f"[ceo_agent] Retried {name}")
            except Exception as e:
                logger.error(f"[ceo_agent] Retry of {name} failed: {e}")
                actions.append(f"Retry of {name} attempted but still failing — manual check needed")

    except Exception as e:
        logger.error(f"[ceo_agent] _retry_failed error: {e}")

    return actions


def _auto_fix(db, stats: dict, warnings: list) -> list:
    """Attempt to fix detected problems. Returns list of action strings."""
    actions = []
    pipeline = stats.get("pipeline", {})
    wa_queued = stats.get("whatsapp_queued", 0)
    new_count = pipeline.get("new", 0)
    preview_ready = pipeline.get("preview_ready", 0)

    # Fix 1: Empty WA queue but leads are preview_ready → generate campaign
    if wa_queued == 0 and preview_ready > 0:
        try:
            from agents.outreach_writer import generate_whatsapp_campaign
            result = generate_whatsapp_campaign(limit=30)
            generated = result.get("generated", 0)
            if generated > 0:
                msg = f"Auto-generated {generated} WhatsApp messages (queue was empty)"
                actions.append(msg)
                db.table("agent_logs").insert({
                    "agent_name": "ceo_agent",
                    "action": f"Auto-fix: {msg}",
                    "status": "success",
                    "details": {"auto_fix": "whatsapp_campaign", "result": result},
                }).execute()
        except Exception as e:
            logger.error(f"[ceo_agent] Auto-fix WA campaign failed: {e}")

    # Fix 2: Many leads stuck in 'new' → run website analyzer
    if new_count > 50:
        try:
            from agents.website_analyzer import run as analyze
            result = analyze(batch_size=50)
            analyzed = result.get("analyzed", 0)
            if analyzed > 0:
                msg = f"Auto-analyzed {analyzed} backed-up new leads"
                actions.append(msg)
                db.table("agent_logs").insert({
                    "agent_name": "ceo_agent",
                    "action": f"Auto-fix: {msg}",
                    "status": "success",
                    "details": {"auto_fix": "website_analyzer", "result": result},
                }).execute()
        except Exception as e:
            logger.error(f"[ceo_agent] Auto-fix website analyzer failed: {e}")

    return actions


def send_daily_briefing() -> bool:
    """Send 8am briefing email to the founder with overnight stats and system status."""
    from db.client import get_db
    from config import settings

    db = get_db()
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    try:
        # Pipeline counts
        all_leads = db.table("leads").select("status").execute().data or []
        pipeline = {}
        for lead in all_leads:
            s = lead.get("status", "unknown")
            pipeline[s] = pipeline.get(s, 0) + 1

        # Replies in last 24h
        replies_24h = (
            db.table("leads").select("id", count="exact")
            .gte("updated_at", f"{yesterday}T00:00:00")
            .in_("status", ["replied", "interested"])
            .execute().count or 0
        )

        # WhatsApp queue
        wa_queued = (
            db.table("outreach_messages").select("id", count="exact")
            .eq("status", "queued").eq("channel", "whatsapp")
            .execute().count or 0
        )

        # Last CEO check result
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
            system_status = {"ok": "✅ All systems operational", "warning": "⚠️  Warnings", "error": "❌ Issues detected"}.get(overall, overall)
            actions_overnight = rpt.get("actions_taken", [])

        converted = pipeline.get("converted", 0)
        interested = pipeline.get("interested", 0)
        replied = pipeline.get("replied", 0)
        recurring = converted * 15

        actions_section = ""
        if actions_overnight:
            actions_section = "\nAUTO-FIXES OVERNIGHT\n" + "\n".join(f"  • {a}" for a in actions_overnight) + "\n"

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
