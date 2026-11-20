/**
 * dsh-tushare-sync —— Tushare 日更下载管理 Host 插件。
 * 导出 name / inject / Config / apply；禁止 export default（会丢掉 inject）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { Config, normalizeConfig, type PluginConfig } from './config.js'
import { registerHttpApi } from './http-api.js'
import { getLatestService, setLatestService, TushareSyncService } from './service.js'
import { registerTools } from './tools/register.js'

export const name = 'dsh-tushare-sync'
export const inject = ['tools']
export { Config, getLatestService }

export function apply(ctx: Context, config: Partial<PluginConfig> = {}): void {
  const cfg = normalizeConfig(config)
  const svc = new TushareSyncService(cfg)
  setLatestService(svc)

  ctx.logger?.info?.(
    '[dsh-tushare-sync] loaded (enginePython=%s, cron=%s %s)',
    cfg.enginePython,
    cfg.cronEnabled,
    cfg.cronExpression,
  )

  registerTools(ctx, svc)
  registerHttpApi(ctx, svc)

  const stopCron = svc.startCronDriver()
  ctx.effect(() => () => {
    stopCron()
    svc.cancelRun()
    setLatestService(null)
  })
}
