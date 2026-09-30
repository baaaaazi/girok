import { CATEGORY_IDS, type Activity, type AppData, type CategoryId, type DayRecord, type HourRecord } from '../types/record.ts'

export type ReviewHour = { hour: number; activities: readonly Activity[] }

export function replaceHour(data: AppData, day: string, hour: number, record: HourRecord | null): AppData {
  const records = { ...data.records }
  const currentDay = { ...(records[day] ?? {}) }
  if (record && record.segments.length) currentDay[String(hour)] = record
  else delete currentDay[String(hour)]
  if (Object.keys(currentDay).length) records[day] = currentDay
  else delete records[day]
  return { version: 2, records }
}

export function reviewHours(day: DayRecord): ReviewHour[] {
  return Object.entries(day)
    .map(([hour, record]) => ({ hour: Number(hour), activities: record.segments }))
    .sort((a, b) => a.hour - b.hour)
}

export function recordedHourCount(records: AppData['records'], dates: string[]): number {
  return dates.reduce((total, date) => total + Object.keys(records[date] ?? {}).length, 0)
}

export function categoryPresence(records: AppData['records'], dates: string[]): Record<CategoryId, number> {
  const presence = Object.fromEntries(CATEGORY_IDS.map((category) => [category, 0])) as Record<CategoryId, number>
  for (const date of dates) {
    for (const hour of Object.values(records[date] ?? {})) {
      for (const category of new Set(hour.segments.map((activity) => activity.category))) presence[category] += 1
    }
  }
  return presence
}
