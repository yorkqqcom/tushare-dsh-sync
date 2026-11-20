import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { asJson, renderJson } from '../json.js'
import type { TushareSyncService } from '../service.js'
import { DAILY_STEPS, type DailyStepId } from '../types.js'

export function registerTools(ctx: Context, svc: TushareSyncService): void {
  ctx.tools.register(
    defineTool({
      name: 'tushare_sync_configure',
      description:
        'Save Tushare sync connection settings (token, sqlite/postgresql). Does not echo secrets.',
      parameters: {
        token: { type: 'string', description: 'Tushare Pro token' },
        dbDriver: {
          type: 'string',
          required: true,
          description: 'sqlite | postgresql',
        },
        sqlitePath: { type: 'string' },
        pgHost: { type: 'string' },
        pgPort: { type: 'number' },
        pgUser: { type: 'string' },
        pgPassword: { type: 'string' },
        pgDatabase: { type: 'string' },
        apiMinIntervalSec: { type: 'number' },
        defaultAdjType: { type: 'string' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => renderJson(_a, v),
      },
      async execute(args) {
        const driver = String(args.dbDriver || '').toLowerCase()
        if (driver !== 'sqlite' && driver !== 'postgresql') {
          return asJson({ ok: false, error: 'dbDriver must be sqlite or postgresql' })
        }
        return asJson(
          svc.saveConnection({
            token: args.token != null ? String(args.token) : undefined,
            dbDriver: driver,
            sqlitePath: args.sqlitePath != null ? String(args.sqlitePath) : undefined,
            pgHost: args.pgHost != null ? String(args.pgHost) : undefined,
            pgPort: args.pgPort != null ? Number(args.pgPort) : undefined,
            pgUser: args.pgUser != null ? String(args.pgUser) : undefined,
            pgPassword: args.pgPassword != null ? String(args.pgPassword) : undefined,
            pgDatabase: args.pgDatabase != null ? String(args.pgDatabase) : undefined,
            apiMinIntervalSec:
              args.apiMinIntervalSec != null ? Number(args.apiMinIntervalSec) : undefined,
            defaultAdjType: args.defaultAdjType != null ? String(args.defaultAdjType) : undefined,
          }),
        )
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tushare_sync_run',
      description: `Start Tushare daily sync job. Steps: ${DAILY_STEPS.join(', ')}. Only one job at a time.`,
      parameters: {
        mode: { type: 'string', description: 'incremental | range' },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional subset of daily steps',
        },
        startDate: { type: 'string', description: 'YYYYMMDD for range mode' },
        endDate: { type: 'string', description: 'YYYYMMDD for range mode' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => renderJson(_a, v),
      },
      async execute(args) {
        const steps = Array.isArray(args.steps)
          ? (args.steps.map(String) as DailyStepId[])
          : undefined
        return asJson(
          svc.startRun({
            mode: args.mode === 'range' ? 'range' : 'incremental',
            steps,
            startDate: args.startDate != null ? String(args.startDate) : undefined,
            endDate: args.endDate != null ? String(args.endDate) : undefined,
            trigger: 'tool',
          }),
        )
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tushare_sync_status',
      description: 'Get sync status: active run, recent runs, and optional waterline.',
      parameters: {
        runId: { type: 'string' },
        includeWaterline: { type: 'boolean' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => renderJson(_a, v),
      },
      async execute(args) {
        if (args.runId) return asJson(svc.getRun(String(args.runId)))
        const base = {
          ok: true,
          describe: svc.describe(),
          runs: svc.listRuns(10),
        }
        if (args.includeWaterline) {
          return asJson({ ...base, waterline: await svc.getWaterline() })
        }
        return asJson(base)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tushare_sync_cancel',
      description: 'Cancel the active (or specified) Tushare sync run.',
      parameters: {
        runId: { type: 'string' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => renderJson(_a, v),
      },
      async execute(args) {
        return asJson(svc.cancelRun(args.runId != null ? String(args.runId) : undefined))
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tushare_schedule_upsert',
      description:
        'Enable/update plugin-owned daily sync cron (Asia/Shanghai). Does not use Host Schedule delivery.',
      parameters: {
        enabled: { type: 'boolean', required: true },
        cronExpression: { type: 'string', description: 'Five-field cron, default 30 18 * * 1-5' },
        timeZone: { type: 'string', description: 'IANA zone, default Asia/Shanghai' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => renderJson(_a, v),
      },
      async execute(args) {
        return asJson(
          svc.upsertSchedule({
            enabled: Boolean(args.enabled),
            cronExpression:
              args.cronExpression != null ? String(args.cronExpression) : undefined,
            timeZone: args.timeZone != null ? String(args.timeZone) : undefined,
          }),
        )
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tushare_schedule_list',
      description: 'Show plugin-owned sync schedule state.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => renderJson(_a, v),
      },
      async execute() {
        return asJson(svc.getSchedule())
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tushare_sync_probe_permission',
      description:
        'Probe Tushare token permission tier (ladder + optional user points) and refresh catalog availability.',
      parameters: {
        force: { type: 'boolean', description: 'Ignore cached snapshot (default true)' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => renderJson(_a, v),
      },
      async execute(args) {
        return asJson(
          await svc.probePermission({
            force: args.force == null ? true : Boolean(args.force),
          }),
        )
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tushare_sync_get_catalog',
      description: 'Get API catalog with permission status and current selection for this token.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => renderJson(_a, v),
      },
      async execute() {
        return asJson(await svc.getCatalog())
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tushare_sync_save_selection',
      description:
        'Save selected dataset ids for current token. Only available+implemented ids are kept.',
      parameters: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: 'Dataset ids to sync',
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, v) => renderJson(_a, v),
      },
      async execute(args) {
        const ids = Array.isArray(args.ids) ? args.ids.map(String) : []
        return asJson(svc.saveSelection(ids))
      },
    }),
  )
}
