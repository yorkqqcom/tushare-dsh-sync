import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { PluginConfig } from './config.js'
import type { MetaStore } from './meta-store.js'
import { resolveEngineRoot } from './paths.js'
import { enginePythonEnv, killChildProcess, withSpawnTimeout } from './process-util.js'
import type { ConnectionConfig, DailyStepId, RunRecord } from './types.js'

export type RunnerHandles = {
  child: ChildProcessWithoutNullStreams
  kill: () => void
}

const PROBE_PYTHON_TIMEOUT_MS = 30_000

function buildEngineConfig(connection: ConnectionConfig, run: RunRecord, config: PluginConfig) {
  return {
    token: connection.token ?? '',
    db: {
      driver: connection.dbDriver,
      sqlite_path: connection.sqlitePath,
      host: connection.pgHost,
      port: connection.pgPort,
      user: connection.pgUser,
      password: connection.pgPassword ?? '',
      database: connection.pgDatabase,
    },
    api_min_interval_sec: connection.apiMinIntervalSec,
    default_adj_type: connection.defaultAdjType || config.defaultAdjType,
    job_id: run.id,
    mode: run.mode,
    steps: run.steps,
    start_date: run.startDate ?? null,
    end_date: run.endDate ?? null,
  }
}

export function startEngineRun(opts: {
  config: PluginConfig
  store: MetaStore
  run: RunRecord
  connection: ConnectionConfig
  onEvent: (event: Record<string, unknown>) => void
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void
}): RunnerHandles {
  const engineRoot = resolveEngineRoot(opts.config)
  const metaDir = path.dirname(opts.store.filePath)
  const cfgPath = path.join(metaDir, `${opts.run.id}.engine.json`)
  fs.writeFileSync(cfgPath, JSON.stringify(buildEngineConfig(opts.connection, opts.run, opts.config), null, 2))

  const python = opts.config.enginePython || 'python'
  const child = spawn(
    python,
    ['-m', 'tushare_engine.cli', 'run-pipeline', '--config', cfgPath],
    {
      cwd: engineRoot,
      env: enginePythonEnv({ PYTHONPATH: engineRoot }),
      windowsHide: true,
    },
  )

  let stdoutBuf = ''
  const pushLog = (line: string) => {
    opts.store.updateDeferred((s) => {
      const run = s.runs.find((r) => r.id === opts.run.id)
      if (!run) return
      run.logTail.push(line)
      if (run.logTail.length > 200) run.logTail = run.logTail.slice(-200)
    })
  }

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    pushLog(trimmed)
    if (trimmed.startsWith('{')) {
      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>
        opts.onEvent(event)
        return
      } catch {
        // not json
      }
    }
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdoutBuf += chunk
    const parts = stdoutBuf.split(/\r?\n/)
    stdoutBuf = parts.pop() ?? ''
    for (const line of parts) handleLine(line)
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) pushLog(`[stderr] ${line.trim()}`)
    }
  })

  child.on('exit', (code, signal) => {
    if (stdoutBuf.trim()) handleLine(stdoutBuf)
    opts.store.flush()
    try {
      fs.unlinkSync(cfgPath)
    } catch {
      // ignore
    }
    opts.onExit(code, signal)
  })

  return {
    child,
    kill: () => killChildProcess(child),
  }
}

export function probePython(
  python: string,
  engineRoot: string,
  timeoutMs = PROBE_PYTHON_TIMEOUT_MS,
): Promise<{
  ok: boolean
  version?: string
  error?: string
}> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: { ok: boolean; version?: string; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeoutFn()
      resolve(result)
    }
    const child = spawn(python, ['-c', 'import sys; print(sys.version.split()[0])'], {
      cwd: engineRoot,
      windowsHide: true,
    })
    const clearTimeoutFn = withSpawnTimeout(child, timeoutMs, () => {
      finish({ ok: false, error: 'timeout' })
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => {
      out += String(c)
    })
    child.stderr.on('data', (c) => {
      err += String(c)
    })
    child.on('exit', (code) => {
      if (code === 0) finish({ ok: true, version: out.trim() })
      else finish({ ok: false, error: err.trim() || `exit ${code}` })
    })
    child.on('error', (e) => finish({ ok: false, error: String(e.message || e) }))
  })
}

export type { DailyStepId }
