import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { PluginConfig } from './config.js'
import { cronMatches, nextCronOccurrence } from './cron.js'
import { MetaStore } from './meta-store.js'
import { resolveEngineRoot } from './paths.js'
import { enginePythonEnv, withSpawnTimeout } from './process-util.js'
import { probePython, startEngineRun, type RunnerHandles } from './runner.js'
import {
  DAILY_STEPS,
  type CatalogApiItem,
  type DailyStepId,
  type PermissionSnapshot,
  type SaveConnectionRequest,
  type ScheduleState,
  type StartRunRequest,
  type Waterline,
} from './types.js'

const DEFAULT_CRON = '30 18 * * 1-5'
const TIMEOUT_PROBE_MS = 45_000
const TIMEOUT_ENGINE_MS = 30_000

function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex').slice(0, 16)
}

function safeNextRunAt(
  expression: string,
  timeZone: string,
  after?: Date,
): { iso?: string; expression: string; error?: string } {
  try {
    const next = nextCronOccurrence(expression, timeZone, after)
    return { iso: next?.toISOString(), expression }
  } catch (e) {
    try {
      const next = nextCronOccurrence(DEFAULT_CRON, timeZone || 'Asia/Shanghai', after)
      return {
        iso: next?.toISOString(),
        expression: DEFAULT_CRON,
        error: String(e),
      }
    } catch (e2) {
      return { expression: DEFAULT_CRON, error: String(e2) }
    }
  }
}

function safeCronMatches(expression: string, now: Date, timeZone: string): boolean {
  try {
    return cronMatches(expression, now, timeZone)
  } catch {
    return false
  }
}

function spawnEngineJson(
  config: PluginConfig,
  store: MetaStore,
  command: string,
  cfgPayload: unknown,
  cfgName: string,
  timeoutMs = TIMEOUT_ENGINE_MS,
): Promise<Record<string, unknown>> {
  const engineRoot = resolveEngineRoot(config)
  const cfgPath = path.join(path.dirname(store.filePath), cfgName)
  fs.writeFileSync(cfgPath, JSON.stringify(cfgPayload))
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: Record<string, unknown>) => {
      if (settled) return
      settled = true
      clearTimeoutFn()
      try {
        fs.unlinkSync(cfgPath)
      } catch {
        // ignore
      }
      resolve(result)
    }
    const child = spawn(
      config.enginePython,
      ['-m', 'tushare_engine.cli', command, '--config', cfgPath],
      {
        cwd: engineRoot,
        env: enginePythonEnv({ PYTHONPATH: engineRoot }),
        windowsHide: true,
      },
    )
    const clearTimeoutFn = withSpawnTimeout(child, timeoutMs, () => {
      finish({ ok: false, error: 'timeout' })
    })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (c) => {
      out += String(c)
    })
    child.stderr.on('data', (c) => {
      err += String(c)
    })
    child.on('exit', (code) => {
      try {
        const parsed = JSON.parse(out.trim().split(/\r?\n/).filter(Boolean).pop() || '{}') as Record<
          string,
          unknown
        >
        finish(parsed)
      } catch {
        finish({ ok: code === 0, error: err || out || `exit ${code}` })
      }
    })
    child.on('error', (e) => finish({ ok: false, error: String(e.message || e) }))
  })
}

