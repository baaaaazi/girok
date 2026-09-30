import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
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
import { categoryPresence, recordedHourCount, replaceHour, reviewHours } from './lib/records'
import { EMPTY_DATA, THEME_KEY, clearData, parseImportedData, readData, replaceData, writeData } from './lib/storage'
import { CATEGORY_IDS, CATEGORY_META, type Activity, type AppData, type CategoryId, type DayRecord, type HourRecord, type Page, type ThemeMode } from './types/record'

type StyleVars = CSSProperties & Record<`--${string}`, string | number>
type Notice = { id: number; text: string; kind: 'success' | 'error' | 'info' }
type NoticeContent = Omit<Notice, 'id'>
type DraftActivity = { category: CategoryId | null; text: string }
type ReviewMode = 'day' | 'week' | 'month'

const LIGHT_COLOR = '#F4F1E9'
const DARK_COLOR = '#1E1C18'

function readTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
  } catch {
    return 'system'
  }
}

function categoryStyle(category: CategoryId): StyleVars {
  return { '--category': CATEGORY_META[category].color }
}

function categoryPairStyle(segments: Activity[]): StyleVars {
  return segments.length === 2
    ? {
        '--category': CATEGORY_META[segments[0].category].color,
        '--category-a': CATEGORY_META[segments[0].category].color,
        '--category-b': CATEGORY_META[segments[1].category].color,
      }
    : categoryStyle(segments[0].category)
}

function makeHourRecord(activities: Activity[]): HourRecord | null {
  if (!activities.length) return null
  return activities.length === 1
    ? { segments: [activities[0]] }
    : { segments: [activities[0], activities[1]] }
}

function reviewDates(date: string, mode: ReviewMode): string[] {
  if (mode === 'day') return [date]
  if (mode === 'week') return Array.from({ length: 7 }, (_, index) => shiftDate(date, index - 6))
  return monthDays(parseDateKey(date) ?? new Date()).map(dateKey)
}

function reviewRangeLabel(date: string, mode: ReviewMode, dates: string[]): string {
  if (mode === 'day') return displayDate(date).compact
  if (mode === 'week') return `${displayDate(dates[0]).compact} – ${displayDate(dates[dates.length - 1]).number}`
  return monthTitle(parseDateKey(date) ?? new Date())
}

function formatRangeTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

const NAV_ITEMS: Array<{ id: Page; label: string }> = [
  { id: 'record', label: '기록' },
  { id: 'calendar', label: '달력' },
  { id: 'review', label: '돌아보기' },
]

