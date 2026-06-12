"""
Self-running revenue pipeline (founder mission 2026-06-12).

Keeps the trades funnel full without anyone clicking buttons:
  1. TOP-UP    — Lead Finder pulls real no-website tradespeople until we hold
                 PROSPECT_TARGET of them (deduped by place_id + phone).
  2. QUALIFY   — requalify_all() scores them and gates queue_ready.
  3. PREVIEWS  — build_v3 for every queue-ready prospect that doesn't have one
                 (force=False → resumable; promoted/live pages never touched).
  4. BALANCE   — D and L get equal-sized, completely DISJOINT call queues.
                 Only prospects with zero logged activity ever move sides, so
                 nobody loses a lead they've already worked.

Runs from the scheduler ~2½ min after every deploy and daily at 07:15
Europe/London (before the 08:00 briefing). Idempotent — once the target is met
a run costs a handful of count queries and exits.
"""
import logging
import time

from config import settings
from db.client import get_db
from agents import trades, trades_leadfinder
from agents import preview_qa

logger = logging.getLogger(__name__)

REAL = "real"


def _no_website_count() -> int:
    try:
        return (get_db().table("prospects").select("id", count="exact")
                .eq("data_mode", REAL).eq("website_status", "none")
                .execute().count or 0)
    except Exception as e:
        logger.warning(f"[pipeline] count failed: {e}")
        return -1


def top_up_prospects(target: int) -> dict:
    """Round-robin Lead Finder pulls until we hold `target` no-website prospects.
    Stops early after two rounds that add nothing (patch exhausted)."""
    start = _no_website_count()
    if start < 0:
        return {"ok": False, "before": start, "after": start, "message": "count query failed"}
    have, stagnant, rounds = start, 0, 0
    while have < target and rounds < 8 and stagnant < 2:
        rounds += 1
        res = trades_leadfinder.find_leads(cap=min(60, target - have))
        added = res.get("written", 0)
        stagnant = 0 if added else stagnant + 1
        have = _no_website_count()
        logger.info(f"[pipeline] top-up round {rounds}: +{added} → {have}/{target}")
        time.sleep(1.0)
    return {"ok": True, "before": start, "after": have, "rounds": rounds}


def cleanup_orphan_v3() -> int:
    """Delete v3 preview rows whose prospect no longer exists (wipe-seed/demo
    leftovers). They bloat the table past PostgREST's silent ~1000-row read cap
    and poison every bulk lookup. Returns rows deleted."""
    db = get_db()
    try:
        live = {p["id"] for p in (db.table("prospects").select("id")
                                  .limit(2000).execute().data or [])}
    except Exception as e:
        logger.warning(f"[pipeline] orphan scan failed: {e}")
        return 0
    deleted = 0
    for _ in range(10):                       # paged: each pass reads ≤1000 rows
        try:
            rows = (db.table("previews").select("id,prospect_id")
                    .eq("template_version", "v3").limit(1000).execute().data or [])
        except Exception:
            break
        dead = [r["id"] for r in rows if r.get("prospect_id") not in live]
        if not dead:
            break
        for i in range(0, len(dead), 100):
            try:
                db.table("previews").delete().in_("id", dead[i:i + 100]).execute()
                deleted += len(dead[i:i + 100])
            except Exception as e:
                logger.warning(f"[pipeline] orphan delete chunk failed: {e}")
                return deleted
    if deleted:
        trades.log_event("pipeline", f"cleaned {deleted} orphaned v3 preview rows", "info",
                         {"metric_ok": True})
    return deleted


def build_all_previews() -> dict:
    """v3 for every queue-ready prospect that lacks one, then one retry pass over
    QA-failed drafts (their inputs may have changed — e.g. £-quoting reviews now
    filtered). Chunked; force=False makes re-runs free."""
    built = passed = rounds = 0
    prev_remaining = None
    while rounds < 40:
        rounds += 1
        res = preview_qa.build_v3_batch(mode=REAL, limit=12, force=False)
        n = res.get("built", 0)
        if not n:
            break
        built += n
        passed += res.get("passed", 0)
        if rounds % 5 == 0:
            trades.log_event("pipeline", f"previews… {built} built so far ({passed} QA pass)",
                             "info", {"metric_ok": True})
        time.sleep(0.5)

    # Retry currently-failed drafts once, by prospect id (never name — fuzzy
    # matching could rebuild the wrong business). Promoted/live rows untouched.
    retried = 0
    try:
        db = get_db()
        pros = (db.table("prospects").select("id,preview_id,queue_ready,data_mode")
                .eq("data_mode", REAL).limit(2000).execute().data or [])
        ids = [p["id"] for p in pros if p.get("queue_ready")]
        promoted = {p["id"]: p.get("preview_id") for p in pros}
        v3rows = []
        for i in range(0, len(ids), 100):
            v3rows += (db.table("previews").select("id,prospect_id,qa_status,created_at")
                       .eq("template_version", "v3").in_("prospect_id", ids[i:i + 100])
                       .limit(1000).execute().data or [])
        latest = {}
        for r in sorted(v3rows, key=lambda x: x.get("created_at") or ""):
            latest[r["prospect_id"]] = r
        for pid, row in latest.items():
            if row.get("qa_status") == "qa_failed" and promoted.get(pid) != row["id"]:
                r = preview_qa.build_v3(pid)
                retried += 1
                passed += 1 if r.get("passed") else 0
                if retried >= 30:
                    break
    except Exception as e:
        logger.warning(f"[pipeline] failed-draft retry pass skipped: {e}")
    return {"built": built + retried, "passed": passed}


