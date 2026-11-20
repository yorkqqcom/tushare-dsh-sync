from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

import pandas as pd

from tushare_engine.adapters.base import BusinessStore
from tushare_engine.jsonl import emit
from tushare_engine.pipeline.periods import resolve_periods
from tushare_engine.tushare_client import TushareClient

SH_TZ = ZoneInfo("Asia/Shanghai")

# 主要指数白名单（index_daily 必选 ts_code，不扫全市场）
INDEX_DAILY_UNIVERSE = [
    "000001.SH",  # 上证综指
    "000016.SH",  # 上证50
    "000300.SH",  # 沪深300
    "000688.SH",  # 科创50
    "000852.SH",  # 中证1000
    "000905.SH",  # 中证500
    "000985.SH",  # 中证全指
    "399001.SZ",  # 深证成指
    "399006.SZ",  # 创业板指
    "399005.SZ",  # 中小板指
    "399303.SZ",  # 国证2000
    "399310.SZ",  # 国证A指
]

ALL_STEPS = [
    "trade_cal",
    "stock_basic",
    "daily",
    "daily_basic",
    "moneyflow",
    "adj_hfq",
    "stock_st",
    "index_basic",
    "index_daily",
    "index_member_all",
    "fund_basic",
    "fund_nav",
    "fund_portfolio",
    "income",
    "balancesheet",
    "cashflow",
    "fina_indicator",
]

FINA_STEPS = {
    "income": {
        "table": "income",
        "vip": "income_vip",
        "plain": "income",
        "fields": "ts_code,ann_date,end_date,report_type,basic_eps,diluted_eps,total_revenue,revenue,operate_profit,total_profit,n_income,n_income_attr_p",
        "conflict": ["ts_code", "end_date", "report_type"],
        "need_report_type": True,
    },
    "balancesheet": {
        "table": "balancesheet",
        "vip": "balancesheet_vip",
        "plain": "balancesheet",
        "fields": "ts_code,ann_date,end_date,report_type,total_assets,total_liab,total_hldr_eqy_exc_min_int,total_cur_assets,total_cur_liab",
        "conflict": ["ts_code", "end_date", "report_type"],
        "need_report_type": True,
    },
    "cashflow": {
        "table": "cashflow",
        "vip": "cashflow_vip",
        "plain": "cashflow",
        "fields": "ts_code,ann_date,end_date,report_type,n_cashflow_act,n_cashflow_inv_act,n_cash_flows_fnc_act,c_cash_equ_end_period",
        "conflict": ["ts_code", "end_date", "report_type"],
        "need_report_type": True,
    },
    "fina_indicator": {
        "table": "fina_indicator",
        "vip": "fina_indicator_vip",
        "plain": "fina_indicator",
        "fields": "ts_code,ann_date,end_date,roe,roa,grossprofit_margin,netprofit_margin,debt_to_assets,current_ratio,eps,bps",
        "conflict": ["ts_code", "end_date"],
        "need_report_type": False,
    },
}


def today_ymd() -> str:
    return datetime.now(SH_TZ).strftime("%Y%m%d")


def shift_ymd(ymd: str, days: int) -> str:
    dt = datetime.strptime(ymd, "%Y%m%d") + timedelta(days=days)
    return dt.strftime("%Y%m%d")


