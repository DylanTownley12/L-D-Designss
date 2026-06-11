"""
The trades SALES engine — five agents that run the outbound motion of selling
the missed-call/text-back service to plumbers, electricians and other trades.

    1. Lead Scout      — build + rank + dedupe the call list (never contacts anyone)
    2. Sales Prep      — Claude-written call notes for a booked demo
    3. Dial Manager    — each founder's ordered call list for the day
    4. Follow-up       — DRAFTS chase messages (never sends them)
    5. Revenue Reporter— the daily/weekly numbers

Every function here writes to the SAME Supabase tables the product (Part A) uses,
and every one is callable both from the scheduler and from JARVIS.

HARD RULES enforced here:
  • No autonomous outbound contact. Scout only inserts rows; Follow-up only
    drafts. Nothing in this file ever messages a prospect or a client.
  • Telegram sends in this file go to FOUNDERS only (internal).
"""
import logging
import secrets
from datetime import date, datetime, timedelta, timezone

import safety
from config import settings
from db.client import get_db
from utils import telegram, notify
from models.validate import clean as validate_clean, ValidationError
from agents.trades_logic import (
    normalize_phone, score_prospect, parse_pasted_list, dedupe_entries,
    trial_days_remaining, churn_risk, is_trial_touchpoint,
    is_emergency_trade, valid_uk_phone, local_demand_for,
    opportunity_score, qualify, sales_angle_template,
)

logger = logging.getLogger(__name__)

EMERGENCY_TRADE_DEFAULT = "plumber"
REAL, DEMO = "real", "demo"
# Statuses past which a prospect is done and needs no next action / no dead-pipeline flag.
TERMINAL_STATUSES = ("won", "lost", "not_interested")


# ── small helpers ─────────────────────────────────────────────────────
def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _today():
    return date.today()


def _yesterday_window():
    y = _today() - timedelta(days=1)
    return f"{y.isoformat()}T00:00:00", f"{_today().isoformat()}T00:00:00"


def _claude(system: str, user: str, max_tokens: int = 700, agent: str = "trades_agent"):
    """One bounded Claude call. Returns text, or None on any failure (callers
    must have a non-Claude fallback so the system never depends on it)."""
    if not settings.ANTHROPIC_API_KEY:
        return None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        try:
            safety.record_spend(agent, settings.CLAUDE_MODEL,
                                getattr(resp.usage, "input_tokens", 0),
                                getattr(resp.usage, "output_tokens", 0))
        except Exception:
            pass
        return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
    except Exception as e:
        logger.error(f"[trades._claude] {e}")
        return None


def find_prospect(name_or_id: str):
    """Resolve a prospect by id (uuid) or fuzzy business-name match."""
    if not name_or_id:
        return None
    db = get_db()
    s = str(name_or_id).strip()
    if len(s) >= 32 and "-" in s:                       # looks like a uuid
        try:
            r = db.table("prospects").select("*").eq("id", s).single().execute()
            if r.data:
                return r.data
        except Exception:
            pass
    rows = db.table("prospects").select("*").ilike("business_name", f"%{s}%").limit(8).execute().data or []
    if not rows:
        return None
    low = s.lower()
    rows.sort(key=lambda r: (
        0 if (r.get("business_name") or "").lower() == low else
        1 if (r.get("business_name") or "").lower().startswith(low) else 2,
        len(r.get("business_name") or ""),
    ))
    return rows[0]


def _existing_phone_norms(mode: str = REAL) -> set:
    db = get_db()
    try:
        rows = (db.table("prospects").select("phone_norm,business_name")
                .eq("data_mode", mode).limit(5000).execute().data or [])
    except Exception:
        rows = db.table("prospects").select("phone_norm,business_name").limit(5000).execute().data or []
    norms = set()
    for r in rows:
        n = r.get("phone_norm") or normalize_phone(r.get("phone"))
        if n:
            norms.add(n)
        else:
            norms.add("name:" + (r.get("business_name") or "").strip().lower())
    return norms


def _assignment_counts(mode: str = REAL) -> dict:
    db = get_db()
    out = {}
    for code in ("D", "L"):
        try:
            out[code] = (db.table("prospects").select("id", count="exact")
                         .eq("assigned_to", code).eq("data_mode", mode).execute().count or 0)
        except Exception:
            out[code] = db.table("prospects").select("id", count="exact").eq("assigned_to", code).execute().count or 0
    return out


def _leads_captured(client_id: str, since=None) -> int:
    db = get_db()
    q = db.table("captured_leads").select("id", count="exact").eq("client_id", client_id)
    if since:
        q = q.gte("created_at", since)
    return q.execute().count or 0


def log_event(agent: str, message: str, level: str = "info", data: dict = None) -> None:
    """Write one line to the live AGENT OPS feed. Best-effort — never throws,
    never blocks the agent's real work (e.g. if the table isn't migrated yet)."""
    try:
        get_db().table("agent_events").insert({
            "agent": agent, "level": level, "message": message, "data": data or {},
        }).execute()
    except Exception as e:
        logger.debug(f"[log_event] skipped ({agent}): {e}")


def get_agent_events(limit: int = 40, agent: str = None) -> list:
    """Most-recent agent events for the live feed."""
    try:
        q = get_db().table("agent_events").select("*")
        if agent:
            q = q.eq("agent", agent)
        return q.order("created_at", desc=True).limit(min(limit, 200)).execute().data or []
    except Exception:
        return []


# ════════════════════════════════════════════════════════════════════
#  ALERTS — back the Mission Control RED ALERT banner. Deduped, best-effort.
# ════════════════════════════════════════════════════════════════════
def raise_alert(kind: str, message: str, severity: str = "warn",
                entity: str = None, entity_id: str = None, mode: str = REAL) -> None:
    """Record an open alert (deduped on kind+entity_id). Never throws."""
    try:
        db = get_db()
        if entity_id:
            existing = (db.table("alerts").select("id").eq("kind", kind)
                        .eq("entity_id", str(entity_id)).eq("resolved", False)
                        .limit(1).execute().data or [])
            if existing:
                return
        db.table("alerts").insert({
            "kind": kind, "message": message[:500], "severity": severity,
            "entity": entity, "entity_id": str(entity_id) if entity_id else None,
            "data_mode": mode,
        }).execute()
    except Exception as e:
        logger.debug(f"[raise_alert] skipped: {e}")


def get_open_alerts(mode: str = REAL, limit: int = 50) -> list:
    try:
        return (get_db().table("alerts").select("*").eq("resolved", False)
                .eq("data_mode", mode).order("created_at", desc=True)
                .limit(limit).execute().data or [])
    except Exception:
        return []


def resolve_alert(alert_id: str = None, kind: str = None, entity_id: str = None) -> dict:
    """Resolve one alert by id, or all open alerts of a kind+entity."""
    db = get_db()
    try:
        q = db.table("alerts").update({"resolved": True, "resolved_at": _now_iso()})
        if alert_id:
            q.eq("id", alert_id).execute()
        elif kind and entity_id:
            q.eq("kind", kind).eq("entity_id", str(entity_id)).eq("resolved", False).execute()
        else:
            return {"ok": False, "message": "Need an alert id or kind+entity."}
        return {"ok": True, "message": "Alert resolved."}
    except Exception as e:
        return {"ok": False, "message": f"Couldn't resolve: {e}"}


# ════════════════════════════════════════════════════════════════════
#  SCORING + QUALIFICATION + SALES ANGLE  (Phase 2)
# ════════════════════════════════════════════════════════════════════
def _signals_for(p: dict) -> dict:
    """Map a prospect row to opportunity-score signals (unknown stays unknown)."""
    return {
        "website_status": p.get("website_status") or "unknown",
        "website_quality": p.get("website_quality"),
        "mobile_friendly": None if p.get("website_status") != "has_website" else p.get("mobile_friendly"),
        "reviews_status": p.get("reviews_status"),
        "cta_strength": p.get("cta_strength"),
        "local_demand": p.get("local_demand") or local_demand_for(p.get("town"), p.get("trade")),
        "is_emergency_trade": is_emergency_trade(p.get("trade")),
        "recently_updated": p.get("recently_updated"),
    }


def score_and_qualify_fields(p: dict, angle: str = None, angle_source: str = None) -> dict:
    """Compute the score/qualify/angle columns for a prospect. Pure (no writes)."""
    sig = _signals_for(p)
    score, factors = opportunity_score(sig)
    ready, reason = qualify(p)
    out = {
        "local_demand": sig["local_demand"],
        "opportunity_score": score,
        "score_factors": factors,
        "queue_ready": ready,
        "needs_data_reason": None if ready else reason,
        "updated_at": _now_iso(),
    }
    if angle is not None:
        out["sales_angle"], out["angle_source"] = angle, (angle_source or "template")
    elif ready and not (p.get("sales_angle") or "").strip():
        out["sales_angle"], out["angle_source"] = sales_angle_template(p, factors), "template"
    return out


def effective_score(p: dict) -> int:
    """Score used for ordering — manual override wins, else opportunity_score."""
    if p.get("score_override") is not None:
        try:
            return int(p["score_override"])
        except (TypeError, ValueError):
            pass
    return int(p.get("opportunity_score") or 0)


def apply_scoring(prospect_id: str, p: dict, angle: str = None, angle_source: str = None) -> dict:
    """Persist score/qualify/angle for one prospect. Returns the written fields."""
    fields = score_and_qualify_fields(p, angle=angle, angle_source=angle_source)
    try:
        get_db().table("prospects").update(fields).eq("id", prospect_id).execute()
    except Exception as e:
        logger.warning(f"[apply_scoring] {prospect_id}: {e}")
    return fields


