"""
JARVIS — the founders' Telegram operator for the trades business.

    Telegram message  →  load full live context from Supabase
                      →  ONE Claude call (CLAUDE_MODEL) with tool calling
                      →  one reply (every DB write echoed back)

Design rules (from the brief):
  • Founders only (FOUNDER_CHAT_IDS). Non-founders are ignored silently.
  • Exactly ONE reasoning call per message — we never feed tool results back for
    a second reasoning pass (no loops). Reads (who's next / status / trials /
    general questions) are answered inline from the preloaded context. Writes go
    through tools; their confirmation text is appended to the reply. An action
    tool may itself make ONE bounded model call (e.g. Sales Prep generating
    notes) — that is the agent doing its job, not JARVIS looping.
  • "undo" is handled deterministically (no model needed) from jarvis_log.
  • If Claude is unavailable, we fall back to a command-aware raw data dump so
    the bot still answers — it never dies.
  • Personality: brief, dry, capable.
"""
import json
import logging
import re

from fastapi import APIRouter, Request, Header, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional

from config import settings
from db.client import get_db
from utils import telegram
from agents import trades

logger = logging.getLogger(__name__)
router = APIRouter(tags=["jarvis"])

# Light in-process dedupe — Telegram re-delivers updates until it gets a 200.
_SEEN_MSG_IDS: set = set()


