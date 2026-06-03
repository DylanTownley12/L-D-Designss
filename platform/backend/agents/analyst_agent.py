"""
Data Analyst Agent — nightly at 3am.
Calculates conversion funnel, city performance, and quality score correlation.
"""
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def run() -> dict:
    from db.client import get_db
    db = get_db()

    try:
        all_leads = db.table("leads").select("status, city, quality_score").execute().data or []
    except Exception as e:
        logger.error(f"[analyst_agent] DB read failed: {e}")
        return {"error": str(e)}

    total = len(all_leads)
    if total == 0:
        return {"error": "No leads in database yet"}

    # Pipeline counts
    pipeline = {}
    for lead in all_leads:
        s = lead.get("status", "unknown")
        pipeline[s] = pipeline.get(s, 0) + 1

    # Conversion funnel rates
    ever_analyzed = total - pipeline.get("new", 0)
    outreach_total = sum(pipeline.get(s, 0) for s in ["outreach_queued", "outreach_sent", "replied", "interested", "converted"])
    replies_total = sum(pipeline.get(s, 0) for s in ["replied", "interested", "converted"])
    converted = pipeline.get("converted", 0)

    funnel = {
        "total_leads": total,
        "analysed_rate": round(ever_analyzed / total * 100, 1) if total > 0 else 0,
        "outreach_rate": round(outreach_total / ever_analyzed * 100, 1) if ever_analyzed > 0 else 0,
        "reply_rate": round(replies_total / outreach_total * 100, 1) if outreach_total > 0 else 0,
        "close_rate": round(converted / replies_total * 100, 1) if replies_total > 0 else 0,
    }

    # City breakdown — top 5 by reply rate (min 5 sent)
    city_stats = {}
    for lead in all_leads:
        city = (lead.get("city") or "Unknown").strip().title()
        status = lead.get("status") or "unknown"
        if city not in city_stats:
            city_stats[city] = {"sent": 0, "replied": 0}
        if status in ("outreach_sent", "outreach_queued", "replied", "interested", "converted"):
            city_stats[city]["sent"] += 1
        if status in ("replied", "interested", "converted"):
            city_stats[city]["replied"] += 1

    top_cities = sorted(
        [{"city": c, "sent": s["sent"], "replied": s["replied"],
          "reply_rate": round(s["replied"] / s["sent"] * 100, 1) if s["sent"] >= 5 else 0}
         for c, s in city_stats.items() if s["sent"] >= 5],
        key=lambda x: x["reply_rate"], reverse=True
    )[:5]

    # Quality score: do higher-scored leads reply more?
    replied_statuses = {"replied", "interested", "converted"}
    replied_scores = [l["quality_score"] for l in all_leads
                      if l.get("status") in replied_statuses and l.get("quality_score")]
    sent_scores = [l["quality_score"] for l in all_leads
                   if l.get("status") == "outreach_sent" and l.get("quality_score")]

    avg_replied = round(sum(replied_scores) / len(replied_scores), 1) if replied_scores else None
    avg_sent = round(sum(sent_scores) / len(sent_scores), 1) if sent_scores else None

    # Key insights
    insights = []
    if funnel["reply_rate"] > 0:
        insights.append(f"Overall reply rate: {funnel['reply_rate']}% ({replies_total}/{outreach_total} messaged)")
    if top_cities:
        insights.append(f"Best city: {top_cities[0]['city']} at {top_cities[0]['reply_rate']}% reply rate")
    if avg_replied and avg_sent:
        diff = avg_replied - avg_sent
        if diff > 5:
            insights.append(f"Quality score predicts replies (avg: replied={avg_replied} vs sent={avg_sent}) — prioritise higher scored leads")
        else:
            insights.append(f"Quality score has little impact on replies (replied={avg_replied} vs sent={avg_sent})")
    if converted > 0:
        insights.append(f"{converted} converted = £{converted * 15}/mo recurring + £{converted * 150} upfront")

    result = {
        "funnel": funnel,
        "top_cities": top_cities,
        "quality_score": {
            "avg_replied": avg_replied,
            "avg_sent": avg_sent,
            "sample_replied": len(replied_scores),
            "sample_sent": len(sent_scores),
        },
        "insights": insights,
        "analysed_at": datetime.now(timezone.utc).isoformat(),
    }

    action = insights[0] if insights else f"Analysed {total} leads across {len(city_stats)} cities"

    try:
        db.table("agent_logs").insert({
            "agent_name": "analyst_agent",
            "action": action,
            "status": "success",
            "details": result,
        }).execute()
    except Exception as e:
        logger.error(f"[analyst_agent] Log write failed: {e}")

    logger.info(f"[analyst_agent] {len(insights)} insights, reply_rate={funnel.get('reply_rate')}%")
    return result
