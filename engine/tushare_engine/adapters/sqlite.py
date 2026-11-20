from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

import pandas as pd

from tushare_engine.adapters.base import BusinessStore, TableStats, df_records
from tushare_engine.schemas.ddl import SQLITE_DDL, TABLES_NEED_UPDATED_AT

SH_TZ = ZoneInfo("Asia/Shanghai")


def _now_iso() -> str:
    return datetime.now(SH_TZ).isoformat(timespec="seconds")


class SqliteStore(BusinessStore):
    def __init__(self, path: str):
        self.path = path
        self.conn = sqlite3.connect(path)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")

    def ensure_schema(self) -> None:
        self.conn.executescript(SQLITE_DDL)
        for table in TABLES_NEED_UPDATED_AT:
            cols = {
                r[1]
                for r in self.conn.execute(f"PRAGMA table_info({table})").fetchall()
            }
            if "updated_at" not in cols:
                self.conn.execute(f"ALTER TABLE {table} ADD COLUMN updated_at TEXT")
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def ping(self) -> None:
        self.conn.execute("SELECT 1").fetchone()

    def upsert_dataframe(self, table: str, df: pd.DataFrame, conflict_cols: list[str]) -> int:
        if df is None or df.empty:
            return 0
        out = df.copy()
        if "updated_at" not in out.columns:
            out["updated_at"] = _now_iso()
        rows = df_records(out)
        if not rows:
            return 0
        cols = list(rows[0].keys())
        placeholders = ",".join(["?"] * len(cols))
        col_sql = ",".join(cols)
        update_cols = [c for c in cols if c not in conflict_cols]
        if update_cols:
            set_sql = ",".join(f"{c}=excluded.{c}" for c in update_cols)
            sql = (
                f"INSERT INTO {table} ({col_sql}) VALUES ({placeholders}) "
                f"ON CONFLICT({','.join(conflict_cols)}) DO UPDATE SET {set_sql}"
            )
        else:
            sql = (
                f"INSERT INTO {table} ({col_sql}) VALUES ({placeholders}) "
                f"ON CONFLICT({','.join(conflict_cols)}) DO NOTHING"
            )
        values = [tuple(r.get(c) for c in cols) for r in rows]
        self.conn.executemany(sql, values)
        self.conn.commit()
        return len(values)

    def max_trade_date(self, table: str, extra_where: str = "") -> Optional[str]:
        where = f" WHERE {extra_where}" if extra_where else ""
        col = "cal_date" if table == "trade_cal" else "trade_date"
        if table == "stock_basic":
            cur = self.conn.execute("SELECT MAX(list_date) FROM stock_basic")
        else:
            cur = self.conn.execute(f"SELECT MAX({col}) FROM {table}{where}")
        row = cur.fetchone()
        return row[0] if row and row[0] else None

    def table_stats(self, table: str, date_col: str, extra_where: str = "") -> TableStats:
        where = f" WHERE {extra_where}" if extra_where else ""
        sql = (
            f"SELECT COUNT(*) AS cnt, MIN({date_col}) AS start_date, "
            f"MAX({date_col}) AS end_date, MAX(updated_at) AS updated_at "
            f"FROM {table}{where}"
        )
        row = self.conn.execute(sql).fetchone()
        if not row:
            return {"count": 0, "start_date": None, "end_date": None, "updated_at": None}
        return {
            "count": int(row[0] or 0),
            "start_date": row[1],
            "end_date": row[2],
            "updated_at": row[3],
        }
