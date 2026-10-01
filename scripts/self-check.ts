import assert from 'node:assert/strict'
import { assertMonthLayout, dateKey, monthGrid, monthLeadingDays, shiftDate, shiftMonth, swipeDateAmount } from '../src/lib/date.ts'
import { categoryPresence, presentCategories, recordedHourCount, replaceHour, replaceHours, reviewHours, timeBlocks } from '../src/lib/records.ts'
import { CORRUPT_BACKUP_KEY, EMPTY_DATA, LEGACY_STORAGE_KEY, STORAGE_KEY, clearData, parseImportedData, readData, replaceData, validateDataV1, validateDataV2 } from '../src/lib/storage.ts'
import { EMPTY_ROUTINE_DATA, ROUTINE_STORAGE_KEY, clearRoutineData, dayComplete, dayProgress, ddayLabel, isDue, nearestGoal, readRoutineData, removeRoutine, routineRates, repeatLabel, sortedGoals, streak, toggleCheck, upsertRoutine, validateRoutineData, weekCount, weekStart, writeRoutineData } from '../src/lib/routines.ts'
import { backupFile } from '../src/lib/storage.ts'
import { CATEGORY_STORAGE_KEY, EMPTY_CATEGORY_DATA, categoryHours, categoryMeta, categoryOrder, isCategoryId, nameTaken, readCategoryData, reassignCategory, removeCategory, upsertCategory, validateCategoryData, writeCategoryData } from '../src/lib/categories.ts'
import type { CategoryData } from '../src/types/category.ts'
import { EMPTY_REMINDER_DATA, REMINDER_STORAGE_KEY, newReminderId, readReminderData, reminderNotificationIds, reminderOccurrences, removeReminder, timeLabel, upsertReminder, validateReminderData, writeReminderData } from '../src/lib/reminders.ts'
import { categoryChanges, formatMinutes, recordingStreak, subjectParticle } from '../src/lib/insights.ts'
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
const withRoutines = parseImportedData(JSON.stringify(backupFile(canonical, routineData, EMPTY_CATEGORY_DATA)))
assert.ok('data' in withRoutines)
assert.deepEqual(withRoutines.data, canonical)
assert.equal('routineData' in withRoutines.data, false)
assert.deepEqual(withRoutines.routineData, routineData)
const oldBackup = parseImportedData(JSON.stringify(canonical))
assert.ok('data' in oldBackup)
assert.equal(oldBackup.routineData, null)
assert.equal('error' in parseImportedData(JSON.stringify({ ...canonical, routineData: badRoutines[2] })), true)
bytes.clear()

// Custom categories live under their own key; records only need a well-formed id.
const reading: CategoryData = upsertCategory(EMPTY_CATEGORY_DATA, { id: 'c-read1', name: '독서', icon: 'book', color: 'red' })
assert.equal(validateCategoryData(reading), true)
assert.equal(isCategoryId('c-read1'), true)
assert.equal(isCategoryId('c-gone'), true) // a missing definition never makes records unreadable
assert.equal(isCategoryId('reading'), false)
assert.equal(isCategoryId('c-'), false)
assert.equal(validateCategoryData({ version: 1, categories: [{ id: 'study', name: 'x', icon: 'book', color: 'red' }] }), false) // built-in id
assert.equal(validateCategoryData({ version: 1, categories: [{ id: 'c-a', name: '아주아주긴이름입니다', icon: 'book', color: 'red' }] }), false)
assert.equal(validateCategoryData({ version: 1, categories: [{ id: 'c-a', name: '독서', icon: 'nope', color: 'red' }] }), false)
assert.equal(validateCategoryData({ version: 1, categories: [reading.categories[0], reading.categories[0]] }), false)
assert.deepEqual(categoryMeta('c-read1', reading), { id: 'c-read1', label: '독서', color: '#D65745', icon: 'book', custom: true })
assert.equal(categoryMeta('study', reading).label, '공부')
assert.equal(categoryMeta('c-gone', reading).label, '지운 카테고리')
assert.deepEqual(categoryOrder(reading).slice(-2), ['other', 'c-read1'])
assert.equal(nameTaken(reading, ' 공부 '), true)
assert.equal(nameTaken(reading, '독서'), true)
assert.equal(nameTaken(reading, '독서', 'c-read1'), false) // renaming to itself is fine
assert.equal(upsertCategory(reading, { id: 'c-read1', name: '책', icon: 'book', color: 'sky' }).categories.length, 1)

