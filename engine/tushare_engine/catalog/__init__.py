from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, Any]:
    path = Path(__file__).with_name("api_catalog.json")
    return json.loads(path.read_text(encoding="utf-8"))


def list_apis() -> list[dict[str, Any]]:
    return list(load_catalog().get("apis") or [])


def daily_recommended_ids() -> list[str]:
    return list(load_catalog().get("daily_recommended") or [])


def tier_probes() -> list[dict[str, Any]]:
    return list(load_catalog().get("tier_probes") or [])


def get_api(api_id: str) -> dict[str, Any] | None:
    for item in list_apis():
        if item.get("id") == api_id:
            return item
    return None
