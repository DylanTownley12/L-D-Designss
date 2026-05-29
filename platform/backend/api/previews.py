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


@router.get("/")
async def list_previews(limit: int = 200):
    db = get_db()
    result = (
        db.table("previews")
        .select("*, leads(business_name, city, status)")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"previews": result.data or []}


@router.get("/serve/{preview_id}", response_class=HTMLResponse)
async def serve_preview(preview_id: str):
    """Serve a preview website directly from the database — survives redeploys."""
    db = get_db()
    result = db.table("previews").select("html_content").eq("id", preview_id).single().execute()
    if not result.data or not result.data.get("html_content"):
        raise HTTPException(status_code=404, detail="Preview not found")
    return HTMLResponse(content=result.data["html_content"])


@router.get("/{preview_id}")
async def get_preview(preview_id: str):
    db = get_db()
    result = db.table("previews").select("*").eq("id", preview_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Preview not found")
    return result.data
