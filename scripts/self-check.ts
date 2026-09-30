import assert from 'node:assert/strict'
import { assertMonthLayout, dateKey, monthGrid, monthLeadingDays, shiftDate, shiftMonth, swipeDateAmount } from '../src/lib/date.ts'
import { categoryPresence, recordedHourCount, replaceHour, replaceHours, reviewHours, timeBlocks } from '../src/lib/records.ts'
import { CORRUPT_BACKUP_KEY, EMPTY_DATA, LEGACY_STORAGE_KEY, STORAGE_KEY, clearData, parseImportedData, readData, replaceData, validateDataV1, validateDataV2 } from '../src/lib/storage.ts'
import { EMPTY_ROUTINE_DATA, ROUTINE_STORAGE_KEY, clearRoutineData, dayComplete, dayProgress, ddayLabel, isDue, nearestGoal, readRoutineData, removeRoutine, routineRates, repeatLabel, sortedGoals, streak, toggleCheck, upsertRoutine, validateRoutineData, weekCount, weekStart, writeRoutineData } from '../src/lib/routines.ts'
import { backupFile } from '../src/lib/storage.ts'
import type { Activity, AppData, LegacyAppData } from '../src/types/record.ts'
import type { Goal, Routine, RoutineData } from '../src/types/routine.ts'

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

// Routines: 2026-09-27 is a Sunday.
const water: Routine = { id: 'w', name: '물 마시기', icon: 'water', color: 'blue', repeat: { kind: 'daily' }, createdAt: '2026-09-20' }
const gym: Routine = { id: 'g', name: '운동', icon: 'dumbbell', color: 'green', repeat: { kind: 'weekdays', days: [1, 3, 5] }, createdAt: '2026-09-20' }
const read: Routine = { id: 'r', name: '책', icon: 'book', color: 'violet', repeat: { kind: 'weekly', times: 2 }, createdAt: '2026-09-13' }
let routineData: RoutineData = [water, gym, read].reduce(upsertRoutine, EMPTY_ROUTINE_DATA)
assert.equal(validateRoutineData(routineData), true)
assert.equal(weekStart('2026-10-01'), '2026-09-27')
assert.equal(weekStart('2026-09-27'), '2026-09-27')
assert.equal(isDue(water, '2026-09-19'), false)
assert.equal(isDue(gym, '2026-09-30'), true) // Wednesday
assert.equal(isDue(gym, '2026-10-01'), false) // Thursday
assert.equal(isDue(read, '2026-10-01'), true)
assert.equal(repeatLabel(gym.repeat), '월 수 금')
assert.equal(repeatLabel({ kind: 'weekdays', days: [5, 4, 3, 2, 1] }), '평일')

for (const day of ['2026-09-28', '2026-09-29', '2026-09-30']) routineData = toggleCheck(routineData, day, 'w')
assert.equal(streak(routineData, water, '2026-10-01'), 3) // today not done yet still counts through yesterday
routineData = toggleCheck(routineData, '2026-10-01', 'w')
assert.equal(streak(routineData, water, '2026-10-01'), 4)
routineData = toggleCheck(routineData, '2026-10-01', 'w')
assert.equal(routineData.checks['2026-10-01'], undefined)
assert.equal(streak(routineData, water, '2026-10-02'), 0) // missed a past day

routineData = toggleCheck(routineData, '2026-09-28', 'g') // Mon
routineData = toggleCheck(routineData, '2026-09-30', 'g') // Wed
assert.equal(streak(routineData, gym, '2026-10-01'), 2) // Thursday is not due, so it does not break the streak
assert.equal(streak(routineData, gym, '2026-10-03'), 0) // Friday was missed

for (const day of ['2026-09-14', '2026-09-16', '2026-09-22', '2026-09-24', '2026-09-28']) routineData = toggleCheck(routineData, day, 'r')
assert.equal(weekCount(routineData, 'r', '2026-10-01'), 1)
assert.equal(streak(routineData, read, '2026-10-01'), 2) // current week still in progress
routineData = toggleCheck(routineData, '2026-10-01', 'r')
assert.equal(streak(routineData, read, '2026-10-01'), 3)
assert.deepEqual(dayProgress(routineData, '2026-09-30'), { done: 2, total: 3 })

// Calendar dot: every daily/weekday routine due that day is done; weekly ones only count when checked.
assert.equal(dayComplete(routineData, '2026-09-30'), true) // water and gym done, weekly read not needed
assert.equal(dayComplete(routineData, '2026-09-29'), true) // gym not due on Tuesday
assert.equal(dayComplete(routineData, '2026-10-01'), false) // water missed
assert.equal(dayComplete(routineData, '2026-09-19'), false) // nothing existed yet
const weeklyOnly: RoutineData = { ...routineData, routines: [read] }
assert.equal(dayComplete(weeklyOnly, '2026-09-28'), true)
assert.equal(dayComplete(weeklyOnly, '2026-09-29'), false)

