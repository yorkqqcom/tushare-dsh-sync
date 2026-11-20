"""季报期助手：财务 / 基金持仓按 period 拉取。"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

QUARTER_ENDS = ("0331", "0630", "0930", "1231")


def _ymd(dt: datetime) -> str:
    return dt.strftime("%Y%m%d")


def iter_quarter_ends(start_ymd: str, end_ymd: str) -> list[str]:
    """返回落在 [start, end] 内的季报日 YYYYMMDD（含边界）。"""
    start = datetime.strptime(start_ymd[:8], "%Y%m%d")
    end = datetime.strptime(end_ymd[:8], "%Y%m%d")
    if start > end:
        start, end = end, start
    out: list[str] = []
    for year in range(start.year - 1, end.year + 2):
        for md in QUARTER_ENDS:
            period = f"{year}{md}"
            if start_ymd[:8] <= period <= end_ymd[:8]:
                out.append(period)
    return sorted(set(out))


def recent_quarter_ends(as_of_ymd: str, n: int = 4) -> list[str]:
    """截止 as_of 往前取最近 n 个季报日。"""
    end = as_of_ymd[:8]
    year = int(end[:4])
    candidates: list[str] = []
    for y in range(year - 3, year + 1):
        for md in QUARTER_ENDS:
            p = f"{y}{md}"
            if p <= end:
                candidates.append(p)
    candidates = sorted(set(candidates))
    return candidates[-max(1, n) :]


def resolve_periods(
    *,
    mode: str,
    start_date: Optional[str],
    end_date: str,
    water_end: Optional[str],
    default_n: int = 4,
) -> list[str]:
    end = (end_date or datetime.now().strftime("%Y%m%d"))[:8]
    if mode == "range" and start_date:
        return iter_quarter_ends(str(start_date)[:8], end)
    if water_end:
        # 增量：水位季报往前多留一期缓冲
        return recent_quarter_ends(end, default_n)
    return recent_quarter_ends(end, default_n)
