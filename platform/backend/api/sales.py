"""
Internal trades SALES API — powers the founder Ops Board and exposes the five
sales agents over HTTP (for the board UI, manual runs, and external triggers).

FOUNDERS ONLY: every route requires the ops key (OPS_KEY, or SECRET_KEY) passed
as ?key=… or the X-Ops-Key header. Nothing here contacts a prospect or client.
"""
import logging

from fastapi import APIRouter, Depends, Header, Query, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import settings
from db.client import get_db
from agents import trades

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sales", tags=["sales"])


# ── founders-only gate ─────────────────────────────────────────────────
def require_ops_key(key: Optional[str] = Query(default=None),
                    x_ops_key: Optional[str] = Header(default=None)):
    expected = settings.ops_key_resolved
    if not expected:
        raise HTTPException(status_code=503, detail="OPS_KEY/SECRET_KEY not configured on the server")
    if (key or x_ops_key) != expected:
        raise HTTPException(status_code=401, detail="Invalid ops key")
    return True


# ── request bodies ─────────────────────────────────────────────────────
class ScoutBody(BaseModel):
    pasted_text: Optional[str] = None
    entries: Optional[list] = None
    town: Optional[str] = None
    trade: Optional[str] = None


class ProspectBody(BaseModel):
    business_name: str
    phone: Optional[str] = None
    town: Optional[str] = None
    trade: Optional[str] = None
    founder: Optional[str] = None


class LogBody(BaseModel):
    outcome: str
    new_status: Optional[str] = None


class ConvertBody(BaseModel):
    monthly_fee: Optional[float] = 49.0


class ClientBody(BaseModel):
    business_name: str
    owner_name: Optional[str] = None
    phone: str
    owner_phone: Optional[str] = None
    trade: Optional[str] = "default"
    town: Optional[str] = None
    monthly_fee: Optional[float] = 49.0


# ── Ops board snapshot ─────────────────────────────────────────────────
@router.get("/board")
async def ops_board(_=Depends(require_ops_key)):
    """Board snapshot for the Ops + JARVIS pages. Must NEVER raise an unhandled
    500: an exception here (e.g. the trades migration hasn't been run, so the
    `prospects` table is missing) would come back without CORS headers and the
    browser would report it as a generic "Network Error". Instead we catch it
    and return setup_needed so the key still works and the UI can say what's
    actually wrong."""
    db = get_db()
    try:
        ctx_pipeline = {
            s: (db.table("prospects").select("id", count="exact").eq("status", s).execute().count or 0)
            for s in ("to_call", "called", "interested", "demo_booked", "won", "not_interested", "lost")
        }
        report = trades.revenue_report(weekly=False)

        # Recent captured leads with their client name for the board feed.
        recent = (db.table("captured_leads").select("*")
                  .order("created_at", desc=True).limit(25).execute().data or [])
        client_names = {}
        for lead in recent:
            cid = lead.get("client_id")
            if cid and cid not in client_names:
                try:
                    cn = db.table("textback_clients").select("business_name").eq("id", cid).single().execute().data
                    client_names[cid] = (cn or {}).get("business_name")
                except Exception:
                    client_names[cid] = None
            lead["client_name"] = client_names.get(cid)

        return {
            "pipeline": ctx_pipeline,
            "calls": {"D": trades.build_call_list("D"), "L": trades.build_call_list("L")},
            "report": report,
            "recent_leads": recent,
        }
    except Exception as e:
        logger.error(f"[sales/board] data load failed — migration not run? {e}", exc_info=True)
        return {
            "pipeline": {}, "calls": {"D": [], "L": []}, "report": {}, "recent_leads": [],
            "setup_needed": True,
            "error": "Couldn't read the trades tables. Run db/migrations.sql in Supabase, then reload.",
        }


