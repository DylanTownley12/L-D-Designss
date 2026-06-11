"""
Insert validation for the trades data layer (Fable data-integrity rule).

Every record in the core tables must carry its structural fields before it can be
written: a status, a source, and a data_mode ('real' or 'demo'); some also need an
owner. db/client.py is a thin PostgREST client, so we enforce at the write helpers
(the only code paths that insert into these tables) rather than globally — the
barber tables are deliberately left untouched.

Postgres supplies id + created_at via column defaults, so a validated record that
passes here always lands complete.
"""

# table -> business fields the CALLER must supply (non-empty)
_REQUIRED = {
    "prospects":        ["business_name", "status", "source"],
    "captured_leads":   ["phone", "status", "source"],
    "textback_clients": ["business_name", "plan_status"],
    "tasks":            ["title", "status"],
}

# tables where a record must be owned by a founder (D/L)
_OWNER_TABLES = set()  # prospects use assigned_to but may be unassigned at import; enforce via clean(owner_required=)


class ValidationError(ValueError):
    """Raised when a record is missing a structural field. Callers should surface
    this as a 4xx / logged refusal, never a silent partial write."""


def clean(table: str, record: dict, *, owner_required: bool = False) -> dict:
    """Return a validated copy of `record` for `table`, or raise ValidationError.

    Guarantees: data_mode is 'real' (default) or 'demo'; all required business
    fields are present and non-empty; owner present when required. Does NOT inject
    timestamps (column sets differ per table; Postgres defaults handle created_at)."""
    rec = dict(record or {})

    rec.setdefault("data_mode", "real")
    if rec.get("data_mode") not in ("real", "demo"):
        raise ValidationError(
            f"{table}.data_mode must be 'real' or 'demo', got {rec.get('data_mode')!r}")

    missing = [f for f in _REQUIRED.get(table, []) if not str(rec.get(f) or "").strip()]
    if owner_required and not str(rec.get("owner") or rec.get("assigned_to") or "").strip():
        missing.append("owner")
    if missing:
        raise ValidationError(
            f"{table} insert rejected — missing required field(s): {', '.join(missing)}")
    return rec


def is_demo(record: dict) -> bool:
    return (record or {}).get("data_mode") == "demo"
