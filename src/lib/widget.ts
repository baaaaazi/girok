import { categoryMeta } from './categories.ts'
import { isChecked, toggleCheck } from './routines.ts'
import type { CategoryData } from '../types/category.ts'
import type { AppData, ThemeMode } from '../types/record.ts'
import { ROUTINE_COLORS, type RoutineData } from '../types/routine.ts'

// What the Android home-screen widget reads (SharedPreferences, written through the GirokWidget plugin).
// The widget works out which routines are due itself, so a stale snapshot still shows the right list
// after midnight; recorded hours only exist for `date`, since nothing is recorded with the app closed.
export type WidgetSnapshot = {
  version: 1
  date: string
  theme: ThemeMode
  hours: string[][] // 24 entries, each [] or one/two category colors
  routines: Array<{ id: string; name: string; color: string; days: number[] | null; createdAt: string }> // days null = any day
  checks: Record<string, string[]> // date key -> done routine ids, for `date` and the day before
}

// A check the user set on the widget while the app was closed; `done` is the state they saw, not a toggle,
// so applying the same op twice is harmless.
export type WidgetOp = { date: string; id: string; done: boolean }

export function widgetSnapshot(records: AppData['records'], routineData: RoutineData, categoryData: CategoryData, theme: ThemeMode, today: string, yesterday: string): WidgetSnapshot {
  const day = records[today] ?? {}
  const checks: Record<string, string[]> = {}
  for (const date of [yesterday, today]) if (routineData.checks[date]) checks[date] = routineData.checks[date]
  return {
    version: 1,
    date: today,
    theme,
    hours: Array.from({ length: 24 }, (_, hour) => day[String(hour)]?.segments.map((activity) => categoryMeta(activity.category, categoryData).color) ?? []),
    routines: routineData.routines.map((routine) => ({
      id: routine.id,
      name: routine.name,
      color: ROUTINE_COLORS[routine.color],
      days: routine.repeat.kind === 'weekdays' ? routine.repeat.days : null,
      createdAt: routine.createdAt,
    })),
    checks,
  }
}

export function parseWidgetOps(json: string): WidgetOp[] {
  try {
    const value: unknown = JSON.parse(json)
    if (!Array.isArray(value)) return []
    return value.filter((op): op is WidgetOp => typeof op === 'object' && op !== null
      && typeof op.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(op.date) && typeof op.id === 'string' && typeof op.done === 'boolean')
  } catch {
    return []
  }
}

// Ops for routines deleted since the widget last drew are dropped.
export function applyWidgetOps(data: RoutineData, ops: WidgetOp[]): RoutineData {
  return ops.reduce((next, { date, id, done }) => !next.routines.some((routine) => routine.id === id) || isChecked(next, date, id) === done
    ? next
    : toggleCheck(next, date, id), data)
}