def balance_assignments() -> dict:
    """Make D's and L's queues equal and disjoint. New/unassigned prospects are
    dealt alternately by score (both get equally good lists); only untouched
    to_call prospects are ever moved when one side is heavy."""
    db = get_db()
    try:
        pros = (db.table("prospects").select("id,assigned_to,status,opportunity_score,data_mode")
                .eq("data_mode", REAL).limit(2000).execute().data or [])
        logs = (db.table("activity_logs").select("prospect_id").limit(5000).execute().data or [])
    except Exception as e:
        return {"ok": False, "message": f"read failed: {e}"}
    worked = {l.get("prospect_id") for l in logs if l.get("prospect_id")}
    counts = {"D": 0, "L": 0}
    unassigned, movable = [], {"D": [], "L": []}
    for p in pros:
        side = (p.get("assigned_to") or "").upper()
        if side in counts:
            counts[side] += 1
            if p["id"] not in worked and p.get("status") == "to_call":
                movable[side].append(p)
        else:
            unassigned.append(p)

    updates = []   # (prospect_id, new_side)
    unassigned.sort(key=lambda p: -(p.get("opportunity_score") or 0))
    for p in unassigned:
        side = "D" if counts["D"] <= counts["L"] else "L"
        counts[side] += 1
        updates.append((p["id"], side))

    heavy, light = ("D", "L") if counts["D"] > counts["L"] else ("L", "D")
    excess = (counts[heavy] - counts[light]) // 2
    if excess > 0:
        pool = sorted(movable[heavy], key=lambda p: -(p.get("opportunity_score") or 0))
        # move every other one (by score) so both queues keep the same quality curve
        for p in pool[1::2][:excess]:
            counts[heavy] -= 1
            counts[light] += 1
            updates.append((p["id"], light))

    moved = 0
    for pid, side in updates:
        try:
            db.table("prospects").update({"assigned_to": side}).eq("id", pid).execute()
            moved += 1
        except Exception as e:
            logger.warning(f"[pipeline] assign {pid}→{side} failed: {e}")
    return {"ok": True, "assigned_or_moved": moved, "D": counts["D"], "L": counts["L"]}


def run(target: int = None) -> dict:
    """The whole mission, in order. Safe to run any number of times."""
    target = target or settings.PROSPECT_TARGET
    t0 = time.time()
    trades.log_event("pipeline", f"pipeline run started — target {target} no-website prospects",
                     "info", {"metric_ok": True})

    cleanup_orphan_v3()
    if not settings.GOOGLE_PLACES_API_KEY:
        # Without the key, builds get stock photos and no reviews — pages we'd
        # only have to throw away. Hold previews, keep the rest of the run.
        trades.log_event("pipeline", "GOOGLE_PLACES_API_KEY missing — lead top-up AND "
                         "preview builds ON HOLD until it's restored in Railway", "error",
                         {"metric_ok": False})
        top = top_up_prospects(target)            # logs its own no-key error, exits fast
        try:
            trades.requalify_all(mode=REAL)
        except Exception as e:
            logger.warning(f"[pipeline] requalify failed: {e}")
        prev = {"built": 0, "passed": 0}
        bal = balance_assignments()
    else:
        top = top_up_prospects(target)
        try:
            trades.requalify_all(mode=REAL)
        except Exception as e:
            logger.warning(f"[pipeline] requalify failed: {e}")
        prev = build_all_previews()
        bal = balance_assignments()

    took = int(time.time() - t0)
    summary = (f"pipeline done in {took}s — prospects {top.get('after')}/{target} "
               f"(+{(top.get('after') or 0) - (top.get('before') or 0)} new), "
               f"{prev['built']} v3 previews built ({prev['passed']} QA pass), "
               f"queues D:{bal.get('D')} / L:{bal.get('L')} ({bal.get('assigned_or_moved')} assigned)")
    trades.log_event("pipeline", summary, "success",
                     {"metric_ok": bool((top.get("after") or 0) >= target * 0.8),
                      "metric": f"{top.get('after')}/{target}"})
    logger.info(f"[pipeline] {summary}")
    return {"ok": True, "took_s": took, "top_up": top, "previews": prev,
            "balance": bal, "message": summary}
