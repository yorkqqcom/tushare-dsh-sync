import fs from 'node:fs'
import path from 'node:path'
import type { PluginConfig } from './config.js'
import { ensureDir, resolveMetaDir } from './paths.js'
import type {
  ConnectionConfig,
  MetaState,
  PermissionSnapshot,
  RunRecord,
  ScheduleState,
} from './types.js'
import { DAILY_STEPS } from './types.js'

const DEFER_MS = 300

function defaultConnection(config: PluginConfig): ConnectionConfig {
  return {
    tokenConfigured: false,
    dbDriver: 'sqlite',
    sqlitePath: path.join(resolveMetaDir(config), 'market.db'),
    pgHost: '127.0.0.1',
    pgPort: 5432,
    pgUser: 'postgres',
    pgDatabase: 'tushare_sync',
    apiMinIntervalSec: config.apiMinIntervalSec,
    defaultAdjType: config.defaultAdjType,
  }
}

function defaultSchedule(config: PluginConfig): ScheduleState {
  return {
    enabled: config.cronEnabled,
    cronExpression: config.cronExpression,
    timeZone: config.cronTimeZone,
  }
}

export function defaultMeta(config: PluginConfig): MetaState {
  return {
    version: 1,
    configured: false,
    connection: defaultConnection(config),
    schedule: defaultSchedule(config),
    runs: [],
    selectionByToken: {},
    independentFlags: {},
  }
}

export class MetaStore {
  readonly filePath: string
  private state: MetaState
  private readonly listeners = new Set<() => void>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly config: PluginConfig) {
    const dir = resolveMetaDir(config)
    ensureDir(dir)
    this.filePath = path.join(dir, 'meta.json')
    this.state = this.load()
  }

  private load(): MetaState {
    if (!fs.existsSync(this.filePath)) return defaultMeta(this.config)
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as MetaState
      if (!raw || raw.version !== 1) return defaultMeta(this.config)
      return {
        ...defaultMeta(this.config),
        ...raw,
        connection: { ...defaultConnection(this.config), ...raw.connection },
        schedule: { ...defaultSchedule(this.config), ...raw.schedule },
        runs: Array.isArray(raw.runs) ? raw.runs : [],
        selectionByToken:
          raw.selectionByToken && typeof raw.selectionByToken === 'object'
            ? raw.selectionByToken
            : {},
        independentFlags:
          raw.independentFlags && typeof raw.independentFlags === 'object'
            ? raw.independentFlags
            : {},
        permissionSnapshot: raw.permissionSnapshot,
      }
    } catch {
      return defaultMeta(this.config)
    }
  }

  private persistNow(): void {
    ensureDir(path.dirname(this.filePath))
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8')
    fs.renameSync(tmp, this.filePath)
    for (const listener of this.listeners) listener()
  }

  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistNow()
    }, DEFER_MS)
  }

  /** 立即落盘（配置 / 终态） */
  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.persistNow()
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get(): MetaState {
    return this.state
  }

  describe(): Omit<MetaState, 'connection'> & {
    connection: Omit<ConnectionConfig, 'token' | 'pgPassword'> & {
      tokenConfigured: boolean
      passwordConfigured: boolean
    }
  } {
    const { connection, ...rest } = this.state
    const { token: _t, pgPassword: _p, ...safe } = connection
    return {
      ...rest,
      connection: {
        ...safe,
        tokenConfigured: Boolean(connection.tokenConfigured && connection.token),
        passwordConfigured: Boolean(connection.pgPassword),
      },
    }
  }

  private trimRuns(): void {
    if (this.state.runs.length > 50) {
      this.state.runs = this.state.runs.slice(0, 50)
    }
  }

  /** 默认立即写盘 */
  update(mutator: (state: MetaState) => void): MetaState {
    mutator(this.state)
    this.trimRuns()
    this.flush()
    return this.state
  }

  /** 内存更新 + debounce 写盘（日志/进度） */
  updateDeferred(mutator: (state: MetaState) => void): MetaState {
    mutator(this.state)
    this.trimRuns()
    this.schedulePersist()
    return this.state
  }

  getActiveRun(): RunRecord | undefined {
    if (!this.state.activeRunId) return undefined
    return this.state.runs.find((r) => r.id === this.state.activeRunId)
  }

  newRunId(): string {
    return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  createStepStates(steps: (typeof DAILY_STEPS)[number][]): RunRecord['stepStates'] {
    return steps.map((id) => ({ id, status: 'pending' as const }))
  }

  setPermissionSnapshot(snapshot: PermissionSnapshot | undefined): void {
    this.update((s) => {
      s.permissionSnapshot = snapshot
    })
  }

  getSelection(fingerprint: string | undefined): string[] {
    if (!fingerprint) return []
    const map = this.state.selectionByToken || {}
    return Array.isArray(map[fingerprint]) ? [...map[fingerprint]] : []
  }

  setSelection(fingerprint: string, ids: string[]): void {
    this.update((s) => {
      if (!s.selectionByToken) s.selectionByToken = {}
      s.selectionByToken[fingerprint] = [...ids]
    })
  }
}
