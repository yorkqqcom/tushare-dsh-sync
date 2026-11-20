import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { TushareSyncService } from './service.js'
import type { DailyStepId, SaveConnectionRequest } from './types.js'

type JsonBody = Record<string, unknown>

type WebServerLike = {
  register: (route: {
    kind: 'prefix' | 'exact'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }) => () => void
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

function hostnameOf(host: string): string {
  const authority = host.trim().toLowerCase()
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']')
    return end === -1 ? '' : authority.slice(1, end)
  }
  const first = authority.indexOf(':')
  if (first === -1) return authority
  return first === authority.lastIndexOf(':') ? authority.slice(0, first) : authority
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const peer = String(req.socket?.remoteAddress ?? '')
  if (!LOOPBACK_ADDRESSES.has(peer)) return false
  const host = String(req.headers.host ?? '')
  if (!host) return false
  return LOOPBACK_HOSTS.has(hostnameOf(host))
}

async function readJson(req: IncomingMessage): Promise<JsonBody> {
  return await new Promise((resolve) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer) => {
      total += c.length
      if (total > 2 * 1024 * 1024) {
        resolve({})
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? (JSON.parse(raw) as JsonBody) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

async function dispatch(svc: TushareSyncService, body: JsonBody): Promise<{ status: number; body: unknown }> {
  const action = String(body.action ?? 'describe').trim().toLowerCase()

  if (action === 'describe' || action === 'health') return { status: 200, body: svc.describe() }
  if (action === 'probe_engine') return { status: 200, body: await svc.probeEngine() }
  if (action === 'test_connection') {
    return { status: 200, body: await svc.testConnection(body as Partial<SaveConnectionRequest>) }
  }
  if (action === 'save_connection') {
    const driver = String(body.dbDriver || '').toLowerCase()
    if (driver !== 'sqlite' && driver !== 'postgresql') {
      return { status: 400, body: { ok: false, error: 'dbDriver must be sqlite|postgresql' } }
    }
    return {
      status: 200,
      body: svc.saveConnection({
        token: body.token != null ? String(body.token) : undefined,
        dbDriver: driver,
        sqlitePath: body.sqlitePath != null ? String(body.sqlitePath) : undefined,
        pgHost: body.pgHost != null ? String(body.pgHost) : undefined,
        pgPort: body.pgPort != null ? Number(body.pgPort) : undefined,
        pgUser: body.pgUser != null ? String(body.pgUser) : undefined,
        pgPassword: body.pgPassword != null ? String(body.pgPassword) : undefined,
        pgDatabase: body.pgDatabase != null ? String(body.pgDatabase) : undefined,
        apiMinIntervalSec:
          body.apiMinIntervalSec != null ? Number(body.apiMinIntervalSec) : undefined,
        defaultAdjType: body.defaultAdjType != null ? String(body.defaultAdjType) : undefined,
      }),
    }
  }
  if (action === 'start_run') {
    const steps = Array.isArray(body.steps) ? (body.steps.map(String) as DailyStepId[]) : undefined
    return {
      status: 200,
      body: svc.startRun({
        mode: body.mode === 'range' ? 'range' : 'incremental',
        steps,
        startDate: body.startDate != null ? String(body.startDate) : undefined,
        endDate: body.endDate != null ? String(body.endDate) : undefined,
        trigger: body.trigger === 'onboarding' ? 'onboarding' : 'manual',
      }),
    }
  }
  if (action === 'cancel_run') {
    return {
      status: 200,
      body: svc.cancelRun(body.runId != null ? String(body.runId) : undefined),
    }
  }
  if (action === 'retry_step') {
    return {
      status: 200,
      body: svc.retryStep(String(body.runId || ''), String(body.step) as DailyStepId),
    }
  }
  if (action === 'list_runs') return { status: 200, body: svc.listRuns(Number(body.limit ?? 20)) }
  if (action === 'get_run') return { status: 200, body: svc.getRun(String(body.runId || '')) }
  if (action === 'waterline') return { status: 200, body: await svc.getWaterline() }
  if (action === 'get_schedule') return { status: 200, body: svc.getSchedule() }
  if (action === 'upsert_schedule') {
    return {
      status: 200,
      body: svc.upsertSchedule({
        enabled: body.enabled != null ? Boolean(body.enabled) : undefined,
        cronExpression: body.cronExpression != null ? String(body.cronExpression) : undefined,
        timeZone: body.timeZone != null ? String(body.timeZone) : undefined,
      }),
    }
  }
  if (action === 'probe_permission') {
    return {
      status: 200,
      body: await svc.probePermission({
        force: body.force != null ? Boolean(body.force) : true,
        probeApiIds: Array.isArray(body.probeApiIds) ? body.probeApiIds.map(String) : undefined,
      }),
    }
  }
  if (action === 'get_catalog') return { status: 200, body: await svc.getCatalog() }
  if (action === 'save_selection') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    return { status: 200, body: svc.saveSelection(ids) }
  }
  if (action === 'mark_independent') {
    return {
      status: 200,
      body: svc.markIndependentOpened(
        String(body.apiId || ''),
        body.opened == null ? true : Boolean(body.opened),
      ),
    }
  }
  return { status: 400, body: { ok: false, error: `unknown action: ${action}` } }
}

/**
 * 注册 loopback HTTP：/tushare-sync/api（对齐 fanqie webServer.register 模式）
 */
export function registerHttpApi(ctx: Context, svc: TushareSyncService): void {
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      const method = String(req.method ?? 'GET').toUpperCase()
      const body = method === 'GET' || method === 'HEAD' ? { action: 'describe' } : await readJson(req)
      if (!body.action && method === 'GET') body.action = 'describe'
      const result = await dispatch(svc, body)
      sendJson(res, result.status, result.body)
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err) })
    }
  }

  try {
    ctx.inject(['webServer'], (webCtx) => {
      const webServer =
        (webCtx as unknown as { webServer?: WebServerLike }).webServer ||
        (
          webCtx as unknown as { reflect?: { get: (n: string) => unknown } }
        ).reflect?.get('webServer') as WebServerLike | undefined
      if (!webServer || typeof webServer.register !== 'function') {
        ctx.logger?.warn?.('[dsh-tushare-sync] webServer.register unavailable')
        return
      }
      webCtx.effect(
        () =>
          webServer.register({
            kind: 'prefix',
            path: '/tushare-sync/api',
            handler,
          }),
        'tushare-sync: api',
      )
      ctx.logger?.info?.('[dsh-tushare-sync] /tushare-sync/api registered on webServer')
    })
  } catch (err) {
    ctx.logger?.warn?.('[dsh-tushare-sync] webServer inject skipped: %s', String(err))
  }
}
