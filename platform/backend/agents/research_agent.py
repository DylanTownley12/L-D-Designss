"""
Research Agent — nightly city intelligence.
Finds the best UK cities to focus on based on lead volume and reply rates.
"""
import logging

logger = logging.getLogger(__name__)


def run() -> dict:
    from db.client import get_db
    db = get_db()

    try:
        all_leads = db.table("leads").select("city, status").execute().data or []
    except Exception as e:
        logger.error(f"[research_agent] DB read failed: {e}")
        return {"error": str(e)}

    city_stats = {}
    for lead in all_leads:
        city = (lead.get("city") or "Unknown").strip().title()
        status = lead.get("status") or "unknown"
        if city not in city_stats:
            city_stats[city] = {"total": 0, "preview_ready": 0, "outreach_sent": 0,
                                "replied": 0, "interested": 0, "converted": 0}
        city_stats[city]["total"] += 1
        if status in city_stats[city]:
            city_stats[city][status] += 1

    def reply_rate(s):
        sent = s["outreach_sent"] + s["replied"] + s["interested"] + s["converted"]
        replies = s["replied"] + s["interested"] + s["converted"]
        return round(replies / sent * 100, 1) if sent >= 5 else 0.0

    # Top 5 cities with most untapped leads (preview_ready, not yet messaged)
    untapped = sorted(
        [(c, s) for c, s in city_stats.items() if s["preview_ready"] > 0],
        key=lambda x: x[1]["preview_ready"], reverse=True
    )[:5]

    # Top 5 cities with best reply rate (min 5 sent)
    performing = sorted(
        [(c, s) for c, s in city_stats.items()
         if (s["outreach_sent"] + s["replied"] + s["interested"] + s["converted"]) >= 5],
        key=lambda x: reply_rate(x[1]), reverse=True
    )[:5]

    recommendations = []
    if untapped:
        top, stats = untapped[0]
        recommendations.append(f"Focus outreach on {top} — {stats['preview_ready']} leads ready to contact")
    if performing:
        best, bstats = performing[0]
        rate = reply_rate(bstats)
        if rate > 0:
            recommendations.append(f"Best reply rate: {best} at {rate}% — find more leads here")
    if not recommendations:
        recommendations.append(f"Analysed {len(city_stats)} cities — keep building pipeline")

    result = {
        "top_untapped": [{"city": c, "preview_ready": s["preview_ready"]} for c, s in untapped],
        "top_performing": [{"city": c, "reply_rate": reply_rate(s)} for c, s in performing],
        "recommendations": recommendations,
        "cities_analysed": len(city_stats),
        "total_leads": len(all_leads),
    }

    try:
        db.table("agent_logs").insert({
            "agent_name": "research_agent",
            "action": recommendations[0],
            "status": "success",
            "details": result,
        }).execute()
    except Exception as e:
        logger.error(f"[research_agent] Log write failed: {e}")

    logger.info(f"[research_agent] {len(city_stats)} cities analysed, {len(recommendations)} recommendations")
    return result
