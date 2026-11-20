from __future__ import annotations

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

from tushare_engine.adapters.base import BusinessStore, TableStats, df_records
from tushare_engine.schemas.ddl import POSTGRES_DDL, TABLES_NEED_UPDATED_AT

SH_TZ = ZoneInfo("Asia/Shanghai")


def _now_iso() -> str:
    return datetime.now(SH_TZ).isoformat(timespec="seconds")


class PostgresStore(BusinessStore):
    def __init__(self, host: str, port: int, user: str, password: str, database: str):
        self.conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password or "",
            dbname=database,
        )
        self.conn.autocommit = False

    def ensure_schema(self) -> None:
        with self.conn.cursor() as cur:
            cur.execute(POSTGRES_DDL)
            for table in TABLES_NEED_UPDATED_AT:
                cur.execute(
                    """
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = %s AND column_name = 'updated_at'
                    """,
                    (table,),
                )
                if cur.fetchone() is None:
                    cur.execute(f"ALTER TABLE {table} ADD COLUMN updated_at TEXT")
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def ping(self) -> None:
        with self.conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()

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
        col_sql = ",".join(cols)
        conflict = ",".join(conflict_cols)
        update_cols = [c for c in cols if c not in conflict_cols]
        if update_cols:
            set_sql = ",".join(f"{c}=EXCLUDED.{c}" for c in update_cols)
            sql = (
                f"INSERT INTO {table} ({col_sql}) VALUES %s "
                f"ON CONFLICT ({conflict}) DO UPDATE SET {set_sql}"
            )
        else:
            sql = f"INSERT INTO {table} ({col_sql}) VALUES %s ON CONFLICT ({conflict}) DO NOTHING"
        values = [tuple(r.get(c) for c in cols) for r in rows]
        with self.conn.cursor() as cur:
            execute_values(cur, sql, values, page_size=500)
        self.conn.commit()
        return len(values)

    def max_trade_date(self, table: str, extra_where: str = "") -> Optional[str]:
        where = f" WHERE {extra_where}" if extra_where else ""
        col = "cal_date" if table == "trade_cal" else "trade_date"
        with self.conn.cursor() as cur:
            if table == "stock_basic":
                cur.execute("SELECT MAX(list_date) FROM stock_basic")
            else:
                cur.execute(f"SELECT MAX({col}) FROM {table}{where}")
            row = cur.fetchone()
        return row[0] if row and row[0] else None

    def table_stats(self, table: str, date_col: str, extra_where: str = "") -> TableStats:
        where = f" WHERE {extra_where}" if extra_where else ""
        sql = (
            f"SELECT COUNT(*) AS cnt, MIN({date_col}) AS start_date, "
            f"MAX({date_col}) AS end_date, MAX(updated_at) AS updated_at "
            f"FROM {table}{where}"
        )
        with self.conn.cursor() as cur:
            cur.execute(sql)
            row = cur.fetchone()
        if not row:
            return {"count": 0, "start_date": None, "end_date": None, "updated_at": None}
        return {
            "count": int(row[0] or 0),
            "start_date": row[1],
            "end_date": row[2],
            "updated_at": row[3],
        }
