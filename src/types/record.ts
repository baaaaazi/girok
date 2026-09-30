export const CATEGORY_IDS = ['study', 'sleep', 'meal', 'travel', 'rest', 'game', 'exercise', 'other'] as const

export type CategoryId = (typeof CATEGORY_IDS)[number]

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

export type Page = 'record' | 'calendar' | 'review' | 'settings'

export const CATEGORY_META: Record<CategoryId, { label: string; color: string }> = {
  study: { label: '공부', color: '#4F7FB8' },
  sleep: { label: '수면', color: '#8274B4' },
  meal: { label: '식사', color: '#D0874A' },
  travel: { label: '이동', color: '#3E9A96' },
  rest: { label: '휴식', color: '#C9A43E' },
  game: { label: '게임', color: '#C0668F' },
  exercise: { label: '운동', color: '#5E9E5A' },
  other: { label: '기타', color: '#8C877D' },
}
