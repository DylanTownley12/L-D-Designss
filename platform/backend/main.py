"""
L&D Designs — Agency Platform Backend
FastAPI application — entry point
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from api import leads, outreach, previews, dashboard, agents, webhooks
from api.deps import require_api_key
from config import settings
from tasks.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Ensure static directories exist
Path("static/previews").mkdir(parents=True, exist_ok=True)


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
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# ── CORS — allow the React frontend ──────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://l-d-designss.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Serve generated preview HTML files ───────────────────────────────────────
app.mount("/previews", StaticFiles(directory="static/previews"), name="previews")

# ── API routes ────────────────────────────────────────────────────────────────
_auth = [Depends(require_api_key)]
app.include_router(leads.router,     prefix="/api", dependencies=_auth)
app.include_router(outreach.router,  prefix="/api", dependencies=_auth)
app.include_router(previews.router,  prefix="/api", dependencies=_auth)
app.include_router(dashboard.router, prefix="/api", dependencies=_auth)
app.include_router(agents.router,    prefix="/api", dependencies=_auth)
app.include_router(webhooks.router,  prefix="/api")  # auth handled per-endpoint


@app.get("/")
async def root():
    return {
        "name": "L&D Designs Platform",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check backend logs."},
    )
