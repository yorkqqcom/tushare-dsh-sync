from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional, TypedDict

import pandas as pd


class TableStats(TypedDict):
    count: int
    start_date: Optional[str]
    end_date: Optional[str]
    updated_at: Optional[str]


class BusinessStore(ABC):
    @abstractmethod
    def ensure_schema(self) -> None: ...

    @abstractmethod
    def close(self) -> None: ...

    @abstractmethod
    def upsert_dataframe(self, table: str, df: pd.DataFrame, conflict_cols: list[str]) -> int: ...

    @abstractmethod
    def max_trade_date(self, table: str, extra_where: str = "") -> Optional[str]: ...

    @abstractmethod
    def table_stats(self, table: str, date_col: str, extra_where: str = "") -> TableStats: ...

    @abstractmethod
    def ping(self) -> None: ...


def df_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []
    clean = df.where(pd.notnull(df), None)
    return clean.to_dict(orient="records")
