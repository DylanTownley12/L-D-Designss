"""
Dev Agent — runs every 3 hours.
Monitors error patterns, repeated failures, and missed daily jobs.
Complements CEO agent (business pipeline) with technical system focus.
"""
import logging
from datetime import datetime, timedelta, date, timezone

logger = logging.getLogger(__name__)

# Agents expected to have logged at least once today (checked after 10am)
_EXPECTED_DAILY = ["lead_finder", "preview_generator", "followup_agent", "ceo_agent"]


def run() -> dict:
    from db.client import get_db
    db = get_db()

    now = datetime.now(timezone.utc)
    today_start = f"{date.today().isoformat()}T00:00:00"
    yesterday_start = (now - timedelta(hours=24)).isoformat()

    alerts = []
    info = []

    try:
        # 1. Error counts per agent in last 24h (exclude dev_agent itself)
        error_logs = (
            db.table("agent_logs").select("agent_name, action")
            .eq("status", "error")
            .neq("agent_name", "dev_agent")
            .gte("created_at", yesterday_start)
            .execute().data or []
        )

        error_counts = {}
        for log in error_logs:
            a = log["agent_name"]
            error_counts[a] = error_counts.get(a, 0) + 1

        for agent, count in error_counts.items():
            if count >= 3:
                alerts.append(f"{agent} failed {count}x in 24h — needs attention")
            else:
                info.append(f"{agent}: {count} error(s) in 24h")

        # 2. Check expected daily agents ran today (only flag after 10am)
        if now.hour >= 10:
            today_logs = (
                db.table("agent_logs").select("agent_name")
                .gte("created_at", today_start)
                .execute().data or []
            )
            ran_today = {l["agent_name"] for l in today_logs}

            for expected in _EXPECTED_DAILY:
                if expected not in ran_today:
                    alerts.append(f"{expected} has not run today — possible scheduler issue")

        # 3. Repeated error pattern detection (same action string seen 2+ times)
        if error_logs:
            action_counts = {}
            for log in error_logs:
                key = (log.get("action") or "")[:60]
                action_counts[key] = action_counts.get(key, 0) + 1
            repeated = sum(1 for c in action_counts.values() if c >= 2)
            if repeated:
                alerts.append(f"{repeated} repeated error pattern(s) in last 24h — same failure recurring")

        overall = "error" if alerts else "ok"
        ran_today_list = list({l["agent_name"] for l in (
            db.table("agent_logs").select("agent_name")
            .gte("created_at", today_start).execute().data or []
        )}) if now.hour >= 10 else []

        result = {
            "overall": overall,
            "alerts": alerts,
            "info": info,
            "error_counts_24h": error_counts,
            "agents_active_today": ran_today_list,
            "checked_at": now.isoformat(),
        }

    except Exception as e:
        logger.error(f"[dev_agent] Analysis failed: {e}")
        result = {"overall": "error", "alerts": [f"Dev agent failed: {e}"], "info": [], "error_counts_24h": {}}

    action = alerts[0] if alerts else f"All nominal — {len(result.get('agents_active_today', []))} agents active today"

    try:
        db.table("agent_logs").insert({
            "agent_name": "dev_agent",
            "action": action,
            "status": "success",
            "details": result,
        }).execute()
    except Exception as e:
        logger.error(f"[dev_agent] Log write failed: {e}")

    logger.info(f"[dev_agent] {len(alerts)} alerts")
    return result