const customDay: AppData = { version: 2, records: {
  '2026-10-01': { '8': { segments: [{ category: 'c-read1', text: '소설' }] }, '9': { segments: [study, { category: 'c-read1', text: '' }] }, '10': { segments: [study] } },
} }
assert.equal(validateDataV2(customDay), true)
assert.equal('error' in parseImportedData(JSON.stringify(customDay)), false)
const customPresence = categoryPresence(customDay.records, ['2026-10-01'])
assert.deepEqual(customPresence, { 'c-read1': 2, study: 2 })
assert.deepEqual(presentCategories(customPresence, categoryOrder(reading)), ['study', 'c-read1']) // tie keeps built-ins first
assert.equal(categoryHours(customDay.records, 'c-read1'), 2)
const reassigned = reassignCategory(customDay, 'c-read1', 'other')
assert.equal(validateDataV2(reassigned), true)
assert.deepEqual(reassigned.records['2026-10-01']['8'].segments, [{ category: 'other', text: '소설' }])
assert.deepEqual(reassigned.records['2026-10-01']['9'].segments, [study, { category: 'other', text: '' }])
assert.equal(categoryHours(reassigned.records, 'c-read1'), 0)
assert.equal(customDay.records['2026-10-01']['8'].segments[0].category, 'c-read1') // input left untouched

assert.equal(writeCategoryData(reading), true)
assert.deepEqual(readCategoryData(), reading)
assert.equal(writeCategoryData({ version: 1, categories: [{ id: 'bad', name: '', icon: 'book', color: 'red' }] } as CategoryData), false)
bytes.set(CATEGORY_STORAGE_KEY, '{oops')
assert.deepEqual(readCategoryData(), EMPTY_CATEGORY_DATA)
assert.deepEqual(removeCategory(reading, 'c-read1'), EMPTY_CATEGORY_DATA)

// Backups carry the custom categories; files without them keep the current ones.
const categoryBackup = parseImportedData(JSON.stringify(backupFile(customDay, EMPTY_ROUTINE_DATA, reading)))
assert.ok(!('error' in categoryBackup))
assert.deepEqual(categoryBackup.categoryData, reading)
assert.deepEqual(categoryBackup.routineData, EMPTY_ROUTINE_DATA)
const noCategories = parseImportedData(JSON.stringify(customDay))
assert.ok(!('error' in noCategories))
assert.equal(noCategories.categoryData, null)
assert.equal('error' in parseImportedData(JSON.stringify({ ...customDay, categoryData: { version: 1, categories: 'x' } })), true)
bytes.clear()

// Insights compare averages per recorded day, so blank days do not count as doing less.
const dayOf = (sleepHours: number, studyHours: number): AppData['records'][string] => {
  const day: AppData['records'][string] = {}
  for (let hour = 0; hour < sleepHours; hour += 1) day[String(hour)] = { segments: [{ category: 'sleep', text: '' }] }
  for (let hour = 0; hour < studyHours; hour += 1) day[String(12 + hour)] = { segments: [{ category: 'study', text: '' }] }
  return day
}
const prevWeek = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']
const thisWeek = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']
const insightRecords: AppData['records'] = {}
for (const date of prevWeek.slice(0, 4)) insightRecords[date] = dayOf(8, 2) // two blank days must not drag the average down
for (const date of thisWeek) insightRecords[date] = dayOf(7, 4)
assert.deepEqual(categoryChanges(insightRecords, thisWeek, prevWeek), [{ category: 'study', minutes: 120 }, { category: 'sleep', minutes: -60 }])
assert.deepEqual(categoryChanges(insightRecords, thisWeek, prevWeek, { limit: 1 }), [{ category: 'study', minutes: 120 }])
assert.deepEqual(categoryChanges(insightRecords, thisWeek, prevWeek, { minMinutes: 90 }), [{ category: 'study', minutes: 120 }])
assert.deepEqual(categoryChanges(insightRecords, thisWeek, ['2026-09-01', '2026-09-02']), []) // too few recorded days to compare
insightRecords['2026-09-24'] = dayOf(8, 0) // a fifth recorded day: study avg 8h / 5 = 1.6h, change +2.4h
assert.deepEqual(categoryChanges(insightRecords, thisWeek, prevWeek)[0], { category: 'study', minutes: 140 }) // rounded to 10 minutes
assert.equal(formatMinutes(40), '40분')
assert.equal(formatMinutes(-120), '2시간')
assert.equal(formatMinutes(150), '2시간 30분')
assert.equal(subjectParticle('수면'), '이')
assert.equal(subjectParticle('게임'), '이')
assert.equal(subjectParticle('기타'), '가')
assert.equal(subjectParticle('유튜브'), '가')
assert.equal(subjectParticle('A'), '가')
assert.equal(subjectParticle('2026'), '이') // 육
assert.equal(subjectParticle('알바2'), '가') // 이

