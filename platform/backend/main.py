"""
L&D Designs — Agency Platform Backend
FastAPI application — entry point
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse

from api import leads, outreach, previews, dashboard, agents, webhooks, textback, payments, strategy, ops, n8n, team
from tasks.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting L&D Designs Platform...")
    start_scheduler()
    yield
    stop_scheduler()
    logger.info("Platform stopped.")


app = FastAPI(
    title="L&D Designs Agency Platform",
    description="AI-powered web design agency platform for local barber shops",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS — allow the React frontend ──────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://l-d-designss.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routes ────────────────────────────────────────────────────────────────
app.include_router(leads.router,     prefix="/api")
app.include_router(outreach.router,  prefix="/api")
app.include_router(previews.router,  prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(agents.router,    prefix="/api")
app.include_router(webhooks.router,  prefix="/api")
app.include_router(textback.router,  prefix="/api")
app.include_router(payments.router,  prefix="/api")
app.include_router(strategy.router,  prefix="/api")
app.include_router(ops.router,       prefix="/api")
app.include_router(n8n.router,       prefix="/api")
app.include_router(team.router,      prefix="/api")


@app.get("/previews/serve/{preview_id}", response_class=HTMLResponse, include_in_schema=False)
async def serve_preview_direct(preview_id: str):
    """
    Serve a barber preview website from the database.
    Path matches what's stored in preview_url — no /api/ prefix.
    The old StaticFiles mount used to intercept this; now served from DB.
    """
    from db.client import get_db
    from agents import preview_generator

    db = get_db()
    result = db.table("previews").select("html_content, lead_id").eq("id", preview_id).single().execute()

    if not result.data:
        return HTMLResponse(content=_holding_page("Preview not found. It may have been deleted."), status_code=404)

    html = result.data.get("html_content") or ""

    if len(html) < 1000:
        # html_content is missing or truncated — regenerate from template now
        lead_id = result.data.get("lead_id")
        if lead_id:
            try:
                preview_generator.run(lead_id)
                result2 = db.table("previews").select("html_content").eq("id", preview_id).single().execute()
                html = (result2.data or {}).get("html_content") or ""
            except Exception as e:
                logger.error(f"Auto-regen failed for {preview_id}: {e}")

        if len(html) < 1000:
            return HTMLResponse(content=_holding_page("This preview is being regenerated. Refresh in a moment or WhatsApp Dylan."), status_code=200)

    # Inject the view beacon so Dylan gets the "barber opened their preview" signal
    # (this route — not just the /api one — is what's stored in preview_url).
    beacon = (
        '<script>(function(){try{'
        f'fetch("/api/previews/view/{preview_id}",{{method:"POST",keepalive:true}}).catch(function(){{}});'
        '}catch(e){}})();</script>'
    )
    if "</body>" in html:
        html = html.replace("</body>", beacon + "</body>", 1)
    else:
        html = html + beacon

    return HTMLResponse(content=html)


def _holding_page(msg: str) -> str:
    return f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview Updating</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}}
h1{{font-size:1.4rem;margin-bottom:12px;color:#C9A84C}}
p{{color:rgba(255,255,255,.5);margin-bottom:28px;font-size:.95rem;line-height:1.6;max-width:360px}}
a{{display:inline-block;background:#C9A84C;color:#000;font-weight:700;padding:13px 28px;border-radius:100px;text-decoration:none;font-size:.9rem}}
</style></head><body>
<div>
  <h1>Preview Updating</h1>
  <p>{msg}</p>
  <a href="https://wa.me/447301181878?text=Hi%20Dylan%2C%20I%20clicked%20the%20preview%20link">WhatsApp Dylan</a>
</div>
</body></html>"""


@app.get("/")
async def root():
    return {
        "name": "L&D Designs Platform",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    """Lightweight health check — also available at /api/dashboard/health for full stats."""
    from api.dashboard import health_check
    return await health_check()


# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check backend logs."},
    )
