import httpx
from typing import Any, Dict, List, Optional
from config import settings


class _Response:
    def __init__(self, data: Any, count: Optional[int] = None):
        self.data = data
        self.count = count


class _QueryBuilder:
    def __init__(self, base_url: str, headers: dict, table: str):
        self._url = f"{base_url}/{table}"
        self._headers = dict(headers)
        self._filters: list = []
        self._select = "*"
        self._order_parts: list = []
        self._limit_val: Optional[int] = None
        self._offset_val: Optional[int] = None
        self._method = "GET"
        self._body = None
        self._count: Optional[str] = None
        self._single = False
        self._upsert = False
        self._on_conflict: Optional[str] = None

    def select(self, columns: str = "*", count: str = None):
        self._select = columns
        self._count = count
        return self

    def eq(self, column: str, value: Any):
        self._filters.append((column, f"eq.{value}"))
        return self

    def neq(self, column: str, value: Any):
        self._filters.append((column, f"neq.{value}"))
        return self

    def ilike(self, column: str, pattern: str):
        self._filters.append((column, f"ilike.{pattern}"))
        return self

    def is_(self, column: str, value: str):
        self._filters.append((column, f"is.{value}"))
        return self

    def gte(self, column: str, value: Any):
        self._filters.append((column, f"gte.{value}"))
        return self

    def in_(self, column: str, values: list):
        val_str = ",".join(str(v) for v in values)
        self._filters.append((column, f"in.({val_str})"))
        return self

    def order(self, column: str, desc: bool = False):
        direction = "desc" if desc else "asc"
        self._order_parts.append(f"{column}.{direction}")
        return self

    def limit(self, n: int):
        self._limit_val = n
        return self

    def range(self, start: int, end: int):
        self._offset_val = start
        self._limit_val = end - start + 1
        return self

    def single(self):
        self._single = True
        return self

    def insert(self, data: Any):
        self._method = "POST"
        self._body = data
        return self

    def update(self, data: Dict):
        self._method = "PATCH"
        self._body = data
        return self

    def delete(self):
        self._method = "DELETE"
        return self

    def upsert(self, data: Any, on_conflict: str = None):
        self._method = "POST"
        self._body = data
        self._upsert = True
        self._on_conflict = on_conflict
        return self

    def execute(self) -> _Response:
        headers = dict(self._headers)
        params: list = []

        if self._method == "GET":
            params.append(("select", self._select))

        for col, val in self._filters:
            params.append((col, val))

        if self._order_parts:
            params.append(("order", ",".join(self._order_parts)))

        if self._limit_val is not None:
            params.append(("limit", str(self._limit_val)))

        if self._offset_val is not None:
            params.append(("offset", str(self._offset_val)))

        if self._count == "exact":
            existing = headers.get("Prefer", "return=representation")
            headers["Prefer"] = existing + ",count=exact"

        if self._upsert:
            prefer = "return=representation,resolution=merge-duplicates"
            if self._on_conflict:
                prefer += f",on_conflict={self._on_conflict}"
            headers["Prefer"] = prefer

        if self._single:
            headers["Accept"] = "application/vnd.pgrst.object+json"

        with httpx.Client(timeout=30.0) as client:
            if self._method == "GET":
                r = client.get(self._url, headers=headers, params=params)
            elif self._method == "POST":
                r = client.post(self._url, headers=headers, json=self._body, params=params)
            elif self._method == "PATCH":
                r = client.patch(self._url, headers=headers, json=self._body, params=params)
            elif self._method == "DELETE":
                r = client.delete(self._url, headers=headers, params=params)

            r.raise_for_status()

            if not r.content or r.status_code == 204:
                return _Response(data=[], count=0)

            data = r.json()

            # single() returns a dict directly — do not wrap in a list

            count = None
            if self._count == "exact":
                content_range = r.headers.get("Content-Range", "")
                if "/" in content_range:
                    count_str = content_range.split("/")[-1]
                    count = int(count_str) if count_str.isdigit() else (len(data) if isinstance(data, list) else 0)

            return _Response(data=data, count=count)


class _DBClient:
    def __init__(self):
        self._base_url = f"{settings.SUPABASE_URL}/rest/v1"
        self._headers = {
            "apikey": settings.SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def table(self, name: str) -> _QueryBuilder:
        return _QueryBuilder(self._base_url, self._headers, name)


_client: Optional[_DBClient] = None


def get_db() -> _DBClient:
    global _client
    if _client is None:
        _client = _DBClient()
    return _client


db = get_db
