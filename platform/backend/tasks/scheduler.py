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
    result = process_queue(max_send=5)  # Conservative: 5 per hour max
    logger.info(f"Queue processed: {result}")


async def _check_followups():
    from agents.followup_agent import run
    result = run()
    logger.info(f"Follow-ups checked: {result}")


async def _analyze_new_leads():
    from agents.website_analyzer import run
    result = run(batch_size=10)
    logger.info(f"Website analysis batch: {result}")


async def _find_new_leads():
    from agents.lead_finder import run
    # Only search 3 cities per day to stay polite and avoid blocks
    import random
    from agents.lead_finder import UK_CITIES
    cities = random.sample(UK_CITIES, min(3, len(UK_CITIES)))
    result = run(cities=cities, pages_per_city=2)
    logger.info(f"Lead finder result: {result}")


def start_scheduler():
    # Process outreach queue every hour at :30
    scheduler.add_job(
        _process_queue,
        trigger=CronTrigger(minute=30),
        id="process_queue",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # Check follow-up sequences 3x per day
    scheduler.add_job(
        _check_followups,
        trigger=CronTrigger(hour="8,13,18", minute=0),
        id="check_followups",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # Analyze new leads twice a day
    scheduler.add_job(
        _analyze_new_leads,
        trigger=CronTrigger(hour="9,15", minute=0),
        id="analyze_leads",
        replace_existing=True,
        misfire_grace_time=600,
    )

    # Find new leads once a day at 7am
    scheduler.add_job(
        _find_new_leads,
        trigger=CronTrigger(hour=7, minute=0),
        id="find_leads",
        replace_existing=True,
        misfire_grace_time=600,
    )

    scheduler.start()
    logger.info("Scheduler started with 4 jobs")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
