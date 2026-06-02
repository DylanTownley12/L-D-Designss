"""
CEO Agent — runs every 2 hours, checks the whole system is healthy.
Logs a structured report to agent_logs so the dashboard can display it.
"""
import logging
from datetime import datetime, timedelta, timezone

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

        if pipeline.get("new", 0) > 500:
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

    logger.info(f"[ceo_agent] {overall.upper()} — {len(issues)} issues, {len(warnings)} warnings")
    return report
