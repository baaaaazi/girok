export const ROUTINE_ICON_IDS = ['check', 'water', 'book', 'pen', 'run', 'dumbbell', 'moon', 'sun', 'heart', 'pill', 'leaf', 'music', 'meal', 'clean', 'money', 'star'] as const
export type RoutineIconId = (typeof ROUTINE_ICON_IDS)[number]

export const ROUTINE_COLORS = {
  blue: '#4A7FCC',
  violet: '#8466C4',
  orange: '#E08A3C',
  teal: '#2E9E96',
  yellow: '#D1A62A',
  pink: '#D0578F',
  green: '#4E9E5E',
  gray: '#8A8D96',
} as const
export type RoutineColorId = keyof typeof ROUTINE_COLORS
export const ROUTINE_COLOR_IDS = Object.keys(ROUTINE_COLORS) as RoutineColorId[]

export type RoutineRepeat =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] } // 0 = Sunday, matching Date#getDay
  | { kind: 'weekly'; times: number } // N times per Sunday-first week, any day

export type Routine = {
  id: string
  name: string
  icon: RoutineIconId
  color: RoutineColorId
  repeat: RoutineRepeat
  createdAt: string // date key; the routine is not due before this day
}

export type Goal = {
  id: string
  name: string
  date: string | null // date key for a D-day, or null for an open-ended goal
  createdAt: string
}

export type RoutineData = {
  version: 1
  routines: Routine[]
  checks: Record<string, string[]> // date key -> ids of routines done that day
  goals: Goal[]
}