export default function App() {
  const [data, setData] = useState<AppData>(() => readData())
  const [page, setPage] = useState<Page>('record')
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [monthCursor, setMonthCursor] = useState(() => monthStart(new Date()))
  const [reviewMode, setReviewMode] = useState<ReviewMode>('day')
  const [theme, setTheme] = useState<ThemeMode>(readTheme)
  const [editorHour, setEditorHour] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [clearArmed, setClearArmed] = useState(false)
  const nextNoticeId = useRef(0)

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

  const saveHour = (hour: number, activities: Activity[]) => commitData(replaceHour(data, selectedDate, hour, makeHourRecord(activities)))
  const deleteHour = (hour: number) => commitData(replaceHour(data, selectedDate, hour, null))
  const navigateDate = (amount: number) => setSelectedDate((current) => shiftDate(current, amount))
  const navigateReview = (amount: number) => setSelectedDate((current) => reviewMode === 'month'
    ? shiftMonth(current, amount)
    : shiftDate(current, amount * (reviewMode === 'week' ? 7 : 1)))
  const navigate = (next: Page) => setPage(next)

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

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* Theme remains active for this session. */ }
  }, [theme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((page !== 'record' && page !== 'review') || editorHour !== null || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (page === 'record') navigateDate(-1)
        else navigateReview(-1)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (page === 'record') navigateDate(1)
        else navigateReview(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [page, editorHour, reviewMode])

  const selectedDisplay = displayDate(selectedDate)
  const selectedDay = data.records[selectedDate] ?? {}

  return (
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

      <main className="page-content">
        {page === 'record' && (
          <RecordPage
            date={selectedDate}
            display={selectedDisplay}
            data={data}
            onPrevious={() => navigateDate(-1)}
            onNext={() => navigateDate(1)}
            onToday={() => setSelectedDate(todayKey())}
            onOpenHour={setEditorHour}
            onOpenReview={() => { setReviewMode('day'); navigate('review') }}
          />
        )}
        {page === 'calendar' && (
          <CalendarPage
            cursor={monthCursor}
            selectedDate={selectedDate}
            data={data}
            onPrevious={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            onNext={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            onSelectDate={(next) => { setSelectedDate(next); navigate('record') }}
          />
        )}
        {page === 'review' && (
          <ReviewPage
            date={selectedDate}
            data={data}
            mode={reviewMode}
            onModeChange={setReviewMode}
            onPrevious={() => navigateReview(-1)}
            onNext={() => navigateReview(1)}
          />
        )}
        {page === 'settings' && (
          <SettingsPage
            data={data}
            theme={theme}
            clearArmed={clearArmed}
            onThemeChange={setTheme}
            onImport={(next) => {
              if (replaceData(next)) {
                setData(next)
                showNotice({ text: '백업 파일을 복원했어요.', kind: 'success' })
              } else showNotice({ text: '가져온 데이터를 저장하지 못했어요.', kind: 'error' })
            }}
            onNotice={showNotice}
            onArmClear={() => { if (window.confirm('모든 기록을 지울까요? 이 작업은 되돌릴 수 없어요.')) setClearArmed(true) }}
            onCancelClear={() => setClearArmed(false)}
            onClear={() => {
              if (clearData()) {
                setData(EMPTY_DATA)
                setClearArmed(false)
                showNotice({ text: '모든 기록을 지웠어요.', kind: 'success' })
              } else showNotice({ text: '데이터를 지우지 못했어요. 기록은 그대로예요.', kind: 'error' })
            }}
          />
        )}
      </main>

      <nav className="mobile-navigation" aria-label="주요 탐색">
        <Navigation page={page} onNavigate={navigate} />
      </nav>
      {notice && <NoticeToast key={notice.id} notice={notice} onDismiss={dismissNotice} />}
      {editorHour !== null && (
        <EntryDialog
          date={selectedDate}
          hour={editorHour}
          record={data.records[selectedDate]?.[String(editorHour)]}
          onClose={() => setEditorHour(null)}
          onSave={(activities) => saveHour(editorHour, activities)}
          onDelete={() => deleteHour(editorHour)}
        />
      )}
    </div>
  )
}

function Navigation({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  return <div className="nav-items">
    {NAV_ITEMS.map((item) => (
      <button key={item.id} type="button" className={`nav-item ${page === item.id ? 'nav-item-active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
        {item.label}
      </button>
    ))}
  </div>
}

function RecordPage({ date, display, data, onPrevious, onNext, onToday, onOpenHour, onOpenReview }: {
  date: string
  display: ReturnType<typeof displayDate>
  data: AppData
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onOpenHour: (hour: number) => void
  onOpenReview: () => void
}) {
  const day = data.records[date] ?? {}
  const recordedHours = Object.keys(day).length
  return <section className="record-page" aria-labelledby="record-title">
    <div className="record-main">
      <DateHeader date={date} display={display} onPrevious={onPrevious} onNext={onNext} onToday={onToday} />
      <p className="record-summary"><strong>{recordedHours}<span> / 24</span></strong><span>시간 기록</span></p>
      <HourGrid date={date} day={day} onOpenHour={onOpenHour} />
    </div>
    <aside className="day-context" aria-label="선택한 날짜 요약">
      <DayOverview date={date} day={day} records={data.records} onOpenReview={onOpenReview} />
    </aside>
  </section>
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
        <div className="date-meta"><span>{display.weekday}</span><span>{date.slice(0, 4)}</span></div>
      </div>
      <button className="date-step" type="button" onClick={onNext} aria-label="다음 날짜"><span aria-hidden="true">→</span></button>
    </div>
    {!isToday(date) && <button className="today-link" type="button" onClick={onToday}>오늘로</button>}
  </div>
}

function HourGrid({ date, day, onOpenHour }: { date: string; day: DayRecord; onOpenHour: (hour: number) => void }) {
  const currentHour = isToday(date) ? new Date().getHours() : -1
  return <div className="hour-grid" role="group" aria-label={`${date} 24시간 기록`}>
    {hours().map((hour) => {
      const record = day[String(hour)]
      const segments: Activity[] = record ? [...record.segments] : []
      const categories = segments.map((activity) => CATEGORY_META[activity.category].label)
      const categoryLabel = categories.join(' · ')
      const descriptor = segments.length === 2 ? `함께 기록 ${categoryLabel}` : categoryLabel || '비어 있음'
      return <button
        key={hour}
        type="button"
        className={`hour-cell ${segments.length ? 'hour-cell-filled' : 'hour-cell-empty'} ${segments.length === 2 ? 'hour-cell-dual' : ''} ${currentHour === hour ? 'hour-cell-now' : ''}`}
        style={segments.length ? categoryPairStyle(segments) : undefined}
        aria-label={`${hourLabel(hour)}${currentHour === hour ? ' 지금' : ''} ${descriptor} ${segments.length ? '기록 수정' : '기록 추가'}`}
        aria-current={currentHour === hour ? 'time' : undefined}
        onClick={() => onOpenHour(hour)}
      >
        <span className="hour-number">{pad(hour)}</span>
        {currentHour === hour && <span className="hour-now">지금</span>}
        {segments.length === 0 && <span className="hour-empty-mark" aria-hidden="true">+</span>}
        {segments.length === 1 && <span className="hour-activity" style={categoryStyle(segments[0].category)}>
          <span className="activity-dot" aria-hidden="true" /><span className="hour-activity-name">{categoryLabel}</span>
        </span>}
        {segments.length === 2 && <span className="hour-activity hour-activity-dual">
          <span className="hour-activity-name">{categoryLabel}</span>
          <span className="activity-pair-dots" aria-hidden="true">
            <i style={{ '--category': CATEGORY_META[segments[0].category].color } as StyleVars} />
            <i style={{ '--category': CATEGORY_META[segments[1].category].color } as StyleVars} />
          </span>
        </span>}
      </button>
    })}
  </div>
}

function hourArcPath(hour: number, radius: number): string {
  const step = 360 / 24
  const gap = 1.4
  const start = (-90 + hour * step + gap / 2) * Math.PI / 180
  const end = (-90 + (hour + 1) * step - gap / 2) * Math.PI / 180
  const x1 = 120 + radius * Math.cos(start)
  const y1 = 120 + radius * Math.sin(start)
  const x2 = 120 + radius * Math.cos(end)
  const y2 = 120 + radius * Math.sin(end)
  return `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`
}

function DayRing({ date, day, compact = false }: { date: string; day: DayRecord; compact?: boolean }) {
  const entries = reviewHours(day)
  const entryByHour = new Map(entries.map((entry) => [entry.hour, entry.activities]))
  const count = entries.length
  const titleId = `ring-title-${date}-${compact ? 'compact' : 'full'}`
  const markerLabels = [
    { label: '00', x: 120, y: 13, anchor: 'middle' },
    { label: '06', x: 227, y: 120, anchor: 'end' },
    { label: '12', x: 120, y: 232, anchor: 'middle' },
    { label: '18', x: 13, y: 120, anchor: 'start' },
  ] as const

  return <svg className={`day-ring ${compact ? 'day-ring-compact' : ''}`} viewBox="0 0 240 240" role="img" aria-labelledby={titleId}>
    <title id={titleId}>{displayDate(date).compact} · {count}시간 기록</title>
    <desc>자정부터 시계 방향으로 한 시간씩 표시한 24시간 기록입니다. 함께 기록한 활동은 같은 시간 위치에 안쪽과 바깥쪽 두 선으로 나타냅니다.</desc>
    {hours().map((hour) => {
      const activities = entryByHour.get(hour)
      return activities?.length === 2
        ? <g key={`track-${hour}`}>
            <path d={hourArcPath(hour, 88)} fill="none" stroke="var(--ring-track)" strokeWidth="8" />
            <path d={hourArcPath(hour, 72)} fill="none" stroke="var(--ring-track)" strokeWidth="8" />
          </g>
        : <path key={`track-${hour}`} d={hourArcPath(hour, 80)} fill="none" stroke="var(--ring-track)" strokeWidth="15" />
    })}
    {entries.map(({ hour, activities }) => activities.length === 2
      ? <g key={`hour-${hour}`}>
          <path d={hourArcPath(hour, 88)} fill="none" stroke={CATEGORY_META[activities[0].category].color} strokeWidth="8" />
          <path d={hourArcPath(hour, 72)} fill="none" stroke={CATEGORY_META[activities[1].category].color} strokeWidth="8" />
        </g>
      : <path key={`hour-${hour}`} d={hourArcPath(hour, 80)} fill="none" stroke={CATEGORY_META[activities[0].category].color} strokeWidth="15" />)}
    <circle cx="120" cy="120" r="53" fill="var(--surface-raised)" />
    <text x="120" y="115" textAnchor="middle" className="ring-center-date">{displayDate(date).number}</text>
    <text x="120" y="137" textAnchor="middle" className="ring-center-count">{count}시간 기록</text>
    {markerLabels.map(({ label, x, y, anchor }) => <text key={label} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="ring-marker">{label}</text>)}
  </svg>
}

function DayOverview({ date, day, records, onOpenReview }: { date: string; day: DayRecord; records: AppData['records']; onOpenReview: () => void }) {
  const count = Object.keys(day).length
  const presence = categoryPresence(records, [date])
  const categories = CATEGORY_IDS.filter((category) => presence[category] > 0)
  return <div className="day-overview">
    <div className="overview-heading"><span className="eyebrow">이 날의 흐름</span><h2>{displayDate(date).compact}</h2></div>
    <DayRing date={date} day={day} compact />
    <div className="overview-total"><strong>{count} / 24</strong><span>시간 기록</span></div>
    {categories.length ? <ul className="overview-categories" aria-label="기록한 카테고리">
      {categories.map((category) => <li key={category}>
        <span className="activity-dot" style={categoryStyle(category)} aria-hidden="true" />
        <span>{CATEGORY_META[category].label}</span><span className="presence-count">{presence[category]}개 시간대</span>
      </li>)}
    </ul> : <p className="overview-empty">기록을 남기면 이곳에 하루의 흐름이 보여요.</p>}
    <button className="overview-link" type="button" onClick={onOpenReview}>하루 돌아보기 <span aria-hidden="true">→</span></button>
  </div>
}

function CategoryLegend({ presence }: { presence: Record<CategoryId, number> }) {
  const present = CATEGORY_IDS.filter((category) => presence[category] > 0)
  if (!present.length) return <p className="review-empty">아직 돌아볼 기록이 없어요.</p>
  return <ul className="category-legend" aria-label="기록한 카테고리">
    {present.map((category) => <li key={category}>
      <span className="activity-dot" style={categoryStyle(category)} aria-hidden="true" />
      <span>{CATEGORY_META[category].label}</span><span>{presence[category]}개 시간대</span>
    </li>)}
  </ul>
}

function ReviewPage({ date, data, mode, onModeChange, onPrevious, onNext }: {
  date: string
  data: AppData
  mode: ReviewMode
  onModeChange: (mode: ReviewMode) => void
  onPrevious: () => void
  onNext: () => void
}) {
  const dates = reviewDates(date, mode)
  const rangeLabel = reviewRangeLabel(date, mode, dates)
  const modes: ReviewMode[] = ['day', 'week', 'month']
  const tabLabels: Record<ReviewMode, string> = { day: '하루', week: '7일', month: '월' }
  const activeLabel = mode === 'day' ? '하루' : mode === 'week' ? '7일' : '월'

  return <section className="section-page review-page" aria-labelledby="review-title">
    <header className="review-page-heading">
      <div><span className="eyebrow">기록을 다시 보는 시간</span><h1 id="review-title">돌아보기</h1></div>
      <div className="range-controls" aria-label={`${activeLabel} 범위 이동`}>
        <button className="round-control" type="button" onClick={onPrevious} aria-label={`이전 ${activeLabel}`}>←</button>
        <p aria-live="polite">{rangeLabel}</p>
        <button className="round-control" type="button" onClick={onNext} aria-label={`다음 ${activeLabel}`}>→</button>
      </div>
    </header>
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
    <div id="review-panel" className="review-panel" role="tabpanel" aria-labelledby={`review-tab-${mode}`}>
      {mode === 'day'
        ? <DayReview date={date} day={data.records[date] ?? {}} />
        : <RangeReview records={data.records} dates={dates} mode={mode} />}
    </div>
  </section>
}

function DayReview({ date, day }: { date: string; day: DayRecord }) {
  const entries = reviewHours(day)
  const presence = categoryPresence({ [date]: day }, [date])
  const titleId = `activities-title-${date}`
  return <div className="day-review-layout">
    <section className="ring-panel" aria-label="24시간 기록">
      <DayRing date={date} day={day} />
      <CategoryLegend presence={presence} />
    </section>
    <section className="activity-review" aria-labelledby={titleId}>
      <div className="subsection-heading"><h2 id={titleId}>시간별 기록</h2><span>{entries.length}시간</span></div>
      {entries.length ? <ol className="activity-review-list">
        {entries.map(({ hour, activities }) => <li className="activity-review-hour" key={hour}>
          <time className="review-hour-time">{formatRangeTime(hour * 60)} – {formatRangeTime((hour + 1) * 60)}</time>
          {activities.length === 1
            ? <div className="single-review-activity">
                <div className="activity-title"><span className="activity-dot" style={categoryStyle(activities[0].category)} aria-hidden="true" /><strong>{CATEGORY_META[activities[0].category].label}</strong></div>
                {activities[0].text && <p>{activities[0].text}</p>}
              </div>
            : <div className="dual-review-activity">
                <span className="together-label">함께 기록</span>
                <ul>{activities.map((activity, index) => <li key={`${activity.category}-${index}`}>
                  <div className="activity-title"><span className="activity-dot" style={categoryStyle(activity.category)} aria-hidden="true" /><strong>{CATEGORY_META[activity.category].label}</strong></div>
                  {activity.text && <p>{activity.text}</p>}
                </li>)}</ul>
              </div>}
        </li>)}
      </ol> : <p className="activity-empty">이 날짜에는 아직 기록이 없어요.</p>}
    </section>
  </div>
}

function RangeReview({ records, dates, mode }: { records: AppData['records']; dates: string[]; mode: 'week' | 'month' }) {
  const hoursRecorded = recordedHourCount(records, dates)
  const presence = categoryPresence(records, dates)
  const present = CATEGORY_IDS.filter((category) => presence[category] > 0)
  return <section className="range-review" aria-label={mode === 'week' ? '7일 돌아보기' : '월 돌아보기'}>
    <div className="range-total"><strong>{hoursRecorded}</strong><span>고유 기록 시간</span></div>
    <p className="range-note">카테고리 수는 해당 활동이 등장한 시간대 수예요. 함께 기록한 활동은 각각 세고, 같은 카테고리가 한 시간대에 두 번 있어도 한 번만 셉니다.</p>
    <section className="presence-section" aria-labelledby="presence-title">
      <div className="subsection-heading"><h2 id="presence-title">카테고리가 등장한 시간</h2><span>{present.length}개</span></div>
      {present.length ? <ul className="presence-list">
        {present.map((category) => <li key={category}>
          <span className="activity-dot" style={categoryStyle(category)} aria-hidden="true" />
          <span>{CATEGORY_META[category].label}</span><strong>{presence[category]}<span>개 시간대</span></strong>
        </li>)}
      </ul> : <p className="activity-empty">이 기간에는 아직 기록이 없어요.</p>}
    </section>
  </section>
}

function CalendarPage({ cursor, selectedDate, data, onPrevious, onNext, onSelectDate }: {
  cursor: Date
  selectedDate: string
  data: AppData
  onPrevious: () => void
  onNext: () => void
  onSelectDate: (date: string) => void
}) {
  const cells = monthGrid(cursor)
  const monthPrefix = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`
  const recordedDays = Object.entries(data.records).filter(([key, day]) => key.startsWith(monthPrefix) && Object.keys(day).length > 0).length
  return <section className="section-page calendar-page" aria-labelledby="calendar-title">
    <header className="section-heading-row">
      <div><span className="eyebrow">날짜를 찾아볼 때</span><h1 id="calendar-title">달력</h1></div>
      <div className="month-controls" aria-label="월 이동">
        <button className="round-control" type="button" onClick={onPrevious} aria-label="이전 달">←</button>
        <button className="round-control" type="button" onClick={onNext} aria-label="다음 달">→</button>
      </div>
    </header>
    <div className="month-title-row"><h2>{monthTitle(cursor)}</h2><span>{recordedDays}일 기록</span></div>
    <div className="calendar-grid calendar-weekdays" aria-hidden="true">{WEEKDAYS_SHORT.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
    <div className="calendar-grid calendar-days">
      {cells.map((date, index) => {
        if (!date) return <span className="calendar-empty" key={`empty-${index}`} aria-hidden="true" />
        const key = dateKey(date)
        const count = Object.keys(data.records[key] ?? {}).length
        const current = key === selectedDate
        const today = isToday(key)
        const markWidth = count >= 13 ? 20 : count >= 6 ? 14 : 8
        return <button
          type="button"
          className={`calendar-day ${current ? 'calendar-day-selected' : ''} ${today ? 'calendar-day-today' : ''}`}
          key={key}
          aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS_SHORT[date.getDay()]}요일${count ? `, ${count}시간 기록` : ', 기록 없음'}`}
          aria-pressed={current}
          aria-current={today ? 'date' : undefined}
          onClick={() => onSelectDate(key)}
        >
          <span>{date.getDate()}</span>
          {count > 0 && <span className="coverage-mark" style={{ '--coverage-width': `${markWidth}px` } as StyleVars} aria-hidden="true" />}
        </button>
      })}
    </div>
    <p className="calendar-hint">날짜를 선택하면 해당 기록을 바로 열어요.</p>
  </section>
}

function SettingsPage({ data, theme, clearArmed, onThemeChange, onImport, onNotice, onArmClear, onCancelClear, onClear }: {
  data: AppData
  theme: ThemeMode
  clearArmed: boolean
  onThemeChange: (theme: ThemeMode) => void
  onImport: (data: AppData) => void
  onNotice: (notice: NoticeContent) => void
  onArmClear: () => void
  onCancelClear: () => void
  onClear: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const dateCount = Object.values(data.records).filter((day) => Object.keys(day).length > 0).length
  const hourCount = recordedHourCount(data.records, Object.keys(data.records))
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `girok-backup-${todayKey()}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    onNotice({ text: '백업 파일을 내려받았어요.', kind: 'success' })
  }
  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 1_000_000) { onNotice({ text: '1MB보다 작은 JSON 파일만 가져올 수 있어요.', kind: 'error' }); return }
    const result = parseImportedData(await file.text())
    if ('error' in result) { onNotice({ text: result.error, kind: 'error' }); return }
    onImport(result.data)
  }

  return <section className="section-page settings-page" aria-labelledby="settings-title">
    <div className="section-heading-row"><div><span className="eyebrow">앱과 기록 관리</span><h1 id="settings-title">설정</h1></div></div>
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
      <section className="setting-section" aria-labelledby="backup-title">
        <div className="setting-heading">
          <div><h2 id="backup-title">데이터 백업</h2><p>기록은 이 기기의 브라우저에만 저장돼요. 중요한 기록은 가끔 백업해 두세요.</p></div>
          <span className="setting-count">{dateCount}일 · {hourCount}시간</span>
        </div>
        <div className="setting-actions">
          <button className="outline-button" type="button" onClick={exportData}>백업 파일 내보내기</button>
          <button className="outline-button" type="button" onClick={() => fileInput.current?.click()}>백업 파일 가져오기</button>
          <input ref={fileInput} className="visually-hidden" type="file" tabIndex={-1} accept="application/json,.json" aria-label="가져올 백업 파일 선택" onChange={importData} />
        </div>
        <p className="setting-hint">v1·v2 형식을 확인하며, 잘못된 파일은 현재 데이터를 바꾸지 않아요.</p>
      </section>
      <section className="setting-section setting-danger" aria-labelledby="danger-title">
        <div className="setting-heading"><div><h2 id="danger-title">기록 삭제</h2><p>모든 날짜의 기록을 이 브라우저에서 삭제해요.</p></div></div>
        {!clearArmed
          ? <button className="danger-button" type="button" onClick={onArmClear}>모든 기록 삭제</button>
          : <div className="clear-confirm" role="alert"><p>모든 기록을 영구 삭제할까요? 한 번 더 확인이 필요해요.</p><div className="clear-actions">
              <button className="ghost-button" type="button" onClick={onCancelClear}>돌아가기</button>
              <button className="danger-button" type="button" onClick={onClear}>영구 삭제</button>
            </div></div>}
      </section>
    </div>
    <p className="settings-footnote">girok는 서버 없이 작동하며, 기록은 이 브라우저의 localStorage에만 남아요.</p>
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

function EntryDialog({ date, hour, record, onClose, onSave, onDelete }: {
  date: string
  hour: number
  record: HourRecord | undefined
  onClose: () => void
  onSave: (activities: Activity[]) => boolean
  onDelete: () => boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const closingRef = useRef(false)
  const [primary, setPrimary] = useState<DraftActivity>(() => record?.segments[0] ? { ...record.segments[0] } : { category: null, text: '' })
  const [secondary, setSecondary] = useState<DraftActivity>(() => record?.segments[1] ? { ...record.segments[1] } : { category: null, text: '' })
  const [memoVisible, setMemoVisible] = useState(Boolean(record?.segments.some((activity) => activity.text)))
  const [secondaryVisible, setSecondaryVisible] = useState(Boolean(record?.segments[1]))
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current) }
  }, [])

  const persist = (nextPrimary: DraftActivity, nextSecondary: DraftActivity, showSecondary = secondaryVisible): boolean => {
    if (!nextPrimary.category) return true
    const activities: Activity[] = [{ category: nextPrimary.category, text: nextPrimary.text }]
    if (showSecondary && nextSecondary.category) activities.push({ category: nextSecondary.category, text: nextSecondary.text })
    const saved = onSave(activities)
    setSaveFailed(!saved)
    return saved
  }

  const close = () => {
    const dialog = dialogRef.current
    if (!dialog?.open || closingRef.current) return
    closingRef.current = true
    setClosingAttribute()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 140 : window.matchMedia('(max-width: 719px)').matches ? 180 : 160
    closeTimer.current = window.setTimeout(() => dialog.close(), duration)
  }

  const setClosingAttribute = () => dialogRef.current?.setAttribute('data-closing', '')
  const submit = (event: FormEvent) => { event.preventDefault(); close() }
  const chooseCategory = (slot: 1 | 2, category: CategoryId) => {
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
    {CATEGORY_IDS.map((category) => <label key={category} className={`category-option ${selected === category ? 'category-option-selected' : ''}`} style={categoryStyle(category)}>
      <input className="visually-hidden" type="radio" name={`entry-category-${date}-${hour}-${slot}`} value={category} checked={selected === category} onChange={() => chooseCategory(slot, category)} />
      <span className="activity-dot" aria-hidden="true" /><span>{CATEGORY_META[category].label}</span>
    </label>)}
  </div>

  const titleId = `entry-dialog-title-${date}-${hour}`
  return <dialog
    ref={dialogRef}
    className="entry-dialog"
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close() }}
    onClose={onClose}
  >
    <form className="entry-form" onSubmit={submit}>
      <header className="dialog-heading"><div><span className="eyebrow">{displayDate(date).compact}</span><h2 id={titleId}>{hourLabel(hour)} 기록</h2></div></header>
      <fieldset className="activity-fieldset">
        <legend>{secondaryVisible ? '활동 1' : '무슨 일을 했나요?'}</legend>
        {categoryOptions(1, primary.category)}
        {memoVisible
          ? <label className="memo-field" htmlFor={`entry-memo-${date}-${hour}-1`}><span className="memo-label">메모</span><textarea id={`entry-memo-${date}-${hour}-1`} className="memo-input" value={primary.text} maxLength={500} placeholder="무엇을 했나요?" onChange={(event) => { const next = { ...primary, text: event.target.value }; setPrimary(next); persist(next, secondary) }} /></label>
          : primary.category && <button className="editor-option" type="button" onClick={() => setMemoVisible(true)}>+ 메모 추가</button>}
      </fieldset>
      {secondaryVisible && <fieldset className="activity-fieldset activity-fieldset-secondary">
        <legend>활동 2</legend>
        {categoryOptions(2, secondary.category)}
        {memoVisible && secondary.category && <label className="memo-field" htmlFor={`entry-memo-${date}-${hour}-2`}><span className="memo-label">메모</span><textarea id={`entry-memo-${date}-${hour}-2`} className="memo-input" value={secondary.text} maxLength={500} placeholder="무엇을 했나요?" onChange={(event) => { const next = { ...secondary, text: event.target.value }; setSecondary(next); persist(primary, next, true) }} /></label>}
        <button className="remove-secondary" type="button" onClick={() => { const empty = { category: null, text: '' }; setSecondary(empty); setSecondaryVisible(false); persist(primary, empty, false) }}>두 번째 활동 빼기</button>
      </fieldset>}
      {primary.category && !secondaryVisible && <button className="editor-option" type="button" onClick={() => setSecondaryVisible(true)}>+ 활동 하나 더</button>}
      <footer className="dialog-footer">
        {record && <button className="delete-entry" type="button" onClick={() => { if (onDelete()) close(); else setSaveFailed(true) }}>이 시간 기록 삭제</button>}
        <span className={`save-status ${saveFailed ? 'save-status-error' : ''}`} role="status" aria-live="polite">{saveFailed ? '저장하지 못함' : primary.category ? '자동 저장됨' : '카테고리를 선택하면 저장돼요'}</span>
        <button className="save-entry" type="submit">완료</button>
      </footer>
    </form>
  </dialog>
}