def generate_sales_angles(prospects: list, max_ai: int = 12) -> dict:
    """{prospect_id: (angle, source)} for queue-ready prospects. ONE Claude call for
    up to max_ai of them; deterministic template for the rest / on any failure.
    Drafts copy only — contacts no one."""
    out, ai_targets = {}, []
    for p in prospects:
        ready, _ = qualify(p)
        if not ready:
            continue
        _, factors = opportunity_score(_signals_for(p))
        if len(ai_targets) < max_ai:
            ai_targets.append((p, factors))
        else:
            out[p["id"]] = (sales_angle_template(p, factors), "template")

    if ai_targets and settings.ANTHROPIC_API_KEY:
        lines = []
        for i, (p, factors) in enumerate(ai_targets):
            facs = ", ".join(f["factor"] for f in factors) or "unknown gaps"
            lines.append(f"{i}. {p.get('business_name')} — {p.get('trade')} in {p.get('town')}; gaps: {facs}")
        system = (
            "You write ONE-SENTENCE sales angles for L&D Designs, which sells UK tradespeople "
            "a website build PLUS an on-site lead-capture form (one-off build + small monthly). "
            "Each angle tells the founder why to ring THIS prospect and what to pitch — concrete, "
            "local, UK tone, references the gap and a fix. No fluff, no greeting. Output strictly "
            "one line per prospect as 'INDEX: angle'."
        )
        user = "Write an angle for each:\n" + "\n".join(lines)
        txt = _claude(system, user, max_tokens=700, agent="sales_angle")
        if txt:
            parsed = {}
            for raw in txt.splitlines():
                m = re.match(r"\s*(\d+)\s*[:.)-]\s*(.+)", raw)
                if m:
                    parsed[int(m.group(1))] = m.group(2).strip()
            for i, (p, factors) in enumerate(ai_targets):
                if parsed.get(i):
                    out[p["id"]] = (parsed[i], "ai")
                else:
                    out[p["id"]] = (sales_angle_template(p, factors), "template")
        else:
            for p, factors in ai_targets:
                out[p["id"]] = (sales_angle_template(p, factors), "template")
    else:
        for p, factors in ai_targets:
            out[p["id"]] = (sales_angle_template(p, factors), "template")
    return out


def requalify_all(mode: str = REAL, with_ai_angles: bool = True) -> dict:
    """Rescore + requalify every prospect in `mode`, (re)generating angles for the
    queue-ready ones. Run after import, after the migration, or on demand. Surfaces
    the qualifier success metric: % of rows that reached queue-ready."""
    db = get_db()
    rows = (db.table("prospects").select("*").eq("data_mode", mode)
            .limit(2000).execute().data or [])
    angles = generate_sales_angles(rows) if with_ai_angles else {}
    ready_n = 0
    for p in rows:
        a, src = angles.get(p["id"], (None, None))
        fields = apply_scoring(p["id"], p, angle=a, angle_source=src)
        if fields.get("queue_ready"):
            ready_n += 1
    total = len(rows)
    pct = round(100 * ready_n / total) if total else 0
    log_event("qualifier", f"requalified {total} prospect(s) — {ready_n} queue-ready ({pct}%)",
              "success" if pct >= 95 or total == 0 else "warn",
              {"total": total, "queue_ready": ready_n, "pct": pct, "metric_ok": pct >= 95 or total == 0})
    return {"ok": True, "total": total, "queue_ready": ready_n, "pct_ready": pct,
            "message": f"Requalified {total} prospect(s): {ready_n} queue-ready ({pct}%)."}


def set_website_status(name_or_id: str, status: str, quality: str = None,
                       url: str = None, source: str = "founder") -> dict:
    """Founder resolves a NEEDS DATA prospect: set website status (none|has_website),
    optional quality (poor|old|modern), optional url. Rescores + may enter the queue."""
    p = find_prospect(name_or_id)
    if not p:
        return {"ok": False, "message": f"No prospect found for '{name_or_id}'."}
    if status not in ("none", "has_website"):
        return {"ok": False, "message": "Website status must be 'none' or 'has_website'."}
    before = {"website_status": p.get("website_status"), "website_quality": p.get("website_quality"),
              "website_url": p.get("website_url")}
    upd = {"website_status": status, "website_status_source": source, "updated_at": _now_iso()}
    if quality:
        upd["website_quality"] = quality
    if url:
        upd["website_url"] = url
    get_db().table("prospects").update(upd).eq("id", p["id"]).execute()
    merged = {**p, **upd}
    fields = apply_scoring(p["id"], merged)
    if fields.get("queue_ready"):
        resolve_alert(kind="missing_data", entity_id=p["id"])
    log_event("qualifier", f"website status set for {p.get('business_name')} → {status}"
              + (f"/{quality}" if quality else ""), "success", {"prospect_id": p["id"]})
    return {"ok": True, "prospect": p.get("business_name"), "queue_ready": fields.get("queue_ready"),
            "opportunity_score": fields.get("opportunity_score"),
            "_undo": {"op": "update", "table": "prospects", "id": p["id"], "before": before},
            "message": (f"{p.get('business_name')}: {status}"
                        + (f" ({quality})" if quality else "")
                        + (f" — score {fields.get('opportunity_score')}, now in the queue."
                           if fields.get("queue_ready") else " — still needs data."))}


# ════════════════════════════════════════════════════════════════════
#  DEAD PIPELINE + FUNNEL + BOTTLENECK  (Phase 4 + Phase 6)
# ════════════════════════════════════════════════════════════════════
def find_dead_pipeline(mode: str = REAL, days: int = 7) -> list:
    """REAL prospects with no contact for `days`+ and no open next action, not
    terminal. These are revenue quietly rotting — surfaced AT RISK + alerted."""
    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days))
    rows = (db.table("prospects").select("*").eq("data_mode", mode)
            .limit(2000).execute().data or [])
    rows = [r for r in rows if r.get("status") not in TERMINAL_STATUSES]
    open_actions = (db.table("next_actions").select("prospect_id")
                    .eq("done", False).limit(2000).execute().data or [])
    have_action = {a["prospect_id"] for a in open_actions}
    dead = []
    for p in rows:
        if p["id"] in have_action:
            continue
        lc = p.get("last_called_at")
        if lc:
            try:
                last = datetime.fromisoformat(str(lc).replace("Z", "+00:00"))
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                if last > cutoff:
                    continue
            except Exception:
                pass
        # never contacted (no last_called_at) and still to_call is NOT dead — it's just new.
        if not lc and p.get("status") == "to_call":
            continue
        dead.append(p)
    return dead


def compute_funnel(mode: str = REAL) -> dict:
    """Deterministic funnel counts: queued → called → interested → preview_sent → won."""
    db = get_db()

    def c(**f):
        q = db.table("prospects").select("id", count="exact").eq("data_mode", mode)
        for k, v in f.items():
            q = q.eq(k, v)
        try:
            return q.execute().count or 0
        except Exception:
            return 0

    queued = c(queue_ready=True, status="to_call")
    called = c(status="called") + c(status="interested") + c(status="demo_booked") + c(status="won") + c(status="lost")
    interested = c(status="interested") + c(status="demo_booked")
    preview_sent = c(preview_status="ready")
    won = c(status="won")
    return {"queued": queued, "called": called, "interested": interested,
            "preview_sent": preview_sent, "won": won}


def find_bottleneck(funnel: dict) -> dict:
    """Biggest proportional drop between adjacent funnel stages = the bottleneck."""
    order = [("queued", "called"), ("called", "interested"),
             ("interested", "preview_sent"), ("preview_sent", "won")]
    worst = None
    for a, b in order:
        top, bot = funnel.get(a, 0), funnel.get(b, 0)
        if top <= 0:
            continue
        drop = 1 - (bot / top)
        if worst is None or drop > worst["drop"]:
            worst = {"from": a, "to": b, "from_n": top, "to_n": bot, "drop": round(drop, 2)}
    if not worst:
        return {"stage": None, "text": "Not enough pipeline yet to spot a bottleneck — import + qualify prospects."}
    pct = round(worst["drop"] * 100)
    return {"stage": f"{worst['from']}→{worst['to']}", "drop_pct": pct,
            "from_n": worst["from_n"], "to_n": worst["to_n"],
            "text": (f"{worst['from']}→{worst['to']}: {worst['from_n']} → {worst['to_n']} "
                     f"({pct}% drop-off). This stage is capping revenue.")}


