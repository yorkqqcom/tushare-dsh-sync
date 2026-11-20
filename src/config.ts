import z from '@deepseek-ai/schemastery'

export const Config = z.object({
  /** 元数据目录；空则使用 cwd/.tushare-dsh-sync */
  metaDir: z.string().default(''),
  enginePython: z.string().default('python'),
  /** 空则解析为包内 engine/ */
  engineRoot: z.string().default(''),
  apiMinIntervalSec: z.number().default(0.35),
  defaultAdjType: z.string().default('hfq'),
  cronEnabled: z.boolean().default(false),
  cronExpression: z.string().default('30 18 * * 1-5'),
  cronTimeZone: z.string().default('Asia/Shanghai'),
})

export type PluginConfig = {
  metaDir: string
  enginePython: string
  engineRoot: string
  apiMinIntervalSec: number
  defaultAdjType: string
  cronEnabled: boolean
  cronExpression: string
  cronTimeZone: string
}

export function normalizeConfig(partial: Partial<PluginConfig> = {}): PluginConfig {
  return {
    metaDir: (partial.metaDir ?? '').trim(),
    enginePython: (partial.enginePython ?? 'python').trim() || 'python',
    engineRoot: (partial.engineRoot ?? '').trim(),
    apiMinIntervalSec: Number(partial.apiMinIntervalSec ?? 0.35),
    defaultAdjType: (partial.defaultAdjType ?? 'hfq').trim() || 'hfq',
    cronEnabled: Boolean(partial.cronEnabled ?? false),
    cronExpression: (partial.cronExpression ?? '30 18 * * 1-5').trim() || '30 18 * * 1-5',
    cronTimeZone: (partial.cronTimeZone ?? 'Asia/Shanghai').trim() || 'Asia/Shanghai',
  }
}
