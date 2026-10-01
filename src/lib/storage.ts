import { isCategoryId, validateCategoryData } from './categories.ts'
import { validateRoutineData } from './routines.ts'
import type { CategoryData } from '../types/category.ts'
import type { RoutineData } from '../types/routine.ts'
import { type Activity, type AppData, type DayRecord, type HourRecord, type LegacyAppData, type LegacyDayRecord } from '../types/record.ts'

export const LEGACY_STORAGE_KEY = 'girok:data:v1'
export const STORAGE_KEY = 'girok:data:v2'
export const THEME_KEY = 'girok:theme:v1'
export const CORRUPT_BACKUP_KEY = 'girok:data:v2:unreadable'
export const EMPTY_DATA: AppData = { version: 2, records: {} }

const hourPattern = /^(?:[0-9]|1[0-9]|2[0-3])$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function validActivity(value: unknown): value is Activity {
  if (!isPlainObject(value)) return false
  return isCategoryId(value.category) && typeof value.text === 'string' && value.text.length <= 500
}

function validLegacyDay(value: unknown): value is LegacyDayRecord {
  if (!isPlainObject(value)) return false
  return Object.entries(value).every(([hour, activity]) => hourPattern.test(hour) && validActivity(activity))
}

function validHourRecord(value: unknown): value is HourRecord {
  if (!isPlainObject(value) || !Array.isArray(value.segments) || (value.segments.length !== 1 && value.segments.length !== 2)) return false
  return value.segments.every(validActivity)
}

function validDay(value: unknown): value is DayRecord {
  if (!isPlainObject(value)) return false
  return Object.entries(value).every(([hour, record]) => hourPattern.test(hour) && validHourRecord(record))
}

export function validateDataV1(value: unknown): value is LegacyAppData {
  if (!isPlainObject(value) || value.version !== 1 || !isPlainObject(value.records)) return false
  return Object.entries(value.records).every(([key, day]) => validDateKey(key) && validLegacyDay(day))
}

export function validateDataV2(value: unknown): value is AppData {
  if (!isPlainObject(value) || value.version !== 2 || !isPlainObject(value.records)) return false
  return Object.entries(value.records).every(([key, day]) => validDateKey(key) && validDay(day))
}

export function validateData(value: unknown): value is AppData {
  return validateDataV2(value)
}

export function migrateV1(value: LegacyAppData): AppData {
  const records: AppData['records'] = {}
  for (const [day, hours] of Object.entries(value.records)) {
    const nextDay: DayRecord = {}
    for (const [hour, activity] of Object.entries(hours)) nextDay[hour] = { segments: [activity] }
    if (Object.keys(nextDay).length) records[day] = nextDay
  }
  return { version: 2, records }
}

export function parseCanonical(raw: string): { data: AppData; migrated: boolean } | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    // Keep only the record fields, so extras such as a backup's routineData never reach the v2 key.
    if (validateDataV2(parsed)) return { data: { version: 2, records: parsed.records }, migrated: false }
    if (validateDataV1(parsed)) return { data: migrateV1(parsed), migrated: true }
  } catch {
    return null
  }
  return null
}

export function readData(): AppData {
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    if (current) {
      const parsed = parseCanonical(current)
      if (parsed && !parsed.migrated) return parsed.data
      // The next save overwrites STORAGE_KEY, so park the unreadable bytes where a later fix can recover them.
      if (localStorage.getItem(CORRUPT_BACKUP_KEY) === null) {
        try { localStorage.setItem(CORRUPT_BACKUP_KEY, current) } catch { /* Best effort; reading still continues. */ }
      }
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const parsed = parseCanonical(legacy)
      if (parsed?.migrated) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.data)) } catch { /* Migration still returns the valid canonical data. */ }
        return parsed.data
      }
    }
  } catch {
    return EMPTY_DATA
  }
  return EMPTY_DATA
}

export function writeData(data: AppData): boolean {
  if (!validateDataV2(data)) return false
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export type BackupFile = AppData & { routineData?: RoutineData; categoryData?: CategoryData }

// Backups carry routines and custom categories next to the records; older apps ignore the extra fields.
export function backupFile(data: AppData, routineData: RoutineData, categoryData: CategoryData): BackupFile {
  return { version: 2, records: data.records, routineData, categoryData }
}

export type ImportedData = { data: AppData; routineData: RoutineData | null; categoryData: CategoryData | null; migrated: boolean }

// `routineData`/`categoryData` are null when the file has none (an older backup), so the current ones can be kept.
export function parseImportedData(raw: string): ImportedData | { error: string } {
  const parsed = parseCanonical(raw)
  if (!parsed) return { error: 'girok 백업 형식과 일치하지 않아요.' }
  let extras: { routineData?: unknown; categoryData?: unknown }
  try { extras = JSON.parse(raw) as typeof extras } catch { extras = {} }
  const { routineData, categoryData } = extras
  if (routineData !== undefined && !validateRoutineData(routineData)) return { error: '백업 파일의 루틴 데이터가 올바르지 않아요.' }
  if (categoryData !== undefined && !validateCategoryData(categoryData)) return { error: '백업 파일의 카테고리 데이터가 올바르지 않아요.' }
  return { ...parsed, routineData: routineData ?? null, categoryData: categoryData ?? null }
}

export function replaceData(data: AppData): boolean {
  return writeData(data)
}

export function clearData(): boolean {
  if (!validateDataV2(EMPTY_DATA)) return false
  let previousCanonical: string | null
  let previousLegacy: string | null
  try {
    previousCanonical = localStorage.getItem(STORAGE_KEY)
    previousLegacy = localStorage.getItem(LEGACY_STORAGE_KEY)
  } catch {
    return false
  }

  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    if (previousLegacy !== null) {
      try { localStorage.setItem(LEGACY_STORAGE_KEY, previousLegacy) } catch { /* Best-effort rollback. */ }
    }
    return false
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(EMPTY_DATA))
    return true
  } catch {
    try {
      if (previousCanonical === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, previousCanonical)
    } catch { /* Best-effort rollback. */ }
    if (previousLegacy !== null) {
      try { localStorage.setItem(LEGACY_STORAGE_KEY, previousLegacy) } catch { /* Best-effort rollback. */ }
    }
    return false
  }
}
