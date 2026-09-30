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
  study: { label: '공부', color: '#A8784A' },
  sleep: { label: '수면', color: '#817497' },
  meal: { label: '식사', color: '#B26E52' },
  travel: { label: '이동', color: '#5F8892' },
  rest: { label: '휴식', color: '#9A8762' },
  game: { label: '게임', color: '#8A6D8C' },
  exercise: { label: '운동', color: '#6C8B75' },
  other: { label: '기타', color: '#858178' },
}
