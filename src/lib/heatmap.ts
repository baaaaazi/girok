import { parseDateKey, shiftDate } from './date.ts'
import { dayComplete } from './routines.ts'
import type { AppData } from '../types/record.ts'
import type { RoutineData } from '../types/routine.ts'

export type HeatLevel = 0 | 1 | 2 | 3 | 4
export type HeatDay = { date: string; hours: number; level: HeatLevel; complete: boolean }
export type HeatWeek = Array<HeatDay | null> // Sunday-first; null pads before the first day and after today
export type HeatMonthLabel = { week: number; month: number } // month is 1-12

// 0 = nothing recorded; then roughly quarter-days, so a fully recorded day reads darkest.
export function heatLevel(hours: number): HeatLevel {
  if (hours <= 0) return 0
  if (hours <= 5) return 1
  if (hours <= 11) return 2
  if (hours <= 17) return 3
  return 4
}

// The last `count` days ending at `today`, oldest first.
export function heatDays(records: AppData['records'], routineData: RoutineData, today: string, count = 365): HeatDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = shiftDate(today, index - count + 1)
    const hours = Object.keys(records[date] ?? {}).length
    return { date, hours, level: heatLevel(hours), complete: dayComplete(routineData, date) }
  })
}

// Groups consecutive days into Sunday-first week columns.
export function heatWeeks(days: HeatDay[]): HeatWeek[] {
  if (!days.length) return []
  const lead = parseDateKey(days[0].date)?.getDay() ?? 0
  const cells: Array<HeatDay | null> = [...Array.from({ length: lead }, () => null), ...days]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7))
}

// A label on each week column holding the 1st of a month; a partial first month is labeled
// only when there is room before the next label.
export function heatMonthLabels(weeks: HeatWeek[], minGap = 3): HeatMonthLabel[] {
  const labels: HeatMonthLabel[] = []
  weeks.forEach((week, index) => {
    const first = week.find((day) => day && day.date.endsWith('-01'))
    if (first) labels.push({ week: index, month: Number(first.date.slice(5, 7)) })
  })
  const start = weeks[0]?.find(Boolean)
  if (start && !start.date.endsWith('-01') && (labels[0]?.week ?? Infinity) >= minGap) labels.unshift({ week: 0, month: Number(start.date.slice(5, 7)) })
  return labels
}
