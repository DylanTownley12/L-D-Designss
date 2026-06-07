"""
safety.py — central guardrails for the autonomous system.

One job: make sure nothing the agents do at 3am can quietly cost real money or
get an account banned. Three protections, all controlled from config / Railway vars:

  1. Daily spend cap   — estimated LLM/API spend per day (DAILY_SPEND_CAP_GBP).
                         When today's spend passes the cap, guarded jobs stop for the day.
  2. Kill-switch       — if no revenue for SAFETY_KILL_SWITCH_DAYS days, alert the founder
                         (mode "alert") or pause autonomous sends (mode "pause").
  3. Volume helpers    — per-channel daily send counts so outreach stays under the caps
                         that got us banned before (consumed by the send layer).

Design rules:
  * Master switch SAFETY_ENABLED — set False in Railway to disable everything instantly.
  * Fail OPEN on internal errors: a database blip must never halt the business. Only a
    real, measured cap breach fails CLOSED (blocks).
  * Every trip alerts the founder at most once per day (notifications table + email).
"""
import logging
import functools
from collections import namedtuple
from datetime import datetime, timedelta, timezone

from config import settings

logger = logging.getLogger(__name__)

Guard = namedtuple("Guard", ["allowed", "reason"])

# Approximate £ per 1,000,000 tokens. Backstop accuracy only — edit if rates change.
PRICE_GBP_PER_1M = {
    "gpt-4o-mini":               {"in": 0.12, "out": 0.47},
    "claude-haiku-4-5":          {"in": 0.80, "out": 4.00},
    "claude-haiku-4-5-20251001": {"in": 0.80, "out": 4.00},
}
_DEFAULT_RATE = {"in": 1.00, "out": 5.00}  # unknown model → assume pricey (safe)

# In-process de-dupe so one bad day doesn't spam the founder with the same alert.
_alerted: set = set()


def _db():
    from db.client import get_db
    return get_db()


def _utc_day_start() -> str:
    return datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()


# ── 1. Spend tracking ─────────────────────────────────────────────────────────

def record_spend(agent: str, model: str, tokens_in: int = 0, tokens_out: int = 0) -> None:
    """Log the estimated cost of one LLM call. Never raises."""
    try:
        rate = PRICE_GBP_PER_1M.get(model, _DEFAULT_RATE)
        cost = (tokens_in / 1_000_000) * rate["in"] + (tokens_out / 1_000_000) * rate["out"]
        _db().table("spend_log").insert({
            "agent": agent,
            "model": model,
            "tokens_in": int(tokens_in or 0),
            "tokens_out": int(tokens_out or 0),
            "est_cost_gbp": round(cost, 5),
        }).execute()
    except Exception as e:
        logger.warning(f"[safety] record_spend failed (non-fatal): {e}")


def today_spend_gbp() -> float:
    """Sum of today's estimated spend. Fails open (returns 0.0) on error."""
    try:
        rows = (_db().table("spend_log").select("est_cost_gbp")
                .gte("created_at", _utc_day_start()).execute().data or [])
        return round(sum(float(r.get("est_cost_gbp") or 0) for r in rows), 5)
    except Exception as e:
        logger.warning(f"[safety] today_spend_gbp failed (assuming 0): {e}")
        return 0.0


# ── 2. Outreach volume helpers (consumed by the send layer — increment 2) ─────

def outreach_count_today(channel: str) -> int:
    """How many outbound messages were sent on this channel today.
    Filters by sent_at (not created_at) — messages can be queued one day and sent the next."""
    try:
        rows = (_db().table("outreach_messages").select("id")
                .eq("channel", channel).eq("direction", "outbound")
                .in_("status", ["sent", "delivered"])
                .not_.is_("sent_at", "null")
                .gte("sent_at", _utc_day_start()).execute().data or [])
        return len(rows)
    except Exception as e:
        logger.warning(f"[safety] outreach_count_today failed (assuming 0): {e}")
        return 0


_CHANNEL_CAP = {
    "whatsapp":  lambda: settings.MAX_WHATSAPP_PER_DAY,
    "instagram": lambda: settings.MAX_INSTAGRAM_PER_DAY,
    "email":     lambda: settings.MAX_EMAILS_PER_DAY,
    "sms":       lambda: settings.MAX_SMS_PER_DAY,
}


