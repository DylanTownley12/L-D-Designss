"""
Gmail Reply Poller
Checks the Gmail INBOX every 30 minutes for replies to outreach emails.
Matches by In-Reply-To header against stored gmail_message_id values.
When a match is found, marks the lead as replied and notifies Dylan.
"""
import imaplib
import email
import logging
from datetime import datetime, timedelta, timezone
from db.client import get_db
from config import settings
from utils.helpers import log_agent_action

logger = logging.getLogger(__name__)


def _connect_imap() -> imaplib.IMAP4_SSL | None:
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(settings.GMAIL_ADDRESS, settings.GMAIL_APP_PASSWORD)
        return mail
    except Exception as e:
        logger.error(f"[gmail_poller] IMAP connect failed: {e}")
        return None


def _get_recent_message_ids(db) -> dict[str, dict]:
    """
    Return a map of gmail_message_id → {message_id, lead_id, channel}
    for outreach messages sent in the last 30 days that have a gmail_message_id stored.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    result = (
        db.table("outreach_messages")
        .select("id, lead_id, gmail_message_id, channel")
        .eq("channel", "email")
        .eq("direction", "outbound")
        .eq("status", "sent")
        .not_.is_("gmail_message_id", "null")
        .gte("sent_at", cutoff)
        .execute()
    )
    mapping = {}
    for row in (result.data or []):
        mid = (row.get("gmail_message_id") or "").strip()
        if mid:
            mapping[mid] = {
                "message_id": row["id"],
                "lead_id": row["lead_id"],
                "channel": row["channel"],
            }
    return mapping


def _already_logged(db, lead_id: str) -> bool:
    """True if this lead already has an inbound email reply recorded."""
    result = (
        db.table("outreach_messages")
        .select("id")
        .eq("lead_id", lead_id)
        .eq("channel", "email")
        .eq("direction", "inbound")
        .execute()
    )
    return bool(result.data)


def run() -> dict:
    """
    Poll Gmail INBOX for replies. Called by scheduler every 30 minutes.
    Only processes emails received in the last 48 hours to keep it fast.
    """
    if not settings.GMAIL_ADDRESS or not settings.GMAIL_APP_PASSWORD:
        logger.warning("[gmail_poller] Gmail credentials not configured — skipping")
        return {"checked": 0, "replies_found": 0, "error": "credentials missing"}

    start = datetime.now()
    db = get_db()

    known_ids = _get_recent_message_ids(db)
    if not known_ids:
        logger.info("[gmail_poller] No sent emails with gmail_message_id to match against")
        return {"checked": 0, "replies_found": 0}

    mail = _connect_imap()
    if not mail:
        return {"checked": 0, "replies_found": 0, "error": "imap connect failed"}

    replies_found = 0
    checked = 0

    try:
        mail.select("INBOX")

        # Search for emails received in the last 48 hours
        since_date = (datetime.now() - timedelta(hours=48)).strftime("%d-%b-%Y")
        _, msg_nums = mail.search(None, f'(SINCE "{since_date}")')

        ids = msg_nums[0].split() if msg_nums[0] else []
        logger.info(f"[gmail_poller] Scanning {len(ids)} recent inbox emails")

        for num in ids:
            try:
                _, data = mail.fetch(num, "(RFC822.SIZE BODY.PEEK[HEADER])")
                if not data or not data[0]:
                    continue

                raw_header = data[0][1]
                parsed = email.message_from_bytes(raw_header)

                in_reply_to = (parsed.get("In-Reply-To") or "").strip()
                references = (parsed.get("References") or "").strip()
                sender = parsed.get("From") or ""
                subject = parsed.get("Subject") or ""

                checked += 1

                # Check if this reply matches any of our sent messages
                matched_info = None
                for mid, info in known_ids.items():
                    if mid in in_reply_to or mid in references:
                        matched_info = info
                        break

                if not matched_info:
                    continue

                lead_id = matched_info["lead_id"]

                # Skip if we've already logged a reply for this lead
                if _already_logged(db, lead_id):
                    continue

                # Fetch the email body (first 500 chars is enough)
                _, body_data = mail.fetch(num, "(BODY[TEXT])")
                body_text = ""
                if body_data and body_data[0]:
                    raw_body = body_data[0][1]
                    try:
                        body_text = raw_body.decode("utf-8", errors="replace")[:500].strip()
                    except Exception:
                        body_text = "Reply received (could not decode body)"

                reply_summary = body_text or f"Email reply from {sender}"

                # Log as inbound message
                db.table("outreach_messages").insert({
                    "lead_id": lead_id,
                    "channel": "email",
                    "direction": "inbound",
                    "body": reply_summary,
                    "status": "replied",
                }).execute()

                # Notify Dylan + update lead status + stop follow-up
                from agents import notification_agent, followup_agent
                notification_agent.notify_reply_received(lead_id, reply_summary)
                followup_agent.stop_sequence(lead_id, reason="replied")

                replies_found += 1
                logger.info(f"[gmail_poller] Reply detected for lead {lead_id} from {sender}")

            except Exception as e:
                logger.warning(f"[gmail_poller] Error processing email {num}: {e}")

    except Exception as e:
        logger.error(f"[gmail_poller] IMAP scan failed: {e}")
    finally:
        try:
            mail.logout()
        except Exception:
            pass

    duration_ms = int((datetime.now() - start).total_seconds() * 1000)
    log_agent_action(db, "gmail_poller", "scan_inbox", None, "success", {
        "checked": checked,
        "replies_found": replies_found,
        "known_message_ids": len(known_ids),
    }, duration_ms)

    logger.info(f"[gmail_poller] Scanned {checked} emails, found {replies_found} replies")
    return {"checked": checked, "replies_found": replies_found}
