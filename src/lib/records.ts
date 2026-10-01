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

// Hours per category; only categories that appear get a key.
export function categoryPresence(records: AppData['records'], dates: string[]): Record<CategoryId, number> {
  const presence: Record<CategoryId, number> = {}
  for (const date of dates) {
    for (const hour of Object.values(records[date] ?? {})) {
      for (const category of new Set(hour.segments.map((activity) => activity.category))) presence[category] = (presence[category] ?? 0) + 1
    }
  }
  return presence
}

// Most-recorded first; ties follow `order` (built-ins, then custom categories), and unknown ids go last.
export function presentCategories(presence: Record<CategoryId, number>, order: readonly CategoryId[] = CATEGORY_IDS): CategoryId[] {
  const rank = (category: CategoryId) => { const index = order.indexOf(category); return index < 0 ? order.length : index }
  return Object.keys(presence)
    .filter((category) => presence[category] > 0)
    .sort((a, b) => presence[b] - presence[a] || rank(a) - rank(b) || (a < b ? -1 : 1))
}

export type TimeBlock =
  | { kind: 'record'; start: number; end: number; categories: CategoryId[]; notes: Array<{ hour: number; category: CategoryId; text: string }> }
  | { kind: 'gap'; start: number; end: number }

// Collapses consecutive hours with the same categories into one block; `end` is exclusive.
// Empty stretches between records become gap blocks so the day reads as a continuous timeline.
export function timeBlocks(day: DayRecord): TimeBlock[] {
  const blocks: TimeBlock[] = []
  const entries = reviewHours(day)
  if (!entries.length) return blocks
  let cursor = entries[0].hour
  for (const { hour, activities } of entries) {
    if (hour > cursor) blocks.push({ kind: 'gap', start: cursor, end: hour })
    const categories = activities.map((activity) => activity.category)
    const notes = activities.filter((activity) => activity.text).map((activity) => ({ hour, category: activity.category, text: activity.text }))
    const last = blocks[blocks.length - 1]
    if (last?.kind === 'record' && last.end === hour && last.categories.join() === categories.join()) {
      last.end = hour + 1
      last.notes.push(...notes)
    } else {
      blocks.push({ kind: 'record', start: hour, end: hour + 1, categories, notes })
    }
    cursor = hour + 1
  }
  return blocks
}

export function replaceHours(data: AppData, day: string, hours: number[], record: HourRecord | null): AppData {
  return hours.reduce((next, hour) => replaceHour(next, day, hour, record), data)
}