# ════════════════════════════════════════════════════════════════════
# 1. LEAD SCOUT — build the list. NEVER contacts anyone.
# ════════════════════════════════════════════════════════════════════
def scout(entries=None, pasted_text: str = None, town: str = None,
          trade: str = None, source: str = "manual", data_mode: str = REAL,
          website_status: str = None) -> dict:
    """
    THE LEAD QUALIFIER. Take a pasted list (name, phone, town) or explicit entries,
    dedupe against everything in this data_mode, normalise numbers, set trade +
    website status, score the opportunity, generate a sales angle, qualify, and
    assign D/L alternately. Queue-ready rows enter the queues; incomplete rows land
    in NEEDS DATA (never a queue). Sends nothing to anyone. Returns the success
    metric: % of imported rows that reached queue-ready.
    """
    db = get_db()
    rows = list(entries or [])
    if pasted_text:
        rows += parse_pasted_list(pasted_text)

    # Apply command-level defaults (e.g. "scout wigan plumber").
    for r in rows:
        if town and not r.get("town"):
            r["town"] = town
        if trade and not r.get("trade"):
            r["trade"] = trade
        if not r.get("trade"):
            r["trade"] = trade or EMERGENCY_TRADE_DEFAULT

    if not rows:
        return {"added": 0, "duplicates": 0, "assigned": {"D": 0, "L": 0}, "queue_ready": 0,
                "needs_data": 0, "pct_ready": 0, "top": [], "message": "No parseable entries found."}

    kept, dropped = dedupe_entries(rows, _existing_phone_norms(data_mode))

    # Does the prospects table have the place_id column yet (Lead Finder dedupe key)?
    try:
        db.table("prospects").select("place_id").limit(1).execute()
        _place_ok = True
    except Exception:
        _place_ok = False

    counts = _assignment_counts(data_mode)
    inserted, ids = [], []
    for e in kept:
        sig = score_prospect(e.get("phone"), e.get("trade"), e.get("town"))
        founder = "D" if counts["D"] <= counts["L"] else "L"
        counts[founder] += 1
        ws = (e.get("website_status") or website_status or "unknown")
        rec = {
            "business_name": (e.get("business_name") or "Unknown").strip()[:200],
            "phone": (e.get("phone") or "").strip() or None,
            "phone_norm": normalize_phone(e.get("phone")) or None,
            "town": (e.get("town") or "").strip() or None,
            "trade": (e.get("trade") or EMERGENCY_TRADE_DEFAULT).strip().lower(),
            "status": "to_call",
            "assigned_to": founder,
            "has_mobile": sig["has_mobile"],
            "is_emergency_trade": sig["is_emergency_trade"],
            "proximity_score": sig["proximity_score"],
            "rank_score": sig["rank_score"],
            "website_status": ws if ws in ("none", "has_website", "unknown") else "unknown",
            "website_url": (e.get("website_url") or "").strip() or None,
            "source": source,
            "data_mode": data_mode,
        }
        if _place_ok and e.get("place_id"):        # Lead Finder dedupe key (only if the column exists)
            rec["place_id"] = e["place_id"]
        try:
            rec = validate_clean("prospects", rec)
            res = db.table("prospects").insert(rec).execute()
            if res.data:
                ids.append(res.data[0]["id"])
                inserted.append({**rec, "id": res.data[0]["id"]})
        except ValidationError as ve:
            logger.warning(f"[scout] rejected {rec.get('business_name')}: {ve}")
            dropped += 1
        except Exception as ex:
            logger.warning(f"[scout] insert failed for {rec.get('business_name')}: {ex}")
            dropped += 1

    # Score + qualify + angle every inserted row (ONE Claude call for the batch).
    angles = generate_sales_angles(inserted)
    ready_n = 0
    for p in inserted:
        a, src = angles.get(p["id"], (None, None))
        fields = apply_scoring(p["id"], p, angle=a, angle_source=src)
        p["opportunity_score"] = fields.get("opportunity_score")
        p["queue_ready"] = fields.get("queue_ready")
        if fields.get("queue_ready"):
            ready_n += 1
        elif data_mode == REAL:
            raise_alert("missing_data", f"{p['business_name']} needs data: {fields.get('needs_data_reason')}",
                        "info", entity="prospect", entity_id=p["id"], mode=data_mode)

    inserted.sort(key=lambda r: r.get("opportunity_score") or 0, reverse=True)
    added_by = {"D": sum(1 for r in inserted if r["assigned_to"] == "D"),
                "L": sum(1 for r in inserted if r["assigned_to"] == "L")}
    needs_data = len(inserted) - ready_n
    pct = round(100 * ready_n / len(inserted)) if inserted else 0
    log_event("qualifier", f"imported +{len(inserted)} (D:{added_by['D']}/L:{added_by['L']}) — "
              f"{ready_n} queue-ready ({pct}%), {needs_data} need data, {dropped} dupes",
              "success" if pct >= 95 else "warn",
              {"added": len(inserted), "queue_ready": ready_n, "needs_data": needs_data,
               "pct": pct, "metric_ok": pct >= 95, "source": source, "mode": data_mode})
    return {
        "added": len(inserted),
        "duplicates": dropped,
        "assigned": added_by,
        "queue_ready": ready_n,
        "needs_data": needs_data,
        "pct_ready": pct,
        "top": [{"business_name": r["business_name"], "town": r["town"],
                 "trade": r["trade"], "score": r.get("opportunity_score"),
                 "queue_ready": r.get("queue_ready"), "assigned_to": r["assigned_to"]}
                for r in inserted[:5]],
        "_undo": {"op": "delete", "table": "prospects", "ids": ids},
        "message": (f"Imported {len(inserted)} prospect(s) (D:{added_by['D']} / L:{added_by['L']}): "
                    f"{ready_n} queue-ready ({pct}%), {needs_data} in NEEDS DATA, "
                    f"{dropped} duplicate(s) skipped."),
    }


# ════════════════════════════════════════════════════════════════════
# 2. SALES PREP — Claude call notes for a demo. One Claude call.
# ════════════════════════════════════════════════════════════════════
def sales_prep(prospect_id: str = None, name: str = None) -> dict:
    db = get_db()
    p = find_prospect(prospect_id or name)
    if not p:
        return {"ok": False, "message": f"No prospect found for '{name or prospect_id}'."}

    biz = p.get("business_name") or "the business"
    trade = p.get("trade") or "tradesperson"
    town = p.get("town") or "their area"

    system = (
        "You are the sales coach for L&D Designs, which sells a missed-call text-back "
        "service to UK trades for ~£49/month (the phone auto-texts back anyone whose "
        "call they miss, so they stop losing jobs). Prep the founder for a short demo call. "
        "Be concrete and trade-specific. UK tone, no fluff."
    )
    user = (
        f"Prospect: {biz} — a {trade} in {town}.\n\n"
        "Write tight call notes with these sections:\n"
        "PAIN — 2-3 likely pain points for this trade around missed calls/lost jobs.\n"
        "OBJECTIONS — the 3 most likely objections and a one-line response to each.\n"
        f"SCRIPT — a 4-5 line demo script personalised to {biz}, opening with a local, "
        "down-to-earth hook and ending on booking them onto a 14-day free trial."
    )
    notes = _claude(system, user, max_tokens=700, agent="sales_prep")
    if not notes:
        notes = (
            f"PAIN\n- A missed call for a {trade} often means a £200-£1,000+ job goes to "
            f"the next name on Google.\n- {biz} can't answer mid-job, on a ladder, or under a sink.\n"
            "- Voicemail gets ignored; people just ring the next firm.\n\n"
            "OBJECTIONS\n- \"I always ring back\" → By then they've booked someone else; the "
            "text lands in 5 seconds.\n- \"Too dear\" → One saved job a month pays for a year.\n"
            "- \"I'm not techy\" → Nothing to install; we set it all up, you do nothing.\n\n"
            f"SCRIPT\n- \"Alright, it's Dylan from L&D — local lad, I help {town} trades stop "
            "losing jobs to missed calls.\"\n- \"When you're on a job and can't pick up, our system "
            "texts them straight back so they wait for you instead of ringing the next plumber.\"\n"
            f"- \"Set up free, runs itself, ~£49 a month.\"\n- \"I'll switch {biz} on free for 14 "
            "days — if it doesn't catch you a job, you've lost nothing. Shall I set it up now?\""
        )

    before = {"call_notes": p.get("call_notes")}
    db.table("prospects").update({"call_notes": notes, "updated_at": _now_iso()}).eq("id", p["id"]).execute()
    log_event("sales_prep", f"wrote call notes for {biz}", "success",
              {"prospect_id": p["id"], "ai": bool(settings.ANTHROPIC_API_KEY)})
    return {
        "ok": True, "prospect": biz, "prospect_id": p["id"], "call_notes": notes,
        "_undo": {"op": "update", "table": "prospects", "id": p["id"], "before": before},
        "message": f"Call notes ready for {biz}.",
    }


# ════════════════════════════════════════════════════════════════════
# 3. DIAL MANAGER — ordered call lists. Overdue actions first, then ranked.
# ════════════════════════════════════════════════════════════════════
def _angle_for(p: dict) -> str:
    """The row's sales angle, falling back to a template if it was never generated."""
    a = (p.get("sales_angle") or "").strip()
    if a:
        return a
    _, factors = opportunity_score(_signals_for(p))
    return sales_angle_template(p, factors)


def build_call_list(founder: str, limit: int = 50, mode: str = REAL) -> list:
    db = get_db()
    founder = (founder or "D").upper()
    today = _today().isoformat()
    items, seen = [], set()

    # 1) Overdue / due-today next_actions, oldest first (pinned regardless of score).
    actions = (db.table("next_actions").select("*")
               .eq("done", False).lte("due_date", today)
               .order("due_date", desc=False).limit(200).execute().data or [])
    pid_to_action = {}
    for a in actions:
        pid_to_action.setdefault(a["prospect_id"], a)
    if pid_to_action:
        pros = (db.table("prospects").select("*")
                .in_("id", list(pid_to_action.keys())).execute().data or [])
        pros = [p for p in pros if (p.get("assigned_to") or "D").upper() == founder
                and (p.get("data_mode") or REAL) == mode
                and p.get("status") not in TERMINAL_STATUSES]
        pros.sort(key=lambda p: pid_to_action[p["id"]].get("due_date") or "")
        for p in pros:
            if p["id"] in seen:
                continue
            seen.add(p["id"])
            act = pid_to_action[p["id"]]
            items.append({**p, "reason": f"⏰ overdue: {act.get('action')}",
                          "sales_angle": _angle_for(p), "score": effective_score(p),
                          "due_date": act.get("due_date"), "priority": 0})

    # 2) Queue-ready uncalled prospects, highest OPPORTUNITY score first.
    # Filter queue_ready in Python (robust to NULL/False/bool-encoding quirks).
    try:
        uncalled = (db.table("prospects").select("*")
                    .eq("assigned_to", founder).eq("status", "to_call")
                    .eq("data_mode", mode).limit(500).execute().data or [])
    except Exception:
        uncalled = (db.table("prospects").select("*")
                    .eq("assigned_to", founder).eq("status", "to_call")
                    .limit(500).execute().data or [])
    uncalled = [p for p in uncalled if p.get("queue_ready") is True]
    uncalled.sort(key=effective_score, reverse=True)
    for p in uncalled:
        if p["id"] in seen:
            continue
        seen.add(p["id"])
        items.append({**p, "reason": _angle_for(p), "sales_angle": _angle_for(p),
                      "score": effective_score(p), "priority": 1})

    return items[:limit]


