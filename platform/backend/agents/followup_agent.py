"""
Follow-Up Agent
Runs the automatic follow-up sequence:
  Day 1  → initial outreach (handled by outreach sender)
  Day 3  → follow-up
  Day 7  → reminder
  Day 14 → final message

Called by the scheduler. Checks which leads need follow-up and queues messages.
"""
import logging
from datetime import datetime, timedelta
from db.client import get_db
from agents import outreach_writer, qc_agent
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)

SEQUENCE = [
    {"day": 3,  "field": "day_3_sent_at",  "sequence_day": 3},
    {"day": 7,  "field": "day_7_sent_at",  "sequence_day": 7},
    {"day": 14, "field": "day_14_sent_at", "sequence_day": 14},
]


def _get_preview_url(db, lead_id: str) -> str | None:
    result = (
        db.table("previews")
        .select("preview_url")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0]["preview_url"] if result.data else None


def _should_send_followup(sequence: dict, step: dict) -> bool:
    """Check if enough time has passed for this step."""
    sent_at_str = sequence.get("initial_sent_at")
    if not sent_at_str:
        return False
    if sequence.get("stopped"):
        return False
    if sequence.get(step["field"]):
        return False  # Already sent this step

    initial_sent_at = datetime.fromisoformat(sent_at_str.replace("Z", "+00:00"))
    now = datetime.now(initial_sent_at.tzinfo)
    days_elapsed = (now - initial_sent_at).days
    return days_elapsed >= step["day"]


def run() -> dict:
    """
    Check all active follow-up sequences and queue any messages that are due.
    Returns a summary of what was queued.
    """
    try:
        get_db().table("agent_logs").insert({"agent_name": "followup_agent", "action": "heartbeat", "status": "running"}).execute()
    except Exception:
        pass
    start = datetime.now()
    db = get_db()
    queued = 0
    skipped = 0
    errors = 0

    # Get active sequences (not stopped) — process in batches to cap memory usage
    result = (
        db.table("follow_up_sequences")
        .select("*, leads(*)")
        .eq("stopped", False)
        .limit(500)
        .execute()
    )

    sequences = result.data or []

    for sequence in sequences:
        lead = sequence.get("leads") or {}
        lead_id = sequence.get("lead_id")

        # Stop sequence if lead has replied or is converted
        if lead.get("status") in ("replied", "interested", "converted", "not_interested", "do_not_contact"):
            db.table("follow_up_sequences").update({
                "stopped": True,
                "stop_reason": lead.get("status"),
            }).eq("id", sequence["id"]).execute()
            logger.info(f"Stopped follow-up for {lead.get('business_name')} — status: {lead.get('status')}")
            skipped += 1
            continue

        channel = sequence.get("channel", "email")
        preview_url = _get_preview_url(db, lead_id)

        for step in SEQUENCE:
            if not _should_send_followup(sequence, step):
                continue

            try:
                # Generate message
                content = outreach_writer.generate_outreach(
                    lead=lead,
                    channel=channel,
                    preview_url=preview_url,
                    sequence_day=step["sequence_day"],
                )

                # QC check
                qc = qc_agent.validate(
                    channel=channel,
                    subject=content.get("subject"),
                    body=content["body"],
                    preview_url=preview_url,
                    lead=lead,
                )

                if not qc["passed"]:
                    logger.warning(f"Follow-up QC failed for {lead.get('business_name')}: {qc['issues']}")
                    errors += 1
                    continue

                # Queue the message
                db.table("outreach_messages").insert({
                    "lead_id": lead_id,
                    "channel": channel,
                    "direction": "outbound",
                    "subject": content.get("subject"),
                    "body": content["body"],
                    "status": "queued",
                    "sequence_day": step["sequence_day"],
                    "ai_generated": True,
                    "approved_by_founder": not __import__("config").settings.REQUIRE_APPROVAL,
                }).execute()

                # Mark step as sent in sequence
                db.table("follow_up_sequences").update({
                    step["field"]: datetime.now().isoformat(),
                }).eq("id", sequence["id"]).execute()

                logger.info(f"Queued day-{step['sequence_day']} follow-up for {lead.get('business_name')}")
                queued += 1
                break  # Only process one step per sequence per run

            except Exception as e:
                logger.error(f"Follow-up error for lead {lead_id}: {e}")
                errors += 1

    duration_ms = int((datetime.now() - start).total_seconds() * 1000)
    log_agent_action(db, "followup_agent", "process_sequences", None, "success",
                     {"sequences": len(sequences), "queued": queued, "skipped": skipped, "errors": errors},
                     duration_ms)

    return {"sequences_checked": len(sequences), "queued": queued, "skipped": skipped, "errors": errors}


def start_sequence(lead_id: str, channel: str = "email") -> dict:
    """
    Start a follow-up sequence for a lead after initial outreach is sent.
    """
    db = get_db()

    # Check if sequence already exists
    existing = db.table("follow_up_sequences").select("id").eq("lead_id", lead_id).execute()
    if existing.data:
        return {"status": "already_exists", "sequence_id": existing.data[0]["id"]}

    result = db.table("follow_up_sequences").insert({
        "lead_id": lead_id,
        "channel": channel,
        "initial_sent_at": datetime.now().isoformat(),
    }).execute()

    return {"status": "started", "sequence_id": result.data[0]["id"] if result.data else None}


def stop_sequence(lead_id: str, reason: str = "manual_stop") -> dict:
    """Stop a follow-up sequence for a lead."""
    db = get_db()
    db.table("follow_up_sequences").update({
        "stopped": True,
        "stop_reason": reason,
    }).eq("lead_id", lead_id).execute()
    return {"status": "stopped", "reason": reason}
