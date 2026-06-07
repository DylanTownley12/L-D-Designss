from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import HTMLResponse, JSONResponse
from db.client import get_db
from agents import preview_generator, notification_agent
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/previews", tags=["previews"])

BEACON_SCRIPT = """<script>
(function(){{
  try {{
    fetch("/api/previews/view/{pid}",{{method:"POST",keepalive:true}}).catch(function(){{}});
  }} catch(e) {{}}
}})();
</script>"""


@router.post("/generate/{lead_id}")
async def generate_preview(lead_id: str, background_tasks: BackgroundTasks):
    db = get_db()
    lead_result = db.table("leads").select("*").eq("id", lead_id).single().execute()
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    result = preview_generator.run(lead_id)
    if result["status"] == "success":
        background_tasks.add_task(notification_agent.notify_preview_ready, lead_id, result["preview_url"])
        return result
    else:
        raise HTTPException(status_code=500, detail=result.get("message", "Preview generation failed"))


@router.post("/generate-batch")
async def generate_batch(limit: int = 10, background_tasks: BackgroundTasks = None):
    db = get_db()
    result = (
        db.table("leads").select("id")
        .eq("status", "preview_ready").eq("website_status", "none")
        .limit(limit).execute()
    )
    lead_ids = [r["id"] for r in (result.data or [])]
    generated = 0
    for lead_id in lead_ids:
        outcome = preview_generator.run(lead_id)
        if outcome["status"] == "success":
            generated += 1
    return {"generated": generated, "total": len(lead_ids)}


@router.post("/view/{preview_id}")
async def log_preview_view(preview_id: str):
    """Beacon endpoint — called by JS injected into every served preview HTML."""
    db = get_db()
    try:
        row = db.table("previews").select("lead_id").eq("id", preview_id).single().execute()
        lead_id = (row.data or {}).get("lead_id")
        db.table("agent_logs").insert({
            "agent_name": "preview_beacon",
            "action": "preview_viewed",
            "status": "success",
            "details": {"preview_id": preview_id, "lead_id": lead_id},
        }).execute()
        logger.info(f"[preview_beacon] view logged: preview={preview_id} lead={lead_id}")
    except Exception as e:
        logger.warning(f"[preview_beacon] log failed: {e}")
    return JSONResponse({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})


@router.get("/by-phone/{phone}")
async def get_preview_by_phone(phone: str):
    db = get_db()
    clean = phone.replace("+44", "0").replace("+", "").replace(" ", "").replace("-", "")
    lead_result = db.table("leads").select("id").ilike("phone", f"%{clean[-9:]}%").limit(1).execute()
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="No lead found for this phone number")
    lead_id = lead_result.data[0]["id"]
    preview_result = (
        db.table("previews").select("preview_url")
        .eq("lead_id", lead_id).order("created_at", desc=True).limit(1).execute()
    )
    if not preview_result.data or not preview_result.data[0].get("preview_url"):
        raise HTTPException(status_code=404, detail="No preview found for this number")
    return {"url": preview_result.data[0]["preview_url"]}