def whos_next(founder: str) -> dict:
    lst = build_call_list(founder, limit=1)
    if not lst:
        return {"founder": founder, "prospect": None,
                "message": f"Nothing queued for {founder}. List's clear."}
    p = lst[0]
    return {
        "founder": founder,
        "prospect": {
            "id": p["id"], "business_name": p.get("business_name"), "phone": p.get("phone"),
            "town": p.get("town"), "trade": p.get("trade"), "rank": p.get("rank_score"),
            "reason": p.get("reason"), "call_notes": p.get("call_notes"),
        },
        "message": _format_prospect_line(p, prefix="Next up"),
    }


def _format_prospect_line(p: dict, prefix: str = "") -> str:
    head = (f"{prefix}: " if prefix else "") + f"{p.get('business_name')}"
    bits = [b for b in [p.get("trade"), p.get("town")] if b]
    if bits:
        head += f" ({', '.join(bits)})"
    if p.get("phone"):
        head += f" — {p['phone']}"
    if p.get("reason"):
        head += f"\n   {p['reason']}"
    if p.get("call_notes"):
        head += f"\n   📝 {p['call_notes'][:280]}"
    return head


def format_call_list(founder: str, items: list) -> str:
    if not items:
        return f"📞 {founder}'s calls — nothing queued. List's clear."
    lines = [f"📞 {founder}'s call list ({len(items)}):"]
    for i, p in enumerate(items, 1):
        tag = "⏰" if p.get("priority") == 0 else f"#{p.get('rank_score', 0)}"
        line = f"{i}. {tag} {p.get('business_name')}"
        extra = [b for b in [p.get("trade"), p.get("town")] if b]
        if extra:
            line += f" — {', '.join(extra)}"
        if p.get("phone"):
            line += f" · {p['phone']}"
        if p.get("priority") == 0 and p.get("reason"):
            line += f"\n     {p['reason']}"
        lines.append(line)
    return "\n".join(lines)


def dial_today(post_to_telegram: bool = True) -> dict:
    out = {}
    for founder in ("D", "L"):
        items = build_call_list(founder)
        out[founder] = len(items)
        if post_to_telegram:
            notify.notify_founder_code(founder, format_call_list(founder, items), kind="call_list")
    overdue = {f: sum(1 for p in build_call_list(f) if p.get("priority") == 0) for f in ("D", "L")}
    log_event("dial_manager", f"built call lists → D:{out['D']} ({overdue['D']} overdue) / "
              f"L:{out['L']} ({overdue['L']} overdue)", "success", {"counts": out, "overdue": overdue})
    return {"ok": True, "counts": out, "overdue": overdue,
            "message": f"Call lists posted — D:{out['D']} / L:{out['L']}."}


# ════════════════════════════════════════════════════════════════════
# 4. FOLLOW-UP — DRAFTS ONLY. Never sends. Posts a batch for approval.
# ════════════════════════════════════════════════════════════════════
def _draft_message(kind: str, ctx: dict) -> str:
    biz = ctx.get("business_name") or "there"
    first = (ctx.get("owner_name") or biz).split()[0] if (ctx.get("owner_name") or biz) else biz
    system = (
        "You write short, friendly UK follow-up texts for L&D Designs (missed-call "
        "text-back for trades, ~£49/mo, 14-day free trial). One message, 2-3 sentences, "
        "no emojis-spam, sound like a local lad, soft call to action. Output ONLY the message."
    )
    prompts = {
        "prospect": f"Follow up with {biz} ({ctx.get('trade','trade')} in {ctx.get('town','')}). "
                    f"We spoke / they were interested but went quiet. Nudge to start the free trial.",
        "trial7":   f"{biz} is 7 days into their free trial. Friendly check-in: how's it going, "
                    f"any missed calls caught yet, here to help.",
        "trial12":  f"{biz} is 12 days into their 14-day trial. It's nearly up — gently move them "
                    f"onto the paid plan (~£49/mo) so the service keeps running.",
        "stale_lead": f"Nudge for {biz}: a new enquiry came in over 24h ago and is still marked new. "
                      f"Remind them to ring the customer back before they book someone else.",
    }
    msg = _claude(system, prompts.get(kind, prompts["prospect"]), max_tokens=200, agent="followup_trades")
    if msg:
        return msg
    # Template fallbacks (no Claude required).
    fallback = {
        "prospect": f"Hi {first}, Dylan here from L&D. Just following up — happy to switch your "
                    f"missed-call text-back on free for 14 days so you stop losing jobs when you "
                    f"can't pick up. Want me to set it up?",
        "trial7":   f"Hi {first}, you're a week into the free trial — how's it going? Caught any "
                    f"calls back yet? Give me a shout if you want anything tweaked.",
        "trial12":  f"Hi {first}, your free trial's nearly up (2 days left). It's been catching "
                    f"your missed calls — want me to keep it running on the £49/mo plan?",
        "stale_lead": f"Heads up {first} — a new enquiry's been sitting on your dashboard over a day. "
                      f"Worth a quick ring back before they book someone else.",
    }
    return fallback.get(kind, fallback["prospect"])


def followup_run(post_to_telegram: bool = True, limit: int = 40) -> dict:
    db = get_db()
    drafts = []

    # (a) Prospects interested/called with no OPEN next action.
    pros = (db.table("prospects").select("*")
            .in_("status", ["interested", "called"]).limit(200).execute().data or [])
    open_actions = (db.table("next_actions").select("prospect_id")
                    .eq("done", False).limit(1000).execute().data or [])
    have_action = {a["prospect_id"] for a in open_actions}
    for p in pros:
        if p["id"] in have_action:
            continue
        drafts.append({"kind": "prospect", "to": p.get("business_name"),
                       "channel": "call/whatsapp", "target_phone": p.get("phone"),
                       "draft": _draft_message("prospect", p)})
        if len(drafts) >= limit:
            break

    # (b) Trials at day 7 and day 12.
    trials = (db.table("textback_clients").select("*")
              .eq("plan_status", "trial").limit(200).execute().data or [])
    for c in trials:
        tp = is_trial_touchpoint(c.get("trial_start"))
        if tp in (7, 12) and len(drafts) < limit:
            drafts.append({"kind": f"trial{tp}", "to": c.get("business_name"),
                           "channel": "client", "target_phone": c.get("owner_phone") or c.get("phone"),
                           "draft": _draft_message(f"trial{tp}", c)})

    # (c) Captured leads still NEW after 24h (client hasn't actioned).
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    stale = (db.table("captured_leads").select("*")
             .eq("status", "new").lt("created_at", cutoff).limit(100).execute().data or [])
    client_cache = {}
    for lead in stale:
        cid = lead.get("client_id")
        if cid not in client_cache:
            try:
                client_cache[cid] = db.table("textback_clients").select("*").eq("id", cid).single().execute().data or {}
            except Exception:
                client_cache[cid] = {}
        c = client_cache[cid]
        if len(drafts) < limit:
            drafts.append({"kind": "stale_lead", "to": c.get("business_name") or "client",
                           "channel": "client", "target_phone": c.get("owner_phone") or c.get("phone"),
                           "draft": _draft_message("stale_lead", {**c, "lead": lead})})

    if post_to_telegram and drafts:
        notify.notify_founders(format_followups(drafts), kind="followups")
    log_event("followup", f"drafted {len(drafts)} follow-up(s) (drafts only — never auto-sent)", "success",
              {"count": len(drafts)})
    return {"ok": True, "count": len(drafts), "drafts": drafts,
            "message": f"{len(drafts)} follow-up draft(s) ready (drafts only — copy & send yourself)."}


def format_followups(drafts: list) -> str:
    if not drafts:
        return "✅ No follow-ups needed right now."
    lines = [f"✍️ {len(drafts)} follow-up draft(s) — copy & send yourself (I never send these):", ""]
    for i, d in enumerate(drafts, 1):
        tgt = d.get("target_phone") or ""
        lines.append(f"{i}. → {d.get('to')} ({d.get('channel')}{(' · ' + tgt) if tgt else ''})")
        lines.append(f"   {d.get('draft')}")
        lines.append("")
    return "\n".join(lines).strip()


def draft_followup(name: str) -> dict:
    """On-demand single draft for a named prospect (JARVIS 'draft follow-up for X')."""
    p = find_prospect(name)
    if not p:
        return {"ok": False, "message": f"No prospect found for '{name}'."}
    draft = _draft_message("prospect", p)
    return {"ok": True, "prospect": p.get("business_name"), "draft": draft,
            "message": f"Draft follow-up for {p.get('business_name')} (copy & send yourself):\n\n{draft}"}


# ════════════════════════════════════════════════════════════════════
# 5. REVENUE REPORTER — yesterday's numbers + live trials + MRR + churn.
# ════════════════════════════════════════════════════════════════════
def _count(table, data_mode=None, **filters) -> int:
    db = get_db()
    q = db.table(table).select("id", count="exact")
    rng = filters.pop("_range", None)
    for k, v in filters.items():
        q = q.eq(k, v)
    if data_mode is not None:
        q = q.eq("data_mode", data_mode)
    if rng:
        col, lo, hi = rng
        q = q.gte(col, lo).lt(col, hi)
    try:
        return q.execute().count or 0
    except Exception:
        return 0


