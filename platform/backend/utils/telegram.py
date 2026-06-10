"""
Telegram Bot API helpers for JARVIS — raw HTTP over httpx (no extra dependency).

Everything here is defensive: if TELEGRAM_BOT_TOKEN is unset, or Telegram is
unreachable, these functions log and return False rather than raising — the rest
of the platform must keep working whether or not the bot is configured.
"""
import logging
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org/bot{token}/{method}"
MAX_LEN = 4000  # Telegram hard limit is 4096; leave headroom for safety


def _api_url(method: str) -> Optional[str]:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    return API_BASE.format(token=token, method=method)


def _chunk(text: str, size: int = MAX_LEN):
    """Split on line boundaries where possible so messages stay readable."""
    text = text or ""
    if len(text) <= size:
        return [text]
    chunks, current = [], ""
    for line in text.split("\n"):
        # A single very long line still has to be hard-split.
        while len(line) > size:
            if current:
                chunks.append(current)
                current = ""
            chunks.append(line[:size])
            line = line[size:]
        if len(current) + len(line) + 1 > size:
            chunks.append(current)
            current = line
        else:
            current = f"{current}\n{line}" if current else line
    if current:
        chunks.append(current)
    return chunks


def send_message(chat_id, text: str, parse_mode: Optional[str] = None) -> bool:
    """Send a message to one chat id. Returns True on success. Never raises."""
    url = _api_url("sendMessage")
    if not url:
        logger.warning("[telegram] TELEGRAM_BOT_TOKEN not set — cannot send message")
        return False
    ok = True
    try:
        with httpx.Client(timeout=20.0) as client:
            for part in _chunk(text):
                payload = {"chat_id": str(chat_id), "text": part, "disable_web_page_preview": True}
                if parse_mode:
                    payload["parse_mode"] = parse_mode
                r = client.post(url, json=payload)
                if r.status_code != 200:
                    logger.warning(f"[telegram] sendMessage {r.status_code}: {r.text[:200]}")
                    ok = False
    except Exception as e:
        logger.error(f"[telegram] send_message failed: {e}")
        return False
    return ok


def broadcast_founders(text: str, parse_mode: Optional[str] = None) -> int:
    """Send to every founder chat id. Returns how many sends succeeded."""
    sent = 0
    for cid in settings.founder_chat_id_list:
        if send_message(cid, text, parse_mode=parse_mode):
            sent += 1
    if not settings.founder_chat_id_list:
        logger.warning("[telegram] no FOUNDER_CHAT_IDS configured — broadcast skipped")
    return sent


def send_to_founder_code(code: str, text: str) -> bool:
    """Send to a specific founder (D or L). Falls back to broadcasting."""
    code = (code or "").upper()
    target = settings.FOUNDER_D_CHAT_ID if code == "D" else settings.FOUNDER_L_CHAT_ID
    if target and str(target).strip():
        return send_message(str(target).strip(), text)
    # No per-founder id mapped — broadcast so the message is never lost.
    return broadcast_founders(f"[{code}] {text}") > 0


def parse_update(update: dict) -> Optional[dict]:
    """
    Pull the useful bits out of a Telegram webhook update.
    Handles plain messages and edited messages. Returns None for anything
    without text (stickers, joins, etc.) so callers can ignore it cleanly.
    """
    if not isinstance(update, dict):
        return None
    msg = update.get("message") or update.get("edited_message") or update.get("channel_post")
    if not msg:
        return None
    chat = msg.get("chat") or {}
    text = msg.get("text") or msg.get("caption")
    if text is None:
        return None
    return {
        "chat_id": chat.get("id"),
        "text": text.strip(),
        "message_id": msg.get("message_id"),
        "from_name": (msg.get("from") or {}).get("first_name", ""),
    }


def set_webhook(url: str) -> dict:
    """Register the JARVIS webhook URL with Telegram. Used during setup."""
    api = _api_url("setWebhook")
    if not api:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set"}
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(api, json={"url": url, "allowed_updates": ["message", "edited_message"]})
            return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}