# ── Tool schemas (Anthropic tool-use) ─────────────────────────────────
# Read tools return a ready-formatted answer that is shown to the founder
# directly (no second reasoning pass). Write tools echo what changed + an undo.
_STATUSES = ["to_call", "called", "interested", "demo_booked", "won", "lost", "not_interested"]
TOOLS = [
    # ---- reads ----
    {"name": "get_status", "description": "The revenue/status report: dials yesterday, pipeline, "
        "trials, paying, MRR, churn risk. Use for 'status', 'report', 'how are we doing'.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_pipeline", "description": "Just the pipeline counts by stage (to_call, called, "
        "interested, demo_booked, won, lost, not_interested).",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "whos_next", "description": "The single top prospect a founder should call next, with "
        "phone + notes + reason.",
     "input_schema": {"type": "object", "properties": {"founder": {"type": "string", "enum": ["D", "L"]}}}},
    {"name": "get_today", "description": "A founder's full ordered call list for today (overdue actions "
        "pinned first, then highest-ranked uncalled).",
     "input_schema": {"type": "object", "properties": {"founder": {"type": "string", "enum": ["D", "L"]}}}},
    {"name": "search_prospect", "description": "Find a prospect by (fuzzy) name and show their card.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
    {"name": "trial_check", "description": "Live trials: days left, leads captured each, churn-risk flags.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_agent_events", "description": "Recent activity from the agents (the ops feed).",
     "input_schema": {"type": "object", "properties": {"limit": {"type": "integer"}}}},
    # ---- writes (each echoes the change + supports undo) ----
    {"name": "log_call", "description": "Log a call outcome on a prospect. Fuzzy-matches the name, "
        "updates status, appends the note, stamps the time, sets the next action, and auto-preps a "
        "booked demo. e.g. 'log called northern heating, gatekeeper, try after 4'.",
     "input_schema": {"type": "object", "properties": {
         "prospect": {"type": "string", "description": "Business name (fuzzy ok) or id"},
         "outcome": {"type": "string", "description": "What happened, in your words"},
         "note": {"type": "string", "description": "Any extra note to append"},
         "new_status": {"type": "string", "enum": _STATUSES,
                        "description": "Explicit status; inferred from outcome if omitted"},
         "next_action": {"type": "string", "description": "What to do next (overrides the default)"},
         "next_action_date": {"type": "string", "description": "ISO date YYYY-MM-DD for the next action"},
     }, "required": ["prospect", "outcome"]}},
    {"name": "add_prospect", "description": "Add one trade business to the call list (to_call). "
        "Auto-ranks + assigns a founder. Contacts no one.",
     "input_schema": {"type": "object", "properties": {
         "business_name": {"type": "string"}, "phone": {"type": "string"}, "town": {"type": "string"},
         "trade": {"type": "string"}, "founder": {"type": "string", "enum": ["D", "L"]},
     }, "required": ["business_name"]}},
    {"name": "scout", "description": "Run Lead Scout on a pasted list (one per line: name, phone, town). "
        "Dedupes, ranks, inserts as to_call, splits across D and L. Builds the list only.",
     "input_schema": {"type": "object", "properties": {
         "pasted_text": {"type": "string"}, "town": {"type": "string"}, "trade": {"type": "string"},
     }, "required": ["pasted_text"]}},
    {"name": "prep_call", "description": "Generate + save call notes (pain, objections, demo script) "
        "for a prospect. Use for 'prep <name>'.",
     "input_schema": {"type": "object", "properties": {"prospect": {"type": "string"}},
                      "required": ["prospect"]}},
    {"name": "draft_followup", "description": "Write a short UK-tone follow-up message for a prospect "
        "for the founder to copy & send. Drafts only — never sends.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "mark_won", "description": "Mark a prospect as WON (closed/sold).",
     "input_schema": {"type": "object", "properties": {"prospect": {"type": "string"}},
                      "required": ["prospect"]}},
    {"name": "mark_lost", "description": "Mark a prospect as LOST / not interested.",
     "input_schema": {"type": "object", "properties": {
         "prospect": {"type": "string"}, "reason": {"type": "string"}}, "required": ["prospect"]}},
    {"name": "convert_to_client", "description": "Convert a won prospect into a live 14-day-trial client "
        "and provision their capture form + dashboard links.",
     "input_schema": {"type": "object", "properties": {
         "prospect": {"type": "string"}, "monthly_fee": {"type": "number"}}, "required": ["prospect"]}},
    {"name": "run_agent", "description": "Run one agent now: 'dial_manager' (build call lists), "
        "'followup' (draft chases), or 'reporter' (revenue report).",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
]


SYSTEM_BASE = (
    "You are JARVIS, the operations brain for L&D Designs' trades arm — a missed-call "
    "text-back service sold to UK plumbers, electricians and other trades (~£49/mo, 14-day "
    "free trial). You report to the two founders, D (Dylan) and L. "
    "Voice: brief, dry, capable. No filler, no emojis-spam, no corporate tone. Answer the "
    "question, then stop.\n\n"
    "You can ANSWER most things directly from the LIVE CONTEXT below — who's next, the day's "
    "call lists, pipeline counts, trial status, churn risk, captured leads, the revenue report. "
    "Don't call a tool just to read; only use a tool to CHANGE something.\n"
    "When asked to draft a follow-up / message for a prospect, WRITE the message yourself in your "
    "reply using their call notes from context — short, UK tone, soft call to action. You only "
    "draft; the founder sends it. Never claim to have messaged anyone.\n"
    "Use tools to: log a call outcome, add a prospect, scout a pasted list, prep a prospect, or "
    "convert a won prospect to a client. After a tool runs, its confirmation is shown to the "
    "founder automatically — so keep your own text minimal when you call a tool.\n"
    "HARD RULE: nothing in this system ever auto-contacts a prospect or client. You build lists "
    "and draft messages only."
)


def _format_context(ctx: dict, founder_code: str) -> str:
    p = ctx.get("pipeline", {})
    c = ctx.get("clients", {})
    lines = [
        f"LIVE CONTEXT (today {ctx.get('today')}). You are talking to founder {founder_code}.",
        f"Pipeline: to_call {p.get('to_call',0)} · called {p.get('called',0)} · "
        f"interested {p.get('interested',0)} · demo_booked {p.get('demo_booked',0)} · "
        f"won {p.get('won',0)} · not_interested {p.get('not_interested',0)}",
        f"Clients: {c.get('trials',0)} on trial, {c.get('paying',0)} paying.",
    ]
    for f in ("D", "L"):
        calls = ctx.get(f"calls_{f}", [])
        if calls:
            lines.append(f"{f}'s next calls:")
            for x in calls:
                bits = " ".join(b for b in [x.get("business_name"), f"({x.get('trade')}, {x.get('town')})",
                                            x.get("phone")] if b and b != "(None, None)")
                lines.append(f"  - {bits} [{x.get('reason')}, rank {x.get('rank')}]")
    if ctx.get("active_prospects"):
        lines.append("Active prospects (with notes):")
        for a in ctx["active_prospects"][:12]:
            note = (a.get("call_notes") or "").replace("\n", " ")[:200]
            lines.append(f"  - {a.get('business_name')} [{a.get('status')}, {a.get('assigned_to')}]"
                         + (f": {note}" if note else ""))
    if ctx.get("trials"):
        lines.append("Trials:")
        for t in ctx["trials"]:
            flag = " RED-CHURN-RISK" if t.get("churn_risk") else ""
            lines.append(f"  - {t.get('business_name')}: {t.get('days_remaining')}d left, "
                         f"{t.get('leads_captured')} leads{flag}")
    if ctx.get("recent_captured_leads"):
        lines.append("Recent captured leads (product output):")
        for l in ctx["recent_captured_leads"][:6]:
            lines.append(f"  - {l.get('name') or ''} {l.get('phone')} [{l.get('status')}, {l.get('source')}]")
    return "\n".join(lines)


# ── Read-tool formatters ──────────────────────────────────────────────
def _fmt_pipeline() -> str:
    p = trades.live_context().get("pipeline", {})
    return ("Pipeline — "
            f"to_call {p.get('to_call',0)} · called {p.get('called',0)} · "
            f"interested {p.get('interested',0)} · demo_booked {p.get('demo_booked',0)} · "
            f"won {p.get('won',0)} · not_interested {p.get('not_interested',0)}")


def _fmt_agent_events(limit: int = 12) -> str:
    evs = trades.get_agent_events(limit=limit)
    if not evs:
        return "No agent activity yet."
    out = ["Recent agent activity:"]
    for e in evs:
        ts = (e.get("created_at") or "")[11:19]
        out.append(f"[{ts}] {(e.get('agent') or '').upper()} — {e.get('message')}")
    return "\n".join(out)


# ── Tool dispatch ─────────────────────────────────────────────────────
def _run_tool(name: str, args: dict, founder_code: str = "D"):
    """Execute a tool. Reads return (formatted_answer, None); writes return
    (echo_of_change, undo_envelope_or_None)."""
    f = (args.get("founder") or founder_code or "D").upper()
    try:
        # -- reads --
        if name == "get_status":
            return trades.revenue_report_text(), None
        if name == "get_pipeline":
            return _fmt_pipeline(), None
        if name == "whos_next":
            return trades.whos_next(f).get("message", "List's clear."), None
        if name == "get_today":
            return trades.format_call_list(f, trades.build_call_list(f)), None
        if name == "search_prospect":
            return trades.search_prospect(args.get("query", "")).get("message", "No match."), None
        if name == "trial_check":
            return trades.trial_check().get("message", "No trials."), None
        if name == "get_agent_events":
            return _fmt_agent_events(int(args.get("limit") or 12)), None
        # -- writes --
        if name == "log_call":
            outcome = args.get("outcome", "")
            if args.get("note"):
                outcome = f"{outcome} — {args['note']}".strip(" —")
            r = trades.log_call(args.get("prospect"), outcome, args.get("new_status"),
                                next_action=args.get("next_action"),
                                next_action_date=args.get("next_action_date"))
            return r.get("message", "Logged."), r.get("_undo")
        if name == "add_prospect":
            r = trades.add_prospect(args.get("business_name"), args.get("phone"),
                                    args.get("town"), args.get("trade"), args.get("founder"))
            return r.get("message", "Added."), r.get("_undo")
        if name == "scout":
            r = trades.scout(pasted_text=args.get("pasted_text"), town=args.get("town"),
                             trade=args.get("trade"), source="jarvis")
            echo = r.get("message", "Done.")
            if r.get("top"):
                echo += "\nTop:\n" + "\n".join(
                    f"  {i+1}. {t['business_name']} ({t['town']}, {t['trade']}) "
                    f"→ {t['assigned_to']} [rank {t['rank']}]" for i, t in enumerate(r["top"]))
            return echo, r.get("_undo")
        if name == "prep_call":
            r = trades.sales_prep(name=args.get("prospect"))
            if not r.get("ok"):
                return r.get("message", "Couldn't prep."), None
            return f"{r['message']}\n\n{r['call_notes']}", r.get("_undo")
        if name == "draft_followup":
            return trades.draft_followup(args.get("name")).get("message", "No prospect."), None
        if name == "mark_won":
            r = trades.mark_won(args.get("prospect"))
            return r.get("message", "Marked won."), r.get("_undo")
        if name == "mark_lost":
            r = trades.mark_lost(args.get("prospect"), args.get("reason", ""))
            return r.get("message", "Marked lost."), r.get("_undo")
        if name == "convert_to_client":
            r = trades.convert_prospect_to_client(args.get("prospect"),
                                                  monthly_fee=args.get("monthly_fee") or 49.0)
            return r.get("message", "Converted."), r.get("_undo")
        if name == "run_agent":
            return trades.run_agent(args.get("name"), post_to_telegram=settings.telegram_enabled).get(
                "message", "Ran."), None
    except Exception as e:
        logger.error(f"[jarvis] tool {name} failed: {e}", exc_info=True)
        return f"⚠️ {name} failed: {e}", None
    return f"Unknown tool: {name}", None


# ── Raw-data fallback (Claude down / no key) — command aware ───────────
# Deterministic parsing for the core commands so the console NEVER dies.
_TAG = "⚙️ (AI offline — raw mode)"


def _fallback_log(text: str):
    """Parse 'log called northern heating, gatekeeper, try after 4' deterministically."""
    body = re.sub(r"^\s*log(ged)?\s+", "", text, flags=re.I).strip()
    parts = [p.strip() for p in body.split(",") if p.strip()]
    if not parts:
        return None
    head = parts[0]
    m = re.match(r"^(called|call|spoke to|rang|phoned|logged)\s+(.+)$", head, flags=re.I)
    name = (m.group(2) if m else head).strip()
    outcome = ", ".join(parts[1:]) if len(parts) > 1 else (head if not m else "called")
    if not name:
        return None
    return trades.log_call(name, outcome).get("message")


def _raw_dump(text: str, ctx: dict, founder_code: str) -> str:
    low = (text or "").lower().strip()
    f = founder_code
    if re.search(r"\bfor l\b|\bl's\b", low) or low.endswith(" l"):
        f = "L"
    try:
        if low.startswith("log"):
            msg = _fallback_log(text)
            if msg:
                return f"{_TAG}\n{msg}"
        if low.startswith("scout"):
            chunks = text.split("\n", 1)
            pasted = chunks[1] if len(chunks) > 1 else ""
            return f"{_TAG}\n{trades.scout(pasted_text=pasted, source='jarvis').get('message')}"
        if low.startswith("prep "):
            r = trades.sales_prep(name=text[5:].strip())
            return f"{_TAG}\n{r.get('message')}" + (f"\n\n{r.get('call_notes')}" if r.get("ok") else "")
        if low.startswith("draft"):
            name = re.sub(r"^draft.*?\b(for|to)\s+", "", text, flags=re.I).strip()
            return f"{_TAG}\n{trades.draft_followup(name or text[5:].strip()).get('message')}"
        if low.startswith("won "):
            return f"{_TAG}\n{trades.mark_won(text[4:].strip()).get('message')}"
        if low.startswith("lost "):
            return f"{_TAG}\n{trades.mark_lost(text[5:].strip()).get('message')}"
        if low.split(" ", 1)[0] in ("find", "search", "lookup") and " " in low:
            return f"{_TAG}\n{trades.search_prospect(text.split(' ', 1)[1].strip()).get('message')}"
        if low.startswith("add "):
            parts = [p.strip() for p in text[4:].split(",")]
            r = trades.add_prospect(parts[0], parts[1] if len(parts) > 1 else None,
                                    parts[2] if len(parts) > 2 else None)
            return f"{_TAG}\n{r.get('message')}"
        if any(k in low for k in ("status", "report", "revenue", "numbers", "mrr", "how are we")):
            return f"{_TAG}\n{trades.revenue_report_text(weekly=('week' in low))}"
        if any(k in low for k in ("pipeline", "funnel")):
            return f"{_TAG}\n{_fmt_pipeline()}"
        if any(k in low for k in ("trial", "churn")):
            return f"{_TAG}\n{trades.trial_check()['message']}"
        if any(k in low for k in ("who's next", "whos next", "next up", "next call")):
            return f"{_TAG}\n{trades.whos_next(f).get('message')}"
        if any(k in low for k in ("today", "call list", "my calls", "dial", "next")):
            return f"{_TAG}\n{trades.format_call_list(f, trades.build_call_list(f))}"
    except Exception as e:
        return f"{_TAG}\nCouldn't action that offline: {e}"
    return f"{_TAG}\n{_format_context(ctx, founder_code)}"


# ── Core message handler ──────────────────────────────────────────────
def handle_message(chat_id, text: str, founder_override: str = None) -> str:
    db = get_db()
    founder_code = (founder_override or settings.founder_code_for_chat(chat_id))

    # Log inbound.
    try:
        db.table("jarvis_log").insert({"chat_id": str(chat_id), "direction": "in",
                                       "message": text}).execute()
    except Exception:
        pass

    # 1) Deterministic UNDO — no model call.
    if text.strip().lower() in ("undo", "undo that", "revert", "/undo"):
        reply = _do_undo(chat_id)
        _log_out(chat_id, reply, tool_calls=[{"undo": True}])
        return reply

    # 2) Load full live context.
    try:
        ctx = trades.live_context()
    except Exception as e:
        logger.error(f"[jarvis] live_context failed: {e}")
        ctx = {}

    # 3) ONE Claude call with tools.
    reply, tool_calls, last_undo = _claude_turn(text, ctx, founder_code)

    # 4) Send + log.
    _log_out(chat_id, reply, tool_calls=tool_calls, prev_state=last_undo)
    return reply


def _claude_turn(text: str, ctx: dict, founder_code: str):
    """Returns (reply_text, tool_calls_meta, last_undo_envelope)."""
    if not settings.ANTHROPIC_API_KEY:
        return _raw_dump(text, ctx, founder_code), [{"fallback": "no_api_key"}], None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        system = SYSTEM_BASE + "\n\n" + _format_context(ctx, founder_code)
        resp = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=1024,
            system=system,
            tools=TOOLS,
            messages=[{"role": "user", "content": text}],
        )
        try:
            import safety
            safety.record_spend("jarvis", settings.CLAUDE_MODEL,
                                getattr(resp.usage, "input_tokens", 0),
                                getattr(resp.usage, "output_tokens", 0))
        except Exception:
            pass

        text_parts, echoes, tool_meta, last_undo = [], [], [], None
        for block in resp.content:
            btype = getattr(block, "type", "")
            if btype == "text":
                text_parts.append(block.text)
            elif btype == "tool_use":
                echo, undo = _run_tool(block.name, block.input or {}, founder_code)
                echoes.append(echo)
                tool_meta.append({"name": block.name, "input": block.input})
                if undo:
                    last_undo = undo
        reply = "\n".join(t for t in text_parts if t and t.strip()).strip()
        if echoes:
            reply = (reply + "\n\n" if reply else "") + "\n\n".join(echoes)
        if not reply:
            reply = "Done."
        return reply, tool_meta, last_undo
    except Exception as e:
        logger.error(f"[jarvis] Claude turn failed: {e}", exc_info=True)
        return _raw_dump(text, ctx, founder_code), [{"fallback": str(e)[:120]}], None


def _do_undo(chat_id) -> str:
    db = get_db()
    try:
        rows = (db.table("jarvis_log").select("*").eq("chat_id", str(chat_id))
                .eq("direction", "out").order("created_at", desc=True).limit(20).execute().data or [])
        for r in rows:
            prev = r.get("prev_state")
            if prev:
                if isinstance(prev, str):
                    prev = json.loads(prev)
                note = trades.apply_undo(prev)
                # Burn it so a second "undo" doesn't re-apply the same revert.
                db.table("jarvis_log").update({"prev_state": None}).eq("id", r["id"]).execute()
                return note
        return "Nothing to undo."
    except Exception as e:
        logger.error(f"[jarvis] undo failed: {e}")
        return f"Undo failed: {e}"


def _log_out(chat_id, message: str, tool_calls=None, prev_state=None):
    try:
        get_db().table("jarvis_log").insert({
            "chat_id": str(chat_id), "direction": "out", "message": message,
            "tool_calls": tool_calls or [], "prev_state": prev_state,
        }).execute()
    except Exception as e:
        logger.warning(f"[jarvis] log_out failed: {e}")


# ── Telegram webhook ──────────────────────────────────────────────────
@router.post("/telegram")
async def telegram_webhook(request: Request):
    try:
        update = await request.json()
    except Exception:
        return {"ok": True}

    parsed = telegram.parse_update(update)
    if not parsed or parsed.get("chat_id") is None:
        return {"ok": True}

    chat_id = parsed["chat_id"]

    # Founders only — silently ignore everyone else.
    if not settings.is_founder(chat_id):
        logger.info(f"[jarvis] ignored non-founder chat {chat_id}")
        return {"ok": True}

    # Dedupe Telegram re-deliveries.
    mid = parsed.get("message_id")
    key = f"{chat_id}:{mid}"
    if mid is not None and key in _SEEN_MSG_IDS:
        return {"ok": True}
    if mid is not None:
        _SEEN_MSG_IDS.add(key)
        if len(_SEEN_MSG_IDS) > 1000:
            _SEEN_MSG_IDS.clear()

    # The heavy work (Supabase reads + one Claude call) is blocking/sync — run it
    # off the event loop so the webhook stays responsive and Telegram doesn't retry.
    reply = await run_in_threadpool(handle_message, chat_id, parsed["text"])
    await run_in_threadpool(telegram.send_message, chat_id, reply)
    return {"ok": True}


@router.post("/jarvis/set-webhook")
async def set_webhook(url: Optional[str] = Query(default=None),
                      key: Optional[str] = Query(default=None),
                      x_ops_key: Optional[str] = Header(default=None)):
    """Register the Telegram webhook. Founders only. If url omitted, uses the
    Railway backend URL + /api/telegram."""
    if (key or x_ops_key) != settings.ops_key_resolved:
        raise HTTPException(status_code=401, detail="Invalid ops key")
    target = url or "https://l-d-designss-production.up.railway.app/api/telegram"
    return telegram.set_webhook(target)


# ── Browser-facing JARVIS (the /jarvis OS page) ───────────────────────
class CommandBody(BaseModel):
    text: str
    founder: Optional[str] = None     # "D" or "L" — who is at the console


@router.post("/jarvis/command")
async def jarvis_command(body: CommandBody,
                         key: Optional[str] = Query(default=None),
                         x_ops_key: Optional[str] = Header(default=None)):
    """Run JARVIS from the browser — same brain as Telegram, no Telegram needed.

    Gated by the ops key (not the Telegram allowlist). The console acts as the
    chosen founder; undo history is scoped to a per-founder web chat id so it
    never collides with the Telegram thread."""
    expected = settings.ops_key_resolved
    if not expected:
        raise HTTPException(status_code=503, detail="OPS_KEY/SECRET_KEY not configured on the server")
    if (key or x_ops_key) != expected:
        raise HTTPException(status_code=401, detail="Invalid ops key")
    if not (body.text or "").strip():
        return {"ok": True, "reply": "Say something.", "founder": "D"}

    founder = (body.founder or "D").upper()
    if founder not in ("D", "L"):
        founder = "D"
    reply = await run_in_threadpool(handle_message, f"web-{founder}", body.text, founder)
    return {"ok": True, "reply": reply, "founder": founder, "model": settings.CLAUDE_MODEL}


@router.get("/jarvis/ping")
async def ping():
    return {"ok": True, "telegram_enabled": settings.telegram_enabled,
            "model": settings.CLAUDE_MODEL, "founders": len(settings.founder_chat_id_list)}