def revenue_report(weekly: bool = False, mode: str = REAL) -> dict:
    db = get_db()
    ylo, yhi = _yesterday_window()

    dials_y = _count("prospects", data_mode=mode, _range=("last_called_at", ylo, yhi))
    demos_total = _count("prospects", data_mode=mode, status="demo_booked")
    interested_total = _count("prospects", data_mode=mode, status="interested")
    to_call_total = _count("prospects", data_mode=mode, status="to_call")
    won_total = _count("prospects", data_mode=mode, status="won")

    # Live trials with per-trial detail.
    try:
        trials = (db.table("textback_clients").select("*")
                  .eq("plan_status", "trial").eq("data_mode", mode).limit(500).execute().data or [])
    except Exception:
        trials = (db.table("textback_clients").select("*")
                  .eq("plan_status", "trial").limit(500).execute().data or [])
    trial_details, red_flags = [], 0
    for c in trials:
        rem = trial_days_remaining(c.get("trial_end"))
        captured = _leads_captured(c["id"], since=(str(c.get("trial_start")) + "T00:00:00") if c.get("trial_start") else None)
        risk = churn_risk(rem, captured)
        if risk:
            red_flags += 1
        trial_details.append({
            "business_name": c.get("business_name"), "days_remaining": rem,
            "leads_captured": captured, "churn_risk": risk,
        })

    try:
        paying = (db.table("textback_clients").select("monthly_fee,build_fee,build_paid")
                  .eq("plan_status", "paying").eq("data_mode", mode).limit(1000).execute().data or [])
        all_clients = (db.table("textback_clients").select("build_fee,build_paid")
                       .eq("data_mode", mode).limit(2000).execute().data or [])
    except Exception:
        paying = (db.table("textback_clients").select("monthly_fee")
                  .eq("plan_status", "paying").limit(1000).execute().data or [])
        all_clients = []
    paying_count = len(paying)
    mrr = round(sum(float(c.get("monthly_fee") or 0) for c in paying), 2)
    # Bundle: one-off build revenue collected (build_paid) across all clients in mode.
    build_revenue = round(sum(float(c.get("build_fee") or 0)
                              for c in all_clients if c.get("build_paid")), 2)
    builds_paid = sum(1 for c in all_clients if c.get("build_paid"))

    report = {
        "date": _today().isoformat(),
        "dials_yesterday": dials_y,
        "demos_booked": demos_total,
        "interested": interested_total,
        "to_call_remaining": to_call_total,
        "won": won_total,
        "trials_live": len(trial_details),
        "trial_details": trial_details,
        "paying_clients": paying_count,
        "mrr": mrr,
        "build_revenue": build_revenue,
        "builds_paid": builds_paid,
        "churn_risk_count": red_flags,
        "weekly": weekly,
        "mode": mode,
    }

    if weekly:
        def window(days_ago_start, days_ago_end):
            lo = (_today() - timedelta(days=days_ago_start)).isoformat() + "T00:00:00"
            hi = (_today() - timedelta(days=days_ago_end)).isoformat() + "T00:00:00"
            return lo, hi
        tw_lo, tw_hi = window(7, 0)
        lw_lo, lw_hi = window(14, 7)
        report["week_over_week"] = {
            "dials_this_week": _count("prospects", _range=("last_called_at", tw_lo, tw_hi)),
            "dials_last_week": _count("prospects", _range=("last_called_at", lw_lo, lw_hi)),
            "won_this_week": _count("prospects", status="won", _range=("updated_at", tw_lo, tw_hi)),
            "won_last_week": _count("prospects", status="won", _range=("updated_at", lw_lo, lw_hi)),
            "new_clients_this_week": _count("textback_clients", _range=("created_at", tw_lo, tw_hi)),
        }
    return report


def revenue_report_text(weekly: bool = False, mode: str = REAL) -> str:
    r = revenue_report(weekly=weekly, mode=mode)
    lines = [f"📊 {'WEEKLY ' if weekly else ''}REVENUE — {r['date']}",
             f"• Dials yesterday: {r['dials_yesterday']}",
             f"• Pipeline: {r['to_call_remaining']} to-call · {r['interested']} interested · {r['demos_booked']} demos booked",
             f"• Builds sold: {r.get('builds_paid', 0)} (£{r.get('build_revenue', 0):.0f} one-off) · "
             f"Paying: {r['paying_clients']} · MRR £{r['mrr']:.0f} · Trials {r['trials_live']}"]
    if r["trial_details"]:
        lines.append("• Trials:")
        for t in r["trial_details"]:
            flag = " 🔴" if t["churn_risk"] else ""
            rem = t["days_remaining"]
            rem_s = f"{rem}d left" if rem is not None else "no end set"
            lines.append(f"   – {t['business_name']}: {rem_s}, {t['leads_captured']} leads{flag}")
    if r["churn_risk_count"]:
        lines.append(f"⚠️ {r['churn_risk_count']} trial(s) at churn risk (<3 days, <3 leads).")
    if weekly and r.get("week_over_week"):
        w = r["week_over_week"]
        lines.append(f"• WoW dials: {w['dials_this_week']} (last wk {w['dials_last_week']})")
        lines.append(f"• WoW wins: {w['won_this_week']} (last wk {w['won_last_week']}) · "
                     f"new clients this wk: {w['new_clients_this_week']}")
    return "\n".join(lines)


def trial_check(mode: str = REAL) -> dict:
    r = revenue_report(weekly=False, mode=mode)
    return {"trials": r["trial_details"], "churn_risk_count": r["churn_risk_count"],
            "message": revenue_report_text(weekly=False, mode=mode)}


# ════════════════════════════════════════════════════════════════════
# Shared write actions used by JARVIS (each returns an _undo envelope)
# ════════════════════════════════════════════════════════════════════
def add_prospect(business_name: str, phone: str = None, town: str = None,
                 trade: str = None, founder: str = None, website_status: str = None,
                 data_mode: str = REAL) -> dict:
    db = get_db()
    sig = score_prospect(phone, trade, town)
    if not founder:
        counts = _assignment_counts(data_mode)
        founder = "D" if counts["D"] <= counts["L"] else "L"
    ws = website_status if website_status in ("none", "has_website", "unknown") else "unknown"
    rec = {
        "business_name": business_name.strip()[:200],
        "phone": (phone or "").strip() or None,
        "phone_norm": normalize_phone(phone) or None,
        "town": (town or "").strip() or None,
        "trade": (trade or EMERGENCY_TRADE_DEFAULT).strip().lower(),
        "status": "to_call", "assigned_to": founder.upper(),
        "has_mobile": sig["has_mobile"], "is_emergency_trade": sig["is_emergency_trade"],
        "proximity_score": sig["proximity_score"], "rank_score": sig["rank_score"],
        "website_status": ws, "source": "jarvis", "data_mode": data_mode,
    }
    try:
        rec = validate_clean("prospects", rec)
    except ValidationError as ve:
        return {"ok": False, "message": f"Rejected: {ve}"}
    res = db.table("prospects").insert(rec).execute()
    pid = res.data[0]["id"] if res.data else None
    fields = apply_scoring(pid, {**rec, "id": pid}) if pid else {}
    ready = fields.get("queue_ready")
    if pid and not ready and data_mode == REAL:
        raise_alert("missing_data", f"{rec['business_name']} needs data: {fields.get('needs_data_reason')}",
                    "info", entity="prospect", entity_id=pid, mode=data_mode)
    return {"ok": True, "prospect_id": pid, "assigned_to": founder.upper(),
            "_undo": {"op": "delete", "table": "prospects", "ids": [pid]} if pid else None,
            "message": (f"Added {rec['business_name']} → {founder.upper()} "
                        f"(score {fields.get('opportunity_score', '?')}, "
                        + ("in queue)." if ready else "NEEDS DATA — set website status)."))}


_OUTCOME_TO_STATUS = {
    "interested": "interested", "keen": "interested", "wants it": "interested",
    "demo": "demo_booked", "booked": "demo_booked", "demo booked": "demo_booked",
    "no answer": "called", "voicemail": "called", "call back": "called", "callback": "called",
    "not interested": "not_interested", "no": "not_interested", "rejected": "not_interested",
    "won": "won", "paid": "won", "signed up": "won", "sold": "won",
    "lost": "lost", "dead": "lost",
}


def _infer_status(outcome: str) -> str:
    low = (outcome or "").lower()
    for k, v in _OUTCOME_TO_STATUS.items():
        if k in low:
            return v
    return "called"


def _recommend_next_action(status: str, demo_at=None):
    """Return (action_text, due_date_iso) or (None, None) for terminal states."""
    today = _today()
    if status == "interested":
        return "Send demo link + book a call", (today + timedelta(days=1)).isoformat()
    if status == "demo_booked":
        due = (demo_at[:10] if demo_at else (today + timedelta(days=1)).isoformat())
        return "Run the demo", due
    if status == "called":
        return "Call back", (today + timedelta(days=2)).isoformat()
    if status == "won":
        return "Onboard: set up their number + send dashboard link", today.isoformat()
    return None, None


