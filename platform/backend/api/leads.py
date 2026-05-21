from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from db.client import get_db
from models.schemas import LeadCreate, LeadUpdate

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("/")
async def list_leads(
    status: Optional[str] = None,
    city: Optional[str] = None,
    website_status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    db = get_db()
    query = db.table("leads").select("*")

    if status:
        query = query.eq("status", status)
    if city:
        query = query.ilike("city", f"%{city}%")
    if website_status:
        query = query.eq("website_status", website_status)
    if search:
        query = query.ilike("business_name", f"%{search}%")

    result = (
        query
        .order("quality_score", desc=True)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"leads": result.data or [], "total": len(result.data or [])}


@router.get("/{lead_id}")
async def get_lead(lead_id: str):
    db = get_db()
    result = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Include outreach history and previews
    messages = db.table("outreach_messages").select("*").eq("lead_id", lead_id).order("created_at").execute()
    previews = db.table("previews").select("*").eq("lead_id", lead_id).order("created_at", desc=True).execute()

    return {
        **result.data,
        "messages": messages.data or [],
        "previews": previews.data or [],
    }


@router.post("/")
async def create_lead(lead: LeadCreate):
    db = get_db()
    result = db.table("leads").insert(lead.model_dump(exclude_none=True)).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create lead")
    created = result.data[0]

    from utils import n8n
    n8n.trigger("lead-enrichment", {
        "lead_id": created["id"],
        "business_name": created.get("business_name", ""),
    })

    return created


@router.patch("/{lead_id}")
async def update_lead(lead_id: str, update: LeadUpdate):
    db = get_db()
    data = update.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = db.table("leads").update(data).eq("id", lead_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    return result.data[0]


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str):
    db = get_db()
    db.table("leads").delete().eq("id", lead_id).execute()
    return {"deleted": True}


@router.post("/{lead_id}/do-not-contact")
async def mark_do_not_contact(lead_id: str):
    db = get_db()
    db.table("leads").update({"status": "do_not_contact"}).eq("id", lead_id).execute()
    # Stop any active follow-up sequence
    db.table("follow_up_sequences").update({
        "stopped": True,
        "stop_reason": "do_not_contact",
    }).eq("lead_id", lead_id).execute()
    return {"status": "do_not_contact"}
