"""
Background task scheduler — Europe/London timezone
Daily pipeline: 5:55am health check → 6am leads → 6:30am previews → 7am WhatsApp → 9am follow-ups
Each job is independently error-handled so one failure never stops the others.
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

import safety

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone='Europe/London')

TZ = 'Europe/London'


# ── Health check ────────────────────────────────────────────────────────────

async def _morning_health_check():
    try:
        from db.client import get_db
        from datetime import date, timedelta
        db = get_db()
        today = date.today().isoformat()
        yesterday = (date.today() - timedelta(days=1)).isoformat()

        def _count(table, **filters):
            q = db.table(table).select("id", count="exact")
            for k, v in filters.items():
                q = q.eq(k, v)
            return q.execute().count or 0

        statuses = ['new', 'preview_ready', 'outreach_sent', 'replied', 'interested', 'converted']
        leads_by_status = {s: _count("leads", status=s) for s in statuses}

        wa_queued = _count("outreach_messages", status="queued", channel="whatsapp", direction="outbound")

        valid_previews = (
            db.table("previews").select("id", count="exact")
            .ilike("preview_url", "%/previews/serve/%")
            .execute().count or 0
        )

        replied_24h = (
            db.table("leads").select("id", count="exact")
            .gte("updated_at", f"{yesterday}T00:00:00")
            .in_("status", ["replied", "interested"])
            .execute().count or 0
        )

        logger.info(
            "\n" + "=" * 55 + "\n"
            f"  MORNING HEALTH CHECK — {today}\n"
            + "=" * 55 + "\n"
            f"  Leads:          {leads_by_status}\n"
            f"  WA queued:      {wa_queued}\n"
            f"  Valid previews: {valid_previews}\n"
            f"  Replies (24h):  {replied_24h}\n"
            + "=" * 55
        )
    except Exception as e:
        logger.error(f"[health_check] Failed: {e}", exc_info=True)


# ── Pipeline jobs ────────────────────────────────────────────────────────────

async def _find_new_leads():
    try:
        import random
        from agents.lead_finder import run, UK_CITIES
        cities = random.sample(UK_CITIES, min(20, len(UK_CITIES)))
        result = run(cities=cities, pages_per_city=3)
        logger.info(f"[lead_finder] {result}")
    except Exception as e:
        logger.error(f"[lead_finder] Failed: {e}", exc_info=True)


async def _generate_previews():
    try:
        from agents.preview_generator import run_batch
        result = run_batch(limit=50)
        logger.info(f"[preview_generator] {result}")
    except Exception as e:
        logger.error(f"[preview_generator] Failed: {e}", exc_info=True)


async def _whatsapp_campaign():
    try:
        from agents.outreach_writer import generate_whatsapp_campaign
        result = generate_whatsapp_campaign(limit=30)
        logger.info(f"[whatsapp_campaign] {result}")
    except Exception as e:
        logger.error(f"[whatsapp_campaign] Failed: {e}", exc_info=True)


async def _instagram_campaign():
    try:
        from agents.outreach_writer import generate_instagram_campaign
        result = generate_instagram_campaign(limit=30)
        logger.info(f"[instagram_campaign] {result}")
    except Exception as e:
        logger.error(f"[instagram_campaign] Failed: {e}", exc_info=True)


async def _strategy_brief():
    try:
        from api.strategy import generate_brief
        result = generate_brief()
        logger.info(f"[strategy_brief] verdict={result.get('verdict', '')[:80]}")
    except Exception as e:
        logger.error(f"[strategy_brief] Failed: {e}", exc_info=True)


async def _refill_queues():
    try:
        from agents.outreach_writer import refill_queues
        result = refill_queues()
        logger.info(f"[refill_queues] {result}")
    except Exception as e:
        logger.error(f"[refill_queues] Failed: {e}", exc_info=True)


async def _check_followups():
    try:
        from agents.followup_agent import run
        result = run()
        logger.info(f"[followup_agent] {result}")
    except Exception as e:
        logger.error(f"[followup_agent] Failed: {e}", exc_info=True)


async def _process_queue():
    try:
        from agents.outreach_sender import process_queue
        result = process_queue(max_send=50)
        logger.info(f"[outreach_sender] {result}")
    except Exception as e:
        logger.error(f"[outreach_sender] Failed: {e}", exc_info=True)


async def _analyze_new_leads():
    try:
        from agents.website_analyzer import run
        result = run(batch_size=100)
        logger.info(f"[website_analyzer] {result}")
    except Exception as e:
        logger.error(f"[website_analyzer] Failed: {e}", exc_info=True)


async def _ceo_check():
    try:
        from agents.ceo_agent import run
        result = run()
        logger.info(f"[ceo_agent] {result['overall'].upper()} — {len(result['issues'])} issues, {len(result['warnings'])} warnings")
    except Exception as e:
        logger.error(f"[ceo_agent] Failed: {e}", exc_info=True)


async def _ceo_daily_briefing():
    try:
        from agents.ceo_agent import send_daily_briefing
        send_daily_briefing()
    except Exception as e:
        logger.error(f"[ceo_agent] Daily briefing failed: {e}", exc_info=True)


async def _research_run():
    try:
        from agents.research_agent import run
        result = run()
        logger.info(f"[research_agent] {result.get('cities_analysed', 0)} cities analysed")
    except Exception as e:
        logger.error(f"[research_agent] Failed: {e}", exc_info=True)


async def _cmo_run():
    try:
        from agents.cmo_agent import run
        result = run()
        logger.info(f"[cmo_agent] trend={result.get('trend')}, reply_rate={result.get('overall_reply_rate')}%")
    except Exception as e:
        logger.error(f"[cmo_agent] Failed: {e}", exc_info=True)


async def _sales_run():
    try:
        from agents.sales_agent import run
        result = run()
        logger.info(f"[sales_agent] drafted={result.get('drafted', 0)}")
    except Exception as e:
        logger.error(f"[sales_agent] Failed: {e}", exc_info=True)


async def _dev_run():
    try:
        from agents.dev_agent import run
        result = run()
        logger.info(f"[dev_agent] {len(result.get('alerts', []))} alerts")
    except Exception as e:
        logger.error(f"[dev_agent] Failed: {e}", exc_info=True)


async def _analyst_run():
    try:
        from agents.analyst_agent import run
        result = run()
        logger.info(f"[analyst_agent] {len(result.get('insights', []))} insights")
    except Exception as e:
        logger.error(f"[analyst_agent] Failed: {e}", exc_info=True)


async def _claude_tasks():
    try:
        from agents.claude_agent import run
        result = run()
        logger.info(f"[claude_agent] Daily tasks: {list(result.keys())}")
    except Exception as e:
        logger.error(f"[claude_agent] Failed: {e}", exc_info=True)


async def _refresh_stale_previews():
    try:
        from agents.preview_refresher import run
        result = run()
        logger.info(f"[preview_refresher] stale={result['stale_found']}, refreshed={result['refreshed']}, queued={result['queued']}")
    except Exception as e:
        logger.error(f"[preview_refresher] Failed: {e}", exc_info=True)


async def _enrich_leads():
    try:
        from agents.lead_enricher import run
        result = run(limit=100)
        logger.info(f"[lead_enricher] checked={result['checked']}, emails={result['emails_found']}, instagram={result['instagram_found']}")
    except Exception as e:
        logger.error(f"[lead_enricher] Failed: {e}", exc_info=True)


async def _seed_team_backlog():
    """Daily: feed the 9-agent team work from the preview_ready backlog so they
    never sit idle. Capped + idempotent + safe (creates tasks only)."""
    try:
        from api.team import seed_backlog
        result = seed_backlog(limit=8)
        if result.get("seeded"):
            from db.client import get_db
            get_db().table("agent_logs").insert({
                "agent_name": "team_seeder",
                "action": f"seeded {result['seeded']} backlog lead(s) into gap's inbox",
                "status": "success",
            }).execute()
        logger.info(f"[team_seeder] {result}")
    except Exception as e:
        logger.error(f"[team_seeder] Failed: {e}", exc_info=True)


async def _auto_retry_safe_failures():
    """Self-healing safety net (every 30 min).

    SAFE only — re-queues stuck agent handoffs and re-runs idempotent backend
    agents that errored recently. It NEVER sends messages, deletes leads, or
    touches Stripe/pricing; the only agent here that costs anything (refill_queues)
    is gated by the spend cap via safety.preflight(). Anything that sends or spends
    stays behind the founder approval queue.
    """
    try:
        from db.client import get_db
        from datetime import datetime, timedelta, timezone as _tz
        db = get_db()
        actions = []

        # 1. Re-queue stuck team handoffs (free + safe) so the next cron run retries them.
        try:
            stuck = (db.table("agent_tasks").select("id")
                     .in_("status", ["failed", "blocked"]).limit(100).execute().data or [])
            for t in stuck:
                db.table("agent_tasks").update({"status": "queued"}).eq("id", t["id"]).execute()
            if stuck:
                actions.append(f"re-queued {len(stuck)} stuck handoff(s)")
        except Exception as e:
            logger.warning(f"[auto_retry] task re-queue failed: {e}")

        # 2. Retry SAFE backend agents whose most-recent run errored in the last 90 min.
        #    All are idempotent (only touch un-done work). refill_queues is spend-guarded.
        SAFE_RETRY = {
            "lead_enricher":     lambda: __import__("agents.lead_enricher",   fromlist=["run"]).run(limit=100),
            "preview_generator": lambda: __import__("agents.preview_generator", fromlist=["run_batch"]).run_batch(limit=30),
            "website_analyzer":  lambda: __import__("agents.website_analyzer", fromlist=["run"]).run(batch_size=100),
            "refill_queues":     lambda: __import__("agents.outreach_writer", fromlist=["refill_queues"]).refill_queues(),
        }
        try:
            cutoff = (datetime.now(_tz.utc) - timedelta(minutes=90)).isoformat()
            recent = (db.table("agent_logs").select("agent_name,status,created_at")
                      .gte("created_at", cutoff).order("created_at", desc=True)
                      .limit(300).execute().data or [])
            latest = {}
            for log in recent:                       # desc order → first seen is newest
                latest.setdefault(log["agent_name"], log["status"])
            for agent, status in latest.items():
                if status != "error" or agent not in SAFE_RETRY:
                    continue
                g = safety.preflight(f"self_heal_{agent}")
                if not g.allowed:
                    actions.append(f"skipped retry of {agent} ({g.reason})")
                    continue
                try:
                    SAFE_RETRY[agent]()
                    actions.append(f"retried {agent} after error")
                except Exception as e:
                    logger.warning(f"[auto_retry] retry of {agent} failed: {e}")
        except Exception as e:
            logger.warning(f"[auto_retry] error scan failed: {e}")

        # Only log when we actually did something (no 30-min heartbeat spam).
        if actions:
            try:
                db.table("agent_logs").insert({
                    "agent_name": "self_heal",
                    "action": "; ".join(actions),
                    "status": "success",
                }).execute()
            except Exception:
                pass
            logger.info(f"[auto_retry] {'; '.join(actions)}")
    except Exception as e:
        logger.error(f"[auto_retry] Failed: {e}", exc_info=True)


async def _cleanup_old_logs():
    try:
        from db.client import get_db
        from datetime import datetime, timedelta, timezone as _tz
        db = get_db()
        cutoff = (datetime.now(_tz.utc) - timedelta(days=30)).isoformat()
        db.table("agent_logs").delete().lt("created_at", cutoff).execute()
        logger.info("[log_cleanup] Deleted agent_logs older than 30 days")
    except Exception as e:
        logger.error(f"[log_cleanup] Failed: {e}", exc_info=True)


# ── Trades / JARVIS jobs ─────────────────────────────────────────────────────

async def _trades_morning():
    """08:00 Europe/London — Dial Manager posts each founder's ordered call list,
    and the Revenue Reporter posts yesterday's numbers (weekly version on Monday).
    Both go to the founders' Telegram only — no outbound to prospects/clients."""
    try:
        from datetime import date
        from agents import trades
        from utils import telegram
        dial = trades.dial_today(post_to_telegram=True)
        telegram.broadcast_founders(trades.revenue_report_text(weekly=(date.today().weekday() == 0)))
        logger.info(f"[trades_morning] {dial}")
    except Exception as e:
        logger.error(f"[trades_morning] Failed: {e}", exc_info=True)


