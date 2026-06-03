"""
CMO Agent — nightly marketing analysis.
Tracks weekly reply rate trends, channel performance, and flags drops early.
"""
import logging
from datetime import datetime, timedelta, date, timezone

logger = logging.getLogger(__name__)


def run() -> dict:
    from db.client import get_db
    db = get_db()

    week_start = (date.today() - timedelta(days=7)).isoformat()
    two_weeks_start = (date.today() - timedelta(days=14)).isoformat()

    try:
        # Leads that moved to replied/interested/converted this week vs last week
        this_week = (
            db.table("leads").select("id", count="exact")
            .in_("status", ["replied", "interested", "converted"])
            .gte("updated_at", f"{week_start}T00:00:00")
            .execute().count or 0
        )
        last_week = (
            db.table("leads").select("id", count="exact")
            .in_("status", ["replied", "interested", "converted"])
            .gte("updated_at", f"{two_weeks_start}T00:00:00")
            .lt("updated_at", f"{week_start}T00:00:00")
            .execute().count or 0
        )

        # Messages sent this week
        sent_this_week = (
            db.table("outreach_messages").select("id", count="exact")
            .eq("status", "sent").eq("direction", "outbound")
            .gte("sent_at", f"{week_start}T00:00:00")
            .execute().count or 0
        )

        # Channel totals (all time)
        wa_sent = (
            db.table("outreach_messages").select("id", count="exact")
            .eq("status", "sent").eq("channel", "whatsapp")
            .execute().count or 0
        )
        email_sent = (
            db.table("outreach_messages").select("id", count="exact")
            .eq("status", "sent").eq("channel", "email")
            .execute().count or 0
        )

        # Overall funnel for reply rate calculation
        all_leads = db.table("leads").select("status").execute().data or []
        pipeline = {}
        for lead in all_leads:
            s = lead.get("status", "unknown")
            pipeline[s] = pipeline.get(s, 0) + 1

        total_sent = sum(pipeline.get(s, 0) for s in ["outreach_sent", "replied", "interested", "converted"])
        total_replied = sum(pipeline.get(s, 0) for s in ["replied", "interested", "converted"])
        overall_reply_rate = round(total_replied / total_sent * 100, 1) if total_sent > 0 else 0.0

        # Trend
        trend = "stable"
        if last_week > 0:
            pct = (this_week - last_week) / last_week * 100
            trend = "up" if pct > 10 else ("down" if pct < -10 else "stable")
        elif this_week > 0:
            trend = "up"

        recommendations = []
        if trend == "down":
            recommendations.append("Reply rate dropped this week — consider refreshing WhatsApp opener template")
        elif trend == "up":
            recommendations.append("Reply rate improving this week — keep current approach and scale volume")
        else:
            recommendations.append("Reply rate stable — A/B test a new message angle to push it higher")

        if total_sent > 50 and overall_reply_rate < 2:
            recommendations.append(f"Overall reply rate is {overall_reply_rate}% — very low, review outreach copy")
        elif overall_reply_rate > 5:
            recommendations.append(f"Strong {overall_reply_rate}% reply rate — increase outreach volume")

        if pipeline.get("interested", 0) > 0:
            recommendations.append(f"{pipeline['interested']} interested leads — sales agent should close these today")

        result = {
            "this_week_replies": this_week,
            "last_week_replies": last_week,
            "trend": trend,
            "sent_this_week": sent_this_week,
            "overall_reply_rate": overall_reply_rate,
            "wa_sent_total": wa_sent,
            "email_sent_total": email_sent,
            "pipeline": pipeline,
            "recommendations": recommendations,
        }

    except Exception as e:
        logger.error(f"[cmo_agent] Analysis failed: {e}")
        result = {"error": str(e), "recommendations": [], "trend": "unknown"}

    action = (result.get("recommendations") or ["Analysis complete"])[0]

    try:
        db.table("agent_logs").insert({
            "agent_name": "cmo_agent",
            "action": action,
            "status": "success",
            "details": result,
        }).execute()
    except Exception as e:
        logger.error(f"[cmo_agent] Log write failed: {e}")

    logger.info(f"[cmo_agent] trend={result.get('trend')}, reply_rate={result.get('overall_reply_rate')}%")
    return result