def log_call(name_or_id: str, outcome: str, new_status: str = None, founder: str = None,
             next_action: str = None, next_action_date: str = None) -> dict:
    """Log a call outcome on a prospect: update status, stamp last_called_at,
    append the outcome to call_notes, recommend & create the next action, and
    (on demo_booked) auto-run Sales Prep. Returns an echo + undo envelope.
    An explicit next_action (+ optional date) overrides the recommended one."""
    db = get_db()
    p = find_prospect(name_or_id)
    if not p:
        return {"ok": False, "message": f"No prospect found for '{name_or_id}'."}

    status = new_status or _infer_status(outcome)
    stamp = _now_iso()
    note_line = f"[{_today().isoformat()}] {outcome}".strip()
    new_notes = ((p.get("call_notes") or "").rstrip() + "\n" + note_line).strip()

    before = {"status": p.get("status"), "call_notes": p.get("call_notes"),
              "last_called_at": p.get("last_called_at")}
    db.table("prospects").update({
        "status": status, "call_notes": new_notes,
        "last_called_at": stamp, "updated_at": stamp,
    }).eq("id", p["id"]).execute()

    undo_ops = [{"op": "update", "table": "prospects", "id": p["id"], "before": before}]

    # Recommend + persist the next action (explicit overrides the recommendation).
    # Phase 4 enforcement: a non-terminal outcome NEVER ends without a next action.
    action, due = _recommend_next_action(status, p.get("demo_at"))
    if next_action:
        action, due = next_action, (next_action_date or due or (_today() + timedelta(days=1)).isoformat())
    if not action and status not in TERMINAL_STATUSES:
        action, due = "Call back", (_today() + timedelta(days=1)).isoformat()
    rec_msg = ""
    if action:
        try:
            ins = db.table("next_actions").insert({
                "prospect_id": p["id"], "action": action, "due_date": due,
                "done": False, "created_by": "jarvis",
            }).execute()
            if ins.data:
                undo_ops.append({"op": "delete", "table": "next_actions", "ids": [ins.data[0]["id"]]})
            rec_msg = f" Next: {action} (by {due})."
        except Exception as e:
            logger.warning(f"[log_call] next_action insert failed: {e}")

    extra = ""
    if status == "demo_booked":
        prep = sales_prep(prospect_id=p["id"])
        if prep.get("ok"):
            extra = " 📝 Prep notes generated."

    log_event("dial_manager", f"logged {p.get('business_name')} → {status}"
              + (f" · {outcome[:60]}" if outcome else ""), "success",
              {"prospect_id": p["id"], "status": status})
    return {
        "ok": True, "prospect": p.get("business_name"), "prospect_id": p["id"],
        "status": status,
        "_undo": {"op": "batch", "ops": undo_ops},
        "message": f"Logged {p.get('business_name')} → {status}.{rec_msg}{extra}",
    }


def convert_prospect_to_client(name_or_id: str, monthly_fee: float = 49.0) -> dict:
    """Turn a won prospect into a trial client (Part A product) with portal tokens.
    Creates nothing outbound — just provisions the account + links."""
    db = get_db()
    p = find_prospect(name_or_id)
    if not p:
        return {"ok": False, "message": f"No prospect found for '{name_or_id}'."}
    dash = secrets.token_urlsafe(12)
    cap = secrets.token_urlsafe(12)
    rec = {
        "business_name": p.get("business_name"), "phone": p.get("phone") or "",
        "owner_phone": p.get("phone"), "trade": p.get("trade") or "default",
        "town": p.get("town"), "active": True, "monthly_fee": monthly_fee,
        "build_fee": 500, "build_paid": False,
        "plan_status": "trial", "trial_start": _today().isoformat(),
        "trial_end": (_today() + timedelta(days=14)).isoformat(),
        "dashboard_token": dash, "capture_token": cap, "total_textbacks_sent": 0,
        "data_mode": p.get("data_mode") or REAL,
    }
    try:
        rec = validate_clean("textback_clients", rec)
    except ValidationError as ve:
        return {"ok": False, "message": f"Rejected: {ve}"}
    res = db.table("textback_clients").insert(rec).execute()
    cid = res.data[0]["id"] if res.data else None
    if cid:
        db.table("prospects").update({"status": "won", "converted_client_id": cid,
                                      "updated_at": _now_iso()}).eq("id", p["id"]).execute()
    log_event("reporter", f"💷 WON — {p.get('business_name')} converted to a 14-day trial client "
              f"(£{monthly_fee:.0f}/mo)", "success", {"client_id": cid, "prospect_id": p["id"]})
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return {
        "ok": True, "client_id": cid,
        "dashboard_url": f"{base}/d/{dash}", "capture_url": f"{base}/capture/{cap}",
        "message": (f"{p.get('business_name')} is live on a 14-day trial.\n"
                    f"Dashboard: {base}/d/{dash}\nCapture form: {base}/capture/{cap}"),
    }


# ── UNDO ──────────────────────────────────────────────────────────────
def apply_undo(undo: dict) -> str:
    """Reverse a previous write using its _undo envelope. Returns a human note."""
    if not undo:
        return "Nothing to undo."
    db = get_db()
    op = undo.get("op")
    try:
        if op == "batch":
            notes = [apply_undo(o) for o in undo.get("ops", [])]
            return "Undone. " + " ".join(n for n in notes if n)
        if op == "delete":
            for _id in undo.get("ids", []):
                if _id:
                    db.table(undo["table"]).delete().eq("id", _id).execute()
            return f"Removed {len(undo.get('ids', []))} new row(s) from {undo['table']}."
        if op == "update":
            db.table(undo["table"]).update(undo["before"]).eq("id", undo["id"]).execute()
            return f"Reverted {undo['table']} row to its previous values."
    except Exception as e:
        logger.error(f"[apply_undo] {e}")
        return f"Undo failed: {e}"
    return "Nothing to undo."


# ── Live context for JARVIS (read-only snapshot) ──────────────────────
def live_context(mode: str = REAL) -> dict:
    """Compact, bounded snapshot of the whole operation for the JARVIS system
    prompt, so most questions are answered with NO extra Claude call or tool.
    Strictly one data_mode — never mixes real and demo."""
    db = get_db()

    def c(table, **f):
        return _count(table, data_mode=mode, **f)

    ctx = {
        "today": _today().isoformat(),
        "mode": mode,
        "pipeline": {
            "to_call": c("prospects", status="to_call"),
            "called": c("prospects", status="called"),
            "interested": c("prospects", status="interested"),
            "demo_booked": c("prospects", status="demo_booked"),
            "won": c("prospects", status="won"),
            "not_interested": c("prospects", status="not_interested"),
        },
        "clients": {
            "trials": c("textback_clients", plan_status="trial"),
            "paying": c("textback_clients", plan_status="paying"),
        },
    }
    # Today's top of each founder's list.
    for f in ("D", "L"):
        nxt = build_call_list(f, limit=5, mode=mode)
        ctx[f"calls_{f}"] = [
            {"business_name": p.get("business_name"), "town": p.get("town"),
             "trade": p.get("trade"), "phone": p.get("phone"), "reason": p.get("reason"),
             "angle": p.get("sales_angle"), "score": p.get("score")} for p in nxt
        ]
    # A few active prospects with notes (for "draft for X" / general Qs).
    try:
        active = (db.table("prospects").select("business_name,phone,town,trade,status,assigned_to,call_notes,opportunity_score,sales_angle")
                  .in_("status", ["interested", "demo_booked", "called"]).eq("data_mode", mode)
                  .order("updated_at", desc=True).limit(15).execute().data or [])
    except Exception:
        active = (db.table("prospects").select("business_name,phone,town,trade,status,assigned_to,call_notes,rank_score")
                  .in_("status", ["interested", "demo_booked", "called"])
                  .order("updated_at", desc=True).limit(15).execute().data or [])
    ctx["active_prospects"] = active
    # Live trials with leads + churn flags.
    ctx["trials"] = trial_check(mode=mode)["trials"]
    # Recently captured leads (product output).
    try:
        recent_leads = (db.table("captured_leads").select("name,phone,job_description,status,source,created_at,client_id")
                        .eq("data_mode", mode).order("created_at", desc=True).limit(10).execute().data or [])
    except Exception:
        recent_leads = (db.table("captured_leads").select("name,phone,job_description,status,source,created_at,client_id")
                        .order("created_at", desc=True).limit(10).execute().data or [])
    ctx["recent_captured_leads"] = recent_leads
    return ctx


# ════════════════════════════════════════════════════════════════════
# Extra JARVIS actions (thin, all echo a result + undo where they write)
# ════════════════════════════════════════════════════════════════════
def mark_won(name_or_id: str) -> dict:
    return log_call(name_or_id, "marked WON", new_status="won")


def mark_lost(name_or_id: str, reason: str = "") -> dict:
    return log_call(name_or_id, f"marked LOST{(' — ' + reason) if reason else ''}", new_status="lost")


def search_prospect(query: str) -> dict:
    """Fuzzy-find a prospect and return a compact card (read-only)."""
    p = find_prospect(query)
    if not p:
        return {"ok": False, "message": f"No prospect matches '{query}'."}
    return {"ok": True, "prospect": {
        "id": p["id"], "business_name": p.get("business_name"), "phone": p.get("phone"),
        "town": p.get("town"), "trade": p.get("trade"), "status": p.get("status"),
        "assigned_to": p.get("assigned_to"), "rank_score": p.get("rank_score"),
        "call_notes": p.get("call_notes"),
    }, "message": _format_prospect_line(p)}