// Review rates: due days up to today; weekly routines use the weekly target scaled to the days counted.
const lastWeek = Array.from({ length: 7 }, (_, index) => shiftDate('2026-10-01', index - 6))
const rates = (dates: string[], today: string) => routineRates(routineData, dates, today).map(({ routine, done, total }) => [routine.id, done, total])
assert.deepEqual(rates(lastWeek, '2026-10-01'), [['w', 3, 7], ['g', 2, 3], ['r', 2, 2]])
assert.deepEqual(rates(lastWeek, '2026-09-29'), [['w', 2, 5], ['g', 1, 2], ['r', 1, 1]]) // later days are not counted yet
assert.deepEqual(rates(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'], '2026-10-01'), [['r', 1, 1]]) // extra checks cap at the target; others did not exist yet
assert.deepEqual(rates(['2026-10-05'], '2026-10-01'), [])

routineData = removeRoutine(routineData, 'w')
assert.equal(routineData.routines.some((routine) => routine.id === 'w'), false)
assert.equal(Object.values(routineData.checks).some((ids) => ids.includes('w')), false)
assert.equal(validateRoutineData(routineData), true)

const goal = (id: string, date: string | null, createdAt = '2026-09-01'): Goal => ({ id, name: id, date, createdAt })
assert.equal(ddayLabel(goal('a', '2026-10-13'), '2026-10-01'), 'D-12')
assert.equal(ddayLabel(goal('a', '2026-10-01'), '2026-10-01'), 'D-day')
assert.equal(ddayLabel(goal('a', '2026-09-28'), '2026-10-01'), 'D+3')
assert.equal(ddayLabel(goal('a', null), '2026-10-01'), '목표')
assert.equal(ddayLabel(goal('a', '2027-03-28'), '2026-10-25'), 'D-154') // spans a DST change in some zones
assert.deepEqual(sortedGoals([goal('open', null), goal('far', '2026-12-01'), goal('near', '2026-10-05')]).map((item) => item.id), ['near', 'far', 'open'])
assert.equal(nearestGoal([goal('open', null), goal('past', '2026-09-30'), goal('far', '2026-12-01'), goal('near', '2026-10-05')], '2026-10-01')?.id, 'near')
assert.equal(nearestGoal([goal('today', '2026-10-01'), goal('far', '2026-12-01')], '2026-10-01')?.id, 'today')
assert.equal(nearestGoal([goal('open', null), goal('past', '2026-09-30')], '2026-10-01'), null)

const badRoutines = [
  { ...routineData, version: 2 },
  { ...routineData, routines: [{ ...gym, repeat: { kind: 'weekdays', days: [] } }] },
  { ...routineData, routines: [{ ...gym, icon: 'rocket' }] },
  { ...routineData, routines: [{ ...gym, name: '   ' }] },
  { ...routineData, routines: [gym, gym] },
  { ...routineData, checks: { '2026-02-30': ['g'] } },
  { ...routineData, goals: [{ ...goal('x', null), date: 'soon' }] },
]
for (const bad of badRoutines) assert.equal(validateRoutineData(bad), false)

bytes.clear()
assert.deepEqual(readRoutineData(), EMPTY_ROUTINE_DATA)
assert.equal(writeRoutineData(routineData), true)
assert.deepEqual(readRoutineData(), routineData)
assert.equal(writeRoutineData(badRoutines[1] as RoutineData), false)
assert.deepEqual(readRoutineData(), routineData)
bytes.set(ROUTINE_STORAGE_KEY, '{ nope')
assert.deepEqual(readRoutineData(), EMPTY_ROUTINE_DATA)
assert.equal(clearRoutineData(), true)
assert.deepEqual(readRoutineData(), EMPTY_ROUTINE_DATA)

// Backups carry routines without touching the v2 record format.
const withRoutines = parseImportedData(JSON.stringify(backupFile(canonical, routineData)))
assert.ok('data' in withRoutines)
assert.deepEqual(withRoutines.data, canonical)
assert.equal('routineData' in withRoutines.data, false)
assert.deepEqual(withRoutines.routineData, routineData)
const oldBackup = parseImportedData(JSON.stringify(canonical))
assert.ok('data' in oldBackup)
assert.equal(oldBackup.routineData, null)
assert.equal('error' in parseImportedData(JSON.stringify({ ...canonical, routineData: badRoutines[2] })), true)
bytes.clear()

console.log('self-check passed')
