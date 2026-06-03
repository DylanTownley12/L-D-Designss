"""
Sales Agent — runs every 6 hours.
Finds interested leads with no recent follow-up and drafts a closing WhatsApp.
Stored as draft for founder approval — nothing sends automatically.
"""
import logging
import random
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

_CLOSING_TEMPLATES = [
    "Hey {name}, just checking in — are you still interested in getting the website live? Happy to crack on whenever suits you. Cheers, Dylan",
    "Hi {name}, just following up! If you're ready to go with the website I can have it live within a few days. Just give me a shout. — Dylan",
    "Hiya {name}, just wanted to check in before I move on to other projects — still keen on the website? Won't take long to get sorted. Cheers, Dylan",
    "Hey {name}! Still up for getting the website sorted? Just say the word and I'll get started. — Dylan from L&D Designs",
]


def run() -> dict:
    from db.client import get_db
    db = get_db()

    now = datetime.now(timezone.utc)
    cutoff_48h = (now - timedelta(hours=48)).isoformat()

    drafted = 0
    skipped = 0

    try:
        interested_leads = (
            db.table("leads").select("id, business_name, phone")
            .eq("status", "interested")
            .execute().data or []
        )

        for lead in interested_leads:
            lead_id = lead["id"]
            name = lead.get("business_name") or "there"

            try:
                # Skip if we already messaged them in the last 48h
                recent = (
                    db.table("outreach_messages").select("id")
                    .eq("lead_id", lead_id)
                    .eq("direction", "outbound")
                    .gte("created_at", cutoff_48h)
                    .execute().data or []
                )
                if recent:
                    skipped += 1
                    continue

                # Skip if there's already a pending draft for this lead
                existing_draft = (
                    db.table("outreach_messages").select("id")
                    .eq("lead_id", lead_id)
                    .eq("status", "draft")
                    .execute().data or []
                )
                if existing_draft:
                    skipped += 1
                    continue

                body = random.choice(_CLOSING_TEMPLATES).format(name=name)

                db.table("outreach_messages").insert({
                    "lead_id": lead_id,
                    "channel": "whatsapp",
                    "direction": "outbound",
                    "body": body,
                    "status": "draft",
                    "sequence_day": 2,
                    "ai_generated": False,
                    "approved_by_founder": False,
                }).execute()

                drafted += 1

            except Exception as e:
                logger.error(f"[sales_agent] Failed for lead {lead_id}: {e}")

    except Exception as e:
        logger.error(f"[sales_agent] DB read failed: {e}")
        return {"drafted": 0, "skipped": 0, "error": str(e)}

    action = (
        f"Drafted {drafted} closing messages for interested leads"
        if drafted else "All interested leads have recent follow-ups"
    )

    try:
        db.table("agent_logs").insert({
            "agent_name": "sales_agent",
            "action": action,
            "status": "success",
            "details": {"drafted": drafted, "skipped": skipped},
        }).execute()
    except Exception as e:
        logger.error(f"[sales_agent] Log write failed: {e}")

    logger.info(f"[sales_agent] {drafted} drafted, {skipped} skipped")
    return {"drafted": drafted, "skipped": skipped}
