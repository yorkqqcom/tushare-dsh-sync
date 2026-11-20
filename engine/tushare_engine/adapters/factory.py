from __future__ import annotations

from typing import Any

from tushare_engine.adapters.base import BusinessStore
from tushare_engine.adapters.postgres import PostgresStore
from tushare_engine.adapters.sqlite import SqliteStore


def create_store(db: dict[str, Any]) -> BusinessStore:
    driver = str(db.get("driver") or "sqlite").lower()
    if driver == "sqlite":
        path = str(db.get("sqlite_path") or "")
        if not path:
            raise ValueError("sqlite_path required")
        return SqliteStore(path)
    if driver in ("postgresql", "postgres"):
        return PostgresStore(
            host=str(db.get("host") or "127.0.0.1"),
            port=int(db.get("port") or 5432),
            user=str(db.get("user") or "postgres"),
            password=str(db.get("password") or ""),
            database=str(db.get("database") or "tushare_sync"),
        )
    raise ValueError(f"unsupported db driver: {driver}")
