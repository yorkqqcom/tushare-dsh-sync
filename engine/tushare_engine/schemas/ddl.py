from __future__ import annotations

# 精简 DDL：独立于 tusharestockForPostgreSQL ORM，仅服务本插件日更/回填。
# 各表含 updated_at，供水位「更新日期」展示。

SQLITE_DDL = """
CREATE TABLE IF NOT EXISTS trade_cal (
  exchange TEXT NOT NULL,
  cal_date TEXT NOT NULL,
  is_open INTEGER NOT NULL,
  pretrade_date TEXT,
  updated_at TEXT,
  PRIMARY KEY (exchange, cal_date)
);

CREATE TABLE IF NOT EXISTS stock_basic (
  ts_code TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT,
  area TEXT,
  industry TEXT,
  market TEXT,
  list_date TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_quotes (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL, high REAL, low REAL, close REAL,
  pre_close REAL, change REAL, pct_chg REAL,
  vol REAL, amount REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_quotes_date ON daily_quotes(trade_date);

CREATE TABLE IF NOT EXISTS daily_basic (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  close REAL, turnover_rate REAL, volume_ratio REAL,
  pe REAL, pe_ttm REAL, pb REAL,
  total_mv REAL, circ_mv REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_basic_date ON daily_basic(trade_date);

CREATE TABLE IF NOT EXISTS moneyflow (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  buy_sm_amount REAL, sell_sm_amount REAL,
  buy_md_amount REAL, sell_md_amount REAL,
  buy_lg_amount REAL, sell_lg_amount REAL,
  buy_elg_amount REAL, sell_elg_amount REAL,
  net_mf_amount REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_moneyflow_date ON moneyflow(trade_date);

CREATE TABLE IF NOT EXISTS adj_quotes (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  adj_type TEXT NOT NULL,
  open REAL, high REAL, low REAL, close REAL,
  pre_close REAL, change REAL, pct_chg REAL,
  vol REAL, amount REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date, adj_type)
);
CREATE INDEX IF NOT EXISTS idx_adj_quotes_date ON adj_quotes(trade_date, adj_type);

CREATE TABLE IF NOT EXISTS stock_st (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  name TEXT,
  type TEXT,
  type_name TEXT,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_stock_st_date ON stock_st(trade_date);

CREATE TABLE IF NOT EXISTS index_basic (
  ts_code TEXT PRIMARY KEY,
  name TEXT,
  market TEXT,
  publisher TEXT,
  category TEXT,
  base_date TEXT,
  list_date TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS index_daily (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL, high REAL, low REAL, close REAL,
  pre_close REAL, change REAL, pct_chg REAL,
  vol REAL, amount REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_index_daily_date ON index_daily(trade_date);

CREATE TABLE IF NOT EXISTS index_member_all (
  l1_code TEXT NOT NULL,
  l2_code TEXT NOT NULL,
  l3_code TEXT NOT NULL,
  ts_code TEXT NOT NULL,
  l1_name TEXT,
  l2_name TEXT,
  l3_name TEXT,
  name TEXT,
  in_date TEXT,
  out_date TEXT,
  is_new TEXT,
  updated_at TEXT,
  PRIMARY KEY (l3_code, ts_code)
);

CREATE TABLE IF NOT EXISTS fund_basic (
  ts_code TEXT PRIMARY KEY,
  name TEXT,
  management TEXT,
  fund_type TEXT,
  found_date TEXT,
  due_date TEXT,
  list_date TEXT,
  status TEXT,
  market TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS fund_nav (
  ts_code TEXT NOT NULL,
  nav_date TEXT NOT NULL,
  unit_nav REAL,
  accum_nav REAL,
  adj_nav REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, nav_date)
);
CREATE INDEX IF NOT EXISTS idx_fund_nav_date ON fund_nav(nav_date);

CREATE TABLE IF NOT EXISTS fund_portfolio (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  ann_date TEXT,
  mkv REAL,
  amount REAL,
  stk_mkv_ratio REAL,
  stk_float_ratio REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date, symbol)
);
CREATE INDEX IF NOT EXISTS idx_fund_portfolio_end ON fund_portfolio(end_date);

CREATE TABLE IF NOT EXISTS income (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT '',
  ann_date TEXT,
  basic_eps REAL,
  diluted_eps REAL,
  total_revenue REAL,
  revenue REAL,
  operate_profit REAL,
  total_profit REAL,
  n_income REAL,
  n_income_attr_p REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date, report_type)
);
CREATE INDEX IF NOT EXISTS idx_income_end ON income(end_date);

CREATE TABLE IF NOT EXISTS balancesheet (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT '',
  ann_date TEXT,
  total_assets REAL,
  total_liab REAL,
  total_hldr_eqy_exc_min_int REAL,
  total_cur_assets REAL,
  total_cur_liab REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date, report_type)
);
CREATE INDEX IF NOT EXISTS idx_balancesheet_end ON balancesheet(end_date);

CREATE TABLE IF NOT EXISTS cashflow (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT '',
  ann_date TEXT,
  n_cashflow_act REAL,
  n_cashflow_inv_act REAL,
  n_cash_flows_fnc_act REAL,
  c_cash_equ_end_period REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date, report_type)
);
CREATE INDEX IF NOT EXISTS idx_cashflow_end ON cashflow(end_date);

CREATE TABLE IF NOT EXISTS fina_indicator (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  ann_date TEXT,
  roe REAL,
  roa REAL,
  grossprofit_margin REAL,
  netprofit_margin REAL,
  debt_to_assets REAL,
  current_ratio REAL,
  eps REAL,
  bps REAL,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date)
);
CREATE INDEX IF NOT EXISTS idx_fina_indicator_end ON fina_indicator(end_date);
"""

