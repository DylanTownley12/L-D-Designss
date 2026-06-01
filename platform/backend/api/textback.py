"""
Missed Call Text-Back API
Manages client subscriptions and handles missed call webhooks.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from db.client import get_db
from agents import missed_call_textback

router = APIRouter(prefix="/textback", tags=["textback"])


class ClientCreate(BaseModel):
    business_name: str
    owner_name: str
    phone: str           # The client's business phone (we forward calls from this)
    trade: str           # plumber, electrician, builder, etc.
    custom_message: Optional[str] = None
    monthly_fee: Optional[float] = 49.0


class ClientUpdate(BaseModel):
    business_name: Optional[str] = None
    owner_name: Optional[str] = None
    trade: Optional[str] = None
    custom_message: Optional[str] = None
    active: Optional[bool] = None
    monthly_fee: Optional[float] = None


# ── Client management ──────────────────────────────────────────────────

@router.get("/clients")
async def list_clients():
    db = get_db()
    result = db.table("textback_clients").select("*").order("created_at", desc=True).execute()
    clients = result.data or []

    # Attach today's event counts
    from datetime import date
    today = date.today().isoformat()
    for c in clients:
        count = (
            db.table("textback_events")
            .select("id", count="exact")
            .eq("client_id", c["id"])
            .eq("success", True)
            .gte("fired_at", f"{today}T00:00:00")
            .execute()
        ).count or 0
        c["events_today"] = count

    return {"clients": clients}


@router.post("/clients")
async def create_client(data: ClientCreate):
    db = get_db()
    result = db.table("textback_clients").insert({
        "business_name": data.business_name,
        "owner_name": data.owner_name,
        "phone": data.phone,
        "trade": data.trade,
        "custom_message": data.custom_message,
        "monthly_fee": data.monthly_fee,
        "active": True,
        "total_textbacks_sent": 0,
    }).execute()
    return {"client": result.data[0] if result.data else {}}


@router.get("/clients/{client_id}")
async def get_client(client_id: str):
    stats = missed_call_textback.get_client_stats(client_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Client not found")
    return stats


@router.patch("/clients/{client_id}")
async def update_client(client_id: str, data: ClientUpdate):
    db = get_db()
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    db.table("textback_clients").update(update).eq("id", client_id).execute()
    return {"updated": True}


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str):
    db = get_db()
    db.table("textback_clients").delete().eq("id", client_id).execute()
    return {"deleted": True}


@router.post("/clients/{client_id}/toggle")
async def toggle_client(client_id: str):
    db = get_db()
    client = db.table("textback_clients").select("active").eq("id", client_id).single().execute().data
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    new_state = not client["active"]
    db.table("textback_clients").update({"active": new_state}).eq("id", client_id).execute()
    return {"active": new_state}


# ── Webhook — receives missed call signal ──────────────────────────────

@router.post("/webhook/missed-call/{client_id}")
async def missed_call_webhook(client_id: str, request: Request):
    """
    Called when a client misses a call.
    Twilio can POST here when a call goes unanswered.
    Also accept manual triggers for testing.
    """
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    form = await request.form() if "application/x-www-form-urlencoded" in request.headers.get("content-type", "") else {}

    # Twilio sends form data: From = caller number
    caller = (
        form.get("From") or
        body.get("caller_number") or
        body.get("From") or
        "unknown"
    )

    if caller == "unknown":
        raise HTTPException(status_code=400, detail="caller_number required")

    result = missed_call_textback.handle_missed_call(client_id, caller)
    return result


@router.post("/test/{client_id}")
async def test_textback(client_id: str, caller_number: str):
    """Send a test text-back to verify the service works."""
    result = missed_call_textback.handle_missed_call(client_id, caller_number)
    return result


# ── Stats ──────────────────────────────────────────────────────────────

@router.get("/stats")
async def overall_stats():
    db = get_db()
    from datetime import date, timedelta

    today = date.today().isoformat()
    month_start = date.today().replace(day=1).isoformat()

    total_clients = (db.table("textback_clients").select("id", count="exact").execute()).count or 0
    active_clients = (db.table("textback_clients").select("id", count="exact").eq("active", True).execute()).count or 0
    sent_today = (
        db.table("textback_events")
        .select("id", count="exact")
        .eq("success", True)
        .gte("fired_at", f"{today}T00:00:00")
        .execute()
    ).count or 0
    sent_this_month = (
        db.table("textback_events")
        .select("id", count="exact")
        .eq("success", True)
        .gte("fired_at", f"{month_start}T00:00:00")
        .execute()
    ).count or 0

    revenue_result = db.table("textback_clients").select("monthly_fee").eq("active", True).execute()
    mrr = sum(r["monthly_fee"] or 0 for r in (revenue_result.data or []))

    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "sent_today": sent_today,
        "sent_this_month": sent_this_month,
        "mrr": mrr,
    }
