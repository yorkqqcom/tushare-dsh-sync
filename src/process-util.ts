import { spawn, type ChildProcess } from 'node:child_process'

/** 强制 Python stdout/stderr 为 UTF-8，避免 Windows GBK 管道把中文弄成 �。 */
export function enginePythonEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    ...extra,
  }
}

/** Windows 下尽量杀进程树；其它平台 SIGTERM。 */
export function killChildProcess(child: ChildProcess): void {
  try {
    child.kill('SIGTERM')
  } catch {
    // ignore
  }
  if (process.platform === 'win32' && child.pid) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    } catch {
      // ignore
    }
  }
}

export function withSpawnTimeout(
  child: ChildProcess,
  timeoutMs: number,
  onTimeout: () => void,
): () => void {
  const timer = setTimeout(() => {
    killChildProcess(child)
    onTimeout()
  }, Math.max(1_000, timeoutMs))
  return () => clearTimeout(timer)
}