@router.get("/by-lead/{lead_id}")
async def get_preview_by_lead(lead_id: str):
    db = get_db()
    result = (
        db.table("previews").select("id, preview_url, created_at")
        .eq("lead_id", lead_id).order("created_at", desc=True).limit(1).execute()
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
    previews = result.data or []

    # Annotate with view counts from beacon logs (last 30 days, max 2000 rows)
    try:
        thirty_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        view_logs = (
            db.table("agent_logs").select("details, created_at")
            .eq("agent_name", "preview_beacon")
            .gte("created_at", thirty_ago)
            .limit(2000).execute().data or []
        )
        view_counts: dict = defaultdict(int)
        last_viewed: dict = {}
        for log in view_logs:
            pid = (log.get("details") or {}).get("preview_id")
            ts = log.get("created_at") or ""
            if pid:
                view_counts[pid] += 1
                if ts > last_viewed.get(pid, ""):
                    last_viewed[pid] = ts
        for p in previews:
            pid = p["id"]
            p["view_count"] = view_counts.get(pid, 0)
            p["last_viewed_at"] = last_viewed.get(pid)
    except Exception as e:
        logger.warning(f"[previews/list] view annotation failed: {e}")
        for p in previews:
            p["view_count"] = 0
            p["last_viewed_at"] = None

    return {"previews": previews, "total": total, "limit": limit, "offset": offset}


@router.post("/fix-urls")
async def fix_preview_urls(limit: int = 1000):
    """Repoint EVERY preview whose URL isn't the live DB-serve path to it.

    Catches all three broken formats that 404 in front of prospects:
      • localhost URLs (dev leakage)
      • old static-file URLs  (/previews/<shortid>.html)
      • null / empty URLs
    Safe self-heal: a string rebuild only — never regenerates or sends.
    Walks the whole table in pages so it fixes the full backlog, not just 500.
    """
    from config import settings
    db = get_db()
    # Resolved base guards against PREVIEW_BASE_URL still being localhost in prod.
    base = settings.preview_base_url_resolved.replace("/previews", "").rstrip("/")

    fixed = 0
    scanned = 0
    page = 0
    PAGE = 500
    while True:
        rows = (db.table("previews").select("id, preview_url")
                .order("created_at", desc=True)
                .range(page * PAGE, page * PAGE + PAGE - 1)
                .execute().data or [])
        if not rows:
            break
        for p in rows:
            scanned += 1
            url = p.get("preview_url") or ""
            if "/previews/serve/" in url and "localhost" not in url:
                continue  # already healthy
            new_url = f"{base}/previews/serve/{p['id']}"
            db.table("previews").update({"preview_url": new_url}).eq("id", p["id"]).execute()
            fixed += 1
        page += 1
        if page * PAGE >= limit:
            break
    return {"ok": True, "fixed": fixed, "scanned": scanned, "base": base}


@router.post("/regenerate")
async def regenerate_previews(limit: int = 150, marker: str = "Fraunces"):
    """Upgrade previews to the CURRENT template, resumably.

    Pages through the previews table and regenerates any whose stored HTML
    doesn't already contain `marker` (a string only the new template emits).
    Already-upgraded previews are skipped, so repeated calls march through the
    backlog without redoing work and without timing out. Returns how many were
    upgraded this call and how many stale ones remain.
    """
    db = get_db()
    upgraded, scanned, remaining = 0, 0, 0
    page, PAGE = 0, 200
    while True:
        rows = (db.table("previews").select("id, lead_id, html_content")
                .order("created_at", desc=True)
                .range(page * PAGE, page * PAGE + PAGE - 1)
                .execute().data or [])
        if not rows:
            break
        for r in rows:
            scanned += 1
            html = r.get("html_content") or ""
            if marker in html:
                continue  # already on the new template
            if not r.get("lead_id"):
                continue
            if upgraded < limit:
                outcome = preview_generator.run(r["lead_id"], force=True)
                if outcome.get("status") == "success":
                    upgraded += 1
            else:
                remaining += 1
        page += 1
    return {"ok": True, "upgraded": upgraded, "remaining_stale": remaining, "scanned": scanned}


@router.get("/serve/{preview_id}", response_class=HTMLResponse)
async def serve_preview(preview_id: str):
    """Serve a preview from DB and inject view beacon script."""
    db = get_db()
    result = db.table("previews").select("html_content, lead_id").eq("id", preview_id).single().execute()
    if not result.data:
        return HTMLResponse(content=_missing_page("Preview not found."), status_code=404)

    html = result.data.get("html_content") or ""
    lead_id = result.data.get("lead_id")

    if len(html) < 1000:
        if lead_id:
            try:
                preview_generator.run(lead_id)
                result2 = db.table("previews").select("html_content").eq("id", preview_id).single().execute()
                html = (result2.data or {}).get("html_content") or ""
            except Exception:
                pass
        if len(html) < 1000:
            return HTMLResponse(content=_missing_page("This preview is being regenerated. Check back in a moment."))

    # Inject beacon before </body>
    beacon = BEACON_SCRIPT.format(pid=preview_id)
    if "</body>" in html:
        html = html.replace("</body>", beacon + "</body>", 1)
    else:
        html = html + beacon

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
