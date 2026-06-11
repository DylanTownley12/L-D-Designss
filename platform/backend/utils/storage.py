"""
Supabase Storage via the SERVICE key — private bucket `lead-photos`, all uploads
go through the backend (no anon upload policies). Returns long-lived signed URLs.
"""
import logging
import uuid
import mimetypes
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)
BUCKET = "lead-photos"


def _headers(content_type: Optional[str] = None) -> dict:
    h = {"Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
         "apikey": settings.SUPABASE_SERVICE_KEY}
    if content_type:
        h["Content-Type"] = content_type
    return h


def ensure_bucket() -> bool:
    """Create the private bucket if it doesn't exist. Idempotent."""
    url = f"{settings.SUPABASE_URL}/storage/v1/bucket"
    try:
        with httpx.Client(timeout=15) as c:
            r = c.post(url, headers=_headers("application/json"), json={
                "id": BUCKET, "name": BUCKET, "public": False,
                "file_size_limit": 10485760,
                "allowed_mime_types": ["image/png", "image/jpeg", "image/webp", "image/heic"],
            })
        if r.status_code in (200, 201, 409) or "already exists" in r.text.lower():
            return True
        logger.warning(f"[storage] ensure_bucket {r.status_code}: {r.text[:200]}")
        return False
    except Exception as e:
        logger.error(f"[storage] ensure_bucket failed: {e}")
        return False


def upload_photo(content: bytes, filename: str = "photo.jpg",
                 content_type: Optional[str] = None) -> Optional[str]:
    """Upload bytes to the private bucket; return a 1-year signed URL (or None)."""
    if not content:
        return None
    ensure_bucket()
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "jpg").lower()[:5]
    path = f"{uuid.uuid4().hex}.{ext}"
    ct = content_type or mimetypes.guess_type(filename)[0] or "image/jpeg"
    try:
        with httpx.Client(timeout=30) as c:
            r = c.post(f"{settings.SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",
                       headers=_headers(ct), content=content)
        if r.status_code not in (200, 201):
            logger.warning(f"[storage] upload {r.status_code}: {r.text[:200]}")
            return None
        # Private bucket → return a signed URL the dashboard can render.
        with httpx.Client(timeout=15) as c:
            sr = c.post(f"{settings.SUPABASE_URL}/storage/v1/object/sign/{BUCKET}/{path}",
                        headers=_headers("application/json"), json={"expiresIn": 31536000})
        if sr.status_code == 200:
            signed = sr.json().get("signedURL") or sr.json().get("signedUrl")
            if signed:
                return f"{settings.SUPABASE_URL}/storage/v1{signed}"
        return None
    except Exception as e:
        logger.error(f"[storage] upload failed: {e}")
        return None
