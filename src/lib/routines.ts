import { parseDateKey, shiftDate, WEEKDAYS_SHORT } from './date.ts'
import { ROUTINE_COLORS, ROUTINE_ICON_IDS, type Goal, type Routine, type RoutineData, type RoutineRepeat } from '../types/routine.ts'

export const ROUTINE_STORAGE_KEY = 'girok:routines:v1'
export const EMPTY_ROUTINE_DATA: RoutineData = { version: 1, routines: [], checks: {}, goals: [] }
export const NAME_MAX_LENGTH = 40
export const WEEKLY_MAX_TIMES = 6

const iconSet = new Set<string>(ROUTINE_ICON_IDS)
const colorSet = new Set<string>(Object.keys(ROUTINE_COLORS))

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validDateKey(value: unknown): value is string {
  return typeof value === 'string' && parseDateKey(value) !== null
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= NAME_MAX_LENGTH
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
}

function validRepeat(value: unknown): value is RoutineRepeat {
  if (!isPlainObject(value)) return false
  if (value.kind === 'daily') return true
  if (value.kind === 'weekdays') {
    const days = value.days
    return Array.isArray(days) && days.length > 0 && new Set(days).size === days.length
      && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  }
  if (value.kind === 'weekly') return Number.isInteger(value.times) && Number(value.times) >= 1 && Number(value.times) <= WEEKLY_MAX_TIMES
  return false
}

function validRoutine(value: unknown): value is Routine {
  if (!isPlainObject(value)) return false
  return validId(value.id) && validName(value.name) && iconSet.has(String(value.icon)) && colorSet.has(String(value.color))
    && validRepeat(value.repeat) && validDateKey(value.createdAt)
}

function validGoal(value: unknown): value is Goal {
  if (!isPlainObject(value)) return false
  return validId(value.id) && validName(value.name) && (value.date === null || validDateKey(value.date)) && validDateKey(value.createdAt)
}

export function validateRoutineData(value: unknown): value is RoutineData {
  if (!isPlainObject(value) || value.version !== 1 || !Array.isArray(value.routines) || !Array.isArray(value.goals) || !isPlainObject(value.checks)) return false
  if (!value.routines.every(validRoutine) || !value.goals.every(validGoal)) return false
  if (new Set(value.routines.map((routine) => routine.id)).size !== value.routines.length) return false
  return Object.entries(value.checks).every(([key, ids]) => validDateKey(key) && Array.isArray(ids) && ids.length > 0 && ids.every(validId))
}

export function readRoutineData(): RoutineData {
  try {
    const raw = localStorage.getItem(ROUTINE_STORAGE_KEY)
    if (!raw) return EMPTY_ROUTINE_DATA
    const parsed: unknown = JSON.parse(raw)
    return validateRoutineData(parsed) ? parsed : EMPTY_ROUTINE_DATA
  } catch {
    return EMPTY_ROUTINE_DATA
  }
}