# RUN NOW dispatch — only the no-argument agents (Scout/Prep need input).
_RUN_AGENT_ALIASES = {
    "dial": "dial_manager", "dial_manager": "dial_manager", "dials": "dial_manager",
    "today": "dial_manager", "call_list": "dial_manager", "prioritiser": "dial_manager",
    "lead_prioritiser": "dial_manager", "lead prioritiser": "dial_manager",
    "followup": "followup", "follow_up": "followup", "follow-up": "followup", "chase": "followup",
    "reporter": "reporter", "revenue": "reporter", "report": "reporter", "status": "reporter",
    "revenue_analyst": "reporter", "revenue analyst": "reporter", "trial": "reporter",
    "qualifier": "qualifier", "lead_qualifier": "qualifier", "lead qualifier": "qualifier",
    "ceo": "ceo", "brief": "ceo", "briefing": "ceo", "ceo_briefing": "ceo",
    "qa": "preview_qa", "preview": "preview_qa", "preview_qa": "preview_qa", "preview qa": "preview_qa",
    "lead_finder": "lead_finder", "finder": "lead_finder", "find_leads": "lead_finder",
    "find leads": "lead_finder", "lead finder": "lead_finder", "scout_new": "lead_finder",
}


def run_agent(name: str, post_to_telegram: bool = True, mode: str = REAL) -> dict:
    """Fire one agent on demand (for the UI RUN NOW buttons + JARVIS run_agent)."""
    canon = _RUN_AGENT_ALIASES.get((name or "").strip().lower())
    if canon == "dial_manager":
        return trades_result("dial_manager", dial_today(post_to_telegram=post_to_telegram))
    if canon == "followup":
        return trades_result("followup", followup_run(post_to_telegram=post_to_telegram))
    if canon == "reporter":
        txt = revenue_report_text(weekly=(date.today().weekday() == 0), mode=mode)
        if post_to_telegram:
            notify.notify_founders(txt, kind="revenue")
        log_event("reporter", "ran revenue report", "success", {"metric_ok": True})
        return {"ok": True, "agent": "reporter", "message": txt}
    if canon == "qualifier":
        return trades_result("qualifier", requalify_all(mode=mode))
    if canon == "ceo":
        r = ceo_briefing(post=post_to_telegram, mode=mode)
        return {"ok": True, "agent": "ceo", "message": r["briefing"]}
    if canon == "preview_qa":
        try:
            from agents import preview_qa
            return trades_result("preview_qa", preview_qa.run_all(mode=mode))
        except Exception as e:
            return {"ok": False, "message": f"Preview QA needs a prospect — 'build preview <name>' first ({e})."}
    if canon == "lead_finder":
        from agents import trades_leadfinder
        return trades_result("lead_finder", trades_leadfinder.find_leads(cap=20))
    return {"ok": False, "message": f"Can't run '{name}' on its own — "
            "Scout needs a pasted list and Sales Prep needs a prospect name."}


def trades_result(agent: str, r: dict) -> dict:
    r = dict(r or {})
    r.setdefault("agent", agent)
    return r


def wipe_seed() -> dict:
    """Delete ONLY demo rows (data_mode='demo') so fake data never pollutes real
    calling. Deletes nothing real. Returns per-table counts. (next_actions cascade
    from their demo prospect.)"""
    db = get_db()
    out = {}
    for table in ("tasks", "captured_leads", "prospects", "textback_clients", "alerts", "briefings"):
        try:
            n = db.table(table).select("id", count="exact").eq("data_mode", "demo").execute().count or 0
            if n:
                db.table(table).delete().eq("data_mode", "demo").execute()
            out[table] = n
        except Exception as e:
            # Back-compat: older rows flagged is_seed before data_mode existed.
            try:
                if table in ("tasks", "captured_leads", "prospects", "textback_clients"):
                    n = db.table(table).select("id", count="exact").eq("is_seed", True).execute().count or 0
                    if n:
                        db.table(table).delete().eq("is_seed", True).execute()
                    out[table] = n
                else:
                    out[table] = f"skip: {e}"
            except Exception as e2:
                out[table] = f"err: {e2}"
    log_event("reporter", f"🧹 wiped demo data {out}", "warn", out)
    return {"ok": True, "deleted": out,
            "message": (f"Wiped demo data — prospects {out.get('prospects',0)}, "
                        f"leads {out.get('captured_leads',0)}, tasks {out.get('tasks',0)}, "
                        f"clients {out.get('textback_clients',0)}. Real data untouched.")}


# Console alias — "wipe demo" reads better than "wipe seed".
wipe_demo = wipe_seed


# ── Tasks (general founder to-dos) ────────────────────────────────────
def list_tasks(owner: str = None, include_done: bool = False, mode: str = REAL) -> list:
    db = get_db()
    q = db.table("tasks").select("*")
    if not include_done:
        q = q.eq("status", "open")
    if owner:
        q = q.eq("owner", owner.upper())
    try:
        return q.eq("data_mode", mode).order("due_date", desc=False).limit(100).execute().data or []
    except Exception:
        return q.order("due_date", desc=False).limit(100).execute().data or []


def create_task(title: str, owner: str = None, detail: str = None,
                due_date: str = None, created_by: str = "jarvis", data_mode: str = REAL) -> dict:
    db = get_db()
    rec = {"title": title.strip()[:200], "owner": (owner or "").upper() or None,
           "detail": detail, "due_date": due_date or _today().isoformat(),
           "status": "open", "created_by": created_by, "data_mode": data_mode}
    try:
        rec = validate_clean("tasks", rec)
    except ValidationError as ve:
        return {"ok": False, "message": f"Rejected: {ve}"}
    res = db.table("tasks").insert(rec).execute()
    tid = res.data[0]["id"] if res.data else None
    log_event("dial_manager", f"task created: {title}", "info", {"owner": rec["owner"]})
    return {"ok": True, "task_id": tid,
            "_undo": {"op": "delete", "table": "tasks", "ids": [tid]} if tid else None,
            "message": f"Task added{(' for ' + rec['owner']) if rec['owner'] else ''}: {title}"}


def mark_task_done(task_id_or_title: str) -> dict:
    db = get_db()
    s = (task_id_or_title or "").strip()
    row = None
    if len(s) >= 32 and "-" in s:
        try:
            row = db.table("tasks").select("*").eq("id", s).single().execute().data
        except Exception:
            row = None
    if not row:
        rows = db.table("tasks").select("*").ilike("title", f"%{s}%").eq("status", "open").limit(1).execute().data or []
        row = rows[0] if rows else None
    if not row:
        return {"ok": False, "message": f"No open task matching '{s}'."}
    before = {"status": row.get("status"), "done_at": row.get("done_at")}
    db.table("tasks").update({"status": "done", "done_at": _now_iso()}).eq("id", row["id"]).execute()
    return {"ok": True, "_undo": {"op": "update", "table": "tasks", "id": row["id"], "before": before},
            "message": f"Done: {row.get('title')}"}


# ── Insight reads (for JARVIS + the WHAT NOW strip) ───────────────────
def get_hot_prospects(limit: int = 8, mode: str = REAL) -> list:
    db = get_db()
    try:
        rows = (db.table("prospects").select("*").in_("status", ["interested", "demo_booked"])
                .eq("data_mode", mode).limit(200).execute().data or [])
    except Exception:
        rows = (db.table("prospects").select("*").in_("status", ["interested", "demo_booked"])
                .limit(200).execute().data or [])
    rows.sort(key=effective_score, reverse=True)
    return rows[:limit]


def hot_prospects_text() -> str:
    rows = get_hot_prospects()
    if not rows:
        return "No hot prospects yet — log calls as interested / demo_booked and they'll surface here."
    out = ["🔥 Hottest prospects:"]
    for p in rows:
        out.append(f"• {p.get('business_name')} [{p.get('status')}, {p.get('assigned_to')}]"
                   + (f" — {p.get('phone')}" if p.get("phone") else ""))
    return "\n".join(out)


def get_overdue_followups(mode: str = REAL) -> list:
    db = get_db()
    acts = (db.table("next_actions").select("*").eq("done", False)
            .lte("due_date", _today().isoformat()).order("due_date", desc=False)
            .limit(200).execute().data or [])
    if not acts:
        return []
    # Keep only follow-ups on prospects in this data_mode.
    pids = [a.get("prospect_id") for a in acts if a.get("prospect_id")]
    try:
        pros = (db.table("prospects").select("id,data_mode").in_("id", pids).execute().data or [])
        mode_ok = {p["id"] for p in pros if (p.get("data_mode") or REAL) == mode}
        acts = [a for a in acts if a.get("prospect_id") in mode_ok]
    except Exception:
        pass
    return acts[:50]


def overdue_followups_text() -> str:
    acts = get_overdue_followups()
    if not acts:
        return "✅ No follow-ups due or overdue."
    db = get_db()
    pids = [a["prospect_id"] for a in acts if a.get("prospect_id")]
    names = {}
    if pids:
        for p in (db.table("prospects").select("id,business_name,assigned_to")
                  .in_("id", pids).execute().data or []):
            names[p["id"]] = p
    out = [f"⏰ {len(acts)} follow-up(s) due/overdue:"]
    for a in acts[:20]:
        p = names.get(a.get("prospect_id"), {})
        out.append(f"• {p.get('business_name', '?')} [{p.get('assigned_to', '')}] — "
                   f"{a.get('action')} (due {a.get('due_date')})")
    return "\n".join(out)


def find_risks(mode: str = REAL) -> str:
    r = revenue_report(mode=mode)
    out = ["🚩 What's blocking revenue:"]
    for t in r["trial_details"]:
        if t["churn_risk"]:
            out.append(f"• Trial at churn risk: {t['business_name']} "
                       f"({t['days_remaining']}d left, {t['leads_captured']} leads)")
    overdue = get_overdue_followups(mode=mode)
    if overdue:
        out.append(f"• {len(overdue)} overdue follow-up(s) not yet actioned")
    dead = find_dead_pipeline(mode=mode)
    if dead:
        out.append(f"• {len(dead)} prospect(s) AT RISK — contacted 7+ days ago, no next action")
    if r["to_call_remaining"] == 0:
        out.append("• Call list is EMPTY — import prospects (scout) or you'll run dry")
    if r["paying_clients"] == 0 and r.get("builds_paid", 0) == 0:
        out.append("• £0 revenue — no builds sold / clients yet; convert the warm trials/demos")
    if len(out) == 1:
        out.append("Nothing major flagged — keep dialling the ranked list.")
    return "\n".join(out)


