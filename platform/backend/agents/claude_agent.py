"""
Claude Agent — daily 10am automated tasks.
Uses Claude API to analyse A/B performance, generate better openers,
review reply patterns, and surface actionable insights for Dylan.
This is the 'Claude Code tasks' from the Plan, running automatically.
"""
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def run() -> dict:
    from db.client import get_db
    from config import settings

    if not settings.ANTHROPIC_API_KEY:
        logger.warning("[claude_agent] ANTHROPIC_API_KEY not set — skipping")
        return {"skipped": True, "reason": "ANTHROPIC_API_KEY not configured"}

    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    db = get_db()

    results = {}

    # ── 1. Pull A/B test data and generate better variants ─────────────────
    try:
        results["ab_analysis"] = _analyse_and_improve_openers(db, client)
    except Exception as e:
        logger.error(f"[claude_agent] A/B analysis failed: {e}")
        results["ab_analysis"] = {"error": str(e)}

    # ── 2. Review reply patterns and give Dylan specific advice ────────────
    try:
        results["reply_insight"] = _reply_pattern_insight(db, client)
    except Exception as e:
        logger.error(f"[claude_agent] Reply insight failed: {e}")
        results["reply_insight"] = {"error": str(e)}

    # ── 3. Surface hottest leads for Dylan to act on personally ───────────
    try:
        results["hot_leads"] = _surface_hot_leads(db, client)
    except Exception as e:
        logger.error(f"[claude_agent] Hot leads failed: {e}")
        results["hot_leads"] = {"error": str(e)}

    action = (
        results.get("reply_insight", {}).get("advice", "Daily analysis complete")
        if isinstance(results.get("reply_insight"), dict)
        else "Daily analysis complete"
    )

    try:
        db.table("agent_logs").insert({
            "agent_name": "claude_agent",
            "action": action,
            "status": "success",
            "details": results,
        }).execute()
    except Exception as e:
        logger.error(f"[claude_agent] Log write failed: {e}")

    logger.info(f"[claude_agent] Daily tasks complete")
    return results


def _analyse_and_improve_openers(db, client) -> dict:
    """Pull A/B stats, kill the worst performer, write a replacement."""
    # Get template performance from outreach_messages
    msgs = db.table("outreach_messages").select("body, status, direction") \
        .eq("channel", "whatsapp").eq("direction", "outbound") \
        .execute().data or []

    sent_msgs = [m for m in msgs if m["status"] in ("sent", "replied")]
    if len(sent_msgs) < 5:
        return {"skipped": True, "reason": "Not enough sent messages yet for analysis"}

    # Get reply stats from leads
    all_leads = db.table("leads").select("status").execute().data or []
    pipeline = {}
    for l in all_leads:
        s = l.get("status", "unknown")
        pipeline[s] = pipeline.get(s, 0) + 1

    total_sent = sum(pipeline.get(s, 0) for s in ["outreach_sent", "replied", "interested", "converted"])
    total_replied = sum(pipeline.get(s, 0) for s in ["replied", "interested", "converted"])
    reply_rate = round(total_replied / total_sent * 100, 1) if total_sent > 0 else 0

    sample_msgs = [m["body"][:200] for m in sent_msgs[:5]]

    prompt = f"""L&D Designs WhatsApp outreach data:
- {total_sent} messages sent to UK barbers
- {total_replied} replied ({reply_rate}% reply rate)
- Dylan is 17, from Wigan, selling websites to barbers for £150 build + £15/month

Sample outreach messages sent:
{chr(10).join(f'- "{m}"' for m in sample_msgs)}

Tasks:
1. Is {reply_rate}% good for cold WhatsApp outreach to barbers? (industry benchmark is 3-8%)
2. What's the single biggest weakness you can spot in the sample messages?
3. Write 2 new WhatsApp opener variants (3-4 lines each) that address that weakness.
   Must start casual, mention no website spotted, show preview link placeholder [PREVIEW_URL].
   Sound like a real 17-year-old from Wigan texting, not AI.

Be direct and specific. No fluff."""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )

    analysis = response.content[0].text

    return {
        "reply_rate": reply_rate,
        "total_sent": total_sent,
        "analysis": analysis,
    }


def _reply_pattern_insight(db, client) -> dict:
    """Analyse what's different about leads that replied vs those that didn't."""
    replied_leads = db.table("leads").select("city, business_name, quality_score") \
        .in_("status", ["replied", "interested", "converted"]) \
        .limit(20).execute().data or []

    silent_leads = db.table("leads").select("city, business_name, quality_score") \
        .eq("status", "outreach_sent") \
        .limit(20).execute().data or []

    if not replied_leads:
        return {"skipped": True, "reason": "No replies yet"}

    replied_cities = [l.get("city", "?") for l in replied_leads]
    silent_cities = [l.get("city", "?") for l in silent_leads[:10]]

    avg_replied_score = sum(l.get("quality_score") or 50 for l in replied_leads) / len(replied_leads)
    avg_silent_score = sum(l.get("quality_score") or 50 for l in silent_leads) / len(silent_leads) if silent_leads else 0

    prompt = f"""L&D Designs lead analysis:

Leads that REPLIED (n={len(replied_leads)}):
- Cities: {', '.join(set(replied_cities))}
- Avg quality score: {avg_replied_score:.0f}/100

Leads that STAYED SILENT after outreach (n={len(silent_leads)}):
- Cities: {', '.join(set(silent_cities))}
- Avg quality score: {avg_silent_score:.0f}/100

What's the single most actionable thing Dylan should do today based on this data?
Keep it to 2 sentences. Be specific — no generic advice."""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=150,
        messages=[{"role": "user", "content": prompt}],
    )

    advice = response.content[0].text.strip()
    return {"advice": advice, "replied_count": len(replied_leads)}


def _surface_hot_leads(db, client) -> dict:
    """Find the top 3 leads Dylan should personally follow up today."""
    interested = db.table("leads").select("id, business_name, city, phone") \
        .eq("status", "interested").limit(10).execute().data or []

    replied = db.table("leads").select("id, business_name, city, phone") \
        .eq("status", "replied").limit(10).execute().data or []

    hot = interested + replied
    if not hot:
        return {"hot_leads": [], "message": "No hot leads right now"}

    lead_names = [f"{l['business_name']} ({l.get('city','?')})" for l in hot[:6]]
    lead_list = ", ".join(lead_names)

    db.table("agent_logs").insert({
        "agent_name": "claude_agent",
        "action": f"Hot leads today: {lead_list}",
        "status": "success",
        "details": {"hot_leads": hot[:6]},
    }).execute()

    return {
        "interested": len(interested),
        "replied": len(replied),
        "top_leads": [{"name": l["business_name"], "city": l.get("city"), "phone": l.get("phone")} for l in hot[:3]],
    }
