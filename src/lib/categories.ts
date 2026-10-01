import { CATEGORY_COLORS, CATEGORY_ICON_IDS, type CategoryData, type CategoryIconId, type CustomCategory } from '../types/category.ts'
import { CATEGORY_IDS, CATEGORY_META, type AppData, type BuiltinCategoryId, type DayRecord } from '../types/record.ts'

export const CATEGORY_STORAGE_KEY = 'girok:categories:v1'
export const EMPTY_CATEGORY_DATA: CategoryData = { version: 1, categories: [] }
export const CATEGORY_NAME_MAX_LENGTH = 8
export const CUSTOM_CATEGORY_MAX = 12

const builtinSet = new Set<string>(CATEGORY_IDS)
const iconSet = new Set<string>(CATEGORY_ICON_IDS)
const colorSet = new Set<string>(Object.keys(CATEGORY_COLORS))
const customIdPattern = /^c-[a-z0-9]{1,40}$/

export type CategoryMeta = { id: string; label: string; color: string; icon: CategoryIconId; custom: boolean }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isBuiltinCategory(id: string): id is BuiltinCategoryId {
  return builtinSet.has(id)
}

// Records accept any well-formed custom id, even one whose definition is missing, so a record
// never fails validation (and gets parked as unreadable) just because a category was not restored.
export function isCategoryId(value: unknown): value is string {
  return typeof value === 'string' && (builtinSet.has(value) || customIdPattern.test(value))
}

function validCategory(value: unknown): value is CustomCategory {
  if (!isPlainObject(value)) return false
  return typeof value.id === 'string' && customIdPattern.test(value.id)
    && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= CATEGORY_NAME_MAX_LENGTH
    && iconSet.has(String(value.icon)) && colorSet.has(String(value.color))
}

export function validateCategoryData(value: unknown): value is CategoryData {
  if (!isPlainObject(value) || value.version !== 1 || !Array.isArray(value.categories)) return false
  if (value.categories.length > CUSTOM_CATEGORY_MAX || !value.categories.every(validCategory)) return false
  return new Set(value.categories.map((category) => category.id)).size === value.categories.length
}

export function readCategoryData(): CategoryData {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY)
    if (!raw) return EMPTY_CATEGORY_DATA
    const parsed: unknown = JSON.parse(raw)
    return validateCategoryData(parsed) ? parsed : EMPTY_CATEGORY_DATA
  } catch {
    return EMPTY_CATEGORY_DATA
  }
}

export function writeCategoryData(data: CategoryData): boolean {
  if (!validateCategoryData(data)) return false
  try {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function newCategoryId(): string {
  return `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function categoryMeta(id: string, data: CategoryData): CategoryMeta {
  if (isBuiltinCategory(id)) return { id, ...CATEGORY_META[id], custom: false }
  const custom = data.categories.find((category) => category.id === id)
  if (custom) return { id, label: custom.name, color: CATEGORY_COLORS[custom.color], icon: custom.icon, custom: true }
  return { id, label: '지운 카테고리', color: CATEGORY_META.other.color, icon: 'dots', custom: true }
}

// Picker and tie-break order: built-ins first, then custom categories in the order they were added.
export function categoryOrder(data: CategoryData): string[] {
  return [...CATEGORY_IDS, ...data.categories.map((category) => category.id)]
}

export function upsertCategory(data: CategoryData, category: CustomCategory): CategoryData {
  const exists = data.categories.some((item) => item.id === category.id)
  return {
    version: 1,
    categories: exists ? data.categories.map((item) => item.id === category.id ? category : item) : [...data.categories, category],
  }
}

export function removeCategory(data: CategoryData, id: string): CategoryData {
  return { version: 1, categories: data.categories.filter((category) => category.id !== id) }
}

// True when another category (built-in or custom) already shows this name.
export function nameTaken(data: CategoryData, name: string, exceptId?: string): boolean {
  const target = name.trim()
  return CATEGORY_IDS.some((id) => CATEGORY_META[id].label === target)
    || data.categories.some((category) => category.id !== exceptId && category.name.trim() === target)
}

export function categoryHours(records: AppData['records'], id: string): number {
  let count = 0
  for (const day of Object.values(records)) {
    for (const hour of Object.values(day)) if (hour.segments.some((activity) => activity.category === id)) count += 1
  }
  return count
}

// Moves every activity in `from` to `to`, e.g. to 기타 before a custom category is deleted.
export function reassignCategory(data: AppData, from: string, to: string): AppData {
  const records: AppData['records'] = {}
  for (const [key, day] of Object.entries(data.records)) {
    const nextDay: DayRecord = {}
    for (const [hour, record] of Object.entries(day)) {
      const segments = record.segments.map((activity) => activity.category === from ? { ...activity, category: to } : activity)
      nextDay[hour] = { segments: segments as typeof record.segments }
    }
    records[key] = nextDay
  }
  return { version: 2, records }
}
