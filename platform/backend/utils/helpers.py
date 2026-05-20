import re
import logging

logger = logging.getLogger(__name__)


def clean_phone(raw: str) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"[^\d+]", "", raw)
    return digits if len(digits) >= 7 else None


def clean_postcode(raw: str) -> str | None:
    if not raw:
        return None
    cleaned = raw.upper().strip()
    postcode_re = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$")
    return cleaned if postcode_re.match(cleaned) else None


def log_agent_action(
    db,
    agent_name: str,
    action: str,
    lead_id: str | None,
    status: str,
    details: dict | None = None,
    duration_ms: int = 0,
    error_message: str | None = None,
) -> None:
    try:
        db.table("agent_logs").insert({
            "agent_name": agent_name,
            "action": action,
            "lead_id": lead_id,
            "status": status,
            "details": details or {},
            "duration_ms": duration_ms,
            "error_message": error_message,
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to write agent log: {e}")


def truncate(text: str, max_len: int = 100) -> str:
    return text[:max_len] + "..." if text and len(text) > max_len else (text or "")