@router.get("/prospects")
async def list_prospects(status: Optional[str] = None, founder: Optional[str] = None,
                         limit: int = 100, _=Depends(require_ops_key)):
    db = get_db()
    q = db.table("prospects").select("*")
    if status:
        q = q.eq("status", status)
    if founder:
        q = q.eq("assigned_to", founder.upper())
    rows = q.order("rank_score", desc=True).limit(limit).execute().data or []
    return {"prospects": rows, "count": len(rows)}


# ── The five agents over HTTP ──────────────────────────────────────────
@router.post("/scout")               # 1. LEAD SCOUT  (alias also at /api/agents/scout)
async def run_scout(body: ScoutBody, _=Depends(require_ops_key)):
    return trades.scout(entries=body.entries, pasted_text=body.pasted_text,
                        town=body.town, trade=body.trade, source="ops_board")


@router.post("/prospects/{prospect_id}/prep")   # 2. SALES PREP
async def run_prep(prospect_id: str, _=Depends(require_ops_key)):
    return trades.sales_prep(prospect_id=prospect_id)


@router.post("/dial-today")          # 3. DIAL MANAGER
async def run_dial_today(post: bool = True, _=Depends(require_ops_key)):
    return trades.dial_today(post_to_telegram=post)


@router.post("/followup")            # 4. FOLLOW-UP (drafts only)
async def run_followup(post: bool = True, _=Depends(require_ops_key)):
    return trades.followup_run(post_to_telegram=post)


@router.get("/report")               # 5. REVENUE REPORTER
async def run_report(weekly: bool = False, _=Depends(require_ops_key)):
    try:
        return trades.revenue_report(weekly=weekly)
    except Exception as e:
        logger.error(f"[sales/report] {e}")
        return {"setup_needed": True, "error": "Run db/migrations.sql in Supabase."}


# ── Live AGENT OPS feed + RUN NOW ─────────────────────────────────────
@router.get("/agent-events")
async def agent_events(limit: int = 40, agent: Optional[str] = None, _=Depends(require_ops_key)):
    return {"events": trades.get_agent_events(limit=limit, agent=agent)}


@router.post("/run-agent")
async def run_agent(agent: str = Query(...), post: bool = True, _=Depends(require_ops_key)):
    """Fire one no-arg agent on demand (Dial Manager / Follow-up / Reporter)."""
    try:
        return trades.run_agent(agent, post_to_telegram=post)
    except Exception as e:
        logger.error(f"[sales/run-agent {agent}] {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Couldn't run {agent} — is the migration applied?")


# ── Prospect controls used by the board ───────────────────────────────
@router.post("/prospects")
async def add_prospect(body: ProspectBody, _=Depends(require_ops_key)):
    return trades.add_prospect(body.business_name, body.phone, body.town, body.trade, body.founder)


@router.post("/prospects/{prospect_id}/log")
async def log_call(prospect_id: str, body: LogBody, _=Depends(require_ops_key)):
    return trades.log_call(prospect_id, body.outcome, body.new_status)


@router.post("/prospects/{prospect_id}/convert")
async def convert(prospect_id: str, body: ConvertBody, _=Depends(require_ops_key)):
    return trades.convert_prospect_to_client(prospect_id, monthly_fee=body.monthly_fee or 49.0)


# ── Provision a client directly (e.g. the first one) ──────────────────
@router.post("/clients")
async def create_client(body: ClientBody, _=Depends(require_ops_key)):
    """Create a trial client + capture/dashboard tokens. Returns the live links."""
    import secrets
    from datetime import date, timedelta, datetime, timezone
    db = get_db()
    dash, cap = secrets.token_urlsafe(12), secrets.token_urlsafe(12)
    rec = {
        "business_name": body.business_name, "owner_name": body.owner_name,
        "phone": body.phone, "owner_phone": body.owner_phone or body.phone,
        "trade": body.trade or "default", "town": body.town,
        "active": True, "monthly_fee": body.monthly_fee or 49.0,
        "plan_status": "trial", "trial_start": date.today().isoformat(),
        "trial_end": (date.today() + timedelta(days=14)).isoformat(),
        "dashboard_token": dash, "capture_token": cap, "total_textbacks_sent": 0,
    }
    res = db.table("textback_clients").insert(rec).execute()
    cid = res.data[0]["id"] if res.data else None
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return {
        "ok": True, "client_id": cid,
        "capture_url": f"{base}/capture/{cap}",
        "dashboard_url": f"{base}/d/{dash}",
        "missed_call_webhook": f"https://l-d-designss-production.up.railway.app/api/textback/webhook/missed-call/{cid}",
    }


