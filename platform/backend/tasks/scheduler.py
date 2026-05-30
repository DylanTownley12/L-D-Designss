"""
Background task scheduler
Runs recurring jobs:
- Every hour: process outreach queue
- Every 6 hours: check follow-up sequences
- Every 12 hours: run website analyzer on new leads
- Daily: run lead finder for new leads

Uses APScheduler — simple, no Redis needed.
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def _process_queue():
    from agents.outreach_sender import process_queue
    result = process_queue(max_send=50)
    logger.info(f"Queue processed: {result}")


async def _generate_previews():
    from agents.preview_generator import run_batch
    result = run_batch(limit=50)
    logger.info(f"Preview batch: {result}")


async def _write_outreach():
    from agents.outreach_writer import run_batch
    result = run_batch(limit=50)
    logger.info(f"Outreach batch: {result}")


async def _check_followups():
    from agents.followup_agent import run
    result = run()
    logger.info(f"Follow-ups checked: {result}")


async def _analyze_new_leads():
    from agents.website_analyzer import run
    result = run(batch_size=100)
    logger.info(f"Website analysis batch: {result}")


async def _find_new_leads():
    from agents.lead_finder import run
    # Only search 3 cities per day to stay polite and avoid blocks
    import random
    from agents.lead_finder import UK_CITIES
    cities = random.sample(UK_CITIES, min(20, len(UK_CITIES)))
    result = run(cities=cities, pages_per_city=3)
    logger.info(f"Lead finder result: {result}")


async def _whatsapp_campaign():
    from agents.outreach_writer import generate_whatsapp_campaign
    result = generate_whatsapp_campaign(limit=30)
    logger.info(f"WhatsApp campaign: {result}")


async def _instagram_campaign():
    from agents.outreach_writer import generate_instagram_campaign
    result = generate_instagram_campaign(limit=30)
    logger.info(f"Instagram campaign: {result}")


def start_scheduler():
    # 6:00am — find new leads (≈50 leads across a few cities)
    scheduler.add_job(
        _find_new_leads,
        trigger=CronTrigger(hour=6, minute=0),
        id="find_leads",
        replace_existing=True,
        misfire_grace_time=600,
    )

    # 6:30am — generate previews for new leads
    scheduler.add_job(
        _generate_previews,
        trigger=CronTrigger(hour=6, minute=30),
        id="generate_previews",
        replace_existing=True,
        misfire_grace_time=600,
    )

    # 7:00am — generate WhatsApp campaign messages
    scheduler.add_job(
        _whatsapp_campaign,
        trigger=CronTrigger(hour=7, minute=0),
        id="whatsapp_campaign",
        replace_existing=True,
        misfire_grace_time=600,
    )

    # 7:15am — generate Instagram DM scripts
    scheduler.add_job(
        _instagram_campaign,
        trigger=CronTrigger(hour=7, minute=15),
        id="instagram_campaign",
        replace_existing=True,
        misfire_grace_time=600,
    )

    # 9:00am — process follow-up sequences
    scheduler.add_job(
        _check_followups,
        trigger=CronTrigger(hour=9, minute=0),
        id="check_followups",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # Hourly — send approved email queue
    scheduler.add_job(
        _process_queue,
        trigger=CronTrigger(minute=30),
        id="process_queue",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # Every 2 hours — analyze websites for new leads
    scheduler.add_job(
        _analyze_new_leads,
        trigger=IntervalTrigger(hours=2),
        id="analyze_leads",
        replace_existing=True,
        misfire_grace_time=600,
    )

    scheduler.start()
    logger.info("Scheduler started: daily pipeline at 6am/6:30am/7am/9am + hourly queue")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
