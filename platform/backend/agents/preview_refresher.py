"""
Preview Refresher Agent
Finds leads that have had a preview sent 48h+ ago with no reply, regenerates their preview
with a fresh image/copy variant, then queues a follow-up message.
Runs daily at 11:30am.
"""
import logging
from datetime import datetime, timedelta, timezone
from db.client import get_db
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)


def run(limit: int = 20) -> dict:
    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()

    # Leads: outreach_sent (preview already sent), updated 48h+ ago, no reply yet
    stale = (
        db.table("leads")
        .select("id, business_name, city, phone, updated_at")
        .eq("status", "outreach_sent")
        .lt("updated_at", cutoff)
        .order("updated_at")
        .limit(limit)
        .execute().data or []
    )

    refreshed = 0
    queued = 0
    errors = 0

    for lead in stale:
        lead_id = lead["id"]
        try:
            # Regenerate preview (forces a new variant)
            from agents.preview_generator import run as gen_preview
            gen_preview(lead_id)
            refreshed += 1

            # Get the new preview URL
            preview = (
                db.table("previews")
                .select("preview_url")
                .eq("lead_id", lead_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute().data or [{}]
            )[0]

            preview_url = preview.get("preview_url", "")
            name = lead.get("business_name", "there")

            if preview_url:
                msg = (
                    f"Hi, just updated your free preview with some new photos — "
                    f"have a look: {preview_url}\n\n"
                    f"Happy to chat through it if you want. Any questions just reply here."
                )
                db.table("outreach_messages").insert({
                    "lead_id": lead_id,
                    "channel": "whatsapp",
                    "direction": "outbound",
                    "body": msg,
                    "status": "queued",
                    "approved_by_founder": True,
                }).execute()
                queued += 1

        except Exception as e:
            logger.error(f"[preview_refresher] Failed for lead {lead_id}: {e}")
            errors += 1
            continue

    log_agent_action(
        db, "preview_refresher", "refresh_run", None, "success" if not errors else "warning",
        {"stale_found": len(stale), "refreshed": refreshed, "queued": queued, "errors": errors},
    )

    return {"stale_found": len(stale), "refreshed": refreshed, "queued": queued, "errors": errors}
