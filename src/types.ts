/** Service Definition：日更步骤、运行记录、水位、权限目录与调度类型 */

export const DAILY_STEPS = [
  'trade_cal',
  'stock_basic',
  'daily',
  'daily_basic',
  'moneyflow',
  'adj_hfq',
  'stock_st',
  'index_basic',
  'index_daily',
  'index_member_all',
  'fund_basic',
  'fund_nav',
  'fund_portfolio',
  'income',
  'balancesheet',
  'cashflow',
  'fina_indicator',
] as const

export type DailyStepId = (typeof DAILY_STEPS)[number]

export const STEP_LABELS: Record<DailyStepId, string> = {
  trade_cal: '交易日历',
  stock_basic: '股票列表',
  daily: '日线行情',
  daily_basic: '每日指标',
  moneyflow: '个股资金流向',
  adj_hfq: '后复权行情',
  stock_st: 'ST股票列表',
  index_basic: '指数列表',
  index_daily: '指数日线',
  index_member_all: '指数成分（申万等）',
  fund_basic: '基金列表',
  fund_nav: '基金净值',
  fund_portfolio: '基金持仓',
  income: '利润表',
  balancesheet: '资产负债表',
  cashflow: '现金流量表',
  fina_indicator: '财务指标',
}

/** 水位/步骤中文：同时覆盖 step id 与底层表名 */
export const WATERLINE_LABELS: Record<string, string> = {
  trade_cal: '交易日历',
  stock_basic: '股票列表',
  daily: '日线行情',
  daily_quotes: '日线行情',
  daily_basic: '每日指标',
  moneyflow: '个股资金流向',
  adj_hfq: '后复权行情',
  adj_quotes: '后复权行情',
  stock_st: 'ST股票列表',
  index_basic: '指数列表',
  index_daily: '指数日线',
  index_member_all: '指数成分（申万等）',
  fund_basic: '基金列表',
  fund_nav: '基金净值',
  fund_portfolio: '基金持仓',
  income: '利润表',
  balancesheet: '资产负债表',
  cashflow: '现金流量表',
  fina_indicator: '财务指标',
}

export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type DbDriver = 'sqlite' | 'postgresql'
export type SyncMode = 'incremental' | 'range'

export type ApiPermissionStatus =
  | 'available'
  | 'locked_points'
  | 'locked_independent'
  | 'coming_soon'
  | 'probe_error'
  | 'unknown'

export type CatalogApiItem = {
  id: string
  api: string
  label: string
  domain: string
  domain_label: string
  min_points: number
  doc_id?: number
  independent?: boolean
  implemented: boolean
  vip_api?: string
  pull?: string
  page_size?: number
  est_calls_daily?: number
  volume_hint?: string
  status: ApiPermissionStatus
  status_label: string
  selected_allowed: boolean
}

export type PermissionSnapshot = {
  tokenFingerprint: string
  pointsHint?: number | null
  pointsHintError?: string | null
  effectiveTier: number
  suggestedRatePerMin: number
  suggestedApiMinIntervalSec: number
  ladder?: Array<{ tier: number; api: string; ok: boolean; error?: string | null }>
  dailyRecommended: string[]
  apis: CatalogApiItem[]
  probedAt: string
}

export type ConnectionConfig = {
  tokenConfigured: boolean
  /** secret 不回显；仅内部持有 */
  token?: string
  dbDriver: DbDriver
  sqlitePath: string
  pgHost: string
  pgPort: number
  pgUser: string
  pgPassword?: string
  pgDatabase: string
  apiMinIntervalSec: number
  defaultAdjType: string
}

export type StepState = {
  id: DailyStepId
  status: StepStatus
  message?: string
  rows?: number
  startedAt?: string
  finishedAt?: string
}

export type RunRecord = {
  id: string
  status: RunStatus
  mode: SyncMode
  steps: DailyStepId[]
  stepStates: StepState[]
  startDate?: string
  endDate?: string
  trigger: 'manual' | 'cron' | 'tool' | 'onboarding'
  createdAt: string
  startedAt?: string
  finishedAt?: string
  error?: string
  logTail: string[]
  pid?: number
}

export type WaterlineRow = {
  count: number
  start_date: string | null
  end_date: string | null
  updated_at: string | null
}

export type Waterline = Record<string, WaterlineRow>

export type ScheduleState = {
  enabled: boolean
  cronExpression: string
  timeZone: string
  nextRunAt?: string
  lastRunAt?: string
  lastRunId?: string
  lastTriggerStatus?: string
}

export type MetaState = {
  version: 1
  configured: boolean
  connection: ConnectionConfig
  schedule: ScheduleState
  runs: RunRecord[]
  activeRunId?: string
  /** 当前 Token 的权限探测缓存 */
  permissionSnapshot?: PermissionSnapshot
  /** 按 token 指纹分桶的勾选 */
  selectionByToken?: Record<string, string[]>
  /** 用户声称已开通的独立权限 api id */
  independentFlags?: Record<string, boolean>
}

export type StartRunRequest = {
  mode?: SyncMode
  steps?: DailyStepId[]
  startDate?: string
  endDate?: string
  trigger?: RunRecord['trigger']
}

export type SaveConnectionRequest = {
  token?: string
  dbDriver: DbDriver
  sqlitePath?: string
  pgHost?: string
  pgPort?: number
  pgUser?: string
  pgPassword?: string
  pgDatabase?: string
  apiMinIntervalSec?: number
  defaultAdjType?: string
}
