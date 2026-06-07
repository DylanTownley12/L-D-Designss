"""
Google Places (v1) photo fetcher.

The lead finder already pulls barbers from the Places v1 API but never stored the
place id or photos. This module backfills real shop photos for a lead so its
preview shows the barber's OWN premises instead of stock images — the single
biggest lever for converting a cold barber into a paying customer.

Flow (all v1, same API key the lead finder uses):
  1. searchText "{name} {city} UK"  with fieldmask places.id,places.displayName,places.photos
     → returns photo *resource names* (free, included in the search SKU)
  2. for each photo: GET .../media?skipHttpRedirect=true
     → returns a keyless lh3.googleusercontent.com CDN url (fast, safe to embed)

We resolve to CDN urls at backfill time and store them on the lead, so preview
regeneration is free and the HTML carries no API key.
"""
import logging
import re
from typing import Optional

from config import settings

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger(__name__)

_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
_SEARCH_FIELDMASK = "places.id,places.displayName,places.photos"


def _norm(s: str) -> set:
    """Lowercase word tokens for loose name matching."""
    return set(re.findall(r"[a-z0-9]+", (s or "").lower()))


def _names_match(query_name: str, result_name: str) -> bool:
    """
    Guard against showing the WRONG shop's photos. Require meaningful token overlap
    between the lead's business name and the Places result name. Generic barber
    words don't count toward a match.
    """
    stop = {"barber", "barbers", "barbershop", "shop", "the", "and", "hair", "cuts",
            "cut", "studio", "gents", "mens", "co", "ltd"}
    q = _norm(query_name) - stop
    r = _norm(result_name) - stop
    if not q:
        # Name was only generic words — fall back to any overlap incl. generic
        q = _norm(query_name)
        r = _norm(result_name)
    return bool(q & r)


def resolve_photo_uri(photo_name: str, max_w: int = 1200) -> Optional[str]:
    """Resolve a Places photo resource name to a keyless CDN url."""
    if not httpx or not settings.GOOGLE_PLACES_API_KEY or not photo_name:
        return None
    url = f"https://places.googleapis.com/v1/{photo_name}/media"
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(url, params={
                "maxWidthPx": max_w,
                "skipHttpRedirect": "true",
                "key": settings.GOOGLE_PLACES_API_KEY,
            })
            if r.status_code != 200:
                logger.warning(f"[places_photos] media {r.status_code}: {r.text[:120]}")
                return None
            return r.json().get("photoUri")
    except Exception as e:
        logger.warning(f"[places_photos] resolve failed: {e}")
        return None


def fetch_photos_for_lead(name: str, city: str, want: int = 6, max_w: int = 1200) -> dict:
    """
    Returns {"place_id": str|None, "photo_urls": [cdn...], "matched_name": str|None,
             "status": "ok"|"no_key"|"no_match"|"no_photos"|"error"}.
    Never raises — preview generation must survive any photo failure.
    """
    if not httpx:
        return {"place_id": None, "photo_urls": [], "matched_name": None, "status": "error"}
    if not settings.GOOGLE_PLACES_API_KEY:
        return {"place_id": None, "photo_urls": [], "matched_name": None, "status": "no_key"}

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": _SEARCH_FIELDMASK,
    }
    body = {
        "textQuery": f"{name} {city} UK",
        "languageCode": "en-GB",
        "regionCode": "GB",
        "pageSize": 3,
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(_SEARCH_URL, headers=headers, json=body)
            if r.status_code != 200:
                logger.warning(f"[places_photos] search {r.status_code}: {r.text[:160]}")
                return {"place_id": None, "photo_urls": [], "matched_name": None, "status": "error"}
            places = r.json().get("places", [])
    except Exception as e:
        logger.warning(f"[places_photos] search failed for {name}/{city}: {e}")
        return {"place_id": None, "photo_urls": [], "matched_name": None, "status": "error"}

    # Pick the first result whose name loosely matches the lead (avoid wrong shop)
    chosen = None
    for p in places:
        result_name = (p.get("displayName") or {}).get("text", "")
        if _names_match(name, result_name):
            chosen = p
            break
    if not chosen:
        return {"place_id": None, "photo_urls": [], "matched_name": None, "status": "no_match"}

    place_id = chosen.get("id")
    matched_name = (chosen.get("displayName") or {}).get("text", "")
    photos = chosen.get("photos", []) or []
    if not photos:
        return {"place_id": place_id, "photo_urls": [], "matched_name": matched_name, "status": "no_photos"}

    photo_urls = []
    for ph in photos[:want]:
        nm = ph.get("name")
        uri = resolve_photo_uri(nm, max_w=max_w)
        if uri:
            photo_urls.append(uri)

    status = "ok" if photo_urls else "no_photos"
    return {
        "place_id": place_id,
        "photo_urls": photo_urls,
        "matched_name": matched_name,
        "status": status,
    }