# ── One-click demo seed (founders only) ───────────────────────────────
# Phone numbers use Ofcom's reserved FICTION ranges (07700 900xxx mobiles,
# 01632 960xxx landlines) so a live demo tap-to-call never rings a real person.
# Replace with genuine scouted numbers before doing real outreach.
_DEMO_PROSPECTS = [
    {"business_name": "Wigan Rapid Plumbing",      "phone": "07700 900118", "town": "Wigan",                "trade": "plumber"},
    {"business_name": "Standish Heating Solutions","phone": "07700 900245", "town": "Standish",             "trade": "heating engineer"},
    {"business_name": "Pemberton Gas & Boilers",   "phone": "07700 900372", "town": "Pemberton",            "trade": "gas engineer"},
    {"business_name": "Orrell Drains & Plumbing",  "phone": "07700 900591", "town": "Orrell",               "trade": "drainage"},
    {"business_name": "Hindley Emergency Plumbers","phone": "07700 900614", "town": "Hindley",              "trade": "plumber"},
    {"business_name": "Ashton Boiler Care",        "phone": "07700 900733", "town": "Ashton-in-Makerfield", "trade": "heating engineer"},
    {"business_name": "Leigh Gas Services",        "phone": "07700 900857", "town": "Leigh",                "trade": "gas engineer"},
    {"business_name": "Atherton Plumb & Heat",     "phone": "07700 900926", "town": "Atherton",             "trade": "plumber"},
    {"business_name": "Bolton Boiler Doctor",      "phone": "07700 900164", "town": "Bolton",               "trade": "heating engineer"},
    {"business_name": "St Helens 24hr Plumbing",   "phone": "07700 900283", "town": "St Helens",            "trade": "plumber"},
    {"business_name": "Warrington Heating Co",     "phone": "07700 900405", "town": "Warrington",           "trade": "heating engineer"},
    {"business_name": "Skelmersdale Plumbers",     "phone": "07700 900528", "town": "Skelmersdale",         "trade": "plumber"},
    {"business_name": "Wigan Electrical NW",       "phone": "07700 900649", "town": "Wigan",                "trade": "electrician"},
    {"business_name": "Bryn Gas Engineers",        "phone": "07700 900760", "town": "Bryn",                 "trade": "gas engineer"},
    {"business_name": "Shevington Plumbing",       "phone": "07700 900881", "town": "Shevington",           "trade": "plumber"},
    {"business_name": "Tyldesley Boiler Repairs",  "phone": "07700 900192", "town": "Tyldesley",            "trade": "heating engineer"},
    {"business_name": "Golborne Drainage",         "phone": "07700 900317", "town": "Golborne",             "trade": "drainage"},
    {"business_name": "Ince Plumbing Services",    "phone": "07700 900438", "town": "Ince",                 "trade": "plumber"},
    {"business_name": "Aspull Heating Ltd",        "phone": "07700 900556", "town": "Aspull",               "trade": "heating engineer"},
    {"business_name": "Newton Gas Care",           "phone": "07700 900677", "town": "Newton-le-Willows",    "trade": "gas engineer"},
    {"business_name": "Billinge Plumbers",         "phone": "07700 900798", "town": "Billinge",             "trade": "plumber"},
    {"business_name": "Up Holland Boiler Services","phone": "07700 900819", "town": "Up Holland",           "trade": "heating engineer"},
    {"business_name": "Wigan North Electrical",    "phone": "07700 900930", "town": "Wigan",                "trade": "electrician"},
    {"business_name": "Lowton Plumb Pro",          "phone": "07700 900151", "town": "Lowton",               "trade": "plumber"},
    {"business_name": "Platt Bridge Gas",          "phone": "07700 900262", "town": "Platt Bridge",         "trade": "gas engineer"},
    {"business_name": "Marus Bridge Heating",      "phone": "07700 900384", "town": "Marus Bridge",         "trade": "heating engineer"},
    {"business_name": "Abram Drain Care",          "phone": "07700 900495", "town": "Abram",                "trade": "drainage"},
    {"business_name": "Worsley Hall Plumbing",     "phone": "01632 960517", "town": "Wigan",                "trade": "plumber"},
    {"business_name": "Beech Hill Boilers",        "phone": "01632 960638", "town": "Wigan",                "trade": "heating engineer"},
    {"business_name": "Hawkley Gas & Plumbing",    "phone": "01632 960749", "town": "Wigan",                "trade": "gas engineer"},
]
_DEMO_CLIENT_NAME = "Wigan Rapid Plumbing (DEMO)"