export function writeRoutineData(data: RoutineData): boolean {
  if (!validateRoutineData(data)) return false
  try {
    localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function clearRoutineData(): boolean {
  return writeRoutineData(EMPTY_ROUTINE_DATA)
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function weekday(date: string): number {
  return (parseDateKey(date) ?? new Date()).getDay()
}

// Sunday of the week that contains `date`.
export function weekStart(date: string): string {
  return shiftDate(date, -weekday(date))
}

// Whether the routine belongs on this day's list. `weekly` routines can be done on any day.
export function isDue(routine: Routine, date: string): boolean {
  if (date < routine.createdAt) return false
  return routine.repeat.kind === 'weekdays' ? routine.repeat.days.includes(weekday(date)) : true
}

export function isChecked(data: RoutineData, date: string, id: string): boolean {
  return data.checks[date]?.includes(id) ?? false
}

export function toggleCheck(data: RoutineData, date: string, id: string): RoutineData {
  const current = data.checks[date] ?? []
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  const checks = { ...data.checks }
  if (next.length) checks[date] = next
  else delete checks[date]
  return { ...data, checks }
}

export function weekCount(data: RoutineData, id: string, date: string): number {
  const start = weekStart(date)
  let count = 0
  for (let offset = 0; offset < 7; offset += 1) if (isChecked(data, shiftDate(start, offset), id)) count += 1
  return count
}

// Daily/weekday routines: consecutive due days done, ending at `date` (or the day before if `date` is not done yet).
// Weekly routines: consecutive Sunday-first weeks that met the target, counting the current week only once it is met.
export function streak(data: RoutineData, routine: Routine, date: string): number {
  let count = 0
  if (routine.repeat.kind === 'weekly') {
    const target = routine.repeat.times
    for (let week = weekStart(date); shiftDate(week, 6) >= routine.createdAt; week = shiftDate(week, -7)) {
      if (weekCount(data, routine.id, week) >= target) count += 1
      else if (week !== weekStart(date)) break
    }
    return count
  }
  for (let day = date; day >= routine.createdAt; day = shiftDate(day, -1)) {
    if (!isDue(routine, day)) continue
    if (isChecked(data, day, routine.id)) count += 1
    else if (day !== date) break
  }
  return count
}

export function dayProgress(data: RoutineData, date: string): { done: number; total: number } {
  const due = data.routines.filter((routine) => isDue(routine, date))
  return { done: due.filter((routine) => isChecked(data, date, routine.id)).length, total: due.length }
}

function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function ddayLabel(goal: Goal, today: string): string {
  if (!goal.date) return '목표'
  const diff = dayNumber(goal.date) - dayNumber(today)
  return diff > 0 ? `D-${diff}` : diff === 0 ? 'D-day' : `D+${-diff}`
}

// Dated goals first, nearest date first; open-ended goals after, oldest first.
export function sortedGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date)
    if (a.date || b.date) return a.date ? -1 : 1
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function upsertRoutine(data: RoutineData, routine: Routine): RoutineData {
  const exists = data.routines.some((item) => item.id === routine.id)
  return { ...data, routines: exists ? data.routines.map((item) => item.id === routine.id ? routine : item) : [...data.routines, routine] }
}

export function removeRoutine(data: RoutineData, id: string): RoutineData {
  const checks: RoutineData['checks'] = {}
  for (const [date, ids] of Object.entries(data.checks)) {
    const rest = ids.filter((item) => item !== id)
    if (rest.length) checks[date] = rest
  }
  return { ...data, routines: data.routines.filter((item) => item.id !== id), checks }
}

export function upsertGoal(data: RoutineData, goal: Goal): RoutineData {
  const exists = data.goals.some((item) => item.id === goal.id)
  return { ...data, goals: exists ? data.goals.map((item) => item.id === goal.id ? goal : item) : [...data.goals, goal] }
}

export function removeGoal(data: RoutineData, id: string): RoutineData {
  return { ...data, goals: data.goals.filter((item) => item.id !== id) }
}

export function repeatLabel(repeat: RoutineRepeat): string {
  if (repeat.kind === 'daily') return '매일'
  if (repeat.kind === 'weekly') return `주 ${repeat.times}회`
  const days = [...repeat.days].sort((a, b) => a - b)
  if (days.join() === '1,2,3,4,5') return '평일'
  if (days.join() === '0,6') return '주말'
  return days.map((day) => WEEKDAYS_SHORT[day]).join(' ')
}

// The D-day shown on the record page: the nearest dated goal from today on. Past and open-ended goals are left out.
export function nearestGoal(goals: Goal[], today: string): Goal | null {
  return sortedGoals(goals.filter((goal) => goal.date !== null && goal.date >= today))[0] ?? null
}

// Whether a day earns the calendar dot: every daily/weekday routine due that day is done.
// Weekly routines can be done on any day, so they only count when checked that day (a day with nothing else due needs one).
export function dayComplete(data: RoutineData, date: string): boolean {
  let required = 0
  let doneAny = false
  for (const routine of data.routines) {
    if (!isDue(routine, date)) continue
    const done = isChecked(data, date, routine.id)
    if (routine.repeat.kind !== 'weekly') {
      if (!done) return false
      required += 1
    }
    if (done) doneAny = true
  }
  return required > 0 || doneAny
}

export type RoutineRate = { routine: Routine; done: number; total: number }

// Completion per routine over `dates`, counting only days the routine was due, from its creation up to `today`.
// Weekly routines are measured against their weekly target scaled to those days (3/week over 7 days -> 3),
// and extra checks beyond the target do not push past 100%. Routines with nothing to measure are left out.
export function routineRates(data: RoutineData, dates: string[], today: string): RoutineRate[] {
  return data.routines.flatMap((routine) => {
    const days = dates.filter((date) => date <= today && isDue(routine, date))
    const done = days.filter((date) => isChecked(data, date, routine.id)).length
    if (routine.repeat.kind !== 'weekly') return days.length ? [{ routine, done, total: days.length }] : []
    const total = Math.round(routine.repeat.times * days.length / 7)
    return total ? [{ routine, done: Math.min(done, total), total }] : []
  })
}

// Consecutive days on which every due routine was done (the calendar dot), ending at `date`;
// a still-unfinished `date` counts through the day before. Days with nothing due neither count nor break it.
export function perfectStreak(data: RoutineData, date: string): number {
  if (!data.routines.length) return 0
  const first = data.routines.reduce((min, routine) => routine.createdAt < min ? routine.createdAt : min, data.routines[0].createdAt)
  let day = dayComplete(data, date) ? date : shiftDate(date, -1)
  let count = 0
  while (day >= first) {
    if (dayProgress(data, day).total > 0) {
      if (!dayComplete(data, day)) break
      count += 1
    }
    day = shiftDate(day, -1)
  }
  return count
}
