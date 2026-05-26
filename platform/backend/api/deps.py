from fastapi import Security, HTTPException
from fastapi.security.api_key import APIKeyHeader
from config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(api_key: str = Security(api_key_header)):
    if not api_key or api_key != settings.SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return api_key
