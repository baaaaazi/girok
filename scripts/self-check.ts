import assert from 'node:assert/strict'
import { assertMonthLayout, dateKey, monthGrid, monthLeadingDays, shiftDate, shiftMonth, swipeDateAmount } from '../src/lib/date.ts'
import { categoryPresence, recordedHourCount, replaceHour, replaceHours, reviewHours, timeBlocks } from '../src/lib/records.ts'
import { CORRUPT_BACKUP_KEY, EMPTY_DATA, LEGACY_STORAGE_KEY, STORAGE_KEY, clearData, parseImportedData, readData, replaceData, validateDataV1, validateDataV2 } from '../src/lib/storage.ts'
import type { Activity, AppData, LegacyAppData } from '../src/types/record.ts'

const bytes = new Map<string, string>()
let failSetNext = false
let failRemove = false
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => bytes.get(key) ?? null,
    setItem: (key: string, value: string) => { if (failSetNext) { failSetNext = false; throw new Error('storage full') }; bytes.set(key, value) },
    removeItem: (key: string) => { if (failRemove) throw new Error('storage locked'); bytes.delete(key) },
  },
})

const study: Activity = { category: 'study', text: '수학' }
const meal: Activity = { category: 'meal', text: '점심' }
const sleep: Activity = { category: 'sleep', text: '낮잠' }
const legacy: LegacyAppData = {
  version: 1,
  records: { '2026-09-17': { '9': study } },
}
const canonical: AppData = {
  version: 2,
  records: { '2026-09-17': { '9': { segments: [study] } } },
}

assertMonthLayout(new Date(2026, 8, 1))
assert.equal(monthLeadingDays(new Date(2026, 8, 1)), 2)
assert.equal(monthGrid(new Date(2026, 8, 1)).filter(Boolean).length, 30)
assert.equal(shiftDate('2026-09-30', 1), '2026-10-01')
assert.equal(dateKey(new Date(2026, 8, 17)), '2026-09-17')
assert.equal(shiftMonth('2024-03-31', -1), '2024-02-29')
assert.equal(shiftMonth('2026-01-31', 1), '2026-02-28')
assert.equal(swipeDateAmount(-80, 10, 240), 1)
assert.equal(swipeDateAmount(80, 10, 240), -1)
assert.equal(swipeDateAmount(80, 70, 240), 0)
assert.equal(validateDataV1(legacy), true)
assert.equal(validateDataV2(canonical), true)

const legacyBytes = JSON.stringify(legacy)
bytes.set(LEGACY_STORAGE_KEY, legacyBytes)
assert.deepEqual(readData(), canonical)
assert.equal(bytes.get(LEGACY_STORAGE_KEY), legacyBytes)
assert.equal(bytes.get(STORAGE_KEY), JSON.stringify(canonical))
assert.deepEqual(readData(), canonical)
assert.equal(bytes.get(LEGACY_STORAGE_KEY), legacyBytes)

const v1Import = parseImportedData(legacyBytes)
assert.deepEqual('data' in v1Import ? v1Import.data : null, canonical)
assert.equal('data' in v1Import && v1Import.migrated, true)
const v2Import = parseImportedData(JSON.stringify(canonical))
assert.deepEqual('data' in v2Import ? v2Import.data : null, canonical)
assert.equal('data' in v2Import && !v2Import.migrated, true)

const malformed = [
  '{ nope',
  JSON.stringify({ version: 2, records: { '2026-02-30': {} } }),
  JSON.stringify({ version: 2, records: { '2026-09-17': { '9': { segments: [] } } } }),
  JSON.stringify({ version: 2, records: { '2026-09-17': { '9': { segments: [study, meal, sleep] } } } }),
  JSON.stringify({ version: 2, records: { '2026-09-17': { '24': { segments: [study] } } } }),
  JSON.stringify({ version: 2, records: { '2026-09-17': { '9': { segments: [{ category: 'study', text: 'x'.repeat(501) }] } } } }),
]
for (const raw of malformed) assert.equal('error' in parseImportedData(raw), true)
const beforeReject = bytes.get(STORAGE_KEY)
assert.equal(replaceData(JSON.parse(malformed[2]) as AppData), false)
assert.equal(bytes.get(STORAGE_KEY), beforeReject)