export class TushareSyncService {
  readonly store: MetaStore
  private runner: RunnerHandles | null = null
  private lastCronMinuteKey = ''
  private cronTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly config: PluginConfig) {
    this.store = new MetaStore(config)
    this.store.update((s) => {
      if (!s.schedule.cronExpression) s.schedule.cronExpression = config.cronExpression || DEFAULT_CRON
      if (!s.schedule.timeZone) s.schedule.timeZone = config.cronTimeZone || 'Asia/Shanghai'
      const next = safeNextRunAt(s.schedule.cronExpression, s.schedule.timeZone)
      if (next.error) {
        console.warn('[dsh-tushare-sync] invalid cron, fallback to default:', next.error)
        s.schedule.cronExpression = next.expression
      }
      s.schedule.nextRunAt = next.iso
    })
  }

  startCronDriver(): () => void {
    this.cronTimer = setInterval(() => this.tickCron(), 15_000)
    this.tickCron()
    return () => {
      if (this.cronTimer) clearInterval(this.cronTimer)
      this.cronTimer = null
    }
  }

  private tickCron(): void {
    const { schedule } = this.store.get()
    if (!schedule.enabled) return
    const now = new Date()
    const wallKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: schedule.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now)
    if (wallKey === this.lastCronMinuteKey) return
    if (!safeCronMatches(schedule.cronExpression, now, schedule.timeZone)) return
    this.lastCronMinuteKey = wallKey
    const result = this.startRun({ mode: 'incremental', trigger: 'cron' })
    this.store.update((s) => {
      s.schedule.lastRunAt = now.toISOString()
      s.schedule.lastTriggerStatus = result.ok ? 'started' : result.error
      s.schedule.lastRunId = result.ok ? result.runId : s.schedule.lastRunId
      const next = safeNextRunAt(
        s.schedule.cronExpression,
        s.schedule.timeZone,
        new Date(now.getTime() + 60_000),
      )
      if (next.error) {
        console.warn('[dsh-tushare-sync] invalid cron on tick, fallback:', next.error)
        s.schedule.cronExpression = next.expression
      }
      s.schedule.nextRunAt = next.iso
    })
  }

  private currentFingerprint(): string | undefined {
    const token = this.store.get().connection.token
    return token ? tokenFingerprint(token) : undefined
  }

  describe() {
    const fp = this.currentFingerprint()
    const snap = this.store.get().permissionSnapshot
    const selection = this.store.getSelection(fp)
    return {
      ok: true as const,
      ...this.store.describe(),
      engineRoot: resolveEngineRoot(this.config),
      enginePython: this.config.enginePython,
      dailySteps: [...DAILY_STEPS],
      selection,
      tokenFingerprint: fp,
      permissionReady: Boolean(snap && fp && snap.tokenFingerprint === fp),
    }
  }

  async probeEngine() {
    const engineRoot = resolveEngineRoot(this.config)
    const py = await probePython(this.config.enginePython, engineRoot)
    return {
      ok: py.ok,
      python: this.config.enginePython,
      engineRoot,
      version: py.version,
      error: py.error,
    }
  }

  async testConnection(partial?: Partial<SaveConnectionRequest>) {
    const merged = this.mergeConnection(partial)
    if (!merged.token) {
      return { ok: false as const, error: '缺少 Tushare token' }
    }
    return (await spawnEngineJson(
      this.config,
      this.store,
      'test-connection',
      {
        token: merged.token,
        db: {
          driver: merged.dbDriver,
          sqlite_path: merged.sqlitePath,
          host: merged.pgHost,
          port: merged.pgPort,
          user: merged.pgUser,
          password: merged.pgPassword ?? '',
          database: merged.pgDatabase,
        },
        api_min_interval_sec: merged.apiMinIntervalSec,
      },
      'test-connection.json',
      TIMEOUT_ENGINE_MS,
    )) as { ok: boolean; error?: string; detail?: unknown }
  }

  saveConnection(req: SaveConnectionRequest) {
    const prevToken = this.store.get().connection.token
    this.store.update((s) => {
      const c = s.connection
      if (req.token != null && String(req.token).trim()) {
        c.token = String(req.token).trim()
        c.tokenConfigured = true
      }
      c.dbDriver = req.dbDriver
      if (req.sqlitePath != null) c.sqlitePath = req.sqlitePath
      if (req.pgHost != null) c.pgHost = req.pgHost
      if (req.pgPort != null) c.pgPort = Number(req.pgPort)
      if (req.pgUser != null) c.pgUser = req.pgUser
      if (req.pgPassword != null && String(req.pgPassword).length > 0) {
        c.pgPassword = String(req.pgPassword)
      }
      if (req.pgDatabase != null) c.pgDatabase = req.pgDatabase
      if (req.apiMinIntervalSec != null) c.apiMinIntervalSec = Number(req.apiMinIntervalSec)
      if (req.defaultAdjType != null) c.defaultAdjType = req.defaultAdjType
      s.configured = Boolean(c.tokenConfigured && c.token)
      if (c.token && prevToken && c.token !== prevToken) {
        s.permissionSnapshot = undefined
      }
    })
    return this.describe()
  }

  private mergeConnection(partial?: Partial<SaveConnectionRequest>) {
    const cur = this.store.get().connection
    return {
      ...cur,
      token: partial?.token?.trim() || cur.token,
      dbDriver: partial?.dbDriver ?? cur.dbDriver,
      sqlitePath: partial?.sqlitePath ?? cur.sqlitePath,
      pgHost: partial?.pgHost ?? cur.pgHost,
      pgPort: partial?.pgPort ?? cur.pgPort,
      pgUser: partial?.pgUser ?? cur.pgUser,
      pgPassword: partial?.pgPassword ?? cur.pgPassword,
      pgDatabase: partial?.pgDatabase ?? cur.pgDatabase,
      apiMinIntervalSec: partial?.apiMinIntervalSec ?? cur.apiMinIntervalSec,
      defaultAdjType: partial?.defaultAdjType ?? cur.defaultAdjType,
    }
  }

  async getCatalog() {
    const snap = this.store.get().permissionSnapshot
    const fp = this.currentFingerprint()
    if (snap && fp && snap.tokenFingerprint === fp) {
      return {
        ok: true as const,
        fromCache: true,
        permission: snap,
        selection: this.store.getSelection(fp),
        dailyRecommended: snap.dailyRecommended,
      }
    }
    const engineRoot = resolveEngineRoot(this.config)
    return await new Promise<{
      ok: boolean
      fromCache?: boolean
      permission?: PermissionSnapshot | null
      staticCatalog?: unknown
      selection?: string[]
      dailyRecommended?: string[]
      error?: string
    }>((resolve) => {
      let settled = false
      const finish = (result: {
        ok: boolean
        fromCache?: boolean
        permission?: PermissionSnapshot | null
        staticCatalog?: unknown
        selection?: string[]
        dailyRecommended?: string[]
        error?: string
      }) => {
        if (settled) return
        settled = true
        clearTimeoutFn()
        resolve(result)
      }
      const child = spawn(
        this.config.enginePython,
        ['-m', 'tushare_engine.cli', 'catalog'],
        {
          cwd: engineRoot,
          env: enginePythonEnv({ PYTHONPATH: engineRoot }),
          windowsHide: true,
        },
      )
      const clearTimeoutFn = withSpawnTimeout(child, TIMEOUT_ENGINE_MS, () => {
        finish({ ok: false, error: 'timeout' })
      })
      let out = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (c) => {
        out += String(c)
      })
      child.on('exit', () => {
        try {
          const parsed = JSON.parse(out.trim().split(/\r?\n/).filter(Boolean).pop() || '{}') as {
            dailyRecommended?: string[]
          }
          finish({
            ok: true,
            fromCache: false,
            permission: null,
            staticCatalog: parsed,
            selection: this.store.getSelection(fp),
            dailyRecommended: parsed.dailyRecommended || [...DAILY_STEPS],
          })
        } catch {
          finish({ ok: false, error: out || 'parse_error' })
        }
      })
      child.on('error', (e) => finish({ ok: false, error: String(e.message || e) }))
    })
  }

  async probePermission(opts?: { force?: boolean; probeApiIds?: string[] }) {
    const conn = this.store.get().connection
    if (!conn.token) return { ok: false as const, error: '未配置 Tushare token' }
    const fp = tokenFingerprint(conn.token)
    const existing = this.store.get().permissionSnapshot
    if (!opts?.force && existing && existing.tokenFingerprint === fp) {
      return {
        ok: true as const,
        fromCache: true,
        permission: existing,
        selection: this.store.getSelection(fp),
      }
    }

    const flags = this.store.get().independentFlags || {}
    const raw = await spawnEngineJson(
      this.config,
      this.store,
      'probe-permission',
      {
        token: conn.token,
        api_min_interval_sec: conn.apiMinIntervalSec,
        independent_flags: flags,
        probe_api_ids: opts?.probeApiIds || [],
      },
      'probe-permission.json',
      TIMEOUT_PROBE_MS,
    )
    if (!raw.ok) {
      // 失败保留旧 snapshot，避免清空后同步死锁
      return {
        ok: false as const,
        error: String(raw.error || 'probe_failed'),
        detail: raw,
        permission: existing && existing.tokenFingerprint === fp ? existing : undefined,
        selection: this.store.getSelection(fp),
        keptPrevious: Boolean(existing && existing.tokenFingerprint === fp),
      }
    }

    const apis = (Array.isArray(raw.apis) ? raw.apis : []) as CatalogApiItem[]
    const snapshot: PermissionSnapshot = {
      tokenFingerprint: fp,
      pointsHint: (raw.pointsHint as number | null | undefined) ?? null,
      pointsHintError: (raw.pointsHintError as string | null | undefined) ?? null,
      effectiveTier: Number(raw.effectiveTier ?? 0),
      suggestedRatePerMin: Number(raw.suggestedRatePerMin ?? 50),
      suggestedApiMinIntervalSec: Number(raw.suggestedApiMinIntervalSec ?? 0.35),
      ladder: Array.isArray(raw.ladder) ? (raw.ladder as PermissionSnapshot['ladder']) : [],
      dailyRecommended: Array.isArray(raw.dailyRecommended)
        ? (raw.dailyRecommended as string[])
        : [...DAILY_STEPS],
      apis,
      probedAt: String(raw.probedAt || new Date().toISOString()),
    }
    this.store.setPermissionSnapshot(snapshot)

    // 若该指纹尚无勾选，默认日更推荐 ∩ 可用
    let selection = this.store.getSelection(fp)
    if (!selection.length) {
      const allowed = new Set(
        apis.filter((a) => a.selected_allowed && a.implemented).map((a) => a.id),
      )
      selection = snapshot.dailyRecommended.filter((id) => allowed.has(id))
      this.store.setSelection(fp, selection)
    } else {
      // 清洗越权勾选
      const allowed = new Set(
        apis.filter((a) => a.selected_allowed && a.implemented).map((a) => a.id),
      )
      const cleaned = selection.filter((id) => allowed.has(id))
      if (cleaned.length !== selection.length) {
        this.store.setSelection(fp, cleaned)
        selection = cleaned
      }
    }

    // 可选：建议限流写入连接（不强制覆盖用户手动值，仅当仍为默认 0.35 时）
    if (Math.abs(conn.apiMinIntervalSec - this.config.apiMinIntervalSec) < 1e-6) {
      this.store.update((s) => {
        s.connection.apiMinIntervalSec = snapshot.suggestedApiMinIntervalSec
      })
    }

    return {
      ok: true as const,
      fromCache: false,
      permission: snapshot,
      selection,
      describe: this.describe(),
    }
  }

  saveSelection(ids: string[]) {
    const fp = this.currentFingerprint()
    if (!fp) return { ok: false as const, error: '未配置 Token' }
    const snap = this.store.get().permissionSnapshot
    if (!snap || snap.tokenFingerprint !== fp) {
      return { ok: false as const, error: '请先探测权限' }
    }
    const allowed = new Set(
      snap.apis.filter((a) => a.selected_allowed && a.implemented).map((a) => a.id),
    )
    const cleaned = [...new Set(ids.map(String))].filter((id) => allowed.has(id))
    this.store.setSelection(fp, cleaned)
    return { ok: true as const, selection: cleaned }
  }

  markIndependentOpened(apiId: string, opened = true) {
    this.store.update((s) => {
      if (!s.independentFlags) s.independentFlags = {}
      if (opened) s.independentFlags[apiId] = true
      else delete s.independentFlags[apiId]
      // 强制下次重探
      s.permissionSnapshot = undefined
    })
    return { ok: true as const, independentFlags: this.store.get().independentFlags }
  }

  private resolveRunnableSteps(requested?: DailyStepId[]): {
    ok: true
    steps: DailyStepId[]
  } | { ok: false; error: string } {
    const fp = this.currentFingerprint()
    const snap = this.store.get().permissionSnapshot
    if (!snap || !fp || snap.tokenFingerprint !== fp) {
      return { ok: false, error: '请先探测权限后再同步' }
    }
    const allowed = new Set(
      snap.apis
        .filter((a) => a.selected_allowed && a.implemented)
        .map((a) => a.id)
        .filter((id): id is DailyStepId => (DAILY_STEPS as readonly string[]).includes(id)),
    )
    const selected = this.store.getSelection(fp)
    const base = (requested?.length ? requested : selected) as string[]
    if (!base.length) {
      return { ok: false, error: '请先勾选可用数据集' }
    }
    const steps = base.filter((id): id is DailyStepId => allowed.has(id as DailyStepId))
    if (!steps.length) {
      return { ok: false, error: '勾选中无已实现且有权限的数据集' }
    }
    const invalid = base.filter((id) => !allowed.has(id as DailyStepId))
    if (invalid.length && requested?.length) {
      return { ok: false, error: `无权或未实现: ${invalid.join(',')}` }
    }
    return { ok: true, steps }
  }

  startRun(req: StartRunRequest = {}) {
    const active = this.store.getActiveRun()
    if (active && (active.status === 'queued' || active.status === 'running')) {
      return { ok: false as const, error: 'already_running', runId: active.id }
    }
    const conn = this.store.get().connection
    if (!conn.token) {
      return { ok: false as const, error: '未配置 Tushare token' }
    }
    const mode = req.mode ?? 'incremental'
    if (mode === 'range') {
      const start = String(req.startDate || '').trim()
      const end = String(req.endDate || '').trim()
      const ymd = /^\d{8}$/
      if (!ymd.test(start) || !ymd.test(end)) {
        return { ok: false as const, error: '历史回填需填写起止交易日 YYYYMMDD' }
      }
      if (start > end) {
        return { ok: false as const, error: '起始交易日不能晚于结束交易日' }
      }
      req = { ...req, startDate: start, endDate: end }
    }
    // 开闸只信 probe 返回 apis[].selected_allowed ∩ implemented（见 resolveRunnableSteps）
    const resolved = this.resolveRunnableSteps(req.steps)
    if (!resolved.ok) {
      return { ok: false as const, error: resolved.error }
    }
    const steps = resolved.steps
    const id = this.store.newRunId()
    const now = new Date().toISOString()
    this.store.update((s) => {
      const run = {
        id,
        status: 'running' as const,
        mode,
        steps,
        stepStates: this.store.createStepStates(steps),
        startDate: req.startDate,
        endDate: req.endDate,
        trigger: req.trigger ?? 'manual',
        createdAt: now,
        startedAt: now,
        logTail: [],
      }
      s.runs.unshift(run)
      s.activeRunId = id
    })

    const run = this.store.get().runs.find((r) => r.id === id)!
    this.runner = startEngineRun({
      config: this.config,
      store: this.store,
      run,
      connection: conn,
      onEvent: (event) => this.applyEngineEvent(id, event),
      onExit: (code, signal) => {
        this.runner = null
        this.store.update((s) => {
          const r = s.runs.find((x) => x.id === id)
          if (!r) return
          if (r.status === 'running' || r.status === 'queued') {
            if (signal) {
              r.status = 'cancelled'
              r.error = `signal ${signal}`
            } else if (code === 0) {
              r.status = 'completed'
            } else {
              r.status = 'failed'
              r.error = `exit ${code}`
            }
            r.finishedAt = new Date().toISOString()
          }
          if (s.activeRunId === id) s.activeRunId = undefined
        })
      },
    })
    this.store.update((s) => {
      const r = s.runs.find((x) => x.id === id)
      if (r && this.runner?.child.pid) r.pid = this.runner.child.pid
    })
    return { ok: true as const, runId: id, steps }
  }

  private applyEngineEvent(runId: string, event: Record<string, unknown>) {
    const type = String(event.type ?? '')
    const mutator = (s: ReturnType<MetaStore['get']>) => {
      const run = s.runs.find((r) => r.id === runId)
      if (!run) return
      if (type === 'step_start') {
        const step = run.stepStates.find((x) => x.id === event.step)
        if (step) {
          step.status = 'running'
          step.startedAt = new Date().toISOString()
          step.message = String(event.message ?? '')
        }
      } else if (type === 'step_progress') {
        const step = run.stepStates.find((x) => x.id === event.step)
        if (step) {
          step.message = String(event.message ?? step.message ?? '')
          if (event.rows != null) step.rows = Number(event.rows)
        }
      } else if (type === 'step_end') {
        const step = run.stepStates.find((x) => x.id === event.step)
        if (step) {
          step.status = (String(event.status ?? 'success') as typeof step.status) || 'success'
          step.finishedAt = new Date().toISOString()
          step.message = String(event.message ?? '')
          if (event.rows != null) step.rows = Number(event.rows)
        }
      } else if (type === 'job_end') {
        run.status = String(event.status ?? 'completed') as typeof run.status
        run.finishedAt = new Date().toISOString()
        if (event.error) run.error = String(event.error)
        if (s.activeRunId === runId) s.activeRunId = undefined
      }
    }
    if (type === 'step_progress') this.store.updateDeferred(mutator)
    else this.store.update(mutator)
  }

  cancelRun(runId?: string) {
    const active = this.store.getActiveRun()
    const id = runId || active?.id
    if (!id) return { ok: false as const, error: 'no_active_run' }
    if (this.runner && (!runId || active?.id === id)) {
      this.runner.kill()
      this.runner = null
    }
    this.store.update((s) => {
      const run = s.runs.find((r) => r.id === id)
      if (run && (run.status === 'running' || run.status === 'queued')) {
        run.status = 'cancelled'
        run.finishedAt = new Date().toISOString()
      }
      if (s.activeRunId === id) s.activeRunId = undefined
    })
    return { ok: true as const, runId: id }
  }

  retryStep(runId: string, step: DailyStepId) {
    return this.startRun({
      mode: 'incremental',
      steps: [step],
      trigger: 'manual',
    })
  }

  getRun(runId: string) {
    const run = this.store.get().runs.find((r) => r.id === runId)
    if (!run) return { ok: false as const, error: 'not_found' }
    return { ok: true as const, run }
  }

  listRuns(limit = 20) {
    return {
      ok: true as const,
      runs: this.store.get().runs.slice(0, Math.max(1, Math.min(limit, 50))),
      activeRunId: this.store.get().activeRunId,
    }
  }

  async getWaterline(): Promise<{ ok: boolean; waterline?: Waterline; error?: string }> {
    const conn = this.store.get().connection
    if (!conn.tokenConfigured && !conn.token) {
      return { ok: false, error: '未配置连接' }
    }
    return (await spawnEngineJson(
      this.config,
      this.store,
      'waterline',
      {
        token: conn.token ?? '',
        db: {
          driver: conn.dbDriver,
          sqlite_path: conn.sqlitePath,
          host: conn.pgHost,
          port: conn.pgPort,
          user: conn.pgUser,
          password: conn.pgPassword ?? '',
          database: conn.pgDatabase,
        },
      },
      'waterline.json',
      TIMEOUT_ENGINE_MS,
    )) as { ok: boolean; waterline?: Waterline; error?: string }
  }

  getSchedule() {
    return { ok: true as const, schedule: this.store.get().schedule }
  }

  upsertSchedule(patch: Partial<ScheduleState>) {
    this.store.update((s) => {
      if (patch.enabled != null) s.schedule.enabled = Boolean(patch.enabled)
      if (patch.cronExpression != null) {
        s.schedule.cronExpression = String(patch.cronExpression).trim() || DEFAULT_CRON
      }
      if (patch.timeZone != null) s.schedule.timeZone = String(patch.timeZone).trim() || 'Asia/Shanghai'
      const next = safeNextRunAt(s.schedule.cronExpression, s.schedule.timeZone)
      if (next.error) {
        console.warn('[dsh-tushare-sync] invalid cron on upsert, fallback:', next.error)
        s.schedule.cronExpression = next.expression
      }
      s.schedule.nextRunAt = next.iso
    })
    return this.getSchedule()
  }
}

let latestService: TushareSyncService | null = null

export function setLatestService(svc: TushareSyncService | null): void {
  latestService = svc
}

export function getLatestService(): TushareSyncService | null {
  return latestService
}