POSTGRES_DDL = """
CREATE TABLE IF NOT EXISTS trade_cal (
  exchange TEXT NOT NULL,
  cal_date TEXT NOT NULL,
  is_open INTEGER NOT NULL,
  pretrade_date TEXT,
  updated_at TEXT,
  PRIMARY KEY (exchange, cal_date)
);

CREATE TABLE IF NOT EXISTS stock_basic (
  ts_code TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT,
  area TEXT,
  industry TEXT,
  market TEXT,
  list_date TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_quotes (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open DOUBLE PRECISION, high DOUBLE PRECISION, low DOUBLE PRECISION, close DOUBLE PRECISION,
  pre_close DOUBLE PRECISION, change DOUBLE PRECISION, pct_chg DOUBLE PRECISION,
  vol DOUBLE PRECISION, amount DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_quotes_date ON daily_quotes(trade_date);

CREATE TABLE IF NOT EXISTS daily_basic (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  close DOUBLE PRECISION, turnover_rate DOUBLE PRECISION, volume_ratio DOUBLE PRECISION,
  pe DOUBLE PRECISION, pe_ttm DOUBLE PRECISION, pb DOUBLE PRECISION,
  total_mv DOUBLE PRECISION, circ_mv DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_basic_date ON daily_basic(trade_date);

CREATE TABLE IF NOT EXISTS moneyflow (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  buy_sm_amount DOUBLE PRECISION, sell_sm_amount DOUBLE PRECISION,
  buy_md_amount DOUBLE PRECISION, sell_md_amount DOUBLE PRECISION,
  buy_lg_amount DOUBLE PRECISION, sell_lg_amount DOUBLE PRECISION,
  buy_elg_amount DOUBLE PRECISION, sell_elg_amount DOUBLE PRECISION,
  net_mf_amount DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_moneyflow_date ON moneyflow(trade_date);

CREATE TABLE IF NOT EXISTS adj_quotes (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  adj_type TEXT NOT NULL,
  open DOUBLE PRECISION, high DOUBLE PRECISION, low DOUBLE PRECISION, close DOUBLE PRECISION,
  pre_close DOUBLE PRECISION, change DOUBLE PRECISION, pct_chg DOUBLE PRECISION,
  vol DOUBLE PRECISION, amount DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date, adj_type)
);
CREATE INDEX IF NOT EXISTS idx_adj_quotes_date ON adj_quotes(trade_date, adj_type);

CREATE TABLE IF NOT EXISTS stock_st (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  name TEXT,
  type TEXT,
  type_name TEXT,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_stock_st_date ON stock_st(trade_date);

CREATE TABLE IF NOT EXISTS index_basic (
  ts_code TEXT PRIMARY KEY,
  name TEXT,
  market TEXT,
  publisher TEXT,
  category TEXT,
  base_date TEXT,
  list_date TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS index_daily (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open DOUBLE PRECISION, high DOUBLE PRECISION, low DOUBLE PRECISION, close DOUBLE PRECISION,
  pre_close DOUBLE PRECISION, change DOUBLE PRECISION, pct_chg DOUBLE PRECISION,
  vol DOUBLE PRECISION, amount DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_index_daily_date ON index_daily(trade_date);

CREATE TABLE IF NOT EXISTS index_member_all (
  l1_code TEXT NOT NULL,
  l2_code TEXT NOT NULL,
  l3_code TEXT NOT NULL,
  ts_code TEXT NOT NULL,
  l1_name TEXT,
  l2_name TEXT,
  l3_name TEXT,
  name TEXT,
  in_date TEXT,
  out_date TEXT,
  is_new TEXT,
  updated_at TEXT,
  PRIMARY KEY (l3_code, ts_code)
);

CREATE TABLE IF NOT EXISTS fund_basic (
  ts_code TEXT PRIMARY KEY,
  name TEXT,
  management TEXT,
  fund_type TEXT,
  found_date TEXT,
  due_date TEXT,
  list_date TEXT,
  status TEXT,
  market TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS fund_nav (
  ts_code TEXT NOT NULL,
  nav_date TEXT NOT NULL,
  unit_nav DOUBLE PRECISION,
  accum_nav DOUBLE PRECISION,
  adj_nav DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, nav_date)
);
CREATE INDEX IF NOT EXISTS idx_fund_nav_date ON fund_nav(nav_date);

CREATE TABLE IF NOT EXISTS fund_portfolio (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  ann_date TEXT,
  mkv DOUBLE PRECISION,
  amount DOUBLE PRECISION,
  stk_mkv_ratio DOUBLE PRECISION,
  stk_float_ratio DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date, symbol)
);
CREATE INDEX IF NOT EXISTS idx_fund_portfolio_end ON fund_portfolio(end_date);

CREATE TABLE IF NOT EXISTS income (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT '',
  ann_date TEXT,
  basic_eps DOUBLE PRECISION,
  diluted_eps DOUBLE PRECISION,
  total_revenue DOUBLE PRECISION,
  revenue DOUBLE PRECISION,
  operate_profit DOUBLE PRECISION,
  total_profit DOUBLE PRECISION,
  n_income DOUBLE PRECISION,
  n_income_attr_p DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date, report_type)
);
CREATE INDEX IF NOT EXISTS idx_income_end ON income(end_date);

CREATE TABLE IF NOT EXISTS balancesheet (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT '',
  ann_date TEXT,
  total_assets DOUBLE PRECISION,
  total_liab DOUBLE PRECISION,
  total_hldr_eqy_exc_min_int DOUBLE PRECISION,
  total_cur_assets DOUBLE PRECISION,
  total_cur_liab DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date, report_type)
);
CREATE INDEX IF NOT EXISTS idx_balancesheet_end ON balancesheet(end_date);

CREATE TABLE IF NOT EXISTS cashflow (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT '',
  ann_date TEXT,
  n_cashflow_act DOUBLE PRECISION,
  n_cashflow_inv_act DOUBLE PRECISION,
  n_cash_flows_fnc_act DOUBLE PRECISION,
  c_cash_equ_end_period DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date, report_type)
);
CREATE INDEX IF NOT EXISTS idx_cashflow_end ON cashflow(end_date);

CREATE TABLE IF NOT EXISTS fina_indicator (
  ts_code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  ann_date TEXT,
  roe DOUBLE PRECISION,
  roa DOUBLE PRECISION,
  grossprofit_margin DOUBLE PRECISION,
  netprofit_margin DOUBLE PRECISION,
  debt_to_assets DOUBLE PRECISION,
  current_ratio DOUBLE PRECISION,
  eps DOUBLE PRECISION,
  bps DOUBLE PRECISION,
  updated_at TEXT,
  PRIMARY KEY (ts_code, end_date)
);
CREATE INDEX IF NOT EXISTS idx_fina_indicator_end ON fina_indicator(end_date);
"""

TABLES_NEED_UPDATED_AT = (
    "trade_cal",
    "stock_basic",
    "daily_quotes",
    "daily_basic",
    "moneyflow",
    "adj_quotes",
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
)
