"""静态目录加载冒烟（无 Token）。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "engine"
sys.path.insert(0, str(ROOT))

from tushare_engine.catalog import daily_recommended_ids, list_apis, load_catalog, tier_probes
from tushare_engine.permission import catalog_static, TIER_RATE
from tushare_engine.pipeline.daily import ALL_STEPS, INDEX_DAILY_UNIVERSE
from tushare_engine.pipeline.periods import recent_quarter_ends, resolve_periods
from tushare_engine.scaffold import scaffold_adapter


def main() -> None:
    # 清掉可能的旧缓存
    load_catalog.cache_clear()
    cat = load_catalog()
    assert cat.get("version") == 3
    apis = list_apis()
    assert len(apis) >= 17
    ids = {a["id"] for a in apis}
    for need in daily_recommended_ids():
        assert need in ids
        item = next(a for a in apis if a["id"] == need)
        assert item.get("implemented") is True

    implemented = {a["id"] for a in apis if a.get("implemented")}
    for step in ALL_STEPS:
        assert step in implemented, step
        assert step in ids

    assert "stk_mins" in ids
    assert next(a for a in apis if a["id"] == "stk_mins").get("implemented") is False
    assert next(a for a in apis if a["id"] == "index_basic").get("min_points") == 2000

    tiers = [int(t["tier"]) for t in tier_probes()]
    assert 3000 in tiers
    assert 3000 in TIER_RATE
    assert len(INDEX_DAILY_UNIVERSE) >= 6

    periods = recent_quarter_ends("20240630", 4)
    assert len(periods) == 4
    assert periods[-1] == "20240630"
    ranged = resolve_periods(mode="range", start_date="20230101", end_date="20231231", water_end=None)
    assert "20230331" in ranged and "20231231" in ranged

    static = catalog_static()
    assert static["ok"] is True
    # stk_mins still coming_soon in static catalog
    assert any(a.get("id") == "stk_mins" and a.get("status") == "coming_soon" for a in static["apis"])

    sc = scaffold_adapter("stk_mins", force=True)
    assert sc.get("ok") is True
    print("catalog ok", len(apis), "apis;", len(ALL_STEPS), "runnable steps")


if __name__ == "__main__":
    main()
