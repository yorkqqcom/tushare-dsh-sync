import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PluginConfig } from './config.js'

const here = path.dirname(fileURLToPath(import.meta.url))

/** 编译后 lib/ → 包根；开发时 src/ → 包根 */
export function packageRoot(): string {
  return path.resolve(here, '..')
}

export function defaultEngineRoot(): string {
  return path.join(packageRoot(), 'engine')
}

export function resolveEngineRoot(config: PluginConfig): string {
  if (config.engineRoot) return path.resolve(config.engineRoot)
  return defaultEngineRoot()
}

export function resolveMetaDir(config: PluginConfig): string {
  if (config.metaDir) return path.resolve(config.metaDir)
  return path.resolve(process.cwd(), '.tushare-dsh-sync')
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}
