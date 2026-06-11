"""
Founder notifications — the ONE place founder-facing alerts leave the system.

Channel order:
  1. OpenClaw webhook (OPENCLAW_WEBHOOK_URL) → Baz relays to the founders' WhatsApp.
  2. Telegram (if configured).
  3. Gmail (GMAIL_ADDRESS + GMAIL_APP_PASSWORD are set in Railway) → emails the
     founder (FOUNDER_EMAIL, else the Gmail account itself). This is the guaranteed
     floor: a captured lead ALWAYS reaches a human inbox even before WhatsApp is wired.

Every send (or failure) is also written to agent_events as an audit line, so the
Mission Control feed shows exactly what notification fired, on which channel,
with what payload — provable, not vibes.

HARD RULE: nothing in this module ever contacts a prospect or a client. It only
ever messages the founders. All sales/outbound is human-sent.
"""
import logging
import smtplib
from email.mime.text import MIMEText
from typing import Optional

import httpx

from config import settings
from utils import telegram

logger = logging.getLogger(__name__)

_KIND_SUBJECT = {
    "new_lead": "📞 NEW LEAD",
    "briefing": "☀️ CEO briefing",
    "followups": "✍️ Follow-up drafts",
    "call_list": "📞 Call list",
    "revenue": "📊 Revenue",
    "alert": "⚠️ Alert",
}


def _audit(kind: str, channel: str, ok: bool, text: str) -> None:
    """Write the notification to the agent feed — visible proof it fired."""
    try:
        from agents import trades
        trades.log_event("notify",
                         f"{'✅' if ok else '✕'} {kind} via {channel}: {text[:140]}",
                         "success" if ok else "error",
                         {"channel": channel, "ok": ok, "kind": kind,
                          "payload": text[:500], "metric_ok": ok})
    except Exception:
        pass


def _send_gmail(text: str, kind: str) -> bool:
    """Email the founders via the Gmail creds already in Railway. Never raises."""
    if not (settings.GMAIL_ADDRESS and settings.GMAIL_APP_PASSWORD):
        return False
    try:
        to_addr = (settings.FOUNDER_EMAIL or settings.GMAIL_ADDRESS).strip()
        msg = MIMEText(text, "plain", "utf-8")
        msg["From"] = settings.GMAIL_ADDRESS
        msg["To"] = to_addr
        msg["Subject"] = f"{_KIND_SUBJECT.get(kind, '🔔')} — L&D Mission Control"
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as server:
            server.login(settings.GMAIL_ADDRESS, settings.GMAIL_APP_PASSWORD)
            server.sendmail(settings.GMAIL_ADDRESS, to_addr, msg.as_string())
        return True
    except Exception as e:
        logger.error(f"[notify] gmail send failed: {e}")
        return False


def notify_founders(text: str, kind: str = "alert", meta: Optional[dict] = None) -> dict:
    """Send one internal message to the founders. Tries OpenClaw → Telegram → Gmail.
    Returns {channel, ok, ...} and audits to agent_events. Never raises."""
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
                _audit(kind, "openclaw", True, text)
                return {"channel": "openclaw", "ok": True, "status": r.status_code}
            logger.warning(f"[notify] openclaw webhook {r.status_code}: {r.text[:200]}")
        except Exception as e:
            logger.error(f"[notify] openclaw webhook failed: {e}")

    if settings.telegram_enabled:
        sent = telegram.broadcast_founders(text)
        if sent:
            _audit(kind, "telegram", True, text)
            return {"channel": "telegram", "ok": True, "sent": sent}

    if _send_gmail(text, kind):
        _audit(kind, "gmail", True, text)
        return {"channel": "gmail", "ok": True,
                "to": settings.FOUNDER_EMAIL or settings.GMAIL_ADDRESS}

    logger.warning(f"[notify] NO channel delivered (set OPENCLAW_WEBHOOK_URL) — dropped: {text[:80]}")
    _audit(kind, "none", False, text)
    return {"channel": "none", "ok": False, "reason": "no_channel"}


def notify_founder_code(code: str, text: str, kind: str = "alert") -> dict:
    """Notify one founder (D or L) where the channel supports it; otherwise the
    message goes to the shared channel tagged with their letter."""
    code = (code or "").upper()
    if (settings.OPENCLAW_WEBHOOK_URL or "").strip():
        return notify_founders(f"[{code}] {text}", kind=kind, meta={"founder": code})
    if settings.telegram_enabled:
        ok = telegram.send_to_founder_code(code, text)
        _audit(kind, "telegram", bool(ok), text)
        return {"channel": "telegram", "ok": bool(ok)}
    return notify_founders(f"[{code}] {text}", kind=kind)
