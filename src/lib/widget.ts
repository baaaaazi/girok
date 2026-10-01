import { categoryMeta } from './categories.ts'
import { isChecked, streak, toggleCheck, weekCount } from './routines.ts'
import type { CategoryData } from '../types/category.ts'
import type { AppData, ThemeMode } from '../types/record.ts'
import { ROUTINE_COLORS, type Routine, type RoutineData } from '../types/routine.ts'

// What the Android home-screen widget reads (SharedPreferences, written through the GirokWidget plugin).
// The widget works out which routines are due itself, so a stale snapshot still shows the right list
// after midnight; recorded hours only exist for `date`, since nothing is recorded with the app closed.
export type WidgetSnapshot = {
  version: 1
  date: string
  theme: ThemeMode
  hours: string[][] // 24 entries, each [] or one/two category colors
  opacity: number // background opacity in percent
  // days null = any day; labels are the right-hand note for `date` while undone / done, since a widget tap flips it
  routines: Array<{ id: string; name: string; color: string; days: number[] | null; createdAt: string; labels: [string, string] }>
  checks: Record<string, string[]> // date key -> done routine ids, for `date` and the day before
}

// A check the user set on the widget while the app was closed; `done` is the state they saw, not a toggle,
// so applying the same op twice is harmless.
export type WidgetOp = { date: string; id: string; done: boolean }

export const WIDGET_SETTINGS_KEY = 'girok:widget:v1'
export const WIDGET_OPACITIES = [100, 80, 60, 40, 0] as const

// Device-local like reminders, so it is not part of backups.
export function readWidgetOpacity(): number {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(WIDGET_SETTINGS_KEY) ?? 'null')
    const opacity = typeof value === 'object' && value !== null ? (value as { opacity?: unknown }).opacity : null
    return WIDGET_OPACITIES.includes(opacity as never) ? opacity as number : 100
  } catch {
    return 100
  }
}

export function writeWidgetOpacity(opacity: number): boolean {
  if (!WIDGET_OPACITIES.includes(opacity as never)) return false
  try {
    localStorage.setItem(WIDGET_SETTINGS_KEY, JSON.stringify({ opacity }))
    return true
  } catch {
    return false
  }
}

// Daily routines: the run once it reaches two (as on the 루틴 tab). Weekly ones: this week's count.
function routineLabel(data: RoutineData, routine: Routine, date: string): string {
  if (routine.repeat.kind === 'weekly') return `이번 주 ${weekCount(data, routine.id, date)}/${routine.repeat.times}`
  const count = streak(data, routine, date)
  return count >= 2 ? `🔥 ${count}일` : ''
}

export function widgetSnapshot(records: AppData['records'], routineData: RoutineData, categoryData: CategoryData, theme: ThemeMode, opacity: number, today: string, yesterday: string): WidgetSnapshot {
  const day = records[today] ?? {}
  const checks: Record<string, string[]> = {}
  for (const date of [yesterday, today]) if (routineData.checks[date]) checks[date] = routineData.checks[date]
  return {
    version: 1,
    date: today,
    theme,
    opacity,
    hours: Array.from({ length: 24 }, (_, hour) => day[String(hour)]?.segments.map((activity) => categoryMeta(activity.category, categoryData).color) ?? []),
    routines: routineData.routines.map((routine) => {
      const checked = isChecked(routineData, today, routine.id)
      const flipped = toggleCheck(routineData, today, routine.id)
      const [undone, done] = checked ? [flipped, routineData] : [routineData, flipped]
      return {
        id: routine.id,
        name: routine.name,
        color: ROUTINE_COLORS[routine.color],
        days: routine.repeat.kind === 'weekdays' ? routine.repeat.days : null,
        createdAt: routine.createdAt,
        labels: [routineLabel(undone, routine, today), routineLabel(done, routine, today)],
      }
    }),
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