async def _trades_followup():
    """18:00 Europe/London — Follow-up agent DRAFTS chase messages (interested/called
    prospects with no open action, trial day-7/12 check-ins, captured leads still new
    after 24h) and posts the batch to Telegram for the founder to copy & send.
    Drafts only — never sends to anyone."""
    try:
        from agents import trades
        result = trades.followup_run(post_to_telegram=True)
        logger.info(f"[trades_followup] {result.get('count', 0)} draft(s)")
    except Exception as e:
        logger.error(f"[trades_followup] Failed: {e}", exc_info=True)


# ── Scheduler setup ──────────────────────────────────────────────────────────

def start_scheduler():
    def job(fn, guard=True, **kwargs):
        # Cost/send jobs run through the safety guard (spend cap + kill-switch).
        # Free/critical jobs (health, watchdog, briefing, cleanup) pass guard=False.
        wrapped = safety.guarded(kwargs.get("id", getattr(fn, "__name__", "job")))(fn) if guard else fn
        return dict(func=wrapped, replace_existing=True, misfire_grace_time=600, **kwargs)

    # 5:55am — morning health check
    scheduler.add_job(**job(_morning_health_check, guard=False, id="health_check",
        trigger=CronTrigger(hour=5, minute=55, timezone=TZ)))

    # 6:00am — find new leads
    scheduler.add_job(**job(_find_new_leads, id="find_leads",
        trigger=CronTrigger(hour=6, minute=0, timezone=TZ)))

    # 6:30am — generate previews for new leads
    scheduler.add_job(**job(_generate_previews, id="generate_previews",
        trigger=CronTrigger(hour=6, minute=30, timezone=TZ)))

    # 7:00am — generate WhatsApp messages
    scheduler.add_job(**job(_whatsapp_campaign, id="whatsapp_campaign",
        trigger=CronTrigger(hour=7, minute=0, timezone=TZ)))

    # 7:15am — generate Instagram DM scripts
    scheduler.add_job(**job(_instagram_campaign, id="instagram_campaign",
        trigger=CronTrigger(hour=7, minute=15, timezone=TZ)))

    # 9:00am — process follow-up sequences
    scheduler.add_job(**job(_check_followups, id="check_followups",
        trigger=CronTrigger(hour=9, minute=0, timezone=TZ)))

    # Every 30 mins — send approved email queue
    scheduler.add_job(**job(_process_queue, id="process_queue",
        trigger=IntervalTrigger(minutes=30)))

    # Every 2 hours — analyse new leads' websites
    scheduler.add_job(**job(_analyze_new_leads, id="analyze_leads",
        trigger=IntervalTrigger(hours=2)))

    # Every 2 hours — refill WA + IG queues if running low
    scheduler.add_job(**job(_refill_queues, id="refill_queues",
        trigger=IntervalTrigger(hours=2)))

    # Every 2 hours — Claude + GPT strategy debate
    scheduler.add_job(**job(_strategy_brief, id="strategy_brief",
        trigger=IntervalTrigger(hours=2)))

    # Every hour — CEO system health check + auto-fix
    scheduler.add_job(**job(_ceo_check, guard=False, id="ceo_check",
        trigger=IntervalTrigger(hours=1)))

    # 8:00am — CEO daily briefing email to founder
    scheduler.add_job(**job(_ceo_daily_briefing, guard=False, id="ceo_briefing",
        trigger=CronTrigger(hour=8, minute=0, timezone=TZ)))

    # FROZEN — not running until revenue path is proven:
    # cmo_agent (1am), research_agent (2am), analyst_agent (3am),
    # dev_agent (3h), sales_agent (6h), claude_agent (10am)

    # 11:30am — Refresh stale previews (48h+ no reply) + queue follow-up message
    scheduler.add_job(**job(_refresh_stale_previews, id="preview_refresher",
        trigger=CronTrigger(hour=11, minute=30, timezone=TZ)))

    # 6:05am — Enrich preview_ready leads (find emails + Instagram handles)
    scheduler.add_job(**job(_enrich_leads, id="lead_enricher",
        trigger=CronTrigger(hour=6, minute=5, timezone=TZ)))

    # 5:50am — seed the 9-agent team with a capped backlog batch (before gap @ 6:20)
    scheduler.add_job(**job(_seed_team_backlog, guard=False, id="team_seeder",
        trigger=CronTrigger(hour=5, minute=50, timezone=TZ)))

    # Every 30 mins — self-healing: retry SAFE failures (stuck handoffs, errored
    # idempotent agents). guard=False so re-queues always run; paid sub-actions
    # are individually spend-checked inside the job.
    scheduler.add_job(**job(_auto_retry_safe_failures, guard=False, id="auto_retry",
        trigger=IntervalTrigger(minutes=30)))

    # 3:30am — Delete agent_logs older than 30 days
    scheduler.add_job(**job(_cleanup_old_logs, guard=False, id="log_cleanup",
        trigger=CronTrigger(hour=3, minute=30, timezone=TZ)))

    # ── TRADES / JARVIS (Europe/London) ──────────────────────────────────────
    # 8:00am — Dial Manager call lists + Revenue Reporter → founders' Telegram
    scheduler.add_job(**job(_trades_morning, guard=False, id="trades_morning",
        trigger=CronTrigger(hour=8, minute=0, timezone=TZ)))

    # 6:00pm — Follow-up agent drafts → founders' Telegram (drafts only)
    scheduler.add_job(**job(_trades_followup, guard=False, id="trades_followup",
        trigger=CronTrigger(hour=18, minute=0, timezone=TZ)))

    scheduler.start()
    logger.info("Scheduler started — night: 1am CMO, 2am Research, 3am Analyst, 3:30am cleanup | morning: 5:55am health, 6am leads, 6:05am enricher, 6:30am previews, 7am WA, 8am briefing, 9am followups, 10am Claude, 11:30am preview-refresh | continuous: 2h CEO+analyzer, 3h Dev, 6h Sales, 30min email queue")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
