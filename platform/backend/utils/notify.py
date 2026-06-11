"""
Founder notifications — the ONE place founder-facing alerts leave the system.

Primary channel: the OpenClaw webhook (OPENCLAW_WEBHOOK_URL) → relays to the
founders' WhatsApp via Baz. Telegram is a fallback only (kept for back-compat,
usually unset on this deployment). If neither is configured we log and return
cleanly — the platform never depends on delivery succeeding.

HARD RULE: nothing in this module ever contacts a prospect or a client. It only
ever messages the two founders (D and L). All sales/outbound is human-sent.
"""
import logging
from typing import Optional

import httpx

from config import settings
from utils import telegram

logger = logging.getLogger(__name__)


def notify_founders(text: str, kind: str = "alert", meta: Optional[dict] = None) -> dict:
    """Send one internal message to the founders. Returns {channel, ok, ...}.
    Never raises — a delivery failure must never break the caller's real work."""
    text = (text or "").strip()
    if not text:
        return {"channel": "none", "ok": False, "reason": "empty"}

    url = (settings.OPENCLAW_WEBHOOK_URL or "").strip()
    if url:
        try:
            with httpx.Client(timeout=15.0) as client:
                r = client.post(url, json={
                    "text": text, "kind": kind, "meta": meta or {}, "source": "jarvis",
                })
            if 200 <= r.status_code < 300:
                return {"channel": "openclaw", "ok": True, "status": r.status_code}
            logger.warning(f"[notify] openclaw webhook {r.status_code}: {r.text[:200]}")
        except Exception as e:
            logger.error(f"[notify] openclaw webhook failed: {e}")

    # Fallback: Telegram, only if it's actually configured.
    if settings.telegram_enabled:
        sent = telegram.broadcast_founders(text)
        if sent:
            return {"channel": "telegram", "ok": True, "sent": sent}

    logger.warning(f"[notify] no founder-notification channel configured "
                   f"(set OPENCLAW_WEBHOOK_URL) — dropped: {text[:80]}")
    return {"channel": "none", "ok": False, "reason": "no_channel"}


def notify_founder_code(code: str, text: str, kind: str = "alert") -> dict:
    """Notify one founder (D or L) where the channel supports it. OpenClaw gets a
    tagged single message; Telegram uses the per-founder chat if mapped."""
    code = (code or "").upper()
    if (settings.OPENCLAW_WEBHOOK_URL or "").strip():
        return notify_founders(f"[{code}] {text}", kind=kind, meta={"founder": code})
    if settings.telegram_enabled:
        ok = telegram.send_to_founder_code(code, text)
        return {"channel": "telegram", "ok": bool(ok)}
    return notify_founders(f"[{code}] {text}", kind=kind)
