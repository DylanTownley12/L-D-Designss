"""
Cron HTTP triggers for the trades jobs.

The jobs run automatically via APScheduler at 08:00 and 18:00 Europe/London
(see tasks/scheduler.py). These endpoints let you ALSO fire them manually, or
from an external scheduler (e.g. a Vercel/GitHub cron that POSTs here) — which
is how the brief's "Vercel cron" maps onto this FastAPI + Railway stack.

Founders only — pass the ops key as ?key=… or the X-Ops-Key header.
"""
import logging
from datetime import date

from fastapi import APIRouter, Header, Query, HTTPException
from typing import Optional

from config import settings
from agents import trades
from utils import telegram

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cron", tags=["cron"])


def _auth(key: Optional[str], x_ops_key: Optional[str]):
    if (key or x_ops_key) != settings.ops_key_resolved:
        raise HTTPException(status_code=401, detail="Invalid ops key")


@router.post("/morning")
async def cron_morning(post: bool = True,
                       key: Optional[str] = Query(default=None),
                       x_ops_key: Optional[str] = Header(default=None)):
    """08:00 job: Dial Manager call lists + Revenue Reporter → Telegram."""
    _auth(key, x_ops_key)
    try:
        dial = trades.dial_today(post_to_telegram=post)
        report = trades.revenue_report_text(weekly=(date.today().weekday() == 0))
        if post:
            telegram.broadcast_founders(report)
        return {"ok": True, "dial": dial, "report": report,
                "telegram": settings.telegram_enabled}
    except Exception as e:
        logger.error(f"[cron/morning] failed — migration not run? {e}", exc_info=True)
        raise HTTPException(status_code=503,
                            detail="Morning job couldn't run — run db/migrations.sql in Supabase first.")


@router.post("/evening")
async def cron_evening(post: bool = True,
                       key: Optional[str] = Query(default=None),
                       x_ops_key: Optional[str] = Header(default=None)):
    """18:00 job: Follow-up agent drafts → Telegram (drafts only, never sends)."""
    _auth(key, x_ops_key)
    try:
        r = trades.followup_run(post_to_telegram=post)
        r["telegram"] = settings.telegram_enabled
        return r
    except Exception as e:
        logger.error(f"[cron/evening] failed — migration not run? {e}", exc_info=True)
        raise HTTPException(status_code=503,
                            detail="Evening job couldn't run — run db/migrations.sql in Supabase first.")
