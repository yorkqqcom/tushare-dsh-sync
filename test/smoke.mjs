import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lib = path.join(root, 'lib')

assert.ok(fs.existsSync(path.join(lib, 'index.js')), 'lib/index.js missing — run npm run build')
assert.ok(fs.existsSync(path.join(root, 'client', 'index.js')), 'client/index.js missing')
assert.ok(fs.existsSync(path.join(root, 'engine', 'tushare_engine', 'cli.py')), 'engine cli missing')

const { cronMatches, parseCron, nextCronOccurrence } = await import(
  pathToFileURL(path.join(lib, 'cron.js')).href
)

const parts = parseCron('30 18 * * 1-5')
assert.deepEqual(parts.minute, [30])
assert.deepEqual(parts.hour, [18])

// 构造一个 Asia/Shanghai 的周一 18:30（用固定 UTC 近似：2024-01-01 是周一）
// 2024-01-01 10:30 UTC = 18:30 CST
const sample = new Date(Date.UTC(2024, 0, 1, 10, 30, 0))
assert.equal(cronMatches('30 18 * * 1-5', sample, 'Asia/Shanghai'), true)

const next = nextCronOccurrence('30 18 * * 1-5', 'Asia/Shanghai', new Date('2024-01-01T00:00:00Z'))
assert.ok(next instanceof Date)

const { MetaStore } = await import(pathToFileURL(path.join(lib, 'meta-store.js')).href)
const { normalizeConfig } = await import(pathToFileURL(path.join(lib, 'config.js')).href)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tushare-dsh-'))
const cfg = normalizeConfig({ metaDir: tmp, cronExpression: '0 9 * * *' })
const store = new MetaStore(cfg)
store.update((s) => {
  s.connection.token = 'x'
  s.connection.tokenConfigured = true
  s.configured = true
})
const desc = store.describe()
assert.equal(desc.connection.tokenConfigured, true)
assert.equal('token' in desc.connection, false)

// deferred persist
store.updateDeferred((s) => {
  s.runs.unshift({
    id: 'run-test',
    status: 'running',
    mode: 'incremental',
    steps: ['trade_cal'],
    stepStates: [{ id: 'trade_cal', status: 'pending' }],
    trigger: 'manual',
    createdAt: new Date().toISOString(),
    logTail: ['line1'],
  })
})
store.flush()
assert.ok(fs.existsSync(path.join(tmp, 'meta.json')))

const { TushareSyncService } = await import(pathToFileURL(path.join(lib, 'service.js')).href)
const badCronCfg = normalizeConfig({ metaDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tushare-dsh-bad-')), cronExpression: 'not-a-cron' })
const svc = new TushareSyncService(badCronCfg)
assert.equal(svc.store.get().schedule.cronExpression, '30 18 * * 1-5')

console.log('smoke ok', { tmp, next: next?.toISOString() })
