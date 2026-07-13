"""
Holiday HQ agents — personal holiday finder for Dylan + his girlfriend.
NOT part of the barber pipeline — personal tooling on the same dashboard.

Two personas:
  - CONCIERGE: interviews Dylan one question at a time to build the trip profile.
    Uses claude-haiku (fast/cheap, runs on every answer). Falls back to a static
    question list if ANTHROPIC_API_KEY is missing or the call fails.
  - SCOUT: turns the finished profile into 5 ranked destination recommendations.
    Uses claude-sonnet for quality (user-triggered, runs rarely), falls back to haiku.

All spend is logged via safety.record_spend.
"""
import json
import logging
from datetime import date

from config import settings

logger = logging.getLogger(__name__)

CONCIERGE_MODEL = "claude-haiku-4-5-20251001"
SCOUT_MODEL = "claude-sonnet-5"
SCOUT_FALLBACK_MODEL = "claude-haiku-4-5-20251001"

# Profile fields the Concierge works through (also the static fallback flow)
STATIC_QUESTIONS = [
    ("timing", "When are you two thinking of going, and for how many nights?",
     ["Next month", "This summer", "Winter sun", "5–7 nights", "10+ nights"]),
    ("budget_total_gbp", "What's the total budget for both of you — flights, stay and spending money?",
     ["Under £600", "£600–£1,000", "£1,000–£1,500", "£1,500+"]),
    ("departure_airport", "Which airport works best to fly from?",
     ["Manchester", "Liverpool", "Leeds Bradford", "Anywhere cheap"]),
    ("vibe", "What's the vibe you're after?",
     ["Beach & chill", "City break", "Party", "Adventure", "Romantic mix"]),
    ("weather", "How important is guaranteed hot sun?",
     ["Essential", "Warm is fine", "Don't mind"]),
    ("accommodation", "What kind of place do you want to stay in?",
     ["All-inclusive hotel", "Hotel + breakfast", "Apartment", "Surprise us"]),
    ("flight_tolerance", "What's the max flight time you'd both put up with?",
     ["Under 3h", "Up to 4–5h", "Long haul is fine"]),
    ("interests", "Last one — what do you both love doing on holiday? Food, nightlife, sightseeing, water sports, lazing by the pool?",
     ["Food & drink", "Nightlife", "Sightseeing", "Pool days", "Bit of everything"]),
]

MAX_QUESTIONS = len(STATIC_QUESTIONS)

_CONCIERGE_SYSTEM = """You are the Holiday Concierge on Dylan's personal dashboard.
Dylan is planning a holiday for himself and his girlfriend — 2 travellers flying from the UK
(most likely Manchester or Liverpool — confirm, never assume).

Your job: interview Dylan ONE question at a time to build the trip profile, then hand off
to the Holiday Scout who finds destinations.

Profile fields to fill (rough priority order):
- timing: month/dates + number of nights
- budget_total_gbp: total budget for BOTH people (flights + stay + spending)
- departure_airport
- vibe: beach & chill / city break / party / adventure / romantic mix
- weather: guaranteed hot sun vs warm-is-fine
- accommodation: hotel vs apartment; all-inclusive vs B&B/self-catering
- flight_tolerance: max flight time
- interests: food, nightlife, sightseeing, activities
- dealbreakers: must-haves or hard nos

Rules:
- ONE question per turn. Short, warm, casual British English — like a mate who's a travel agent.
- Give 3–5 quick_replies (tappable answer chips) whenever sensible.
- Merge EVERYTHING learned so far into `preferences` (keep existing keys, add new ones; concise values).
- If an answer is vague, you may ask one follow-up — but never get stuck on a topic.
- Once the profile is complete enough to search well (usually 6–8 answers), set complete=true,
  set question to null, and tell Dylan to hit the FIND HOLIDAYS button.
- Respond with ONLY valid JSON, no markdown fences, in exactly this shape:
{"reply": "short acknowledgment of their answer",
 "question": "next question text or null",
 "quick_replies": ["chip", ...],
 "preferences": {"field": "value", ...},
 "complete": false}"""

_SCOUT_SYSTEM = """You are the Holiday Scout — an expert UK travel-agent AI on Dylan's personal dashboard.
You plan for 2 travellers: Dylan and his girlfriend, a young couple flying from the UK.

Given their trip profile and interview transcript, recommend the 5 best-fit holiday
destinations, ranked best first.

Rules:
- Real destinations. Realistic GBP estimates for 2 people (flights + accommodation + spending),
  aware of the season they want to travel. Today's date: {today}.
- Be specific — name the exact resort/town/area to stay in, not just a country.
- flight_time is from their departure airport (e.g. "4h 20m from Manchester").
- Every pick must justify WHY it fits their specific answers — reference their budget, vibe and dates.
- They are a young couple: where relevant, flag minimum check-in ages (many hotels require the
  lead guest to be 18+ or 21+) and prefer young-couple-friendly picks. Put this in tips.
- Prices are estimates, not live quotes — say so once in the overview.
- match_score is 0–100 for how well it fits their profile.
- Respond with ONLY valid JSON, no markdown fences, in exactly this shape:
{"overview": "2-3 sentence strategy note across all picks",
 "recommendations": [
   {"destination": "Albufeira", "country": "Portugal", "match_score": 92,
    "summary": "why this fits them specifically",
    "best_time": "early June — hot but before peak prices",
    "flight_time": "2h 55m from Manchester",
    "est_cost_pp": 420, "est_cost_total": 840,
    "highlights": ["3-5 short strings"],
    "stay_area": "Old Town, near Fisherman's Beach",
    "tips": "practical booking tips for this pick"}
 ]}"""


