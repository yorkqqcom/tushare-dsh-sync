from __future__ import annotations

import time
from typing import Any, Optional

import pandas as pd
import tushare as ts


class TushareClient:
    def __init__(self, token: str, min_interval_sec: float = 0.35):
        if not token:
            raise ValueError("token required")
        ts.set_token(token)
        self.pro = ts.pro_api()
        self.min_interval = max(0.05, float(min_interval_sec))
        self._last = 0.0

    def _throttle(self) -> None:
        now = time.monotonic()
        wait = self.min_interval - (now - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def query(self, api_name: str, **kwargs: Any) -> pd.DataFrame:
        self._throttle()
        for attempt in range(5):
            try:
                df = self.pro.query(api_name, **kwargs)
                if df is None:
                    return pd.DataFrame()
                return df
            except Exception as e:
                msg = str(e)
                if attempt < 4 and ("每分钟" in msg or "频次" in msg or "limit" in msg.lower()):
                    time.sleep(self.min_interval * (attempt + 2))
                    continue
                raise

    def trade_cal(self, start_date: str, end_date: str, exchange: str = "SSE") -> pd.DataFrame:
        return self.query(
            "trade_cal",
            exchange=exchange,
            start_date=start_date,
            end_date=end_date,
            fields="exchange,cal_date,is_open,pretrade_date",
        )

    def stock_basic(self) -> pd.DataFrame:
        return self.query(
            "stock_basic",
            exchange="",
            list_status="L",
            fields="ts_code,symbol,name,area,industry,market,list_date",
        )

    def daily(self, trade_date: str) -> pd.DataFrame:
        return self.query(
            "daily",
            trade_date=trade_date,
            fields="ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount",
        )

    def daily_basic(self, trade_date: str) -> pd.DataFrame:
        return self.query(
            "daily_basic",
            trade_date=trade_date,
            fields="ts_code,trade_date,close,turnover_rate,volume_ratio,pe,pe_ttm,pb,total_mv,circ_mv",
        )

    def moneyflow(self, trade_date: str) -> pd.DataFrame:
        return self.query(
            "moneyflow",
            trade_date=trade_date,
            fields=(
                "ts_code,trade_date,buy_sm_amount,sell_sm_amount,buy_md_amount,sell_md_amount,"
                "buy_lg_amount,sell_lg_amount,buy_elg_amount,sell_elg_amount,net_mf_amount"
            ),
        )

    def pro_bar_hfq(self, ts_code: str, start_date: str, end_date: str) -> pd.DataFrame:
        self._throttle()
        df = ts.pro_bar(ts_code=ts_code, adj="hfq", start_date=start_date, end_date=end_date)
        if df is None:
            return pd.DataFrame()
        return df

    def open_dates(self, start_date: str, end_date: str) -> list[str]:
        cal = self.trade_cal(start_date, end_date)
        if cal.empty:
            return []
        opened = cal[cal["is_open"] == 1]["cal_date"].astype(str).tolist()
        return sorted(opened)

    def user(self) -> pd.DataFrame:
        """积分明细（pro.user）；字段因版本可能不同，调用方自行汇总。"""
        self._throttle()
        try:
            df = self.pro.user()
        except TypeError:
            df = self.pro.query("user")
        if df is None:
            return pd.DataFrame()
        return df

    def stock_st(self, trade_date: str) -> pd.DataFrame:
        return self.query(
            "stock_st",
            trade_date=trade_date,
            fields="ts_code,name,trade_date,type,type_name",
        )

    def index_basic(self) -> pd.DataFrame:
        return self.query(
            "index_basic",
            fields="ts_code,name,market,publisher,category,base_date,list_date",
        )

    def index_daily(self, ts_code: str, start_date: str, end_date: str) -> pd.DataFrame:
        return self.query(
            "index_daily",
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fields="ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount",
        )

    def index_member_all(self) -> pd.DataFrame:
        """申万成分；可能分页，尽量一次拉全。"""
        frames: list[pd.DataFrame] = []
        offset = 0
        page = 5000
        while True:
            try:
                df = self.query(
                    "index_member_all",
                    fields="l1_code,l1_name,l2_code,l2_name,l3_code,l3_name,ts_code,name,in_date,out_date,is_new",
                    limit=page,
                    offset=offset,
                )
            except Exception:
                # 部分环境不支持 limit/offset
                if offset == 0:
                    return self.query(
                        "index_member_all",
                        fields="l1_code,l1_name,l2_code,l2_name,l3_code,l3_name,ts_code,name,in_date,out_date,is_new",
                    )
                break
            if df is None or df.empty:
                break
            frames.append(df)
            if len(df) < page:
                break
            offset += page
            if offset > 200_000:
                break
        if not frames:
            return pd.DataFrame()
        return pd.concat(frames, ignore_index=True)

    def fund_basic(self) -> pd.DataFrame:
        return self.query(
            "fund_basic",
            fields="ts_code,name,management,fund_type,found_date,due_date,list_date,status,market",
        )

    def fund_nav(self, nav_date: str) -> pd.DataFrame:
        return self.query(
            "fund_nav",
            nav_date=nav_date,
            fields="ts_code,nav_date,unit_nav,accum_nav,adj_nav",
        )

    def fund_portfolio(self, period: str) -> pd.DataFrame:
        return self.query(
            "fund_portfolio",
            period=period,
            fields="ts_code,ann_date,end_date,symbol,mkv,amount,stk_mkv_ratio,stk_float_ratio",
        )

    def fina_period(self, vip_api: str, plain_api: str, period: str, fields: str) -> pd.DataFrame:
        """优先 VIP 按报告期全市场；失败再尝试普通接口（无 ts_code 时可能失败）。"""
        try:
            return self.query(vip_api, period=period, fields=fields)
        except Exception as e:
            msg = str(e).lower()
            # 无 VIP / 接口名不存在 → 尝试普通 period（多数会失败，留给调用方）
            if "permission" in msg or "权限" in str(e) or "积分" in str(e) or "不存在" in str(e):
                pass
            try:
                return self.query(plain_api, period=period, fields=fields)
            except Exception:
                raise e from None