def summarize_day(mode: str = REAL) -> str:
    db = get_db()
    today = _today().isoformat()
    evs = (db.table("agent_events").select("*").gte("created_at", today + "T00:00:00")
           .order("created_at", desc=True).limit(60).execute().data or [])
    r = revenue_report(mode=mode)
    logged = [e for e in evs if "logged " in (e.get("message") or "")]
    out = [f"📅 Today — {today}",
           f"• Pipeline: {r['to_call_remaining']} to-call · {r['interested']} interested · "
           f"{r['demos_booked']} demos · {r['won']} won",
           f"• Trials {r['trials_live']} · Paying {r['paying_clients']} · MRR £{r['mrr']:.0f}",
           f"• {len(logged)} call(s) logged today"]
    if evs:
        out.append("• Latest: " + " · ".join((e.get("message") or "")[:48] for e in evs[:4]))
    return "\n".join(out)


def log_decision(founder: str, question: str, recommendation: str, data: dict = None) -> None:
    try:
        get_db().table("decisions").insert({
            "founder": founder, "question": (question or "")[:500],
            "recommendation": (recommendation or "")[:2000], "data": data or {},
        }).execute()
    except Exception as e:
        logger.debug(f"[log_decision] skipped: {e}")


def update_lead_status(lead_id: str, status: str) -> dict:
    db = get_db()
    valid = ("new", "contacted", "quoted", "won", "lost")
    if status not in valid:
        return {"ok": False, "message": f"Status must be one of {valid}."}
    try:
        before = db.table("captured_leads").select("status").eq("id", lead_id).single().execute().data
    except Exception:
        before = None
    db.table("captured_leads").update({"status": status, "updated_at": _now_iso()}).eq("id", lead_id).execute()
    return {"ok": True, "message": f"Lead → {status}.",
            "_undo": {"op": "update", "table": "captured_leads", "id": lead_id,
                      "before": {"status": (before or {}).get("status", "new")}}}


# ════════════════════════════════════════════════════════════════════
# DAILY BRIEFING — the single 08:00 run: all five agents + one Telegram
# ════════════════════════════════════════════════════════════════════
def _highest_revenue_action(d_list, l_list, overdue, dead, rep, hot) -> str:
    """The single highest-revenue next move, computed deterministically."""
    if hot:
        return f"Close the hottest: convert {hot[0].get('business_name')} to a paying build"
    if dead:
        return f"Re-engage {len(dead)} AT-RISK prospect(s) before they go cold for good"
    if overdue:
        return f"Clear {len(overdue)} overdue follow-up(s) — warmest pipeline, going stale"
    if rep["to_call_remaining"] == 0:
        return "Import + qualify a fresh prospect list (scout) — the queue is empty"
    if d_list or l_list:
        nxt = (d_list or l_list)[0]
        return f"Work the top of the queue: {nxt.get('business_name')} ({nxt.get('sales_angle','')[:60]})"
    return "Import + qualify prospects — nothing is queue-ready yet"


def ceo_briefing(post: bool = True, mode: str = REAL) -> dict:
    """THE daily 08:00 run + on-demand 'brief me'. Runs all five agents, then
    composes a NUMBERS-FIRST CEO briefing: what happened, what's broken, the
    bottleneck (deterministic), the highest-revenue action, and what D and L each
    do next. Claude words it; a raw fallback states it plainly. Stored to the
    briefings table and delivered via the OpenClaw webhook (never to a prospect)."""
    # 1 Lead Prioritiser
    d_list = build_call_list("D", mode=mode)
    l_list = build_call_list("L", mode=mode)
    log_event("dial_manager", f"prioritised queues — D:{len(d_list)} / L:{len(l_list)}", "success",
              {"metric_ok": True, "metric": f"D:{len(d_list)}/L:{len(l_list)} queued"})

    # 2 Sales Coach — ensure the hottest prospects have call notes
    hot = get_hot_prospects(limit=5, mode=mode)
    coached = 0
    for p in hot[:3]:
        if not (p.get("call_notes") or "").strip():
            try:
                sales_prep(prospect_id=p["id"]); coached += 1
            except Exception:
                pass

    # 3 Follow-Up (drafts only)
    fu = followup_run(post_to_telegram=False)
    # 4 Trial Monitor + 5 Revenue Analyst
    rep = revenue_report(mode=mode)
    overdue = get_overdue_followups(mode=mode)
    dead = find_dead_pipeline(mode=mode)
    funnel = compute_funnel(mode=mode)
    bottleneck = find_bottleneck(funnel)
    ylo, yhi = _yesterday_window()
    leads_y = _count("captured_leads", data_mode=mode, _range=("created_at", ylo, yhi))
    overdue_ok = len(overdue) == 0
    log_event("reporter", f"revenue — £{rep.get('build_revenue',0):.0f} builds + £{rep['mrr']:.0f} MRR, "
              f"{rep['churn_risk_count']} churn risk", "success",
              {"metric_ok": True, "metric": f"£{rep['mrr']:.0f} MRR"})
    log_event("followup", f"follow-up enforcement — {len(overdue)} overdue, {fu.get('count',0)} drafts",
              "success" if overdue_ok else "warn",
              {"metric_ok": overdue_ok, "metric": f"{len(overdue)} overdue"})
    log_event("qualifier", f"bottleneck {bottleneck.get('stage') or 'n/a'}", "success",
              {"metric_ok": bottleneck.get("stage") is not None, "metric": bottleneck.get("stage")})
    if dead:
        raise_alert("dead_pipeline", f"{len(dead)} prospect(s) AT RISK — 7+ days no contact, no next action",
                    "warn", entity="pipeline", entity_id="dead", mode=mode)

    hra = _highest_revenue_action(d_list, l_list, overdue, dead, rep, hot)
    d_next = (f"{d_list[0].get('business_name')} — {d_list[0].get('sales_angle','')[:70]}"
              if d_list else "queue empty — import + qualify prospects")
    l_next = (f"{l_list[0].get('business_name')} — {l_list[0].get('sales_angle','')[:70]}"
              if l_list else "queue empty — import + qualify prospects")

    raw = "\n".join([
        f"☀️ CEO BRIEFING — {_today().isoformat()}"
        + ("  · DEMO DATA" if mode == DEMO else ""),
        "",
        "WHAT HAPPENED:",
        f"• Yesterday: {rep['dials_yesterday']} dial(s), {leads_y} lead(s) captured.",
        f"• Pipeline: {funnel['queued']} queued → {funnel['called']} called → "
        f"{funnel['interested']} interested → {funnel['preview_sent']} preview-ready → {funnel['won']} won.",
        f"• Money: £{rep.get('build_revenue',0):.0f} builds sold + £{rep['mrr']:.0f} MRR "
        f"({rep['paying_clients']} paying, {rep['trials_live']} on trial).",
        "",
        "WHAT'S BROKEN:",
        f"• {len(overdue)} overdue follow-up(s); {len(dead)} prospect(s) at risk; "
        f"{rep['churn_risk_count']} trial(s) near churn.",
        f"• BOTTLENECK — {bottleneck['text']}",
        "",
        f"💷 HIGHEST-REVENUE ACTION: {hra}",
        f"→ D does next: {d_next}",
        f"→ L does next: {l_next}",
    ])

    # Claude words it crisply from the computed facts — numbers preserved. Raw on failure.
    briefing = raw
    if settings.ANTHROPIC_API_KEY:
        worded = _claude(
            "You are the CEO of a UK web-design firm briefing two founders (D and L) who sell "
            "website builds + lead-capture to tradespeople. Rewrite the briefing below to be sharp "
            "and motivating WITHOUT changing any number, name or the bottleneck. Keep the sections "
            "(what happened / what's broken / highest-revenue action / D next / L next). UK tone, "
            "punchy, max ~140 words. BANNED: vague filler like 'progressing well'. Be specific.",
            raw, max_tokens=420, agent="ceo_briefing")
        if worded and len(worded) > 60:
            briefing = worded

    # Store the briefing so Mission Control can show the latest.
    try:
        get_db().table("briefings").insert({
            "kind": "daily", "text": briefing, "bottleneck": bottleneck.get("stage"),
            "data_mode": mode,
            "metrics": {"funnel": funnel, "mrr": rep["mrr"], "build_revenue": rep.get("build_revenue", 0),
                        "overdue": len(overdue), "dead": len(dead), "leads_yesterday": leads_y,
                        "highest_revenue_action": hra},
        }).execute()
    except Exception as e:
        logger.debug(f"[ceo_briefing] store skipped: {e}")

    delivery = notify.notify_founders(briefing, kind="briefing") if post else {"channel": "none", "ok": False}
    return {"ok": True, "briefing": briefing, "bottleneck": bottleneck, "funnel": funnel,
            "coached": coached, "followup_drafts": fu.get("count", 0),
            "delivery": delivery, "notify_channel": settings.notify_channel}


def daily_briefing(post_to_telegram: bool = True) -> dict:
    """Back-compat entry point for the scheduler + /api/cron/morning."""
    r = ceo_briefing(post=post_to_telegram, mode=REAL)
    r["telegram"] = settings.telegram_enabled
    return r


def get_latest_briefing(mode: str = REAL) -> dict:
    try:
        rows = (get_db().table("briefings").select("*").eq("data_mode", mode)
                .order("created_at", desc=True).limit(1).execute().data or [])
        return rows[0] if rows else {}
    except Exception:
        return {}