def opening_message() -> dict:
    """Static first message stored when a trip is created — no LLM call needed."""
    key, question, chips = STATIC_QUESTIONS[0]
    return {
        "role": "assistant",
        "content": (
            "Alright Dylan — let's find you and your girlfriend a proper good holiday. "
            "I'll ask a few quick questions, then the Scout goes hunting. "
            f"First up: {question[0].lower()}{question[1:]}"
        ),
        "quick_replies": chips,
    }


def _parse_json(text: str) -> dict:
    """Extract a JSON object from an LLM reply, tolerating code fences and chatter."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start:end + 1])


def _record_spend(agent: str, model: str, response) -> None:
    try:
        import safety
        usage = getattr(response, "usage", None)
        safety.record_spend(
            agent, model,
            tokens_in=getattr(usage, "input_tokens", 0) or 0,
            tokens_out=getattr(usage, "output_tokens", 0) or 0,
        )
    except Exception:
        pass


def _static_next_question(questions_asked: int) -> dict:
    """No-LLM fallback: walk the fixed question list in order."""
    if questions_asked >= MAX_QUESTIONS:
        return {
            "reply": "Got everything I need — hit FIND HOLIDAYS and the Scout will get hunting.",
            "question": None, "quick_replies": [], "preferences": {}, "complete": True,
        }
    _, question, chips = STATIC_QUESTIONS[questions_asked]
    return {
        "reply": "Noted!",
        "question": question,
        "quick_replies": chips,
        "preferences": {},
        "complete": False,
    }


def _static_capture(preferences: dict, questions_asked: int, answer: str) -> dict:
    """In fallback mode, store the raw answer under the topic that was just asked."""
    prefs = dict(preferences or {})
    idx = min(max(questions_asked - 1, 0), MAX_QUESTIONS - 1)
    key = STATIC_QUESTIONS[idx][0]
    prefs[key] = answer
    return prefs


def process_answer(conversation: list, preferences: dict, questions_asked: int) -> dict:
    """
    Concierge turn: take the conversation (ending in Dylan's latest answer) and the
    profile so far; return {reply, question, quick_replies, preferences, complete, agent}.
    Never raises — falls back to the static question list.
    """
    latest_answer = ""
    for msg in reversed(conversation or []):
        if msg.get("role") == "user":
            latest_answer = msg.get("content", "")
            break

    if settings.ANTHROPIC_API_KEY:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

            messages = []
            for m in (conversation or [])[-20:]:
                if m.get("role") in ("user", "assistant") and m.get("content"):
                    messages.append({"role": m["role"], "content": m["content"]})

            context = (
                f"Profile so far (merge into this, don't lose keys): {json.dumps(preferences or {})}\n"
                f"Questions asked so far: {questions_asked} (wrap up by ~{MAX_QUESTIONS})."
            )
            response = client.messages.create(
                model=CONCIERGE_MODEL,
                max_tokens=700,
                system=f"{_CONCIERGE_SYSTEM}\n\n{context}",
                messages=messages,
            )
            _record_spend("holiday_concierge", CONCIERGE_MODEL, response)

            result = _parse_json(response.content[0].text)
            merged = dict(preferences or {})
            merged.update(result.get("preferences") or {})
            return {
                "reply": result.get("reply") or "Noted!",
                "question": result.get("question"),
                "quick_replies": result.get("quick_replies") or [],
                "preferences": merged,
                "complete": bool(result.get("complete")) or not result.get("question"),
                "agent": "concierge",
            }
        except Exception as e:
            logger.warning(f"[holiday_agent] concierge LLM failed, using static flow: {e}")

    result = _static_next_question(questions_asked)
    result["preferences"] = _static_capture(preferences, questions_asked, latest_answer)
    result["agent"] = "concierge_static"
    return result


def find_holidays(preferences: dict, conversation: list) -> dict:
    """
    Scout run: profile + transcript in, ranked recommendations out.
    Returns {overview, recommendations: [...], agent} or {error}.
    """
    if not settings.ANTHROPIC_API_KEY:
        return {"error": "ANTHROPIC_API_KEY not set in Railway Variables — add it to enable the Holiday Scout."}

    transcript = "\n".join(
        f"{'Dylan' if m.get('role') == 'user' else 'Concierge'}: {m.get('content', '')}"
        for m in (conversation or []) if m.get("content")
    )
    user_prompt = (
        f"TRIP PROFILE:\n{json.dumps(preferences or {}, indent=2)}\n\n"
        f"INTERVIEW TRANSCRIPT:\n{transcript}\n\n"
        "Find their 5 best-fit holidays now."
    )
    system = _SCOUT_SYSTEM.replace("{today}", date.today().isoformat())

    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    last_error = None
    for model in (SCOUT_MODEL, SCOUT_FALLBACK_MODEL):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=2500,
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
            )
            _record_spend("holiday_scout", model, response)

            result = _parse_json(response.content[0].text)
            recs = result.get("recommendations") or []
            if not recs:
                raise ValueError("scout returned no recommendations")
            return {
                "overview": result.get("overview") or "",
                "recommendations": recs,
                "agent": f"scout ({model})",
            }
        except Exception as e:
            last_error = e
            logger.warning(f"[holiday_agent] scout failed on {model}: {e}")

    return {"error": f"Scout failed: {last_error}"}