# A few prospects get realistic state so the queues, notes and follow-up agent
# all have something to chew on. (status, call_notes, due-today next action?)
_DEMO_NOTES = {
    "Wigan Rapid Plumbing":      ("interested", "Spoke to owner Dave — keen, reckons he loses 2-3 calls/week when he's under a sink. Wants to see it working. Ring back, push the free trial.", True),
    "Standish Heating Solutions":("called", "Gatekeeper — wife takes the calls, owner Mark's on the tools till 4. Try again after teatime.", True),
    "Leigh Gas Services":        ("demo_booked", "Booked a demo Friday 10am. Misses loads of calls while servicing boilers. Have the £49 trial ready.", False),
    "Bolton Boiler Doctor":      ("interested", "One-man band, sounded interested — 'go on then, send us something'. Follow up with a WhatsApp + a call.", True),
    "St Helens 24hr Plumbing":   ("called", "No answer x2, didn't leave VM. 24hr emergency plumber so the phone never stops — ideal fit. Retry tomorrow AM.", True),
}


def _seed_enrichment(db, demo_client_id) -> dict:
    """Give a handful of prospects real state + add 3 sample captured leads on the
    demo client. Idempotent: only fills gaps, never clobbers real data."""
    from datetime import datetime, timezone, timedelta, date
    now = datetime.now(timezone.utc)
    today = date.today().isoformat()
    out = {"notes": 0, "next_actions": 0, "captured_leads": 0}

    for name, (status, note, due_today) in _DEMO_NOTES.items():
        rows = db.table("prospects").select("*").eq("business_name", name).limit(1).execute().data or []
        if not rows:
            continue
        p = rows[0]
        if not (p.get("call_notes") or "").strip():          # don't overwrite real notes
            db.table("prospects").update({
                "status": status, "call_notes": note,
                "last_called_at": now.isoformat(), "updated_at": now.isoformat(),
            }).eq("id", p["id"]).execute()
            out["notes"] += 1
        if due_today:
            open_act = (db.table("next_actions").select("id").eq("prospect_id", p["id"])
                        .eq("done", False).limit(1).execute().data or [])
            if not open_act:
                db.table("next_actions").insert({
                    "prospect_id": p["id"], "action": "Call back — follow up on first contact",
                    "due_date": today, "done": False, "created_by": "seed",
                }).execute()
                out["next_actions"] += 1

    # Sample captured leads (only if the demo client has none yet).
    if demo_client_id:
        have = (db.table("captured_leads").select("id", count="exact")
                .eq("client_id", demo_client_id).execute().count or 0)
        if have < 3:
            samples = [
                {"name": "Sarah Whitfield", "phone": "07700 900512", "postcode": "WN1 2AB",
                 "job_description": "Boiler banging and no hot water since this morning", "source": "missed_call",
                 "status": "new", "created_at": (now - timedelta(hours=2)).isoformat()},
                {"name": "Tom Halliwell", "phone": "07700 900643", "postcode": "WN3 5RT",
                 "job_description": "Quote to replace a dripping outside tap", "source": "form",
                 "status": "contacted", "created_at": (now - timedelta(hours=20)).isoformat()},
                {"name": "Priya Nair", "phone": "07700 900788", "postcode": "WN5 8LP",
                 "job_description": "Radiator leaking downstairs, water coming through the ceiling", "source": "form",
                 "status": "new", "created_at": (now - timedelta(hours=30)).isoformat()},
            ]
            for s in samples:
                try:
                    db.table("captured_leads").insert({"client_id": demo_client_id, "notified": True, **s}).execute()
                    out["captured_leads"] += 1
                except Exception as e:
                    logger.warning(f"[seed] captured_lead failed: {e}")
    return out


