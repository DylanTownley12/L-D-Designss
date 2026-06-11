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
from fastapi.concurrency import run_in_threadpool
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
    """The daily run: all five agents + ONE founders' briefing to Telegram."""
    _auth(key, x_ops_key)
    try:
        return await run_in_threadpool(trades.daily_briefing, post_to_telegram=post)
    except Exception as e:
        logger.error(f"[cron/morning] failed — migration not run? {e}", exc_info=True)
        raise HTTPException(status_code=503,
                            detail="Daily run couldn't execute — run db/migrations.sql in Supabase first.")


@router.post("/evening")
async def cron_evening(post: bool = True,
                       key: Optional[str] = Query(default=None),
                       x_ops_key: Optional[str] = Header(default=None)):
    """18:00 job: Follow-up agent drafts → Telegram (drafts only, never sends)."""
    _auth(key, x_ops_key)
    try:
        r = await run_in_threadpool(trades.followup_run, post_to_telegram=post)
        r["telegram"] = settings.telegram_enabled
        return r
    except Exception as e:
        logger.error(f"[cron/evening] failed — migration not run? {e}", exc_info=True)
        raise HTTPException(status_code=503,
                            detail="Evening job couldn't run — run db/migrations.sql in Supabase first.")
