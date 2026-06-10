"""
Public lead-capture form API. The unguessable capture_token in the URL IS the
auth — no login. A homeowner submits → captured_lead + founder Telegram ping +
shows on the client's dashboard.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from db.client import get_db
from agents import lead_capture

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/capture", tags=["capture"])


class CaptureSubmit(BaseModel):
    name: Optional[str] = None
    phone: str
    postcode: Optional[str] = None
    job_description: Optional[str] = None


def _client_by_capture_token(token: str) -> dict:
    db = get_db()
    try:
        c = db.table("textback_clients").select("*").eq("capture_token", token).single().execute().data
    except Exception:
        c = None
    if not c:
        raise HTTPException(status_code=404, detail="Form not found")
    return c


@router.get("/{capture_token}")
async def capture_info(capture_token: str):
    """Branding info the public form renders (business name, trade, town)."""
    c = _client_by_capture_token(capture_token)
    return {
        "business_name": c.get("business_name"),
        "trade": c.get("trade"),
        "town": c.get("town"),
        "active": bool(c.get("active", True)),
    }


@router.post("/{capture_token}")
async def capture_submit(capture_token: str, data: CaptureSubmit):
    c = _client_by_capture_token(capture_token)
    phone = (data.phone or "").strip()
    if len(phone) < 7:
        raise HTTPException(status_code=400, detail="A valid phone number is required")

    result = lead_capture.record_lead(
        client_id=c["id"], phone=phone, name=data.name, postcode=data.postcode,
        job_description=data.job_description, source="form",
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Could not save enquiry"))
    return {
        "ok": True,
        "message": f"Thanks! {c.get('business_name','The team')} has your details and will be in touch shortly.",
    }