def seed_demo_data() -> dict:
    """Populate the dial list with 30 realistic local prospects (deduped, ranked,
    split D/L by the real Scout) and provision one demo client with a live capture
    token — so the board + a sales demo are ready instantly. Safe to run twice:
    prospects dedupe by phone, the demo client is reused if it already exists."""
    import secrets
    from datetime import date, timedelta
    db = get_db()

    try:
        scout_res = trades.scout(entries=[dict(p) for p in _DEMO_PROSPECTS], source="seed_demo")
    except Exception as e:
        logger.error(f"[sales/seed-demo] scout failed — migration not run? {e}", exc_info=True)
        raise HTTPException(status_code=503,
                            detail="Couldn't seed: run db/migrations.sql in Supabase first, then try again.")

    # Demo client — reuse if present so repeat seeds don't pile up duplicates.
    existing = (db.table("textback_clients").select("*")
                .eq("business_name", _DEMO_CLIENT_NAME).limit(1).execute().data or [])
    if existing:
        c = existing[0]
        cid = c.get("id")
        cap = c.get("capture_token") or secrets.token_urlsafe(12)
        dash = c.get("dashboard_token") or secrets.token_urlsafe(12)
        if not c.get("capture_token") or not c.get("dashboard_token"):
            db.table("textback_clients").update(
                {"capture_token": cap, "dashboard_token": dash}).eq("id", cid).execute()
    else:
        cap, dash = secrets.token_urlsafe(12), secrets.token_urlsafe(12)
        rec = {
            "business_name": _DEMO_CLIENT_NAME, "owner_name": "Demo Owner",
            "phone": "07700 900000", "owner_phone": "07700 900000",
            "trade": "plumber", "town": "Wigan", "active": True, "monthly_fee": 49.0,
            "plan_status": "trial", "trial_start": date.today().isoformat(),
            "trial_end": (date.today() + timedelta(days=14)).isoformat(),
            "dashboard_token": dash, "capture_token": cap, "total_textbacks_sent": 0,
        }
        res = db.table("textback_clients").insert(rec).execute()
        cid = res.data[0]["id"] if res.data else None

    enrichment = _seed_enrichment(db, cid)
    trades.log_event("scout", "🌱 demo dataset seeded — 30 prospects, notes, follow-ups + sample leads",
                     "success", {"enrichment": enrichment})

    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return {
        "ok": True,
        "prospects": scout_res,
        "enrichment": enrichment,
        "demo_client": {
            "client_id": cid, "business_name": _DEMO_CLIENT_NAME,
            "capture_url": f"{base}/capture/{cap}",
            "dashboard_url": f"{base}/d/{dash}",
            "missed_call_webhook": f"https://l-d-designss-production.up.railway.app/api/textback/webhook/missed-call/{cid}",
        },
    }


@router.post("/seed-demo")
async def seed_demo(_=Depends(require_ops_key)):
    return seed_demo_data()
