import type { CategoryIconId } from './category.ts'

// The eight built-in categories. Records may also hold a custom category id (`c-…`, see src/lib/categories.ts).
export const CATEGORY_IDS = ['study', 'sleep', 'meal', 'travel', 'rest', 'game', 'exercise', 'other'] as const

export type BuiltinCategoryId = (typeof CATEGORY_IDS)[number]
export type CategoryId = string

export type Activity = {
  category: CategoryId
  text: string
}

export type HourRecord = {
  segments: [Activity] | [Activity, Activity]
}

export type DayRecord = Record<string, HourRecord>

export type AppData = {
  version: 2
  records: Record<string, DayRecord>
}

export type LegacyDayRecord = Record<string, Activity>

export type LegacyAppData = {
  version: 1
  records: Record<string, LegacyDayRecord>
}

export type ThemeMode = 'system' | 'light' | 'dark'

export type Page = 'record' | 'routine' | 'calendar' | 'review' | 'settings'

export const CATEGORY_META: Record<BuiltinCategoryId, { label: string; color: string; icon: CategoryIconId }> = {
  study: { label: '공부', color: '#4A7FCC', icon: 'book' },
  sleep: { label: '수면', color: '#8466C4', icon: 'moon' },
  meal: { label: '식사', color: '#E08A3C', icon: 'meal' },
  travel: { label: '이동', color: '#2E9E96', icon: 'bus' },
  rest: { label: '휴식', color: '#D1A62A', icon: 'cup' },
  game: { label: '게임', color: '#D0578F', icon: 'game' },
  exercise: { label: '운동', color: '#4E9E5E', icon: 'dumbbell' },
  other: { label: '기타', color: '#8A8D96', icon: 'dots' },
}
