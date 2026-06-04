"""
Background task scheduler — Europe/London timezone
Daily pipeline: 5:55am health check → 6am leads → 6:30am previews → 7am WhatsApp → 9am follow-ups
Each job is independently error-handled so one failure never stops the others.
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

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

        preview_result = db.table("previews").select("preview_url").limit(2000).execute()
        valid_previews = sum(
            1 for p in (preview_result.data or [])
            if 'railway' in (p.get("preview_url") or '') or '/previews/serve/' in (p.get("preview_url") or '')
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


# ── Scheduler setup ──────────────────────────────────────────────────────────

def start_scheduler():
    def job(fn, **kwargs):
        return dict(func=fn, replace_existing=True, misfire_grace_time=600, **kwargs)

    # 5:55am — morning health check
    scheduler.add_job(**job(_morning_health_check, id="health_check",
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
        trigger=CronTrigger(minute=30, timezone=TZ)))

    # Every 2 hours — analyse new leads' websites
    scheduler.add_job(**job(_analyze_new_leads, id="analyze_leads",
        trigger=IntervalTrigger(hours=2)))

    # Every 2 hours — CEO system health check + auto-fix
    scheduler.add_job(**job(_ceo_check, id="ceo_check",
        trigger=IntervalTrigger(hours=2, start_date=None)))

    # 8:00am — CEO daily briefing email to founder
    scheduler.add_job(**job(_ceo_daily_briefing, id="ceo_briefing",
        trigger=CronTrigger(hour=8, minute=0, timezone=TZ)))

    # 1:00am — CMO marketing analysis
    scheduler.add_job(**job(_cmo_run, id="cmo_agent",
        trigger=CronTrigger(hour=1, minute=0, timezone=TZ)))

    # 2:00am — Research agent city intelligence
    scheduler.add_job(**job(_research_run, id="research_agent",
        trigger=CronTrigger(hour=2, minute=0, timezone=TZ)))

    # 3:00am — Data analyst nightly report
    scheduler.add_job(**job(_analyst_run, id="analyst_agent",
        trigger=CronTrigger(hour=3, minute=0, timezone=TZ)))

    # Every 3 hours — Dev agent technical monitoring
    scheduler.add_job(**job(_dev_run, id="dev_agent",
        trigger=IntervalTrigger(hours=3)))

    # Every 6 hours — Sales agent closes interested leads
    scheduler.add_job(**job(_sales_run, id="sales_agent",
        trigger=IntervalTrigger(hours=6)))

    # 10:00am — Claude agent: A/B analysis, opener improvements, hot lead surfacing
    scheduler.add_job(**job(_claude_tasks, id="claude_agent",
        trigger=CronTrigger(hour=10, minute=0, timezone=TZ)))

    # 11:30am — Refresh stale previews (48h+ no reply) + queue follow-up message
    scheduler.add_job(**job(_refresh_stale_previews, id="preview_refresher",
        trigger=CronTrigger(hour=11, minute=30, timezone=TZ)))

    scheduler.start()
    logger.info("Scheduler started — night: 1am CMO, 2am Research, 3am Analyst | morning: 5:55am health, 6am leads, 6:30am previews, 7am WA, 8am briefing, 9am followups, 10am Claude | continuous: 2h CEO+analyzer, 3h Dev, 6h Sales, 30min email queue")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
