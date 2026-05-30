from fastapi import APIRouter
from datetime import date, timedelta
from db.client import get_db

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

    # Today's tasks
    whatsapp_queued  = count("outreach_messages", status="queued",  channel="whatsapp",  direction="outbound")
    instagram_ready  = count("outreach_messages", status="queued",  channel="instagram", direction="outbound")
    followups_waiting = count("leads", status="outreach_sent")
    need_attention   = count("leads", status="replied") + count("leads", status="interested")

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
        "outreach_queued": outreach_queued,
        "emails_today": emails_today,
        "revenue_total": float(revenue_total),
        "pipeline": pipeline,
        "activity": activity,
        "notifications": notifs.data or [],
        "unread_notifications": len(notifs.data or []),
        "whatsapp_queued": whatsapp_queued,
        "instagram_ready": instagram_ready,
        "followups_waiting": followups_waiting,
        "need_attention": need_attention,
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