def can_send(channel: str, n: int = 1) -> Guard:
    """Whether `n` more messages may go out on `channel` today (ban protection)."""
    if not settings.SAFETY_ENABLED:
        return Guard(True, "safety disabled")
    cap_fn = _CHANNEL_CAP.get(channel)
    if not cap_fn:
        return Guard(True, "no cap for channel")
    cap = cap_fn()
    sent = outreach_count_today(channel)
    if sent + n > cap:
        return Guard(False, f"{channel} daily cap reached ({sent}/{cap})")
    return Guard(True, f"{sent}/{cap} sent")


# ── 3. Kill-switch ────────────────────────────────────────────────────────────

def check_kill_switch() -> Guard:
    """
    Tripped when the business has run >= N days with no revenue in the last N days.
    Returns Guard(allowed=False, reason) when tripped. Fails open on error and never
    trips a brand-new, pre-revenue system.
    """
    try:
        days = settings.SAFETY_KILL_SWITCH_DAYS
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        # System age — don't trip before we've even had a fair run.
        first = (_db().table("leads").select("created_at")
                 .order("created_at").limit(1).execute().data or [])
        if not first:
            return Guard(True, "no leads yet")
        first_at = first[0].get("created_at", "")
        if not (first_at and first_at < cutoff):
            return Guard(True, "system younger than kill-switch window")

        # Recent revenue? paid websites or converted leads in the window.
        paid = (_db().table("deployed_websites").select("id,payment_received,payment_date")
                .gte("payment_date", cutoff).execute().data or [])
        if any(p.get("payment_received") for p in paid):
            return Guard(True, "revenue within window")
        converted = (_db().table("leads").select("id")
                     .eq("status", "converted").gte("updated_at", cutoff).execute().data or [])
        if converted:
            return Guard(True, "conversion within window")

        return Guard(False, f"no revenue in {days} days")
    except Exception as e:
        logger.warning(f"[safety] kill-switch check failed (assuming OK): {e}")
        return Guard(True, "check failed — failing open")


# ── Founder alerts (reuse existing notifications + email path) ─────────────────

def alert_founder(key: str, title: str, body: str = "") -> None:
    """Alert at most once per day per key. Never raises."""
    stamp = (key, datetime.now(timezone.utc).date().isoformat())
    if stamp in _alerted:
        return
    _alerted.add(stamp)
    try:
        _db().table("notifications").insert(
            {"type": "safety", "title": title, "body": body}
        ).execute()
    except Exception as e:
        logger.warning(f"[safety] notification insert failed: {e}")
    try:
        from agents.notification_agent import _send_founder_email
        _send_founder_email(f"[L&D Safety] {title}", body or title)
    except Exception as e:
        logger.warning(f"[safety] founder email failed: {e}")
    logger.warning(f"[safety] ALERT {title} — {body}")


# ── Preflight gate (used by the scheduler) ────────────────────────────────────

def preflight(job_name: str) -> Guard:
    """Decide whether a guarded scheduled job may run right now."""
    if not settings.SAFETY_ENABLED:
        return Guard(True, "safety disabled")

    spend = today_spend_gbp()
    cap = settings.DAILY_SPEND_CAP_GBP
    if spend >= cap:
        alert_founder(
            "spend_cap",
            f"Daily spend cap hit (£{spend:.2f} / £{cap:.2f})",
            f"Autonomous jobs are paused for the rest of today; '{job_name}' was blocked. "
            f"Raise DAILY_SPEND_CAP_GBP in Railway if this is expected.",
        )
        return Guard(False, f"spend cap £{spend:.2f}/£{cap:.2f}")

    ks = check_kill_switch()
    if not ks.allowed:
        mode = (settings.SAFETY_KILL_SWITCH_MODE or "alert").lower()
        alert_founder(
            "kill_switch",
            f"Kill-switch: {ks.reason}",
            f"No revenue in {settings.SAFETY_KILL_SWITCH_DAYS} days. Mode={mode}. "
            + ("Autonomous sends paused." if mode == "pause" else "Still running (alert-only)."),
        )
        if mode == "pause":
            return Guard(False, f"kill-switch ({ks.reason})")

    return Guard(True, "ok")


def guarded(job_name: str):
    """Decorator: run an async scheduled job only if preflight allows."""
    def deco(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            g = preflight(job_name)
            if not g.allowed:
                logger.warning(f"[safety] BLOCKED {job_name}: {g.reason}")
                return {"blocked": True, "reason": g.reason}
            return await fn(*args, **kwargs)
        return wrapper
    return deco
