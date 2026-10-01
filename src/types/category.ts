import { ROUTINE_COLORS, ROUTINE_ICON_IDS } from './routine.ts'

// Routine icons plus the built-in category glyphs that have no routine twin.
export const CATEGORY_ICON_IDS = [...ROUTINE_ICON_IDS, 'bus', 'cup', 'game', 'dots'] as const
export type CategoryIconId = (typeof CATEGORY_ICON_IDS)[number]

// The routine palette plus four more, so custom categories can stand apart from the built-in ones.
export const CATEGORY_COLORS = {
  ...ROUTINE_COLORS,
  red: '#D65745',
  sky: '#3A9BD6',
  brown: '#9C7350',
  lime: '#7FA33A',
} as const
export type CategoryColorId = keyof typeof CATEGORY_COLORS
export const CATEGORY_COLOR_IDS = Object.keys(CATEGORY_COLORS) as CategoryColorId[]

export type CustomCategory = {
  id: string // `c-` + random suffix, so it never collides with a built-in id
  name: string
  icon: CategoryIconId
  color: CategoryColorId
}

export type CategoryData = {
  version: 1
  categories: CustomCategory[]
}
