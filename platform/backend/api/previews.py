from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse
from db.client import get_db
from agents import preview_generator, notification_agent

router = APIRouter(prefix="/previews", tags=["previews"])


@router.post("/generate/{lead_id}")
async def generate_preview(lead_id: str, background_tasks: BackgroundTasks):
    """Generate a preview website for a lead."""
    db = get_db()

    lead_result = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    result = preview_generator.run(lead_id)

    if result["status"] == "success":
        background_tasks.add_task(
            notification_agent.notify_preview_ready,
            lead_id,
            result["preview_url"],
        )
        return result
    else:
        raise HTTPException(status_code=500, detail=result.get("message", "Preview generation failed"))


@router.post("/generate-batch")
async def generate_batch(limit: int = 10, background_tasks: BackgroundTasks = None):
    """Generate previews for all leads in preview_ready status."""
    db = get_db()

    result = (
        db.table("leads")
        .select("id")
        .eq("status", "preview_ready")
        .eq("website_status", "none")
        .limit(limit)
        .execute()
    )

    lead_ids = [r["id"] for r in (result.data or [])]
    generated = 0

    for lead_id in lead_ids:
        outcome = preview_generator.run(lead_id)
        if outcome["status"] == "success":
            generated += 1

    return {"generated": generated, "total": len(lead_ids)}


@router.get("/by-phone/{phone}")
async def get_preview_by_phone(phone: str):
    """Baz calls this with a barber's phone number to get their preview URL."""
    db = get_db()
    clean = phone.replace("+44", "0").replace("+", "").replace(" ", "").replace("-", "")
    lead_result = db.table("leads").select("id").ilike("phone", f"%{clean[-9:]}%").limit(1).execute()
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="No lead found for this phone number")
    lead_id = lead_result.data[0]["id"]
    preview_result = (
        db.table("previews")
        .select("preview_url")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not preview_result.data or not preview_result.data[0].get("preview_url"):
        raise HTTPException(status_code=404, detail="No preview found for this number")
    return {"url": preview_result.data[0]["preview_url"]}


@router.get("/by-lead/{lead_id}")
async def get_preview_by_lead(lead_id: str):
    """Get the latest preview URL for a lead."""
    db = get_db()
    result = (
        db.table("previews")
        .select("id, preview_url, created_at")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No preview found for this lead")
    return result.data[0]


@router.get("/")
async def list_previews(limit: int = 50, offset: int = 0):
    db = get_db()
    result = (
        db.table("previews")
        .select("*, leads(business_name, city, status)", count="exact")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    total = result.count if result.count is not None else len(result.data or [])
    return {"previews": result.data or [], "total": total, "limit": limit, "offset": offset}


@router.get("/serve/{preview_id}", response_class=HTMLResponse)
async def serve_preview(preview_id: str):
    """Serve a preview website directly from the database — survives redeploys."""
    db = get_db()
    result = db.table("previews").select("html_content, lead_id").eq("id", preview_id).single().execute()
    if not result.data:
        return HTMLResponse(content=_missing_page("Preview not found."), status_code=404)
    html = result.data.get("html_content") or ""
    if len(html) < 1000:
        # Old file-based preview or truncated — serve a holding page and queue regeneration
        lead_id = result.data.get("lead_id")
        if lead_id:
            try:
                preview_generator.run(lead_id)
                # Re-fetch after regeneration
                result2 = db.table("previews").select("html_content").eq("id", preview_id).single().execute()
                html = (result2.data or {}).get("html_content") or ""
            except Exception:
                pass
        if len(html) < 1000:
            return HTMLResponse(content=_missing_page("This preview is being regenerated. Check back in a moment."), status_code=200)
    return HTMLResponse(content=html)


def _missing_page(msg: str) -> str:
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview Unavailable</title>
<style>
  body{{margin:0;background:#080808;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}}
  h1{{font-size:1.5rem;margin-bottom:12px;color:#C9A84C}}
  p{{color:rgba(255,255,255,0.5);margin-bottom:24px;font-size:0.95rem}}
  a{{background:#C9A84C;color:#000;font-weight:600;padding:12px 28px;border-radius:999px;text-decoration:none;display:inline-block}}
</style></head><body>
<div><h1>Preview Updating</h1><p>{msg}</p>
<a href="https://wa.me/447301181878">Contact Dylan on WhatsApp</a></div>
</body></html>"""


@router.get("/{preview_id}")
async def get_preview(preview_id: str):
    db = get_db()
    result = db.table("previews").select("*").eq("id", preview_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Preview not found")
    return result.data
