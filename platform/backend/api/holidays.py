"""
Holiday HQ API — personal holiday finder for Dylan + his girlfriend.
GET  /api/holidays/trip                        — active trip (auto-created) + recommendations
POST /api/holidays/trip/new                    — archive current trip, start fresh
POST /api/holidays/answer                      — answer the Concierge's question
POST /api/holidays/search                      — run the Scout, store recommendations
GET  /api/holidays/recommendations             — list recommendations for the active trip
POST /api/holidays/recommendations/{id}/status — shortlist / dismiss / book a pick
"""
import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents import holiday_agent

router = APIRouter()
logger = logging.getLogger(__name__)

MIGRATION_HINT = (
    "Holiday tables missing — run the HOLIDAY HQ section of "
    "platform/backend/db/migrations.sql in the Supabase SQL Editor."
)

REC_STATUSES = {"suggested", "shortlisted", "dismissed", "booked"}


class AnswerBody(BaseModel):
    answer: str


class RecStatusBody(BaseModel):
    status: str


def _db():
    from db.client import get_db
    return get_db()


def _table_guard(e: Exception):
    """PostgREST 404s on unknown tables — surface the migration hint instead of a raw 500."""
    if isinstance(e, httpx.HTTPStatusError) and e.response.status_code in (400, 404):
        raise HTTPException(status_code=503, detail=MIGRATION_HINT)
    raise e


def _active_trip(db, create: bool = True) -> dict | None:
    try:
        rows = db.table("holiday_trips").select("*").neq("status", "archived") \
            .order("created_at", desc=True).limit(1).execute().data or []
        if rows:
            return rows[0]
        if not create:
            return None
        created = db.table("holiday_trips").insert({
            "title": "Our Next Holiday",
            "status": "interviewing",
            "preferences": {},
            "conversation": [holiday_agent.opening_message()],
            "questions_asked": 1,
        }).execute().data
        return created[0] if created else None
    except HTTPException:
        raise
    except Exception as e:
        _table_guard(e)


def _trip_recs(db, trip_id: str) -> list:
    return db.table("holiday_recommendations").select("*") \
        .eq("trip_id", trip_id).order("rank").execute().data or []


@router.get("/holidays/trip")
def get_trip():
    db = _db()
    trip = _active_trip(db)
    if not trip:
        raise HTTPException(status_code=500, detail="Could not create a trip.")
    return {"trip": trip, "recommendations": _trip_recs(db, trip["id"])}


@router.post("/holidays/trip/new")
def new_trip():
    db = _db()
    try:
        db.table("holiday_trips").update({"status": "archived"}).neq("status", "archived").execute()
    except Exception as e:
        _table_guard(e)
    trip = _active_trip(db)
    return {"trip": trip, "recommendations": []}


@router.post("/holidays/answer")
def answer_question(body: AnswerBody):
    text = (body.answer or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Answer is empty.")

    db = _db()
    trip = _active_trip(db)
    if trip["status"] not in ("interviewing", "ready", "searched"):
        raise HTTPException(status_code=400, detail=f"Trip is {trip['status']} — start a new trip.")

    conversation = list(trip.get("conversation") or [])
    conversation.append({"role": "user", "content": text})

    result = holiday_agent.process_answer(
        conversation, trip.get("preferences") or {}, trip.get("questions_asked") or 0
    )

    assistant_content = result["reply"]
    if result.get("question"):
        assistant_content = f"{result['reply']} {result['question']}".strip()
    conversation.append({
        "role": "assistant",
        "content": assistant_content,
        "quick_replies": result.get("quick_replies") or [],
    })

    complete = bool(result.get("complete"))
    update = {
        "conversation": conversation,
        "preferences": result.get("preferences") or {},
        "questions_asked": (trip.get("questions_asked") or 0) + (0 if complete else 1),
    }
    # Never regress a searched trip back to 'ready' — extra answers just refine the profile
    if complete and trip["status"] == "interviewing":
        update["status"] = "ready"

    updated = db.table("holiday_trips").update(update).eq("id", trip["id"]).execute().data
    trip = updated[0] if updated else {**trip, **update}
    return {"trip": trip, "recommendations": _trip_recs(db, trip["id"])}


@router.post("/holidays/search")
def search_holidays():
    db = _db()
    trip = _active_trip(db)
    if not (trip.get("preferences") or {}):
        raise HTTPException(status_code=400, detail="Answer the Concierge's questions first — the Scout needs a profile.")

    result = holiday_agent.find_holidays(trip.get("preferences") or {}, trip.get("conversation") or [])
    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])

    # Re-searches replace old suggestions but never touch the shortlist or booked picks
    db.table("holiday_recommendations").delete().eq("trip_id", trip["id"]) \
        .in_("status", ["suggested", "dismissed"]).execute()

    rows = []
    for i, rec in enumerate(result["recommendations"][:8], start=1):
        try:
            rows.append({
                "trip_id": trip["id"],
                "rank": i,
                "destination": str(rec.get("destination") or "Unknown")[:120],
                "country": str(rec.get("country") or "")[:80],
                "match_score": max(0, min(100, int(rec.get("match_score") or 0))),
                "summary": rec.get("summary") or "",
                "best_time": rec.get("best_time") or "",
                "flight_time": rec.get("flight_time") or "",
                "est_cost_pp": float(rec.get("est_cost_pp") or 0),
                "est_cost_total": float(rec.get("est_cost_total") or 0),
                "highlights": rec.get("highlights") or [],
                "stay_area": rec.get("stay_area") or "",
                "tips": rec.get("tips") or "",
                "status": "suggested",
            })
        except (TypeError, ValueError) as e:
            logger.warning(f"[holidays] skipped malformed recommendation: {e}")

    if not rows:
        raise HTTPException(status_code=502, detail="Scout returned nothing usable — try again.")

    db.table("holiday_recommendations").insert(rows).execute()

    updated = db.table("holiday_trips").update({
        "status": "searched",
        "scout_overview": result.get("overview") or "",
    }).eq("id", trip["id"]).execute().data
    trip = updated[0] if updated else trip

    return {"trip": trip, "recommendations": _trip_recs(db, trip["id"])}


@router.get("/holidays/recommendations")
def list_recommendations(status: str | None = None):
    db = _db()
    trip = _active_trip(db, create=False)
    if not trip:
        return {"recommendations": []}
    recs = _trip_recs(db, trip["id"])
    if status:
        recs = [r for r in recs if r.get("status") == status]
    return {"recommendations": recs}


@router.post("/holidays/recommendations/{rec_id}/status")
def set_recommendation_status(rec_id: str, body: RecStatusBody):
    if body.status not in REC_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(REC_STATUSES)}")
    db = _db()
    updated = db.table("holiday_recommendations").update({"status": body.status}) \
        .eq("id", rec_id).execute().data
    if not updated:
        raise HTTPException(status_code=404, detail="Recommendation not found.")
    return {"recommendation": updated[0]}