def _keep_cols(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    present = [c for c in cols if c in df.columns]
    out = df[present].copy()
    return out


def run_pipeline(cfg: dict[str, Any], store: BusinessStore, client: TushareClient) -> int:
    job_id = str(cfg.get("job_id") or "job")
    mode = str(cfg.get("mode") or "incremental")
    steps = list(cfg.get("steps") or ALL_STEPS)
    start_date = cfg.get("start_date")
    end_date = cfg.get("end_date") or today_ymd()
    adj_type = str(cfg.get("default_adj_type") or "hfq")

    store.ensure_schema()
    emit({"type": "job_start", "job_id": job_id, "steps": steps, "mode": mode})

    failed = False
    try:
        for step in steps:
            if step not in ALL_STEPS:
                emit({"type": "step_end", "step": step, "status": "skipped", "message": "unknown step"})
                continue
            emit({"type": "step_start", "step": step, "message": "starting"})
            try:
                rows = _run_step(step, store, client, mode, start_date, end_date, adj_type)
                emit({"type": "step_end", "step": step, "status": "success", "rows": rows, "message": "ok"})
            except Exception as e:
                failed = True
                emit({"type": "step_end", "step": step, "status": "failed", "message": str(e)})
        status = "failed" if failed else "completed"
        emit({"type": "job_end", "job_id": job_id, "status": status})
        return 1 if failed else 0
    except Exception as e:
        emit({"type": "job_end", "job_id": job_id, "status": "failed", "error": str(e)})
        return 2


def _resolve_range(
    store: BusinessStore,
    table: str,
    mode: str,
    start_date: Optional[str],
    end_date: str,
    lookback_days: int = 5,
    date_col: str = "trade_date",
) -> tuple[str, str]:
    end = end_date or today_ymd()
    if mode == "range" and start_date:
        return str(start_date), end
    stats = store.table_stats(table, date_col)
    water = stats.get("end_date")
    if water:
        start = shift_ymd(str(water), -lookback_days)
    else:
        start = shift_ymd(end, -30)
    return start, end


def _run_step(
    step: str,
    store: BusinessStore,
    client: TushareClient,
    mode: str,
    start_date: Optional[str],
    end_date: str,
    adj_type: str,
) -> int:
    if step == "trade_cal":
        start, end = _resolve_range(store, "trade_cal", mode, start_date, end_date, lookback_days=0, date_col="cal_date")
        start = min(start, shift_ymd(end, -400))
        total = 0
        for exchange in ("SSE", "SZSE"):
            df = client.trade_cal(start, end, exchange=exchange)
            total += store.upsert_dataframe("trade_cal", df, ["exchange", "cal_date"])
            emit({"type": "step_progress", "step": step, "message": f"{exchange} rows={len(df)}", "rows": total})
        return total

    if step == "stock_basic":
        df = client.stock_basic()
        if not df.empty:
            df = df.copy()
            df["updated_at"] = datetime.now(SH_TZ).isoformat()
        n = store.upsert_dataframe("stock_basic", df, ["ts_code"])
        emit({"type": "step_progress", "step": step, "message": f"stocks={n}", "rows": n})
        return n

    if step in ("daily", "daily_basic", "moneyflow"):
        table = {"daily": "daily_quotes", "daily_basic": "daily_basic", "moneyflow": "moneyflow"}[step]
        start, end = _resolve_range(store, table, mode, start_date, end_date)
        dates = client.open_dates(start, end)
        total = 0
        for i, d in enumerate(dates):
            if step == "daily":
                df = client.daily(d)
            elif step == "daily_basic":
                df = client.daily_basic(d)
            else:
                df = client.moneyflow(d)
            n = store.upsert_dataframe(table, df, ["ts_code", "trade_date"])
            total += n
            if i % 5 == 0 or i == len(dates) - 1:
                emit(
                    {
                        "type": "step_progress",
                        "step": step,
                        "message": f"{d} {i+1}/{len(dates)}",
                        "rows": total,
                    }
                )
        return total

    if step == "adj_hfq":
        table = "adj_quotes"
        start, end = _resolve_range(store, table, mode, start_date, end_date, lookback_days=3)
        total = 0
        dates = client.open_dates(start, end)
        for i, d in enumerate(dates):
            factor = client.query("adj_factor", trade_date=d, fields="ts_code,trade_date,adj_factor")
            daily = client.daily(d)
            if factor.empty or daily.empty:
                continue
            merged = daily.merge(factor, on=["ts_code", "trade_date"], how="inner")
            if merged.empty:
                continue
            out = merged.copy()
            for col in ("open", "high", "low", "close", "pre_close"):
                if col in out.columns:
                    out[col] = out[col] * out["adj_factor"]
            out["adj_type"] = adj_type
            keep = [
                "ts_code",
                "trade_date",
                "adj_type",
                "open",
                "high",
                "low",
                "close",
                "pre_close",
                "change",
                "pct_chg",
                "vol",
                "amount",
            ]
            out = out[[c for c in keep if c in out.columns]]
            n = store.upsert_dataframe(table, out, ["ts_code", "trade_date", "adj_type"])
            total += n
            if i % 3 == 0 or i == len(dates) - 1:
                emit(
                    {
                        "type": "step_progress",
                        "step": step,
                        "message": f"{d} {i+1}/{len(dates)}",
                        "rows": total,
                    }
                )
        return total

    if step == "stock_st":
        start, end = _resolve_range(store, "stock_st", mode, start_date, end_date)
        dates = client.open_dates(start, end)
        total = 0
        for i, d in enumerate(dates):
            df = client.stock_st(d)
            df = _keep_cols(df, ["ts_code", "trade_date", "name", "type", "type_name"])
            n = store.upsert_dataframe("stock_st", df, ["ts_code", "trade_date"])
            total += n
            if i % 5 == 0 or i == len(dates) - 1:
                emit(
                    {
                        "type": "step_progress",
                        "step": step,
                        "message": f"{d} {i+1}/{len(dates)}",
                        "rows": total,
                    }
                )
        return total

    if step == "index_basic":
        df = client.index_basic()
        df = _keep_cols(df, ["ts_code", "name", "market", "publisher", "category", "base_date", "list_date"])
        n = store.upsert_dataframe("index_basic", df, ["ts_code"])
        emit({"type": "step_progress", "step": step, "message": f"indexes={n}", "rows": n})
        return n

    if step == "index_daily":
        start, end = _resolve_range(store, "index_daily", mode, start_date, end_date)
        total = 0
        codes = INDEX_DAILY_UNIVERSE
        for i, code in enumerate(codes):
            df = client.index_daily(code, start, end)
            df = _keep_cols(
                df,
                [
                    "ts_code",
                    "trade_date",
                    "open",
                    "high",
                    "low",
                    "close",
                    "pre_close",
                    "change",
                    "pct_chg",
                    "vol",
                    "amount",
                ],
            )
            n = store.upsert_dataframe("index_daily", df, ["ts_code", "trade_date"])
            total += n
            emit(
                {
                    "type": "step_progress",
                    "step": step,
                    "message": f"{code} {i+1}/{len(codes)}",
                    "rows": total,
                }
            )
        return total

    if step == "index_member_all":
        df = client.index_member_all()
        df = _keep_cols(
            df,
            [
                "l1_code",
                "l2_code",
                "l3_code",
                "ts_code",
                "l1_name",
                "l2_name",
                "l3_name",
                "name",
                "in_date",
                "out_date",
                "is_new",
            ],
        )
        if not df.empty:
            for col in ("l1_code", "l2_code", "l3_code", "ts_code"):
                if col in df.columns:
                    df[col] = df[col].astype(str)
        n = store.upsert_dataframe("index_member_all", df, ["l3_code", "ts_code"])
        emit({"type": "step_progress", "step": step, "message": f"members={n}", "rows": n})
        return n

    if step == "fund_basic":
        df = client.fund_basic()
        df = _keep_cols(
            df,
            ["ts_code", "name", "management", "fund_type", "found_date", "due_date", "list_date", "status", "market"],
        )
        n = store.upsert_dataframe("fund_basic", df, ["ts_code"])
        emit({"type": "step_progress", "step": step, "message": f"funds={n}", "rows": n})
        return n

    if step == "fund_nav":
        start, end = _resolve_range(store, "fund_nav", mode, start_date, end_date, date_col="nav_date")
        dates = client.open_dates(start, end)
        total = 0
        for i, d in enumerate(dates):
            df = client.fund_nav(d)
            df = _keep_cols(df, ["ts_code", "nav_date", "unit_nav", "accum_nav", "adj_nav"])
            n = store.upsert_dataframe("fund_nav", df, ["ts_code", "nav_date"])
            total += n
            if i % 5 == 0 or i == len(dates) - 1:
                emit(
                    {
                        "type": "step_progress",
                        "step": step,
                        "message": f"{d} {i+1}/{len(dates)}",
                        "rows": total,
                    }
                )
        return total

    if step == "fund_portfolio":
        water = store.table_stats("fund_portfolio", "end_date").get("end_date")
        periods = resolve_periods(
            mode=mode,
            start_date=start_date,
            end_date=end_date or today_ymd(),
            water_end=water,
            default_n=4,
        )
        total = 0
        for i, period in enumerate(periods):
            df = client.fund_portfolio(period)
            df = _keep_cols(
                df,
                ["ts_code", "ann_date", "end_date", "symbol", "mkv", "amount", "stk_mkv_ratio", "stk_float_ratio"],
            )
            if not df.empty and "end_date" not in df.columns:
                df = df.copy()
                df["end_date"] = period
            n = store.upsert_dataframe("fund_portfolio", df, ["ts_code", "end_date", "symbol"])
            total += n
            emit(
                {
                    "type": "step_progress",
                    "step": step,
                    "message": f"period={period} {i+1}/{len(periods)}",
                    "rows": total,
                }
            )
        return total

    if step in FINA_STEPS:
        return _run_fina_step(step, store, client, mode, start_date, end_date)

    raise ValueError(f"unsupported step {step}")


def _run_fina_step(
    step: str,
    store: BusinessStore,
    client: TushareClient,
    mode: str,
    start_date: Optional[str],
    end_date: str,
) -> int:
    meta = FINA_STEPS[step]
    table = str(meta["table"])
    water = store.table_stats(table, "end_date").get("end_date")
    periods = resolve_periods(
        mode=mode,
        start_date=start_date,
        end_date=end_date or today_ymd(),
        water_end=water,
        default_n=4,
    )
    fields = str(meta["fields"])
    conflict = list(meta["conflict"])
    need_rt = bool(meta["need_report_type"])
    total = 0
    for i, period in enumerate(periods):
        df = client.fina_period(str(meta["vip"]), str(meta["plain"]), period, fields)
        keep = [c.strip() for c in fields.split(",")]
        df = _keep_cols(df, keep)
        if not df.empty:
            df = df.copy()
            if need_rt:
                if "report_type" not in df.columns:
                    df["report_type"] = ""
                else:
                    df["report_type"] = df["report_type"].fillna("").astype(str)
        n = store.upsert_dataframe(table, df, conflict)
        total += n
        emit(
            {
                "type": "step_progress",
                "step": step,
                "message": f"period={period} {i+1}/{len(periods)}",
                "rows": total,
            }
        )
    return total


def waterline(store: BusinessStore) -> dict[str, dict]:
    """各表覆盖区间：记录数 / 起始 / 截至 / 更新日期。"""
    store.ensure_schema()
    specs = [
        ("trade_cal", "cal_date", ""),
        ("stock_basic", "list_date", ""),
        ("daily_quotes", "trade_date", ""),
        ("daily_basic", "trade_date", ""),
        ("moneyflow", "trade_date", ""),
        ("adj_quotes", "trade_date", "adj_type='hfq'"),
        ("stock_st", "trade_date", ""),
        ("index_basic", "list_date", ""),
        ("index_daily", "trade_date", ""),
        ("index_member_all", "in_date", ""),
        ("fund_basic", "list_date", ""),
        ("fund_nav", "nav_date", ""),
        ("fund_portfolio", "end_date", ""),
        ("income", "end_date", ""),
        ("balancesheet", "end_date", ""),
        ("cashflow", "end_date", ""),
        ("fina_indicator", "end_date", ""),
    ]
    out: dict[str, dict] = {}
    for table, date_col, extra in specs:
        stats = store.table_stats(table, date_col, extra)
        out[table] = {
            "count": stats["count"],
            "start_date": stats["start_date"],
            "end_date": stats["end_date"],
            "updated_at": stats["updated_at"],
        }
    return out
