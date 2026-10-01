import { shiftDate } from './date.ts'
import { categoryPresence } from './records.ts'
import type { AppData, CategoryId } from '../types/record.ts'

export type CategoryChange = { category: CategoryId; minutes: number } // per recorded day; negative = less

function recordedDays(records: AppData['records'], dates: string[]): number {
  return dates.filter((date) => Object.keys(records[date] ?? {}).length > 0).length
}

// Compares each category's average per recorded day between two ranges, so days left blank
// do not read as "did less". Returns the biggest changes first, rounded to 10 minutes.
export function categoryChanges(records: AppData['records'], current: string[], previous: string[], { minDays = 3, minMinutes = 30, limit = 2 } = {}): CategoryChange[] {
  const currentDays = recordedDays(records, current)
  const previousDays = recordedDays(records, previous)
  if (currentDays < minDays || previousDays < minDays) return []
  const now = categoryPresence(records, current)
  const before = categoryPresence(records, previous)
  return [...new Set([...Object.keys(now), ...Object.keys(before)])]
    .map((category) => ({ category, minutes: Math.round(((now[category] ?? 0) / currentDays - (before[category] ?? 0) / previousDays) * 6) * 10 }))
    .filter((change) => Math.abs(change.minutes) >= minMinutes)
    .sort((a, b) => Math.abs(b.minutes) - Math.abs(a.minutes) || (a.category < b.category ? -1 : 1))
    .slice(0, limit)
}

// Consecutive days with at least one recorded hour, ending today; a still-empty today does not break it.
export function recordingStreak(records: AppData['records'], today: string): number {
  const has = (date: string) => Object.keys(records[date] ?? {}).length > 0
  let day = has(today) ? today : shiftDate(today, -1)
  let count = 0
  while (has(day)) { count += 1; day = shiftDate(day, -1) }
  return count
}

export function formatMinutes(total: number): string {
  const minutes = Math.abs(total)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}분`
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`
}

// 이/가 for a Korean subject; words that do not end in Hangul get 가 unless they end in a digit read with a final consonant.
export function subjectParticle(word: string): '이' | '가' {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0) - 0xac00
  if (code >= 0 && code < 11172) return code % 28 ? '이' : '가'
  return /[013678]$/.test(last) ? '이' : '가'
}
