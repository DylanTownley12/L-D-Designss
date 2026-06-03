from fastapi import APIRouter
from datetime import date, timedelta
from db.client import get_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_stats():
    db = get_db()
    today = date.today().isoformat()

    def count(table, **filters):
        q = db.table(table).select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        return q.execute().count or 0

    def count_gte(table, field, value, **filters):
        q = db.table(table).select("id", count="exact").gte(field, value)
        for k, v in filters.items():
            q = q.eq(k, v)
        return q.execute().count or 0

    # Lead counts by status
    total_leads       = count("leads")
    new_leads         = count("leads", status="new")
    analyzing         = count("leads", status="analyzing")
    preview_ready     = count("leads", status="preview_ready")
    outreach_queued_l = count("leads", status="outreach_queued")
    outreach_sent     = count("leads", status="outreach_sent")
    replied           = count("leads", status="replied")
    interested        = count("leads", status="interested")
    converted         = count("leads", status="converted")
    previews_total    = count("previews")
    outreach_queued   = count("outreach_messages", status="queued", direction="outbound")
    emails_today      = count_gte("outreach_messages", "sent_at", f"{today}T00:00:00",
                                  channel="email", status="sent")
    whatsapp_today    = count_gte("outreach_messages", "sent_at", f"{today}T00:00:00",
                                  channel="whatsapp", status="sent")

    # Last WA message sent (for Baz health)
    last_wa = db.table("outreach_messages").select("sent_at").eq("channel", "whatsapp").eq(
        "status", "sent").order("sent_at", desc=True).limit(1).execute()
    last_whatsapp_sent_at = (last_wa.data[0]["sent_at"] if last_wa.data else None)

    # Today's tasks
    whatsapp_queued  = count("outreach_messages", status="queued",  channel="whatsapp",  direction="outbound")
    instagram_ready  = count("outreach_messages", status="queued",  channel="instagram", direction="outbound")
    followups_waiting = count("leads", status="outreach_sent")
    need_attention   = count("leads", status="replied") + count("leads", status="interested")

    # Converted clients (wins)
    wins_result = db.table("leads").select("business_name, city").eq("status", "converted").limit(20).execute()
    wins = wins_result.data or []

    # Revenue
    revenue_result = db.table("deployed_websites").select("payment_amount").eq("payment_received", True).execute()
    revenue_total = sum(r["payment_amount"] or 0 for r in (revenue_result.data or []))

    # Recent notifications
    notifs = (
        db.table("notifications")
        .select("*")
        .eq("read", False)
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    )

    # Pipeline breakdown for chart
    pipeline = [
        {"label": "New",           "count": new_leads,       "color": "#6b7280"},
        {"label": "Analysing",     "count": analyzing,       "color": "#3b82f6"},
        {"label": "Preview Ready", "count": preview_ready,   "color": "#a855f7"},
        {"label": "Queued",        "count": outreach_queued_l, "color": "#f59e0b"},
        {"label": "Outreach Sent", "count": outreach_sent,   "color": "#06b6d4"},
        {"label": "Replied",       "count": replied,         "color": "#f59e0b"},
        {"label": "Interested",    "count": interested,      "color": "#8b5cf6"},
        {"label": "Converted",     "count": converted,       "color": "#10b981"},
    ]

    # 7-day outreach activity
    activity = []
    for i in range(6, -1, -1):
        day = (date.today() - timedelta(days=i)).isoformat()
        sent = count_gte("outreach_messages", "sent_at", f"{day}T00:00:00", status="sent")
        activity.append({"date": day, "sent": sent})

    return {
        "total_leads": total_leads,
        "new_leads": new_leads,
        "outreach_sent": outreach_sent,
        "replies": replied,
        "interested": interested,
        "converted": converted,
        "previews_generated": previews_total,
        "preview_ready": preview_ready,
        "outreach_queued": outreach_queued,
        "emails_today": emails_today,
        "whatsapp_today": whatsapp_today,
        "last_whatsapp_sent_at": last_whatsapp_sent_at,
        "revenue_total": float(revenue_total),
        "pipeline": pipeline,
        "activity": activity,
        "notifications": notifs.data or [],
        "unread_notifications": len(notifs.data or []),
        "whatsapp_queued": whatsapp_queued,
        "instagram_ready": instagram_ready,
        "followups_waiting": followups_waiting,
        "need_attention": need_attention,
        "wins": wins,
    }


@router.get("/notifications")
async def get_notifications(limit: int = 20, unread_only: bool = False):
    db = get_db()
    q = db.table("notifications").select("*, leads(business_name)").order("created_at", desc=True).limit(limit)
    if unread_only:
        q = q.eq("read", False)
    result = q.execute()
    return {"notifications": result.data or []}


@router.post("/notifications/mark-read")
async def mark_notifications_read():
    from agents.notification_agent import mark_all_read
    mark_all_read()
    return {"ok": True}


@router.get("/health")
async def health_check():
    """Quick health snapshot — check from your phone at any time."""
    try:
        db = get_db()
        yesterday = (date.today() - timedelta(days=1)).isoformat()

        def _count(table, **filters):
            q = db.table(table).select("id", count="exact")
            for k, v in filters.items():
                q = q.eq(k, v)
            return q.execute().count or 0

        preview_result = db.table("previews").select("preview_url").limit(2000).execute()
        valid_previews = sum(
            1 for p in (preview_result.data or [])
            if '/previews/serve/' in (p.get("preview_url") or '')
            and 'localhost' not in (p.get("preview_url") or '')
        )

        replied_24h = (
            db.table("leads").select("id", count="exact")
            .gte("updated_at", f"{yesterday}T00:00:00")
            .in_("status", ["replied", "interested"])
            .execute().count or 0
        )

        return {
            "status": "ok",
            "leads": {
                "new":           _count("leads", status="new"),
                "preview_ready": _count("leads", status="preview_ready"),
                "sent":          _count("leads", status="outreach_sent"),
                "replied":       _count("leads", status="replied"),
                "interested":    _count("leads", status="interested"),
                "converted":     _count("leads", status="converted"),
            },
            "whatsapp_queued":  _count("outreach_messages", status="queued", channel="whatsapp", direction="outbound"),
            "valid_previews":   valid_previews,
            "replies_24h":      replied_24h,
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {"status": "error", "detail": str(e)}


@router.get("/activity")
async def get_recent_activity(limit: int = 20):
    db = get_db()
    result = (
        db.table("agent_logs")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"activity": result.data or []}


@router.get("/yesterday")
async def yesterday_summary():
    """What each agent did yesterday — shown on the dashboard recap section."""
    db = get_db()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    yesterday_start = f"{yesterday}T00:00:00"
    today_start = f"{date.today().isoformat()}T00:00:00"

    logs = (
        db.table("agent_logs")
        .select("agent_name, action, status, created_at, details")
        .gte("created_at", yesterday_start)
        .lt("created_at", today_start)
        .order("created_at", desc=True)
        .limit(500)
        .execute().data or []
    )

    # Group by agent — keep the most meaningful action (first non-trivial one)
    agents = {}
    for log in logs:
        name = log["agent_name"]
        if name not in agents:
            agents[name] = {
                "agent": name,
                "last_action": log["action"],
                "status": log["status"],
                "runs": 0,
                "errors": 0,
                "last_at": log["created_at"],
            }
        agents[name]["runs"] += 1
        if log["status"] == "error":
            agents[name]["errors"] += 1

    return {
        "date": yesterday,
        "agents": sorted(agents.values(), key=lambda x: x["last_at"], reverse=True),
    }
