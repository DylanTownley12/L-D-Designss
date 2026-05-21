"""
n8n integration — fires webhook events to n8n workflows.
Set N8N_WEBHOOK_BASE_URL in .env to enable.
"""
import logging
import requests
from typing import Any

logger = logging.getLogger(__name__)


def trigger(event: str, payload: dict[str, Any]) -> bool:
    """POST to an n8n webhook URL. Non-blocking: logs errors, never raises."""
    from config import settings

    if not settings.N8N_WEBHOOK_BASE_URL:
        return False

    url = f"{settings.N8N_WEBHOOK_BASE_URL.rstrip('/')}/webhook/{event}"
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"X-N8N-Secret": settings.N8N_SECRET},
            timeout=5,
        )
        resp.raise_for_status()
        logger.info("n8n event sent: %s", event)
        return True
    except Exception as exc:
        logger.warning("n8n trigger failed [%s]: %s", event, exc)
        return False
