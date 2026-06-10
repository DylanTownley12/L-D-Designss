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
    db = get_db()
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
    return trades.revenue_report(weekly=weekly)


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
