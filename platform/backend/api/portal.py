"""
Client dashboard API. The unguessable dashboard_token in the URL IS the auth.
A trade client sees the leads we've captured for them and can move each through
their own pipeline (new → contacted → quoted → won/lost).
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db.client import get_db
from agents.trades_logic import trial_days_remaining

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/portal", tags=["portal"])

VALID_LEAD_STATUS = {"new", "contacted", "quoted", "won", "lost"}


class LeadStatusUpdate(BaseModel):
    status: str


def _client_by_dashboard_token(token: str) -> dict:
    db = get_db()
    try:
        c = db.table("textback_clients").select("*").eq("dashboard_token", token).single().execute().data
    except Exception:
        c = None
    if not c:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return c


@router.get("/{dashboard_token}")
async def client_dashboard(dashboard_token: str):
    db = get_db()
    c = _client_by_dashboard_token(dashboard_token)

    leads = (db.table("captured_leads").select("*")
             .eq("client_id", c["id"]).order("created_at", desc=True).limit(200).execute().data or [])

    by_status = {s: 0 for s in VALID_LEAD_STATUS}
    for lead in leads:
        by_status[lead.get("status", "new")] = by_status.get(lead.get("status", "new"), 0) + 1

    days_remaining = trial_days_remaining(c.get("trial_end")) if c.get("plan_status") == "trial" else None

    return {
        "business_name": c.get("business_name"),
        "trade": c.get("trade"),
        "town": c.get("town"),
        "plan_status": c.get("plan_status"),
        "monthly_fee": float(c.get("monthly_fee") or 0),
        "trial_days_remaining": days_remaining,
        "total_leads": len(leads),
        "leads_by_status": by_status,
        "leads": leads,
    }


@router.post("/{dashboard_token}/leads/{lead_id}/status")
async def update_lead_status(dashboard_token: str, lead_id: str, data: LeadStatusUpdate):
    c = _client_by_dashboard_token(dashboard_token)
    status = (data.status or "").strip().lower()
    if status not in VALID_LEAD_STATUS:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(VALID_LEAD_STATUS)}")

    db = get_db()
    # Ensure the lead belongs to THIS client (token scoping).
    try:
        lead = db.table("captured_leads").select("id,client_id").eq("id", lead_id).single().execute().data
    except Exception:
        lead = None
    if not lead or lead.get("client_id") != c["id"]:
        raise HTTPException(status_code=404, detail="Lead not found")

    from datetime import datetime, timezone
    db.table("captured_leads").update(
        {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", lead_id).execute()
    return {"ok": True, "lead_id": lead_id, "status": status}
