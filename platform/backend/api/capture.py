"""
Public lead-capture form API. The unguessable capture_token in the URL IS the
auth — no login. A homeowner submits → captured_lead + founder Telegram ping +
shows on the client's dashboard.
"""
import logging

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List

from db.client import get_db
from agents import lead_capture
from utils import storage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/capture", tags=["capture"])


class CaptureSubmit(BaseModel):
    name: Optional[str] = None
    phone: str
    postcode: Optional[str] = None
    job_type: Optional[str] = None
    urgency: Optional[str] = None
    job_description: Optional[str] = None
    photo_urls: Optional[List[str]] = None


def _resolve_capture(token: str):
    """Resolve a capture token to ('client', row) or ('prospect', row). A prospect
    token backs the on-demand demo preview so the form is live before they sign."""
    db = get_db()
    try:
        c = db.table("textback_clients").select("*").eq("capture_token", token).single().execute().data
    except Exception:
        c = None
    if c:
        return "client", c
    try:
        p = db.table("prospects").select("*").eq("capture_token", token).single().execute().data
    except Exception:
        p = None
    if p:
        return "prospect", p
    raise HTTPException(status_code=404, detail="Form not found")


def _client_by_capture_token(token: str) -> dict:
    """Back-compat: a client OR a prospect-backed form. Returns the branding row."""
    _, row = _resolve_capture(token)
    return row


@router.get("/{capture_token}")
async def capture_info(capture_token: str):
    """Branding info the public form renders (business name, trade, town)."""
    kind, row = _resolve_capture(capture_token)
    return {
        "business_name": row.get("business_name"),
        "trade": row.get("trade"),
        "town": row.get("town"),
        "active": bool(row.get("active", True)) if kind == "client" else True,
    }


@router.post("/{capture_token}/photo")
async def capture_photo(capture_token: str, file: UploadFile = File(...)):
    """Upload one photo for an in-progress enquiry. Returns its signed URL, which
    the form then submits in photo_urls. Backend-only upload via the service key."""
    _resolve_capture(capture_token)                  # validates the token
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")
    url = storage.upload_photo(content, file.filename or "photo.jpg", file.content_type)
    if not url:
        raise HTTPException(status_code=502, detail="Photo upload failed")
    return {"ok": True, "url": url}


@router.post("/{capture_token}")
async def capture_submit(capture_token: str, data: CaptureSubmit):
    kind, row = _resolve_capture(capture_token)
    phone = (data.phone or "").strip()
    if len(phone) < 7:
        raise HTTPException(status_code=400, detail="A valid phone number is required")

    kwargs = dict(phone=phone, name=data.name, postcode=data.postcode,
                  job_type=data.job_type, urgency=data.urgency,
                  job_description=data.job_description, photo_urls=data.photo_urls,
                  source="web_form")
    if kind == "client":
        result = lead_capture.record_lead(client_id=row["id"], **kwargs)
    else:
        result = lead_capture.record_lead(prospect_id=row["id"], **kwargs)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Could not save enquiry"))
    return {
        "ok": True,
        "message": f"Thanks! {row.get('business_name','The team')} has your details and will be in touch shortly.",
    }
