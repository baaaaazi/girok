import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  dateKey,
  displayDate,
  hourLabel,
  hours,
  isToday,
  monthDays,
  monthGrid,
  monthStart,
  monthTitle,
  pad,
  parseDateKey,
  shiftDate,
  shiftMonth,
  swipeDateAmount,
  todayKey,
  WEEKDAYS_SHORT,
} from './lib/date'
import { categoryPresence, presentCategories, recordedHourCount, replaceHours, reviewHours, timeBlocks } from './lib/records'
import { EMPTY_DATA, THEME_KEY, backupFile, clearData, parseImportedData, readData, replaceData, writeData } from './lib/storage'
import { CUSTOM_CATEGORY_MAX, newCategoryId, readCategoryData, reassignCategory, removeCategory, categoryHours, upsertCategory, writeCategoryData } from './lib/categories'
import { heatDays, heatMonthLabels, type HeatDay, heatMonths, heatSummary, heatWeeks } from './lib/heatmap'
import { categoryChanges, formatMinutes, recordingStreak, subjectParticle } from './lib/insights'
import { EMPTY_ROUTINE_DATA, clearRoutineData, dayComplete, dayProgress, ddayLabel, nearestGoal, readRoutineData, routineRates, writeRoutineData } from './lib/routines'
import type { CategoryData, CustomCategory } from './types/category'
import { ROUTINE_COLORS, type Goal, type RoutineData } from './types/routine'
import { type Activity, type AppData, type CategoryId, type DayRecord, type HourRecord, type Page, type ThemeMode } from './types/record'
import { RoutineIcon } from './icons'
import { CategoryContext, CategoryDialog, CategoryIcon, CategorySettings, blankCategory, useCategories, type CategoryDraft } from './CategorySheet'
import { exitApp, isNative, listenBackButton, shareBackup, syncReminders, takeWidgetOps, updateWidget } from './native'
import { applyWidgetOps, widgetSnapshot } from './lib/widget'
import { readReminderData, writeReminderData, type ReminderData } from './lib/reminders'
import { ReminderSettings } from './ReminderSettings'
import { RoutinePage } from './RoutinePage'

type StyleVars = CSSProperties & Record<`--${string}`, string | number>
type Notice = { id: number; text: string; kind: 'success' | 'error' | 'info' }
type NoticeContent = Omit<Notice, 'id'>
type DraftActivity = { category: CategoryId | null; text: string }
type ReviewMode = 'day' | 'week' | 'month' | 'year'
type RangeMode = 'day' | 'week' | 'month'

const LIGHT_COLOR = '#FFFFFF'
const DARK_COLOR = '#111113'

const MULTI_HINT_KEY = 'girok:hint:multi-select'

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

function writeFlag(key: string): void {
  try { localStorage.setItem(key, '1') } catch { /* Hint shows again next session. */ }
}

function readTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
  } catch {
    return 'system'
  }
}

type CategoryLookup = ReturnType<typeof useCategories>['meta']

function categoryStyle(meta: CategoryLookup, category: CategoryId): StyleVars {
  return { '--category': meta(category).color }
}

function categoryPairStyle(meta: CategoryLookup, categories: CategoryId[]): StyleVars {
  return categories.length === 2
    ? {
        '--category': meta(categories[0]).color,
        '--category-a': meta(categories[0]).color,
        '--category-b': meta(categories[1]).color,
      }
    : categoryStyle(meta, categories[0])
}

function makeHourRecord(activities: Activity[]): HourRecord | null {
  if (!activities.length) return null
  return activities.length === 1
    ? { segments: [activities[0]] }
    : { segments: [activities[0], activities[1]] }
}

function reviewDates(date: string, mode: RangeMode): string[] {
  if (mode === 'day') return [date]
  if (mode === 'week') return Array.from({ length: 7 }, (_, index) => shiftDate(date, index - 6))
  return monthDays(parseDateKey(date) ?? new Date()).map(dateKey)
}

function monthDayLabel(key: string, withMonth = true): string {
  const date = parseDateKey(key) ?? new Date()
  return withMonth ? `${date.getMonth() + 1}월 ${date.getDate()}일` : `${date.getDate()}일`
}

function reviewRangeLabel(date: string, mode: RangeMode, dates: string[]): string {
  if (mode === 'day') return `${monthDayLabel(date)} ${displayDate(date).weekday}`
  if (mode === 'week') {
    const first = dates[0]
    const last = dates[dates.length - 1]
    return `${monthDayLabel(first)} – ${monthDayLabel(last, first.slice(0, 7) !== last.slice(0, 7))}`
  }
  return monthTitle(parseDateKey(date) ?? new Date())
}

function formatRangeTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

function isContiguous(sortedHours: number[]): boolean {
  return sortedHours.every((hour, index) => index === 0 || hour === sortedHours[index - 1] + 1)
}

function hoursLabel(sortedHours: number[]): string {
  if (sortedHours.length === 1) return `${hourLabel(sortedHours[0])} 기록`
  if (isContiguous(sortedHours)) return `${hourLabel(sortedHours[0])} – ${formatRangeTime((sortedHours[sortedHours.length - 1] + 1) * 60)}`
  return `${sortedHours.length}칸 기록`
}

const NAV_ITEMS: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'record', label: '기록', icon: 'M5 4.5h4.5a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5Zm9.5 0H19a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-.5.5h-4.5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5ZM5 14h4.5a.5.5 0 0 1 .5.5V19a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5v-4.5A.5.5 0 0 1 5 14Zm9.5 0H19a.5.5 0 0 1 .5.5V19a.5.5 0 0 1-.5.5h-4.5a.5.5 0 0 1-.5-.5v-4.5a.5.5 0 0 1 .5-.5Z' },
  { id: 'routine', label: '루틴', icon: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4Zm-3.7 8.4 2.6 2.6 4.9-5.2' },
  { id: 'calendar', label: '달력', icon: 'M5.5 5.5h13a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1ZM4.5 10h15M8.5 3.5v4m7-4v4' },
  { id: 'review', label: '돌아보기', icon: 'M12 3.8a8.2 8.2 0 1 0 8.2 8.2M12 3.8V12h8.2M14.8 3.9a8.2 8.2 0 0 1 5.3 5.3' },
]