let edited: AppData = { version: 2, records: {} }
edited = replaceHour(edited, '2026-09-17', 9, { segments: [study] })
edited = replaceHour(edited, '2026-09-17', 10, { segments: [meal, sleep] })
assert.deepEqual(edited.records['2026-09-17']['9'].segments, [study])
assert.deepEqual(edited.records['2026-09-17']['10'].segments, [meal, sleep])
const reviewDay: AppData['records'][string] = {
  '9': { segments: [study, meal] },
  '10': { segments: [study, { category: 'study', text: '쓰기' }] },
}
assert.deepEqual(reviewHours(reviewDay).map(({ hour, activities }) => [hour, activities]), [
  [9, [study, meal]],
  [10, [study, { category: 'study', text: '쓰기' }]],
])
assert.equal(recordedHourCount({ '2026-09-17': reviewDay }, ['2026-09-17']), 2)
const presence = categoryPresence({ '2026-09-17': reviewDay }, ['2026-09-17'])
assert.equal(presence.study, 2)
assert.equal(presence.meal, 1)

edited = replaceHour(edited, '2026-09-17', 9, null)
edited = replaceHour(edited, '2026-09-17', 10, null)
assert.deepEqual(edited.records['2026-09-17'], undefined)
assert.deepEqual(edited.records, {})

bytes.set(STORAGE_KEY, JSON.stringify(canonical))
bytes.set(LEGACY_STORAGE_KEY, legacyBytes)
failSetNext = true
assert.equal(clearData(), false)
assert.equal(bytes.get(STORAGE_KEY), JSON.stringify(canonical))
assert.equal(bytes.get(LEGACY_STORAGE_KEY), legacyBytes)
assert.deepEqual(readData(), canonical)
failRemove = true
assert.equal(clearData(), false)
assert.equal(bytes.get(STORAGE_KEY), JSON.stringify(canonical))
assert.equal(bytes.get(LEGACY_STORAGE_KEY), legacyBytes)
assert.deepEqual(readData(), canonical)
failRemove = false

bytes.delete(STORAGE_KEY)
bytes.set(LEGACY_STORAGE_KEY, legacyBytes)
failSetNext = true
assert.equal(clearData(), false)
assert.equal(bytes.has(STORAGE_KEY), false)
assert.equal(bytes.get(LEGACY_STORAGE_KEY), legacyBytes)
assert.deepEqual(readData(), canonical)

assert.equal(clearData(), true)
assert.equal(bytes.get(STORAGE_KEY), JSON.stringify(EMPTY_DATA))
assert.equal(bytes.has(LEGACY_STORAGE_KEY), false)
assert.deepEqual(readData(), EMPTY_DATA)
assert.deepEqual(EMPTY_DATA.records, {})

assert.deepEqual(timeBlocks({}), [])
assert.deepEqual(timeBlocks({
  '1': { segments: [{ category: 'sleep', text: '' }] },
  '2': { segments: [{ category: 'sleep', text: '꿈' }] },
  '3': { segments: [{ category: 'sleep', text: '' }, { category: 'meal', text: '' }] },
  '6': { segments: [{ category: 'study', text: '' }] },
}), [
  { kind: 'record', start: 1, end: 3, categories: ['sleep'], notes: [{ hour: 2, category: 'sleep', text: '꿈' }] },
  { kind: 'record', start: 3, end: 4, categories: ['sleep', 'meal'], notes: [] },
  { kind: 'gap', start: 4, end: 6 },
  { kind: 'record', start: 6, end: 7, categories: ['study'], notes: [] },
])

bytes.clear()
bytes.set(STORAGE_KEY, '{"version":2,"records":{"bad-date":{}}}')
assert.deepEqual(readData(), EMPTY_DATA)
assert.equal(bytes.get(CORRUPT_BACKUP_KEY), '{"version":2,"records":{"bad-date":{}}}')
bytes.clear()

const bulk = replaceHours(canonical, '2026-09-18', [0, 1, 2], { segments: [sleep] })
assert.deepEqual(Object.keys(bulk.records['2026-09-18']), ['0', '1', '2'])
assert.deepEqual(bulk.records['2026-09-17'], canonical.records['2026-09-17'])
assert.equal(replaceHours(bulk, '2026-09-18', [0, 1, 2], null).records['2026-09-18'], undefined)

console.log('self-check passed')
