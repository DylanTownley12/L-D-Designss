"""
Strategy Brief API — Claude + Codex debate every 2 hours.
GET  /api/strategy/brief        — latest cached brief
POST /api/strategy/brief/run    — trigger a new debate now
"""
import json
import logging
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from openai import OpenAI
from config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

BRIEF_CACHE_FILE = Path("/tmp/strategy_brief_cache.json")

DEBATE_PROMPT = """You are advising a 17-year-old solo founder running L&D Designs — a UK web design agency targeting barber shops with no website.

Business model: find barbers with no website → auto-generate a personalised preview site → outreach via WhatsApp + Instagram → £150 build + £15/month hosting.

Current state:
- 995 leads in database, ~585 with preview sites ready
- WhatsApp: 15 messages/day (recovering from ban)
- Instagram: 15 scripts/day generated, sent manually
- Email pipeline built but contacts sparse
- 0 paying customers yet
- Stripe payments set up
- Baz (AI agent) handles WhatsApp replies automatically

Answer this one question in under 200 words:
WHAT IS THE SINGLE MOST IMPORTANT THING THIS BUSINESS SHOULD DO IN THE NEXT 24 HOURS TO GET CLOSER TO ITS FIRST PAYING CUSTOMER?

Be specific, actionable, and ruthlessly focused on revenue. No fluff."""


def _get_db_context() -> str:
    try:
        from db.client import get_db
        db = get_db()
        wa = db.table("outreach_messages").select("id", count="exact") \
            .eq("channel", "whatsapp").in_("status", ["queued", "draft"]).execute().count or 0
        ig = db.table("outreach_messages").select("id", count="exact") \
            .eq("channel", "instagram").in_("status", ["queued", "draft"]).execute().count or 0
        replied = db.table("leads").select("id", count="exact").eq("status", "replied").execute().count or 0
        interested = db.table("leads").select("id", count="exact").eq("status", "interested").execute().count or 0
        return f"Live stats: WA queue={wa}, IG queue={ig}, replied={replied}, interested={interested}"
    except Exception:
        return ""


def _ask_claude(context: str) -> str:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=300,
            messages=[{"role": "user", "content": f"{DEBATE_PROMPT}\n\n{context}"}]
        )
        return msg.content[0].text.strip()
    except Exception as e:
        logger.warning(f"Claude call failed: {e}")
        return None


def _ask_codex(context: str) -> str:
    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=300,
            messages=[{"role": "user", "content": f"{DEBATE_PROMPT}\n\n{context}"}]
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"Codex/GPT call failed: {e}")
        return None


def _synthesise(claude_take: str, gpt_take: str, context: str) -> str:
    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=200,
            messages=[{"role": "user", "content": (
                f"Two AI advisors gave their takes on what a barber shop web design startup should do next.\n\n"
                f"Claude said: {claude_take}\n\nGPT said: {gpt_take}\n\n"
                f"In 2-3 sentences, give the FINAL VERDICT — what is the #1 action to take right now? Be direct and specific."
            )}]
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"Synthesis failed: {e}")
        return claude_take or gpt_take or "Unable to generate brief."


def generate_brief() -> dict:
    context = _get_db_context()
    claude_take = _ask_claude(context)
    gpt_take = _ask_codex(context)

    if claude_take and gpt_take:
        verdict = _synthesise(claude_take, gpt_take, context)
    else:
        verdict = claude_take or gpt_take or "Unable to generate brief — check API keys."

    brief = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claude": claude_take or "Unavailable (check ANTHROPIC_API_KEY)",
        "gpt": gpt_take or "Unavailable (check OPENAI_API_KEY)",
        "verdict": verdict,
        "context": context,
    }

    try:
        BRIEF_CACHE_FILE.write_text(json.dumps(brief))
    except Exception:
        pass

    return brief


@router.get("/strategy/brief")
def get_brief():
    if BRIEF_CACHE_FILE.exists():
        try:
            data = json.loads(BRIEF_CACHE_FILE.read_text())
            return {"status": "ok", "brief": data, "cached": True}
        except Exception:
            pass
    return {"status": "no_brief", "brief": None, "cached": False}


@router.post("/strategy/brief/run")
def run_brief():
    brief = generate_brief()
    return {"status": "ok", "brief": brief}
