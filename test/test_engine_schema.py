"""无 Token 的 engine schema / upsert 冒烟。"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "engine"
sys.path.insert(0, str(ROOT))

import pandas as pd

from tushare_engine.adapters.sqlite import SqliteStore


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "t.db"
        store = SqliteStore(str(db))
        store.ensure_schema()
        store.ping()
        df = pd.DataFrame(
            [
                {"exchange": "SSE", "cal_date": "20240102", "is_open": 1, "pretrade_date": "20240101"},
                {"exchange": "SSE", "cal_date": "20240103", "is_open": 1, "pretrade_date": "20240102"},
            ]
        )
        n = store.upsert_dataframe("trade_cal", df, ["exchange", "cal_date"])
        assert n == 2
        assert store.max_trade_date("trade_cal") == "20240103"
        stats = store.table_stats("trade_cal", "cal_date")
        assert stats["count"] == 2
        assert stats["start_date"] == "20240102"
        assert stats["end_date"] == "20240103"
        assert stats["updated_at"]
        # upsert again
        n2 = store.upsert_dataframe("trade_cal", df, ["exchange", "cal_date"])
        assert n2 == 2
        store.close()
        print("engine schema ok")


if __name__ == "__main__":
    main()
