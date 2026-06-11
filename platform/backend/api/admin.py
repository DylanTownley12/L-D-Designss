"""
TEMPORARY bootstrap/diagnostics router — REMOVE after tonight's go-live.

Two jobs, both safe:
  • GET  /api/admin/env-check  — names-only view of which env vars are set
    (booleans + connection-string host/scheme only — NEVER secret values).
    Lets us see if autonomous DB migration is possible and audit Railway env.
  • POST /api/admin/migrate    — run db/migrations.sql idempotently over a real
    Postgres connection IF one is configured (DATABASE_URL/SUPABASE_DB_URL/…).
    Gated by a one-shot token (we don't have OPS_KEY locally). All DDL is
    CREATE/ALTER ... IF NOT EXISTS, so re-running is harmless.

This file is deleted in the cleanup commit once the tables exist.
"""
import os
import logging
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin-temp"])

# Env vars that could carry a direct Postgres connection (for self-migrate).
_CONN_KEYS = ["DATABASE_URL", "SUPABASE_DB_URL", "POSTGRES_URL", "POSTGRESQL_URL",
              "PG_CONNECTION_STRING", "POSTGRES_CONNECTION", "PGHOST", "PG_DSN"]
# Other vars we want to confirm for the go-live report (presence only).
_OTHER_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_ANON_KEY",
               "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CLAUDE_MODEL",
               "TELEGRAM_BOT_TOKEN", "FOUNDER_CHAT_IDS", "FOUNDER_D_CHAT_ID",
               "FOUNDER_L_CHAT_ID", "OPS_KEY", "SECRET_KEY", "FRONTEND_BASE_URL"]

# One-shot token to run the migration without OPS_KEY (which we don't hold).
# Rotated/removed in the cleanup commit.
_MIGRATE_TOKEN = "ld-bootstrap-2026-06-11-9f3a"


@router.get("/env-check")
def env_check():
    present = {k: bool(os.environ.get(k)) for k in (_CONN_KEYS + _OTHER_KEYS)}
    conn_info = {}
    for k in _CONN_KEYS:
        v = os.environ.get(k)
        if not v:
            continue
        if "://" in v:
            try:
                p = urlparse(v)
                conn_info[k] = {"scheme": p.scheme, "host": p.hostname,
                                "port": p.port, "db": (p.path or "").lstrip("/")}
            except Exception:
                conn_info[k] = {"parse": "failed"}
        else:
            conn_info[k] = {"raw_present": True}
    return {
        "present": present,
        "conn_info": conn_info,
        "can_self_migrate": any(present[k] for k in _CONN_KEYS),
    }


def _resolve_conn_string() -> Optional[str]:
    for k in ("DATABASE_URL", "SUPABASE_DB_URL", "POSTGRES_URL", "POSTGRESQL_URL",
              "PG_CONNECTION_STRING", "POSTGRES_CONNECTION", "PG_DSN"):
        v = os.environ.get(k)
        if v and "://" in v:
            return v
    return None


@router.post("/migrate")
def migrate(token: Optional[str] = Query(default=None)):
    if token != _MIGRATE_TOKEN:
        raise HTTPException(status_code=401, detail="bad token")

    conn_str = _resolve_conn_string()
    if not conn_str:
        return {"ok": False, "ran": False,
                "reason": "No Postgres connection string in env — migration must be run manually in Supabase SQL Editor."}

    # Load the SQL file shipped in the repo.
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
    sql_path = os.path.join(here, "db", "migrations.sql")
    try:
        with open(sql_path, "r") as f:
            sql = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"can't read migrations.sql: {e}")

    try:
        import psycopg  # psycopg 3
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"psycopg not installed: {e}")

    # Supabase pooler URLs sometimes need sslmode; psycopg honours it in the URL.
    try:
        with psycopg.connect(conn_str, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
        # Verify the trades tables now exist.
        with psycopg.connect(conn_str, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT table_name FROM information_schema.tables
                    WHERE table_schema='public'
                      AND table_name IN ('prospects','captured_leads','next_actions','jarvis_log','agent_events')
                    ORDER BY table_name;
                """)
                tables = [r[0] for r in cur.fetchall()]
        return {"ok": True, "ran": True, "tables_present": tables}
    except Exception as e:
        logger.error(f"[admin/migrate] failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"migration failed: {e}")
