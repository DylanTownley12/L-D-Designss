from postgrest import SyncPostgRESTClient
from config import settings

_client = None


class _DBClient:
    """Wraps PostgREST directly — bypasses supabase-py key format validation."""
    def __init__(self):
        self._rest = SyncPostgRESTClient(
            f"{settings.SUPABASE_URL}/rest/v1",
            headers={
                "apikey": settings.SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
        )

    def table(self, name: str):
        return self._rest.from_(name)


def get_db() -> _DBClient:
    global _client
    if _client is None:
        _client = _DBClient()
    return _client


db = get_db
