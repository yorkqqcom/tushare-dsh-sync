/**
 * 插件自有 CronDriver：五段 cron + IANA 时区（首期按 Asia/Shanghai 本地墙钟匹配）。
 * 不依赖 Host Schedule 的 prompt 投递。
 */

export type CronParts = {
  minute: number[]
  hour: number[]
  dayOfMonth: number[]
  month: number[]
  dayOfWeek: number[]
}

function parseField(field: string, min: number, max: number): number[] {
  const out = new Set<number>()
  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/)
    if (stepMatch) {
      const [, base, stepStr] = stepMatch
      const step = Number(stepStr)
      let start = min
      let end = max
      if (base !== '*') {
        if (base.includes('-')) {
          const [a, b] = base.split('-').map(Number)
          start = a
          end = b
        } else {
          start = Number(base)
          end = max
        }
      }
      for (let i = start; i <= end; i += step) out.add(i)
      continue
    }
    if (part === '*') {
      for (let i = min; i <= max; i++) out.add(i)
      continue
    }
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      for (let i = a; i <= b; i++) out.add(i)
      continue
    }
    out.add(Number(part))
  }
  return [...out].filter((n) => n >= min && n <= max).sort((a, b) => a - b)
}

export function parseCron(expression: string): CronParts {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) throw new Error(`cron 需五段，收到: ${expression}`)
  return {
    minute: parseField(fields[0], 0, 59),
    hour: parseField(fields[1], 0, 23),
    dayOfMonth: parseField(fields[2], 1, 31),
    month: parseField(fields[3], 1, 12),
    dayOfWeek: parseField(fields[4], 0, 7).map((d) => (d === 7 ? 0 : d)),
  }
}

/** 在给定时区取墙钟字段（Intl） */
export function wallClockParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayOfWeek: weekdayMap[parts.weekday] ?? 0,
  }
}

export function cronMatches(expression: string, date: Date, timeZone: string): boolean {
  const cron = parseCron(expression)
  const w = wallClockParts(date, timeZone)
  const domMatch = cron.dayOfMonth.includes(w.day)
  const dowMatch = cron.dayOfWeek.includes(w.dayOfWeek)
  const domStar = expression.trim().split(/\s+/)[2] === '*' || expression.trim().split(/\s+/)[2].startsWith('*/')
  const dowStar = expression.trim().split(/\s+/)[4] === '*' || expression.trim().split(/\s+/)[4].startsWith('*/')
  // Vixie：两域皆限制时 OR；任一为 * 则 AND
  const dayOk = !domStar && !dowStar ? domMatch || dowMatch : domMatch && dowMatch
  return (
    cron.minute.includes(w.minute) &&
    cron.hour.includes(w.hour) &&
    cron.month.includes(w.month) &&
    dayOk
  )
}

/** 粗算下次：从 now+1min 起扫描最多 8 天 */
export function nextCronOccurrence(
  expression: string,
  timeZone: string,
  from: Date = new Date(),
): Date | undefined {
  const cursor = new Date(from.getTime())
  cursor.setUTCSeconds(0, 0)
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)
  const limit = from.getTime() + 8 * 24 * 3600 * 1000
  while (cursor.getTime() <= limit) {
    if (cronMatches(expression, cursor, timeZone)) return new Date(cursor)
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)
  }
  return undefined
}