export default function App() {
  const [data, setData] = useState<AppData>(() => readData())
  const [routineData, setRoutineData] = useState<RoutineData>(() => readRoutineData())
  const [categoryData, setCategoryData] = useState<CategoryData>(() => readCategoryData())
  const [reminderData, setReminderData] = useState<ReminderData>(() => readReminderData())
  // `onCreated` lets the entry sheet pick a category the moment it is added from there.
  const [editingCategory, setEditingCategory] = useState<{ draft: CategoryDraft; onCreated?: (id: string) => void } | null>(null)
  const [page, setPage] = useState<Page>('record')
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [monthCursor, setMonthCursor] = useState(() => monthStart(new Date()))
  const [reviewMode, setReviewMode] = useState<ReviewMode>('day')
  const [theme, setTheme] = useState<ThemeMode>(readTheme)
  const [editorHours, setEditorHours] = useState<number[] | null>(null)
  // null = normal tapping; an array = multi-select mode (possibly still empty).
  const [selection, setSelection] = useState<number[] | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [clearArmed, setClearArmed] = useState(false)
  const nextNoticeId = useRef(0)
  const lastToday = useRef(todayKey())
  const [, setClock] = useState(0)
  const [multiHintSeen, setMultiHintSeen] = useState(() => readFlag(MULTI_HINT_KEY))

  const showNotice = (next: NoticeContent) => setNotice({ ...next, id: ++nextNoticeId.current })
  const dismissNotice = (id: number) => setNotice((current) => current?.id === id ? null : current)

  const commitData = (next: AppData): boolean => {
    if (!writeData(next)) {
      showNotice({ text: '저장하지 못했어요. 기존 기록은 그대로예요.', kind: 'error' })
      return false
    }
    setData(next)
    return true
  }

  const commitRoutines = (next: RoutineData): boolean => {
    if (!writeRoutineData(next)) {
      showNotice({ text: '저장하지 못했어요. 기존 루틴은 그대로예요.', kind: 'error' })
      return false
    }
    setRoutineData(next)
    return true
  }

  const commitCategories = (next: CategoryData): boolean => {
    if (!writeCategoryData(next)) {
      showNotice({ text: '카테고리를 저장하지 못했어요.', kind: 'error' })
      return false
    }
    setCategoryData(next)
    return true
  }

  const commitReminders = (next: ReminderData): boolean => {
    if (!writeReminderData(next)) {
      showNotice({ text: '알림을 저장하지 못했어요.', kind: 'error' })
      return false
    }
    const previous = reminderData.reminders
    setReminderData(next)
    if (isNative) {
      void syncReminders(next.reminders, true, previous).then((result) => {
        if (result === 'denied') showNotice({ text: '알림 권한이 없어 알림을 보낼 수 없어요.', kind: 'error' })
        else if (result === 'failed') showNotice({ text: '알림을 예약하지 못했어요.', kind: 'error' })
      })
    }
    return true
  }

  // Reminders are booked REMINDER_DAYS ahead, so top them up whenever the app opens or comes back to the front.
  useEffect(() => {
    if (!isNative) return
    const refresh = () => { if (document.visibilityState === 'visible') void syncReminders(readReminderData().reminders, false) }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  // Checks made on the home-screen widget land here when the app opens or comes back; read storage
  // rather than state so a check is never applied to an older copy of the routines.
  useEffect(() => {
    if (!isNative) return
    const pull = () => {
      if (document.visibilityState !== 'visible') return
      void takeWidgetOps().then((ops) => {
        if (!ops.length) return
        const current = readRoutineData()
        const next = applyWidgetOps(current, ops)
        if (next !== current && writeRoutineData(next)) setRoutineData(next)
      })
    }
    pull()
    document.addEventListener('visibilitychange', pull)
    return () => document.removeEventListener('visibilitychange', pull)
  }, [])

  const today = todayKey()
  useEffect(() => {
    if (isNative) void updateWidget(widgetSnapshot(data.records, routineData, categoryData, theme, today, shiftDate(today, -1)))
  }, [data.records, routineData, categoryData, theme, today])

  const saveCategory = (draft: CategoryDraft): boolean => {
    const id = draft.id ?? newCategoryId()
    if (!commitCategories(upsertCategory(categoryData, { id, name: draft.name, icon: draft.icon, color: draft.color }))) return false
    if (!draft.id) editingCategory?.onCreated?.(id)
    return true
  }

  const deleteCategory = (id: string): boolean => {
    const category = categoryData.categories.find((item) => item.id === id)
    if (!category) return false
    const used = categoryHours(data.records, id)
    if (!window.confirm(used
      ? `'${category.name}' 카테고리를 지울까요? 이 카테고리로 남긴 ${used}시간은 '기타'로 바뀌어요.`
      : `'${category.name}' 카테고리를 지울까요?`)) return false
    // Records first, so a failure leaves the category in place rather than orphaning its hours.
    if (used && !commitData(reassignCategory(data, id, 'other'))) return false
    return commitCategories(removeCategory(categoryData, id))
  }

  const saveHours = (hours: number[], activities: Activity[]) => commitData(replaceHours(data, selectedDate, hours, makeHourRecord(activities)))
  const deleteHours = (hours: number[]) => commitData(replaceHours(data, selectedDate, hours, null))
  const navigateDate = (amount: number) => setSelectedDate((current) => shiftDate(current, amount))
  const navigateReview = (amount: number) => reviewMode !== 'year' && setSelectedDate((current) => reviewMode === 'month'
    ? shiftMonth(current, amount)
    : shiftDate(current, amount * (reviewMode === 'week' ? 7 : 1)))
  const navigate = (next: Page) => {
    setSelection(null)
    if (next === 'calendar') setMonthCursor(monthStart(parseDateKey(selectedDate) ?? new Date()))
    setPage(next)
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'dark' || (theme === 'system' && media.matches) ? 'dark' : 'light'
      document.documentElement.dataset.theme = resolved
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((tag) => {
        tag.content = theme === 'system'
          ? (tag.media.includes('dark') ? DARK_COLOR : LIGHT_COLOR)
          : resolved === 'dark' ? DARK_COLOR : LIGHT_COLOR
      })
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => { setSelection(null) }, [selectedDate])

  const backHandler = useRef(() => {})
  backHandler.current = () => {
    // The last open dialog is the topmost one (a category sheet opened over the entry sheet).
    const dialog = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].pop()
    if (dialog) dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    else if (selection) setSelection(null)
    else if (page !== 'record') navigate('record')
    else void exitApp()
  }
  useEffect(() => {
    if (!isNative) return
    let remove: (() => void) | undefined
    let disposed = false
    void listenBackButton(() => backHandler.current()).then((stop) => { if (disposed) stop(); else remove = stop })
    return () => { disposed = true; remove?.() }
  }, [])

  useEffect(() => {
    if (selection === null || multiHintSeen) return
    setMultiHintSeen(true)
    writeFlag(MULTI_HINT_KEY)
  }, [selection, multiHintSeen])

  useEffect(() => {
    const refresh = () => {
      const now = todayKey()
      if (now !== lastToday.current) {
        const previous = lastToday.current
        setSelectedDate((current) => current === previous ? now : current)
        lastToday.current = now
      }
      setClock((tick) => tick + 1)
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* Theme remains active for this session. */ }
  }, [theme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((page !== 'record' && page !== 'routine' && page !== 'review') || editorHours !== null || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (page === 'review') navigateReview(-1)
        else navigateDate(-1)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (page === 'review') navigateReview(1)
        else navigateDate(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [page, editorHours, reviewMode])

  const selectedDisplay = displayDate(selectedDate)
  const selectedDay = data.records[selectedDate] ?? {}

  return (
    <CategoryContext.Provider value={categoryData}>
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-lockup" aria-label="girok">
          <span className="brand-mark" aria-hidden="true">g</span><span>girok</span>
        </div>
        <nav className="top-navigation" aria-label="주요 탐색">
          <Navigation page={page} onNavigate={navigate} />
        </nav>
        <button className={`settings-button ${page === 'settings' ? 'settings-button-active' : ''}`} type="button" aria-label="설정" aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
            <path d="m19.4 13.5 1.1.8-1.2 2.1-1.3-.5a7.7 7.7 0 0 1-1.3.8l-.2 1.4h-2.4l-.3-1.4a7.6 7.6 0 0 1-1.5 0l-.8 1.2-2.1-1.2.5-1.3a7.7 7.7 0 0 1-.8-1.3l-1.4-.2v-2.4l1.4-.3a7.6 7.6 0 0 1 0-1.5l-1.2-.8 1.2-2.1 1.3.5a7.7 7.7 0 0 1 1.3-.8l.2-1.4h2.4l.3 1.4a7.6 7.6 0 0 1 1.5 0l.8-1.2 2.1 1.2-.5 1.3a7.7 7.7 0 0 1 .8 1.3l1.4.2v2.4l-1.4.3a7.6 7.6 0 0 1 .1 1.5Z" />
          </svg>
        </button>
      </header>

      <main className="page-content" key={page}>
        {page === 'record' && (
          <RecordPage
            date={selectedDate}
            display={selectedDisplay}
            data={data}
            onPrevious={() => navigateDate(-1)}
            onNext={() => navigateDate(1)}
            onToday={() => setSelectedDate(todayKey())}
            selection={selection}
            showMultiHint={!multiHintSeen}
            onSelectionChange={setSelection}
            onOpenHours={setEditorHours}
            onOpenReview={() => { setReviewMode('day'); navigate('review') }}
            goal={nearestGoal(routineData.goals, todayKey())}
            onOpenRoutine={() => navigate('routine')}
          />
        )}
        {page === 'routine' && (
          <RoutinePage
            date={selectedDate}
            today={todayKey()}
            data={routineData}
            onChange={commitRoutines}
            onPrevious={() => navigateDate(-1)}
            onNext={() => navigateDate(1)}
            onToday={() => setSelectedDate(todayKey())}
          />
        )}
        {page === 'calendar' && (
          <CalendarPage
            cursor={monthCursor}
            selectedDate={selectedDate}
            data={data}
            routineData={routineData}
            onPrevious={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            onNext={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            onSelectDate={(next) => { setSelectedDate(next); navigate('record') }}
          />
        )}
        {page === 'review' && (
          <ReviewPage
            date={selectedDate}
            data={data}
            routineData={routineData}
            mode={reviewMode}
            onModeChange={setReviewMode}
            onPrevious={() => navigateReview(-1)}
            onNext={() => navigateReview(1)}
            onSelectDate={(next) => { setSelectedDate(next); navigate('record') }}
            onOpenMonth={(next) => { setSelectedDate(next); setReviewMode('month') }}
          />
        )}
        {page === 'settings' && (
          <SettingsPage
            data={data}
            routineData={routineData}
            categoryData={categoryData}
            reminderData={reminderData}
            onRemindersChange={commitReminders}
            onAddCategory={() => setEditingCategory({ draft: blankCategory(categoryData) })}
            onEditCategory={(category) => setEditingCategory({ draft: category })}
            theme={theme}
            clearArmed={clearArmed}
            onThemeChange={setTheme}
            onImport={(next, nextRoutines, nextCategories) => {
              // Routines and categories first, so a failure there leaves the records unchanged. An older backup without them keeps the current ones.
              if (nextRoutines && !writeRoutineData(nextRoutines)) { showNotice({ text: '가져온 데이터를 저장하지 못했어요.', kind: 'error' }); return }
              if (nextRoutines) setRoutineData(nextRoutines)
              if (nextCategories && !writeCategoryData(nextCategories)) { showNotice({ text: '카테고리를 복원하지 못해 기록은 그대로 두었어요.', kind: 'error' }); return }
              if (nextCategories) setCategoryData(nextCategories)
              if (replaceData(next)) {
                setData(next)
                showNotice({ text: '백업 파일을 복원했어요.', kind: 'success' })
              } else showNotice({ text: nextRoutines ? '루틴만 복원하고 기록은 저장하지 못했어요.' : '가져온 데이터를 저장하지 못했어요.', kind: 'error' })
            }}
            onNotice={showNotice}
            onArmClear={() => { if (window.confirm('모든 기록과 루틴을 지울까요? 이 작업은 되돌릴 수 없어요.')) setClearArmed(true) }}
            onCancelClear={() => setClearArmed(false)}
            onClear={() => {
              if (!clearData()) { showNotice({ text: '데이터를 지우지 못했어요. 기록은 그대로예요.', kind: 'error' }); return }
              setData(EMPTY_DATA)
              setClearArmed(false)
              if (clearRoutineData()) {
                setRoutineData(EMPTY_ROUTINE_DATA)
                showNotice({ text: '모든 기록과 루틴을 지웠어요.', kind: 'success' })
              } else showNotice({ text: '기록은 지웠지만 루틴은 지우지 못했어요.', kind: 'error' })
            }}
          />
        )}
      </main>

      <nav className="mobile-navigation" aria-label="주요 탐색">
        <Navigation page={page} onNavigate={navigate} />
      </nav>
      {notice && <NoticeToast key={notice.id} notice={notice} onDismiss={dismissNotice} />}
      {editorHours !== null && (
        <EntryDialog
          date={selectedDate}
          hours={editorHours}
          records={editorHours.map((hour) => data.records[selectedDate]?.[String(hour)])}
          // Closing without saving keeps a multi-selection so it can be adjusted and reopened.
          onClose={(changed) => { setEditorHours(null); if (changed) setSelection(null) }}
          onSave={(activities) => saveHours(editorHours, activities)}
          onDelete={() => deleteHours(editorHours)}
          onAddCategory={categoryData.categories.length < CUSTOM_CATEGORY_MAX
            ? (onCreated) => setEditingCategory({ draft: blankCategory(categoryData), onCreated })
            : undefined}
        />
      )}
      {editingCategory && (
        <CategoryDialog
          draft={editingCategory.draft}
          data={categoryData}
          onClosed={() => setEditingCategory(null)}
          onSave={saveCategory}
          onDelete={deleteCategory}
        />
      )}
    </div>
    </CategoryContext.Provider>
  )
}

function Navigation({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  return <div className="nav-items">
    {NAV_ITEMS.map((item) => (
      <button key={item.id} type="button" className={`nav-item ${page === item.id ? 'nav-item-active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
        <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
        <span>{item.label}</span>
      </button>
    ))}
  </div>
}

function RecordPage({ date, display, data, goal, selection, showMultiHint, onSelectionChange, onPrevious, onNext, onToday, onOpenHours, onOpenReview, onOpenRoutine }: {
  date: string
  display: ReturnType<typeof displayDate>
  data: AppData
  goal: Goal | null
  selection: number[] | null
  showMultiHint: boolean
  onSelectionChange: Dispatch<SetStateAction<number[] | null>>
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onOpenHours: (hours: number[]) => void
  onOpenReview: () => void
  onOpenRoutine: () => void
}) {
  const { meta, order } = useCategories()
  const day = data.records[date] ?? {}
  const recordedHours = Object.keys(day).length
  const streak = isToday(date) ? recordingStreak(data.records, date) : 0
  const presence = categoryPresence(data.records, [date])
  const categories = presentCategories(presence, order)
  return <section className="record-page" aria-labelledby="record-title">
    <div className={`record-main ${selection ? 'record-main-selecting' : ''}`}>
      <DateHeader date={date} display={display} onPrevious={onPrevious} onNext={onNext} onToday={onToday} />
      {goal && <DdayChip goal={goal} onOpen={onOpenRoutine} />}
      <div className="record-summary-row">
        <p className="record-summary"><strong>{recordedHours}<span> / 24</span></strong><span>시간 기록</span>{streak >= 2 && <span className="record-streak">{streak}일 연속</span>}</p>
        <button className={`select-mode-button ${selection ? 'select-mode-button-active' : ''}`} type="button" aria-pressed={selection !== null} onClick={() => onSelectionChange(selection ? null : [])}>
          {selection ? '선택 끝내기' : '여러 칸 선택'}
        </button>
      </div>
      <HourGrid key={date} date={date} day={day} selection={selection} onSelectionChange={onSelectionChange} onOpenHours={onOpenHours} />
      {!selection && showMultiHint && <p className="grid-hint">칸을 길게 누른 채 끌면 여러 칸을 한 번에 기록할 수 있어요.</p>}
      {categories.length > 0 && <div className="record-categories">
        <ul aria-label="기록한 카테고리">
          {categories.map((category) => <li key={category} style={categoryStyle(meta, category)}>
            <CategoryIcon category={category} />
            <span>{meta(category).label}</span><span className="presence-count">{presence[category]}</span>
          </li>)}
        </ul>
        <button className="overview-link" type="button" onClick={onOpenReview}>하루 돌아보기 <span aria-hidden="true">→</span></button>
      </div>}
      {selection && <div className="selection-bar" role="region" aria-label="여러 칸 선택">
        <p aria-live="polite">{selection.length ? <><strong>{selection.length}칸</strong> 선택</> : '칸을 누르거나 끌어서 고르세요'}</p>
        <button className="ghost-button" type="button" onClick={() => onSelectionChange(null)}>취소</button>
        <button className="save-entry" type="button" disabled={!selection.length} onClick={() => onOpenHours(selection)}>기록하기</button>
      </div>}
    </div>
    <aside className="day-context" aria-label="선택한 날짜 요약">
      <DayOverview date={date} day={day} records={data.records} onOpenReview={onOpenReview} />
    </aside>
  </section>
}

function DdayChip({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const label = ddayLabel(goal, todayKey())
  return <div className="record-dday">
    <button type="button" className="dday-chip" onClick={onOpen} aria-label={`${goal.name} ${label}, 루틴 탭 열기`}>
      <span className="dday-chip-name">{goal.name}</span><strong>{label}</strong>
    </button>
  </div>
}

function DateHeader({ date, display, onPrevious, onNext, onToday }: {
  date: string
  display: ReturnType<typeof displayDate>
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}) {
  const headerRef = useRef<HTMLDivElement>(null)
  const swipeStart = useRef<{ pointerId: number; x: number; y: number; time: number } | null>(null)

  const resetSwipe = () => {
    const element = headerRef.current
    if (!element) return
    element.style.transition = 'transform 160ms var(--ease-in-out)'
    element.style.transform = 'translateX(0)'
    window.setTimeout(() => { element.style.transition = '' }, 160)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !event.isPrimary || (event.target as Element).closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.style.transition = 'none'
    swipeStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    if (!start || start.pointerId !== event.pointerId) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      event.currentTarget.style.transform = `translateX(${Math.max(-16, Math.min(16, deltaX))}px)`
    }
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || start.pointerId !== event.pointerId) return
    const amount = swipeDateAmount(event.clientX - start.x, event.clientY - start.y, performance.now() - start.time)
    resetSwipe()
    if (amount < 0) onPrevious()
    else if (amount > 0) onNext()
  }

  return <div
    ref={headerRef}
    className="date-header"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={() => { swipeStart.current = null; resetSwipe() }}
  >
    <div className="date-header-row">
      <button className="date-step" type="button" onClick={onPrevious} aria-label="이전 날짜"><span aria-hidden="true">←</span></button>
      <div className="date-copy">
        <h1 className="date-number" id="record-title">{display.number}</h1>
        <div className="date-meta">
          <span>{display.weekday}</span>
          <span className="date-meta-line">{date.slice(0, 4)}{!isToday(date) && <button className="today-link" type="button" onClick={onToday}>오늘로</button>}</span>
        </div>
      </div>
      <button className="date-step" type="button" onClick={onNext} aria-label="다음 날짜"><span aria-hidden="true">→</span></button>
    </div>
  </div>
}

const MEMO_SAVE_DELAY_MS = 400
const LONG_PRESS_MS = 420
const LONG_PRESS_SLOP = 8

function HourGrid({ date, day, selection, onSelectionChange, onOpenHours }: {
  date: string
  day: DayRecord
  selection: number[] | null
  onSelectionChange: Dispatch<SetStateAction<number[] | null>>
  onOpenHours: (hours: number[]) => void
}) {
  const { meta } = useCategories()
  const currentHour = isToday(date) ? new Date().getHours() : -1
  const gridRef = useRef<HTMLDivElement>(null)
  const press = useRef<{ pointerId: number; hour: number; x: number; y: number; timer: number } | null>(null)
  const drag = useRef<{ pointerId: number; anchor: number; base: Set<number>; adding: boolean } | null>(null)
  const suppressClick = useRef(false)
  const selected = new Set(selection ?? [])

  // Once a long-press turns into a drag, stop the page from scrolling under the finger.
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const onTouchMove = (event: TouchEvent) => { if (drag.current) event.preventDefault() }
    const onWindowPointerUp = () => {
      if (press.current) window.clearTimeout(press.current.timer)
      press.current = null
      drag.current = null
    }
    grid.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    return () => {
      grid.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
      if (press.current) window.clearTimeout(press.current.timer)
    }
  }, [])

  const hourAt = (x: number, y: number): number | null => {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-hour]')
    return cell && gridRef.current?.contains(cell) ? Number(cell.dataset.hour) : null
  }

  const applyRange = (hour: number) => {
    const current = drag.current
    if (!current) return
    const next = new Set(current.base)
    for (let h = Math.min(current.anchor, hour); h <= Math.max(current.anchor, hour); h += 1) {
      if (current.adding) next.add(h)
      else next.delete(h)
    }
    onSelectionChange([...next].sort((a, b) => a - b))
  }

  const startDrag = (pointerId: number, hour: number, base: number[]) => {
    const baseSet = new Set(base)
    drag.current = { pointerId, anchor: hour, base: baseSet, adding: !baseSet.has(hour) }
    applyRange(hour)
  }

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, hour: number) => {
    suppressClick.current = false
    if (!event.isPrimary || event.button > 0) return
    if (selection) {
      suppressClick.current = true
      startDrag(event.pointerId, hour, selection)
      return
    }
    const { pointerId, clientX, clientY } = event
    cancelPress()
    press.current = {
      pointerId, hour, x: clientX, y: clientY,
      timer: window.setTimeout(() => {
        press.current = null
        suppressClick.current = true
        navigator.vibrate?.(12)
        startDrag(pointerId, hour, [])
      }, LONG_PRESS_MS),
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pending = press.current
    if (pending && pending.pointerId === event.pointerId && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > LONG_PRESS_SLOP) cancelPress()
    if (drag.current?.pointerId !== event.pointerId) return
    const hour = hourAt(event.clientX, event.clientY)
    if (hour !== null) applyRange(hour)
  }

  const endPointer = () => {
    cancelPress()
    drag.current = null
  }

  const onCellClick = (hour: number) => {
    if (suppressClick.current) { suppressClick.current = false; return }
    if (!selection) { onOpenHours([hour]); return }
    // Keyboard activation in select mode toggles a single cell.
    onSelectionChange((current) => {
      if (!current) return current
      return current.includes(hour) ? current.filter((item) => item !== hour) : [...current, hour].sort((a, b) => a - b)
    })
  }

  return <div
    ref={gridRef}
    className={`hour-grid ${selection ? 'hour-grid-selecting' : ''}`}
    role="group"
    aria-label={`${date} 24시간 기록`}
    onPointerMove={onPointerMove}
    onPointerUp={endPointer}
    onPointerCancel={endPointer}
    onContextMenu={(event) => event.preventDefault()}
  >
    {hours().map((hour) => {
      const record = day[String(hour)]
      const segments: Activity[] = record ? [...record.segments] : []
      const categories = segments.map((activity) => meta(activity.category).label)
      const categoryLabel = categories.join(' · ')
      const descriptor = segments.length === 2 ? `함께 기록 ${categoryLabel}` : categoryLabel || '비어 있음'
      const isSelected = selected.has(hour)
      return <button
        key={hour}
        type="button"
        data-hour={hour}
        className={`hour-cell ${segments.length ? 'hour-cell-filled' : 'hour-cell-empty'} ${segments.length === 2 ? 'hour-cell-dual' : ''} ${currentHour === hour ? 'hour-cell-now' : ''} ${isSelected ? 'hour-cell-selected' : ''}`}
        style={{ ...(segments.length ? categoryPairStyle(meta, segments.map((activity) => activity.category)) : {}), '--i': hour } as StyleVars}
        aria-label={`${hourLabel(hour)}${currentHour === hour ? ' 지금' : ''} ${descriptor} ${selection ? (isSelected ? '선택됨' : '선택 안 됨') : segments.length ? '기록 수정' : '기록 추가'}`}
        aria-pressed={selection ? isSelected : undefined}
        aria-current={currentHour === hour ? 'time' : undefined}
        onPointerDown={(event) => onPointerDown(event, hour)}
        onClick={() => onCellClick(hour)}
      >
        <span className="hour-number">{pad(hour)}</span>
        {currentHour === hour && <span className="hour-now">지금</span>}
        {segments.length === 0 && <span className="hour-empty-mark" aria-hidden="true">+</span>}
        {segments.length === 1 && <CategoryIcon key={segments[0].category} category={segments[0].category} className="hour-icon" />}
        {segments.length === 2 && <>
          <span className="hour-icon-slot hour-icon-a" style={categoryStyle(meta, segments[0].category)}><CategoryIcon key={segments[0].category} category={segments[0].category} className="hour-icon" /></span>
          <span className="hour-icon-slot hour-icon-b" style={categoryStyle(meta, segments[1].category)}><CategoryIcon key={segments[1].category} category={segments[1].category} className="hour-icon" /></span>
        </>}
        {isSelected && <span className="hour-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m4 8.4 2.6 2.6L12 5.4" /></svg></span>}
      </button>
    })}
  </div>
}

const RING_RADIUS = 80
const RING_WIDTH = 15
const HOUR_GAP = 1.4
const SPLIT_GAP = 0.6

// `from`/`to` are in hours (e.g. 6.5 is the middle of the 06 slot); gaps are in degrees.
function arcPath(from: number, to: number, { center = 120, radius = RING_RADIUS, startGap = HOUR_GAP / 2, endGap = HOUR_GAP / 2 } = {}): string {
  const step = 360 / 24
  const start = (-90 + from * step + startGap) * Math.PI / 180
  const end = (-90 + to * step - endGap) * Math.PI / 180
  const x1 = center + radius * Math.cos(start)
  const y1 = center + radius * Math.sin(start)
  const x2 = center + radius * Math.cos(end)
  const y2 = center + radius * Math.sin(end)
  return `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`
}

function MiniRing({ day }: { day: DayRecord }) {
  const { meta } = useCategories()
  return <svg className="mini-ring" viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="12" fill="none" stroke="var(--ring-track)" strokeWidth="5" />
    {reviewHours(day).map(({ hour, activities }) => <path key={hour} d={arcPath(hour, hour + 1, { center: 16, radius: 12, startGap: 0, endGap: 0 })} fill="none" stroke={meta(activities[0].category).color} strokeWidth="5" />)}
  </svg>
}

function DayRing({ date, day, compact = false }: { date: string; day: DayRecord; compact?: boolean }) {
  const { meta } = useCategories()
  const entries = reviewHours(day)
  const count = entries.length
  const titleId = `ring-title-${date}-${compact ? 'compact' : 'full'}`
  const markerLabels = [
    { label: '00', x: 120, y: 13, anchor: 'middle' },
    { label: '06', x: 227, y: 120, anchor: 'end' },
    { label: '12', x: 120, y: 232, anchor: 'middle' },
    { label: '18', x: 13, y: 120, anchor: 'start' },
  ] as const

  return <svg key={date} className={`day-ring ${compact ? 'day-ring-compact' : ''}`} viewBox="0 0 240 240" role="img" aria-labelledby={titleId}>
    <title id={titleId}>{displayDate(date).compact} · {count}시간 기록</title>
    <desc>자정부터 시계 방향으로 한 시간씩 표시한 24시간 기록입니다. 함께 기록한 활동은 한 시간 칸을 반씩 나눠 나타냅니다.</desc>
    {hours().map((hour) => <path key={`track-${hour}`} d={arcPath(hour, hour + 1)} fill="none" stroke="var(--ring-track)" strokeWidth={RING_WIDTH} />)}
    {entries.map(({ hour, activities }) => activities.length === 2
      ? <g key={`hour-${hour}`} className="ring-arc" style={{ '--i': hour } as StyleVars}>
          <path d={arcPath(hour, hour + 0.5, { endGap: SPLIT_GAP / 2 })} fill="none" stroke={meta(activities[0].category).color} strokeWidth={RING_WIDTH} />
          <path d={arcPath(hour + 0.5, hour + 1, { startGap: SPLIT_GAP / 2 })} fill="none" stroke={meta(activities[1].category).color} strokeWidth={RING_WIDTH} />
        </g>
      : <path key={`hour-${hour}`} className="ring-arc" style={{ '--i': hour } as StyleVars} d={arcPath(hour, hour + 1)} fill="none" stroke={meta(activities[0].category).color} strokeWidth={RING_WIDTH} />)}
    <circle cx="120" cy="120" r="53" fill="var(--surface-raised)" />
    <text x="120" y="122" textAnchor="middle" className="ring-center-date">{count}</text>
    <text x="120" y="142" textAnchor="middle" className="ring-center-count">시간 기록</text>
    {markerLabels.map(({ label, x, y, anchor }) => <text key={label} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="ring-marker">{label}</text>)}
  </svg>
}

function DayOverview({ date, day, records, onOpenReview }: { date: string; day: DayRecord; records: AppData['records']; onOpenReview: () => void }) {
  const { meta, order } = useCategories()
  const presence = categoryPresence(records, [date])
  const categories = presentCategories(presence, order)
  return <div className="day-overview">
    <h2 className="overview-heading">{reviewRangeLabel(date, 'day', [date])}</h2>
    <DayRing date={date} day={day} compact />
    {categories.length ? <ul className="overview-categories" aria-label="기록한 카테고리">
      {categories.map((category) => <li key={category}>
        <span className="legend-icon" style={categoryStyle(meta, category)}><CategoryIcon category={category} /></span>
        <span>{meta(category).label}</span><span className="presence-count">{presence[category]}시간</span>
      </li>)}
    </ul> : <p className="overview-empty">기록을 남기면 이곳에 하루의 흐름이 보여요.</p>}
    <button className="overview-link" type="button" onClick={onOpenReview}>하루 돌아보기 <span aria-hidden="true">→</span></button>
  </div>
}

function CategoryLegend({ presence }: { presence: Record<CategoryId, number> }) {
  const { meta, order } = useCategories()
  const present = presentCategories(presence, order)
  if (!present.length) return <p className="review-empty">아직 돌아볼 기록이 없어요.</p>
  return <ul className="category-legend" aria-label="기록한 카테고리">
    {present.map((category) => <li key={category}>
      <span className="legend-icon" style={categoryStyle(meta, category)}><CategoryIcon category={category} /></span>
      <span>{meta(category).label}</span><span>{presence[category]}시간</span>
    </li>)}
  </ul>
}

function ReviewPage({ date, data, routineData, mode, onModeChange, onPrevious, onNext, onSelectDate, onOpenMonth }: {
  date: string
  data: AppData
  routineData: RoutineData
  mode: ReviewMode
  onModeChange: (mode: ReviewMode) => void
  onPrevious: () => void
  onNext: () => void
  onSelectDate: (date: string) => void
  onOpenMonth: (date: string) => void
}) {
  const dates = mode === 'year' ? [] : reviewDates(date, mode)
  const rangeLabel = mode === 'year' ? '최근 1년' : reviewRangeLabel(date, mode, dates)
  const modes: ReviewMode[] = ['day', 'week', 'month', 'year']
  const tabLabels: Record<ReviewMode, string> = { day: '하루', week: '7일', month: '월', year: '1년' }

  return <section className="section-page review-page" aria-labelledby="review-title">
    <h1 id="review-title" className="visually-hidden">돌아보기</h1>
    <div className="review-tabs" role="tablist" aria-label="돌아보기 범위" onKeyDown={(event) => {
      const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!direction) return
      event.preventDefault()
      const next = modes[(modes.indexOf(mode) + direction + modes.length) % modes.length]
      onModeChange(next)
      event.currentTarget.querySelector<HTMLButtonElement>(`#review-tab-${next}`)?.focus()
    }}>
      {modes.map((item) => <button key={item} id={`review-tab-${item}`} type="button" role="tab" aria-selected={mode === item} aria-controls="review-panel" tabIndex={mode === item ? 0 : -1} className={mode === item ? 'review-tab review-tab-active' : 'review-tab'} onClick={() => onModeChange(item)}>{tabLabels[item]}</button>)}
    </div>
    <div className="range-controls" aria-label={`${tabLabels[mode]} 범위 이동`}>
      {mode !== 'year' && <button className="step-control" type="button" onClick={onPrevious} aria-label={`이전 ${tabLabels[mode]}`}><span aria-hidden="true">‹</span></button>}
      <p aria-live="polite">{rangeLabel}</p>
      {mode !== 'year' && <button className="step-control" type="button" onClick={onNext} aria-label={`다음 ${tabLabels[mode]}`}><span aria-hidden="true">›</span></button>}
    </div>
    <div id="review-panel" className="review-panel" role="tabpanel" aria-labelledby={`review-tab-${mode}`} key={`${mode}-${dates[0] ?? ''}`}>
      {mode === 'year'
        ? <YearReview records={data.records} routineData={routineData} onSelectDate={onSelectDate} onOpenMonth={onOpenMonth} />
        : mode === 'day'
        ? <DayReview date={date} day={data.records[date] ?? {}} routineData={routineData} />
        : <RangeReview records={data.records} routineData={routineData} dates={dates} previousDates={reviewDates(mode === 'week' ? shiftDate(date, -7) : shiftMonth(date, -1), mode)} mode={mode} onSelectDate={onSelectDate} />}
    </div>
  </section>
}

function YearReview({ records, routineData, onSelectDate, onOpenMonth }: { records: AppData['records']; routineData: RoutineData; onSelectDate: (date: string) => void; onOpenMonth: (date: string) => void }) {
  const today = todayKey()
  const days = heatDays(records, routineData, today)
  const summary = heatSummary(days)
  return <section className="range-review" aria-label="1년 돌아보기">
    <dl className="range-stats">
      <div><dt>기록한 날</dt><dd>{summary.recordedDays}<span>일</span></dd></div>
      <div><dt>하루 평균</dt><dd>{summary.average}<span>시간</span></dd></div>
      <div><dt>최장 연속</dt><dd>{summary.longestRun}<span>일</span></dd></div>
    </dl>
    <YearHeatmap days={days} today={today} onSelectDate={onSelectDate} />
    {summary.recordedDays > 0 && <MonthBars days={days} onOpenMonth={onOpenMonth} />}
  </section>
}

function MonthBars({ days, onOpenMonth }: { days: HeatDay[]; onOpenMonth: (date: string) => void }) {
  const months = heatMonths(days)
  const peak = Math.max(...months.map((month) => month.average))
  const peakMonth = months.find((month) => month.average === peak)
  return <section className="range-card" aria-labelledby="month-bars-title">
    <div className="range-card-heading"><h2 id="month-bars-title">월별 기록</h2><span>하루 평균 · 누르면 그달로 가요</span></div>
    <div className="month-bars">
      {months.map((month, index) => {
        const number = Number(month.month.slice(5))
        const isPeak = month === peakMonth
        return <button
          key={month.month}
          type="button"
          className="month-bar"
          data-peak={isPeak ? '' : undefined}
          style={{ '--i': index, '--fill': peak ? month.average / peak : 0 } as StyleVars}
          aria-label={`${month.month.slice(0, 4)}년 ${number}월, 하루 평균 ${month.average}시간 기록. 월 돌아보기 열기`}
          onClick={() => onOpenMonth(month.last)}
        >
          <span className="month-bar-value" aria-hidden="true">{isPeak ? month.average : ''}</span>
          <span className="month-bar-track" aria-hidden="true"><span /></span>
          <span className="month-bar-label" aria-hidden="true">{number}</span>
        </button>
      })}
    </div>
  </section>
}

function YearHeatmap({ days, today, onSelectDate }: { days: HeatDay[]; today: string; onSelectDate: (date: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const weeks = heatWeeks(days)
  const months = heatMonthLabels(weeks)
  const completeDays = days.filter((day) => day.complete).length
  // Open on the latest weeks; older ones are a swipe to the left.
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  }, [])
  return <section className="range-card heatmap-card" aria-labelledby="heatmap-title">
    <div className="range-card-heading">
      <h2 id="heatmap-title">1년 잔디</h2>
      {completeDays > 0 && <span>루틴 완료 {completeDays}일</span>}
    </div>
    <div className="heatmap">
      <div className="heatmap-weekdays" aria-hidden="true">
        {WEEKDAYS_SHORT.map((weekday, index) => <span key={weekday}>{index % 2 ? weekday : ''}</span>)}
      </div>
      <div className="heatmap-scroll" ref={scrollRef}>
        <div className="heatmap-months" aria-hidden="true">
          {months.map(({ week, month }) => <span key={`${week}-${month}`} style={{ gridColumn: week + 1 }}>{month}월</span>)}
        </div>
        <div className="heatmap-grid">
          {weeks.map((week, column) => <div key={column} className="heatmap-week" style={{ '--i': weeks.length - 1 - column } as StyleVars}>
            {week.map((day, row) => {
              if (!day) return <span key={row} className="heatmap-day heatmap-day-blank" aria-hidden="true" />
              const date = parseDateKey(day.date) ?? new Date()
              return <button
                key={day.date}
                type="button"
                className="heatmap-day"
                data-level={day.level}
                data-complete={day.complete ? '' : undefined}
                aria-current={day.date === today ? 'date' : undefined}
                aria-label={`${monthDayLabel(day.date)} ${WEEKDAYS_SHORT[date.getDay()]}요일, ${day.hours ? `${day.hours}시간 기록` : '기록 없음'}${day.complete ? ', 루틴 모두 완료' : ''}. 기록 열기`}
                onClick={() => onSelectDate(day.date)}
              ><span /></button>
            })}
          </div>)}
        </div>
      </div>
    </div>
    <div className="heatmap-legend" aria-hidden="true">
      <span>적게</span>
      {([0, 1, 2, 3, 4] as const).map((level) => <span key={level} className="heatmap-day" data-level={level}><span /></span>)}
      <span>많이</span>
      <span className="heatmap-legend-dot"><span className="heatmap-day" data-level={0} data-complete=""><span /></span>루틴 완료</span>
    </div>
  </section>
}

function DayReview({ date, day, routineData }: { date: string; day: DayRecord; routineData: RoutineData }) {
  const { meta } = useCategories()
  const routines = dayProgress(routineData, date)
  const blocks = timeBlocks(day)
  const count = Object.keys(day).length
  const presence = categoryPresence({ [date]: day }, [date])
  const titleId = `activities-title-${date}`
  return <div className="day-review-layout">
    <section className="ring-panel" aria-label="24시간 기록">
      <DayRing date={date} day={day} />
      <CategoryLegend presence={presence} />
      {routines.total > 0 && <p className="review-routine-line" data-complete={routines.done === routines.total ? '' : undefined}>
        루틴 <strong>{routines.done}/{routines.total}</strong> 완료
      </p>}
    </section>
    <section className="activity-review" aria-labelledby={titleId}>
      <div className="subsection-heading"><h2 id={titleId}>하루 흐름</h2><span>{count}시간 기록</span></div>
      {blocks.length ? <ol className="timeline">
        {blocks.map((block, index) => {
          const span = block.end - block.start
          if (block.kind === 'gap') return <li className="timeline-gap" key={`gap-${block.start}`} style={{ '--i': index } as StyleVars}>
            <time className="timeline-time">{formatRangeTime(block.start * 60)}</time>
            <span className="timeline-gap-label">기록 없음 · {span}시간</span>
          </li>
          const labels = block.categories.map((category) => meta(category).label).join(' · ')
          return <li className="timeline-block" key={`block-${block.start}`} style={{ ...categoryPairStyle(meta, block.categories), '--span': span, '--i': index } as StyleVars}>
            <time className="timeline-time">{formatRangeTime(block.start * 60)}<span>{formatRangeTime(block.end * 60)}</span></time>
            <div className={`timeline-card ${block.categories.length === 2 ? 'timeline-card-dual' : ''}`}>
              <div className="timeline-title">
                <span className="timeline-icons">{block.categories.map((category, iconIndex) => <span key={`${category}-${iconIndex}`} className="legend-icon" style={categoryStyle(meta, category)}><CategoryIcon category={category} /></span>)}</span>
                <strong>{labels}</strong>
                <span className="timeline-duration">{span}시간</span>
              </div>
              {block.notes.length > 0 && <ul className="timeline-notes">
                {block.notes.map((note, noteIndex) => <li key={`${note.hour}-${noteIndex}`}>{span > 1 && <span>{pad(note.hour)}시</span>}{note.text}</li>)}
              </ul>}
            </div>
          </li>
        })}
      </ol> : <p className="activity-empty">이 날짜에는 아직 기록이 없어요.</p>}
    </section>
  </div>
}

function RangeReview({ records, routineData, dates, previousDates, mode, onSelectDate }: { records: AppData['records']; routineData: RoutineData; dates: string[]; previousDates: string[]; mode: 'week' | 'month'; onSelectDate: (date: string) => void }) {
  const { meta, order } = useCategories()
  const total = recordedHourCount(records, dates)
  const recordedDays = dates.filter((date) => Object.keys(records[date] ?? {}).length > 0).length
  const presence = categoryPresence(records, dates)
  const present = presentCategories(presence, order)
  const presenceTotal = present.reduce((sum, category) => sum + presence[category], 0)
  return <section className="range-review" aria-label={mode === 'week' ? '7일 돌아보기' : '월 돌아보기'}>
    <dl className="range-stats">
      <div><dt>기록한 시간</dt><dd>{total}<span>시간</span></dd></div>
      <div><dt>기록한 날</dt><dd>{recordedDays}<span>/ {dates.length}일</span></dd></div>
      <div><dt>하루 평균</dt><dd>{recordedDays ? Math.round(total / recordedDays * 10) / 10 : 0}<span>시간</span></dd></div>
    </dl>
    {present.length ? <>
      <RangeInsights records={records} dates={dates} previousDates={previousDates} mode={mode} />
      <section className="range-card" aria-labelledby="share-title">
        <h2 id="share-title">무엇을 했나요</h2>
        <div className="share-bar" aria-hidden="true">
          {present.map((category) => <span key={category} style={{ ...categoryStyle(meta, category), flexGrow: presence[category] }} />)}
        </div>
        <ul className="share-list">
          {present.map((category) => <li key={category} style={categoryStyle(meta, category)}>
            <CategoryIcon category={category} />
            <span className="share-label">{meta(category).label}</span>
            <strong>{presence[category]}시간</strong>
            <span className="share-percent">{Math.round(presence[category] / presenceTotal * 100)}%</span>
          </li>)}
        </ul>
      </section>
      <section className="range-card" aria-labelledby="matrix-title">
        <div className="range-card-heading"><h2 id="matrix-title">시간표</h2><span>줄을 누르면 그날 기록으로 가요</span></div>
        <HourMatrix records={records} dates={dates} mode={mode} onSelectDate={onSelectDate} />
      </section>
    </> : <p className="activity-empty">이 기간에는 아직 기록이 없어요.</p>}
    <RoutineRates routineData={routineData} dates={dates} />
  </section>
}

function RangeInsights({ records, dates, previousDates, mode }: { records: AppData['records']; dates: string[]; previousDates: string[]; mode: 'week' | 'month' }) {
  const { meta } = useCategories()
  const changes = categoryChanges(records, dates, previousDates)
  if (!changes.length) return null
  return <section className="range-card insight-card" aria-label="지난 기간과 비교">
    <ul className="insight-list">
      {changes.map(({ category, minutes }, index) => {
        const { label } = meta(category)
        return <li key={category} style={{ ...categoryStyle(meta, category), '--i': index } as StyleVars}>
          <span className="legend-icon"><CategoryIcon category={category} /></span>
          <p>{mode === 'week' ? '지난 7일보다' : '지난달보다'} {label}{subjectParticle(label)} 하루 평균 <strong>{formatMinutes(minutes)}</strong> {minutes > 0 ? '늘었어요' : '줄었어요'}</p>
          <span className={`insight-trend ${minutes > 0 ? 'insight-up' : 'insight-down'}`} aria-hidden="true">{minutes > 0 ? '↑' : '↓'}</span>
        </li>
      })}
    </ul>
  </section>
}

function RoutineRates({ routineData, dates }: { routineData: RoutineData; dates: string[] }) {
  const rates = routineRates(routineData, dates, todayKey())
  if (!rates.length) return null
  return <section className="range-card" aria-labelledby="routine-rates-title">
    <h2 id="routine-rates-title">루틴 달성</h2>
    <ul className="rate-list">
      {rates.map(({ routine, done, total }, index) => {
        const percent = Math.round(done / total * 100)
        return <li key={routine.id} style={{ '--category': ROUTINE_COLORS[routine.color], '--i': index } as StyleVars}>
          <span className="rate-icon"><RoutineIcon icon={routine.icon} /></span>
          <div className="rate-body">
            <p><span className="rate-name">{routine.name}</span><span className="rate-count">{done}/{total} · <strong>{percent}%</strong></span></p>
            <span className="rate-track" aria-hidden="true"><span style={{ transform: `scaleX(${done / total})` }} /></span>
          </div>
        </li>
      })}
    </ul>
  </section>
}

function HourMatrix({ records, dates, mode, onSelectDate }: { records: AppData['records']; dates: string[]; mode: 'week' | 'month'; onSelectDate: (date: string) => void }) {
  const { meta } = useCategories()
  return <div className={`hour-matrix hour-matrix-${mode}`}>
    <div className="matrix-axis" aria-hidden="true">
      {[0, 6, 12, 18].map((hour) => <span key={hour} style={{ gridColumn: hour + 2 }}>{pad(hour)}</span>)}
    </div>
    {dates.map((key, index) => {
      const day = records[key] ?? {}
      const date = parseDateKey(key) ?? new Date()
      const weekday = date.getDay()
      return <button key={key} type="button" className="matrix-row" style={{ '--i': index } as StyleVars} onClick={() => onSelectDate(key)} aria-label={`${monthDayLabel(key)} ${WEEKDAYS_SHORT[weekday]}요일, ${Object.keys(day).length}시간 기록. 기록 열기`}>
        <span className={`matrix-label ${weekday === 0 ? 'weekday-sun' : weekday === 6 ? 'weekday-sat' : ''} ${isToday(key) ? 'matrix-label-today' : ''}`}>
          {mode === 'week' && <span>{WEEKDAYS_SHORT[weekday]}</span>}{date.getDate()}
        </span>
        {hours().map((hour) => {
          const record = day[String(hour)]
          const categories = record?.segments.map((activity) => activity.category) ?? []
          return <span key={hour} className={`matrix-cell ${categories.length === 2 ? 'matrix-cell-dual' : ''}`} style={categories.length ? categoryPairStyle(meta, categories) : undefined} data-filled={categories.length ? '' : undefined} />
        })}
      </button>
    })}
  </div>
}

function CalendarPage({ cursor, selectedDate, data, routineData, onPrevious, onNext, onSelectDate }: {
  cursor: Date
  selectedDate: string
  data: AppData
  routineData: RoutineData
  onPrevious: () => void
  onNext: () => void
  onSelectDate: (date: string) => void
}) {
  const cells = monthGrid(cursor)
  const monthPrefix = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`
  const recordedDays = Object.entries(data.records).filter(([key, day]) => key.startsWith(monthPrefix) && Object.keys(day).length > 0).length
  return <section className="section-page calendar-page" aria-labelledby="calendar-title">
    <header className="page-header">
      <div>
        <h1 id="calendar-title">{monthTitle(cursor)}</h1>
        <p className="page-header-meta">{recordedDays}일 기록</p>
      </div>
      <div className="month-controls" aria-label="월 이동">
        <button className="step-control" type="button" onClick={onPrevious} aria-label="이전 달"><span aria-hidden="true">‹</span></button>
        <button className="step-control" type="button" onClick={onNext} aria-label="다음 달"><span aria-hidden="true">›</span></button>
      </div>
    </header>
    <div className="calendar-grid calendar-weekdays" aria-hidden="true">{WEEKDAYS_SHORT.map((weekday, index) => <span key={weekday} className={index === 0 ? 'weekday-sun' : index === 6 ? 'weekday-sat' : ''}>{weekday}</span>)}</div>
    <div className="calendar-grid calendar-days" key={monthPrefix}>
      {cells.map((date, index) => {
        if (!date) return <span className="calendar-empty" key={`empty-${index}`} aria-hidden="true" />
        const key = dateKey(date)
        const day = data.records[key] ?? {}
        const count = Object.keys(day).length
        const current = key === selectedDate
        const today = isToday(key)
        const weekday = date.getDay()
        const routinesDone = dayComplete(routineData, key)
        return <button
          type="button"
          className={`calendar-day ${current ? 'calendar-day-selected' : ''} ${today ? 'calendar-day-today' : ''}`}
          key={key}
          style={{ '--i': index } as StyleVars}
          aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS_SHORT[weekday]}요일${count ? `, ${count}시간 기록` : ', 기록 없음'}${routinesDone ? ', 루틴 모두 완료' : ''}`}
          aria-pressed={current}
          aria-current={today ? 'date' : undefined}
          onClick={() => onSelectDate(key)}
        >
          <span className={`calendar-date ${weekday === 0 ? 'weekday-sun' : weekday === 6 ? 'weekday-sat' : ''}`}>{date.getDate()}</span>
          {count > 0 ? <MiniRing day={day} /> : <span className="mini-ring-empty" aria-hidden="true" />}
          {routinesDone && <span className="routine-dot" aria-hidden="true" />}
        </button>
      })}
    </div>
    <MonthSummary records={data.records} dates={monthDays(cursor).map(dateKey)} />
  </section>
}

function MonthSummary({ records, dates }: { records: AppData['records']; dates: string[] }) {
  const { meta, order } = useCategories()
  const presence = categoryPresence(records, dates)
  const present = presentCategories(presence, order)
  if (!present.length) return null
  const total = recordedHourCount(records, dates)
  return <section className="range-card month-summary" aria-labelledby="month-summary-title">
    <div className="range-card-heading"><h2 id="month-summary-title">이번 달 한눈에</h2><span>{total}시간 기록</span></div>
    <div className="share-bar" aria-hidden="true">
      {present.map((category) => <span key={category} style={{ ...categoryStyle(meta, category), flexGrow: presence[category] }} />)}
    </div>
    <ul className="month-summary-legend">
      {present.map((category) => <li key={category}>
        <span className="legend-icon" style={categoryStyle(meta, category)}><CategoryIcon category={category} /></span>
        {meta(category).label} <strong>{presence[category]}</strong>
      </li>)}
    </ul>
  </section>
}

function SettingsPage({ data, routineData, categoryData, reminderData, onRemindersChange, onAddCategory, onEditCategory, theme, clearArmed, onThemeChange, onImport, onNotice, onArmClear, onCancelClear, onClear }: {
  data: AppData
  routineData: RoutineData
  categoryData: CategoryData
  reminderData: ReminderData
  onRemindersChange: (next: ReminderData) => boolean
  onAddCategory: () => void
  onEditCategory: (category: CustomCategory) => void
  theme: ThemeMode
  clearArmed: boolean
  onThemeChange: (theme: ThemeMode) => void
  onImport: (data: AppData, routineData: RoutineData | null, categoryData: CategoryData | null) => void
  onNotice: (notice: NoticeContent) => void
  onArmClear: () => void
  onCancelClear: () => void
  onClear: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const dateCount = Object.values(data.records).filter((day) => Object.keys(day).length > 0).length
  const hourCount = recordedHourCount(data.records, Object.keys(data.records))
  const exportData = async () => {
    const fileName = `girok-backup-${todayKey()}.json`
    const json = JSON.stringify(backupFile(data, routineData, categoryData), null, 2)
    if (isNative) {
      try {
        const result = await shareBackup(fileName, json)
        if (result === 'shared') onNotice({ text: '백업 파일을 저장했어요.', kind: 'success' })
      } catch {
        onNotice({ text: '백업 파일을 만들지 못했어요.', kind: 'error' })
      }
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    onNotice({ text: '백업 파일을 내려받았어요.', kind: 'success' })
  }
  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 20_000_000) { onNotice({ text: '20MB보다 작은 JSON 파일만 가져올 수 있어요.', kind: 'error' }); return }
    const result = parseImportedData(await file.text())
    if ('error' in result) { onNotice({ text: result.error, kind: 'error' }); return }
    const importedDays = Object.keys(result.data.records).length
    if (dateCount > 0 && !window.confirm(`현재 기록(${dateCount}일)을 백업 파일의 기록(${importedDays}일)으로 모두 바꿀까요? 이 작업은 되돌릴 수 없어요.`)) return
    onImport(result.data, result.routineData, result.categoryData)
  }

  return <section className="section-page settings-page" aria-labelledby="settings-title">
    <header className="page-header"><h1 id="settings-title">설정</h1></header>
    <div className="settings-stack">
      <section className="setting-section" aria-labelledby="appearance-title">
        <div className="setting-heading"><div><h2 id="appearance-title">화면</h2><p>눈에 편한 분위기를 선택해요.</p></div></div>
        <div className="theme-options" role="radiogroup" aria-label="화면 테마">
          {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => <label key={mode} className={`theme-option ${theme === mode ? 'theme-option-selected' : ''}`}>
            <input className="visually-hidden" type="radio" name="theme-mode" value={mode} checked={theme === mode} onChange={() => onThemeChange(mode)} />
            <span className={`theme-swatch theme-swatch-${mode}`} aria-hidden="true" />
            <span>{mode === 'system' ? '기기 설정' : mode === 'light' ? '밝게' : '어둡게'}</span>
          </label>)}
        </div>
      </section>
      <ReminderSettings data={reminderData} onChange={onRemindersChange} />
      <CategorySettings data={categoryData} records={data.records} onAdd={onAddCategory} onEdit={onEditCategory} />
      <section className="setting-section" aria-labelledby="backup-title">
        <div className="setting-heading">
          <div><h2 id="backup-title">데이터 백업</h2><p>기록은 {isNative ? '이 앱' : '이 기기의 브라우저'}에만 저장돼요. 중요한 기록은 가끔 백업해 두세요.</p></div>
          <span className="setting-count">{dateCount}일 · {hourCount}시간{routineData.routines.length > 0 && ` · 루틴 ${routineData.routines.length}개`}</span>
        </div>
        <div className="setting-actions">
          <button className="outline-button" type="button" onClick={exportData}>백업 파일 내보내기</button>
          <button className="outline-button" type="button" onClick={() => fileInput.current?.click()}>백업 파일 가져오기</button>
          <input ref={fileInput} className="visually-hidden" type="file" tabIndex={-1} accept="application/json,.json" aria-label="가져올 백업 파일 선택" onChange={importData} />
        </div>
        <p className="setting-hint">girok 백업 파일이 아니면 가져오지 않으니 안심하세요.</p>
      </section>
      <section className="setting-section setting-danger" aria-labelledby="danger-title">
        <div className="setting-heading"><div><h2 id="danger-title">기록 삭제</h2><p>모든 날짜의 기록과 루틴, 목표를 {isNative ? '이 앱' : '이 브라우저'}에서 삭제해요.</p></div></div>
        {!clearArmed
          ? <button className="danger-button" type="button" onClick={onArmClear}>모든 기록 삭제</button>
          : <div className="clear-confirm" role="alert"><p>모든 기록을 영구 삭제할까요? 한 번 더 확인이 필요해요.</p><div className="clear-actions">
              <button className="ghost-button" type="button" onClick={onCancelClear}>돌아가기</button>
              <button className="danger-button" type="button" onClick={onClear}>영구 삭제</button>
            </div></div>}
      </section>
    </div>
  </section>
}

function NoticeToast({ notice, onDismiss }: { notice: Notice; onDismiss: (id: number) => void }) {
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    const exit = window.setTimeout(() => setClosing(true), 2860)
    const dismiss = window.setTimeout(() => onDismiss(notice.id), 3000)
    return () => { window.clearTimeout(exit); window.clearTimeout(dismiss) }
  }, [notice.id])
  return <div className={`notice notice-${notice.kind}`} data-closing={closing || undefined} role="status" aria-live="polite">{notice.text}</div>
}

function EntryDialog({ date, hours: selectedHours, records, onClose, onSave, onDelete, onAddCategory }: {
  date: string
  hours: number[]
  records: Array<HourRecord | undefined>
  onClose: (changed: boolean) => void
  onSave: (activities: Activity[]) => boolean
  onDelete: () => boolean
  // Undefined once the custom category limit is reached.
  onAddCategory?: (onCreated: (id: string) => void) => void
}) {
  const { meta, order } = useCategories()
  // Prefill only when every selected hour holds the same record; otherwise start blank.
  const record = records.every((item) => JSON.stringify(item) === JSON.stringify(records[0])) ? records[0] : undefined
  const hasRecord = records.some(Boolean)
  const multiple = selectedHours.length > 1
  const hourKey = selectedHours.join('-')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const closingRef = useRef(false)
  const changedRef = useRef(false)
  const pressedBackdrop = useRef(false)
  const [primary, setPrimary] = useState<DraftActivity>(() => record?.segments[0] ? { ...record.segments[0] } : { category: null, text: '' })
  const [secondary, setSecondary] = useState<DraftActivity>(() => record?.segments[1] ? { ...record.segments[1] } : { category: null, text: '' })
  const [memoVisible, setMemoVisible] = useState(Boolean(record?.segments.some((activity) => activity.text)))
  const [secondaryVisible, setSecondaryVisible] = useState(Boolean(record?.segments[1]))
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first radio, whose focus ring reads as a second selection.
      titleRef.current?.focus()
    }
    return () => {
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
      if (memoTimer.current !== undefined) window.clearTimeout(memoTimer.current)
    }
  }, [])

  // Each save re-validates and rewrites all records, so memo typing is saved once the user pauses.
  const memoTimer = useRef<number | undefined>(undefined)
  const pendingMemo = useRef<(() => void) | null>(null)
  const cancelMemo = () => {
    if (memoTimer.current !== undefined) window.clearTimeout(memoTimer.current)
    memoTimer.current = undefined
    pendingMemo.current = null
  }
  const flushMemo = () => {
    const run = pendingMemo.current
    cancelMemo()
    run?.()
  }
  const persistMemoLater = (nextPrimary: DraftActivity, nextSecondary: DraftActivity, showSecondary: boolean) => {
    cancelMemo()
    pendingMemo.current = () => persist(nextPrimary, nextSecondary, showSecondary)
    memoTimer.current = window.setTimeout(flushMemo, MEMO_SAVE_DELAY_MS)
  }

  const persist = (nextPrimary: DraftActivity, nextSecondary: DraftActivity, showSecondary = secondaryVisible): boolean => {
    if (!nextPrimary.category) return true
    const activities: Activity[] = [{ category: nextPrimary.category, text: nextPrimary.text }]
    if (showSecondary && nextSecondary.category) activities.push({ category: nextSecondary.category, text: nextSecondary.text })
    const saved = onSave(activities)
    if (saved) changedRef.current = true
    setSaveFailed(!saved)
    return saved
  }

  const close = () => {
    const dialog = dialogRef.current
    if (!dialog?.open || closingRef.current) return
    flushMemo()
    closingRef.current = true
    setClosingAttribute()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 140 : window.matchMedia('(max-width: 719px)').matches ? 180 : 160
    // Unmount from the timer rather than the dialog's close event, which some embedded browsers defer.
    closeTimer.current = window.setTimeout(() => { dialog.close(); onClose(changedRef.current) }, duration)
  }

  const setClosingAttribute = () => dialogRef.current?.setAttribute('data-closing', '')
  const submit = (event: FormEvent) => { event.preventDefault(); close() }
  const chooseCategory = (slot: 1 | 2, category: CategoryId) => {
    // The category save below carries the latest memo text, so a pending memo save is redundant.
    cancelMemo()
    if (slot === 1) {
      const next = { ...primary, category }
      setPrimary(next)
      persist(next, secondary)
    } else {
      const next = { ...secondary, category }
      setSecondary(next)
      persist(primary, next, true)
    }
  }
  const categoryOptions = (slot: 1 | 2, selected: CategoryId | null) => <div className="category-options">
    {order.map((category) => <label key={category} className={`category-option ${selected === category ? 'category-option-selected' : ''}`} style={categoryStyle(meta, category)}>
      <input className="visually-hidden" type="radio" name={`entry-category-${date}-${hourKey}-${slot}`} value={category} checked={selected === category} onChange={() => chooseCategory(slot, category)} />
      <CategoryIcon category={category} /><span>{meta(category).label}</span>
    </label>)}
    {onAddCategory && <button type="button" className="category-option category-option-add" onClick={() => onAddCategory((id) => chooseCategory(slot, id))}>
      <span aria-hidden="true">+</span>추가
    </button>}
  </div>

  const titleId = `entry-dialog-title-${date}-${hourKey}`
  return <dialog
    ref={dialogRef}
    className="entry-dialog"
    // A pointer whose target is the <dialog> itself is on the backdrop, since the form fills the sheet.
    // Require both press and release there so a drag that starts inside (e.g. selecting memo text) never dismisses.
    onPointerDown={(event) => { pressedBackdrop.current = event.target === event.currentTarget }}
    onClick={(event) => { if (pressedBackdrop.current && event.target === event.currentTarget) close() }}
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close() }}
  >
    <form className="entry-form" onSubmit={submit}>
      <header className="dialog-heading"><div><span className="eyebrow">{displayDate(date).compact}{multiple && ` · ${selectedHours.length}시간`}</span><h2 id={titleId} ref={titleRef} tabIndex={-1}>{hoursLabel(selectedHours)}</h2>{multiple && !isContiguous(selectedHours) && <p className="dialog-hours">{selectedHours.map(pad).join(', ')}시</p>}{multiple && hasRecord && !record && <p className="dialog-hours">고르면 선택한 칸의 기존 기록을 모두 바꿔요.</p>}</div></header>
      <fieldset className="activity-fieldset">
        <legend>{secondaryVisible ? '활동 1' : '무슨 일을 했나요?'}</legend>
        {categoryOptions(1, primary.category)}
        {memoVisible
          ? <label className="memo-field" htmlFor={`entry-memo-${date}-${hourKey}-1`}><span className="memo-label">메모{multiple && <span className="memo-note"> · 선택한 {selectedHours.length}칸에 모두 들어가요</span>}</span><textarea id={`entry-memo-${date}-${hourKey}-1`} className="memo-input" value={primary.text} maxLength={500} placeholder="무엇을 했나요?" onChange={(event) => { const next = { ...primary, text: event.target.value }; setPrimary(next); persistMemoLater(next, secondary, secondaryVisible) }} /></label>
          : primary.category && <button className="editor-option" type="button" onClick={() => setMemoVisible(true)}>+ 메모 추가</button>}
      </fieldset>
      {secondaryVisible && <fieldset className="activity-fieldset activity-fieldset-secondary">
        <legend>활동 2</legend>
        {categoryOptions(2, secondary.category)}
        {memoVisible && secondary.category && <label className="memo-field" htmlFor={`entry-memo-${date}-${hourKey}-2`}><span className="memo-label">메모</span><textarea id={`entry-memo-${date}-${hourKey}-2`} className="memo-input" value={secondary.text} maxLength={500} placeholder="무엇을 했나요?" onChange={(event) => { const next = { ...secondary, text: event.target.value }; setSecondary(next); persistMemoLater(primary, next, true) }} /></label>}
        <button className="remove-secondary" type="button" onClick={() => { cancelMemo(); const empty = { category: null, text: '' }; setSecondary(empty); setSecondaryVisible(false); persist(primary, empty, false) }}>두 번째 활동 빼기</button>
      </fieldset>}
      {primary.category && !secondaryVisible && <button className="editor-option" type="button" onClick={() => setSecondaryVisible(true)}>+ 활동 하나 더</button>}
      <footer className="dialog-footer">
        {hasRecord && <button className="delete-entry" type="button" onClick={() => { cancelMemo(); if (onDelete()) { changedRef.current = true; close() } else setSaveFailed(true) }}>{multiple ? '선택한 칸 기록 삭제' : '이 시간 기록 삭제'}</button>}
        <span className={`save-status ${saveFailed ? 'save-status-error' : ''}`} role="status" aria-live="polite">{saveFailed ? '저장하지 못함' : primary.category ? '자동 저장됨' : '카테고리를 선택하면 저장돼요'}</span>
        <button className="save-entry" type="submit">완료</button>
      </footer>
    </form>
  </dialog>
}