assert.equal(recordingStreak(insightRecords, '2026-10-01'), 8) // 09-24 through 10-01
assert.equal(recordingStreak(insightRecords, '2026-10-02'), 8) // today still blank keeps yesterday's streak
assert.equal(recordingStreak(insightRecords, '2026-10-03'), 0) // a missed day breaks it
assert.equal(recordingStreak({}, '2026-10-01'), 0)

// Reminders: ids double as Android notification ids, and the list stays in time order.
let reminders = upsertReminder(EMPTY_REMINDER_DATA, { id: newReminderId(EMPTY_REMINDER_DATA), time: '23:00', text: '오늘 루틴 체크', enabled: true })
reminders = upsertReminder(reminders, { id: newReminderId(reminders), time: '12:30', text: '오전 기록하기', enabled: true })
assert.deepEqual(reminders.reminders.map((item) => [item.id, item.time]), [[2, '12:30'], [1, '23:00']])
reminders = upsertReminder(reminders, { ...reminders.reminders[1], enabled: false })
assert.equal(reminders.reminders.length, 2)
assert.equal(reminders.reminders[1].enabled, false)
assert.equal(validateReminderData(reminders), true)
assert.equal(newReminderId(removeReminder(reminders, 1)), 3)
for (const bad of [{ id: 0, time: '09:00', text: 'x', enabled: true }, { id: 1, time: '24:00', text: 'x', enabled: true }, { id: 1, time: '9:00', text: 'x', enabled: true }, { id: 1, time: '09:00', text: ' ', enabled: true }, { id: 1.5, time: '09:00', text: 'x', enabled: true }]) {
  assert.equal(validateReminderData({ version: 1, reminders: [bad] }), false)
}
assert.equal(validateReminderData({ version: 1, reminders: [reminders.reminders[0], reminders.reminders[0]] }), false)
assert.equal(writeReminderData(reminders), true)
assert.deepEqual(readReminderData(), reminders)
const morning = { id: 3, time: '09:00', text: '아침', enabled: true }
const night = { id: 4, time: '23:00', text: '밤', enabled: true }
const at1000 = new Date(2026, 9, 1, 10, 0) // today's 09:00 has already passed
const upcoming = reminderOccurrences([morning, night, { ...night, id: 5, enabled: false }], at1000, 3)
assert.deepEqual(upcoming.map((item) => [item.notificationId, item.at.getDate(), item.at.getHours()]), [[400, 1, 23], [301, 2, 9], [401, 2, 23], [302, 3, 9], [402, 3, 23]])
assert.equal(reminderOccurrences([morning], new Date(2026, 9, 31, 8, 0), 2)[1].at.getMonth(), 10) // rolls into November
assert.deepEqual(reminderNotificationIds([morning], 3), [300, 301, 302])
assert.equal(validateReminderData({ version: 1, reminders: [{ ...morning, id: 20_000_000 }] }), false)
bytes.set(REMINDER_STORAGE_KEY, '[]')
assert.deepEqual(readReminderData(), EMPTY_REMINDER_DATA)
assert.deepEqual(timeLabel('00:05'), { period: '오전', clock: '12:05' })
assert.deepEqual(timeLabel('12:30'), { period: '오후', clock: '12:30' })
assert.deepEqual(timeLabel('23:00'), { period: '오후', clock: '11:00' })
bytes.clear()

console.log('self-check passed')
