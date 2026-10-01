import { useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { WEEKDAYS_SHORT, displayDate, parseDateKey, shiftDate } from './lib/date'
import {
  NAME_MAX_LENGTH,
  WEEKLY_MAX_TIMES,
  dayProgress,
  ddayLabel,
  isChecked,
  isDue,
  newId,
  perfectStreak,
  removeGoal,
  removeRoutine,
  repeatLabel,
  sortedGoals,
  streak,
  toggleCheck,
  upsertGoal,
  upsertRoutine,
  weekCount,
} from './lib/routines'
import { ROUTINE_COLORS, ROUTINE_COLOR_IDS, ROUTINE_ICON_IDS, type Goal, type Routine, type RoutineColorId, type RoutineData, type RoutineIconId, type RoutineRepeat } from './types/routine'
import { ICON_LABELS, RoutineIcon } from './icons'
import { useSheet } from './sheet'

type StyleVars = CSSProperties & Record<`--${string}`, string | number>
type RoutineDraft = Omit<Routine, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
type GoalDraft = Omit<Goal, 'id' | 'createdAt'> & { id?: string; createdAt?: string }

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday-first reads more naturally for picking days.
const COLOR_LABELS: Record<RoutineColorId, string> = {
  blue: '파랑', violet: '보라', orange: '주황', teal: '청록', yellow: '노랑', pink: '분홍', green: '초록', gray: '회색',
}
const SUGGESTIONS: RoutineDraft[] = [
  { name: '물 마시기', icon: 'water', color: 'blue', repeat: { kind: 'daily' } },
  { name: '운동하기', icon: 'run', color: 'green', repeat: { kind: 'weekly', times: 3 } },
  { name: '책 읽기', icon: 'book', color: 'violet', repeat: { kind: 'daily' } },
  { name: '일기 쓰기', icon: 'pen', color: 'orange', repeat: { kind: 'daily' } },
]
const BLANK_ROUTINE: RoutineDraft = { name: '', icon: 'check', color: 'blue', repeat: { kind: 'daily' } }

function colorStyle(color: RoutineColorId): StyleVars {
  return { '--category': ROUTINE_COLORS[color] }
}

function dayTitle(key: string): string {
  const date = parseDateKey(key) ?? new Date()
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${displayDate(key).weekday}`
}

export function RoutinePage({ date, today, data, onChange, onPrevious, onNext, onToday }: {
  date: string
  today: string
  data: RoutineData
  onChange: (next: RoutineData) => boolean
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}) {
  const [editingRoutine, setEditingRoutine] = useState<RoutineDraft | null>(null)
  const [editingGoal, setEditingGoal] = useState<GoalDraft | null>(null)
  // Only the row the user just checked plays the pop, not every done row on mount.
  const [popped, setPopped] = useState<string | null>(null)
  // Bumped when a check finishes the day, so the celebration replays each time it is earned.
  const [celebration, setCelebration] = useState(0)
  // A different day starts quiet: no leftover pop or confetti from the one just left.
  const [shownDate, setShownDate] = useState(date)
  if (shownDate !== date) { setShownDate(date); setPopped(null); setCelebration(0) }
  const future = date > today
  const streakDate = future ? today : date
  const due = data.routines.filter((routine) => isDue(routine, date))
  const resting = data.routines.filter((routine) => !isDue(routine, date) && date >= routine.createdAt)
  const { done, total } = dayProgress(data, date)
  const goals = sortedGoals(data.goals)

  const complete = total > 0 && done === total
  const dueColors = due.map((routine) => ROUTINE_COLORS[routine.color])
  const perfectRun = complete ? perfectStreak(data, date) : 0

  const toggle = (routine: Routine) => {
    const checking = !isChecked(data, date, routine.id)
    const next = toggleCheck(data, date, routine.id)
    if (!onChange(next)) return
    if (!checking) { setPopped(null); return }
    setPopped(routine.id)
    const after = dayProgress(next, date)
    if (after.total > 0 && after.done === after.total) {
      navigator.vibrate?.([18, 70, 26, 70, 40])
      setCelebration((count) => count + 1)
    } else navigator.vibrate?.(18)
  }

  return <section className="section-page routine-page" aria-labelledby="routine-title">
    <h1 id="routine-title" className="visually-hidden">루틴</h1>
    <div className="range-controls routine-date" aria-label="날짜 이동">
      <button className="step-control" type="button" onClick={onPrevious} aria-label="이전 날짜"><span aria-hidden="true">‹</span></button>
      <p aria-live="polite">{dayTitle(date)}{date !== today && <button className="today-link" type="button" onClick={onToday}>오늘로</button>}</p>
      <button className="step-control" type="button" onClick={onNext} aria-label="다음 날짜"><span aria-hidden="true">›</span></button>
    </div>

    <div className="goal-strip" role="list" aria-label="목표">
      {goals.map((goal, index) => {
        const label = ddayLabel(goal, today)
        return <button key={goal.id} role="listitem" type="button" className="goal-card" style={{ '--i': index } as StyleVars} onClick={() => setEditingGoal(goal)} aria-label={`${goal.name} ${label}, 수정`}>
          <span className="goal-name">{goal.name}</span>
          <strong className={`goal-dday ${goal.date ? '' : 'goal-dday-open'}`}>{label}</strong>
          {goal.date && <span className="goal-date">{displayDate(goal.date).compact}</span>}
        </button>
      })}
      <button role="listitem" type="button" className={`goal-card goal-card-add ${goals.length ? '' : 'goal-card-wide'}`} style={{ '--i': goals.length } as StyleVars} onClick={() => setEditingGoal({ name: '', date: shiftDate(today, 30) })}>
        <span className="goal-add-mark" aria-hidden="true">+</span>
        <span>{goals.length ? '목표 추가' : '목표나 디데이를 추가해 보세요'}</span>
      </button>
    </div>

    {data.routines.length === 0 ? <div className="routine-empty">
      <p className="routine-empty-title">매일 챙기고 싶은 일을 루틴으로 만들어 보세요</p>
      <p className="routine-empty-copy">시간은 정하지 않아요. 그날 했는지만 체크하면 돼요.</p>
      <div className="routine-suggestions">
        {SUGGESTIONS.map((suggestion) => <button key={suggestion.name} type="button" className="routine-chip" style={colorStyle(suggestion.color)} onClick={() => setEditingRoutine(suggestion)}>
          <RoutineIcon icon={suggestion.icon} /><span>{suggestion.name}</span>
        </button>)}
      </div>
      <button className="save-entry routine-add-primary" type="button" onClick={() => setEditingRoutine(BLANK_ROUTINE)}>새 루틴 만들기</button>
    </div> : <>
      <div className="routine-progress" data-complete={complete ? '' : undefined}>
        {complete && celebration > 0 && <Confetti key={celebration} colors={dueColors} />}
        <div className="routine-progress-row">
          <h2>{date === today ? '오늘의 루틴' : '이날의 루틴'}</h2>
          <p><strong key={done} className={popped ? 'routine-count-bump' : undefined}>{done}</strong><span> / {total}</span></p>
        </div>
        <div className="routine-progress-track" aria-hidden="true">
          <span style={{ transform: `scaleX(${total ? done / total : 0})`, ...(complete ? { backgroundImage: progressGradient(dueColors) } : {}) }} />
          {complete && celebration > 0 && <i key={celebration} className="routine-progress-shine" />}
        </div>
        {complete && <p key={celebration} className={`routine-progress-note ${celebration > 0 ? 'routine-progress-note-earned' : ''}`}>
          {date === today ? '오늘 루틴을 모두 마쳤어요' : '이날 루틴을 모두 마쳤어요'}
          {perfectRun >= 2 && <span className="routine-perfect-streak"> · 🔥 {perfectRun}일 연속 완료</span>}
        </p>}
        {future && <p className="routine-progress-note routine-progress-muted">아직 오지 않은 날은 체크할 수 없어요</p>}
      </div>

      {due.length ? <ul className="routine-list" aria-label="루틴">
        {due.map((routine, index) => {
          const checked = isChecked(data, date, routine.id)
          const count = streak(data, routine, streakDate)
          const meta = routine.repeat.kind === 'weekly'
            ? `이번 주 ${weekCount(data, routine.id, date)}/${routine.repeat.times}${count ? ` · ${count}주 연속` : ''}`
            : `${repeatLabel(routine.repeat)}${count ? ` · ${count}일 연속` : ''}`
          const justChecked = checked && popped === routine.id
          return <li key={routine.id} className={`routine-row ${checked ? 'routine-row-done' : ''} ${justChecked ? 'routine-row-pop' : ''}`} style={{ ...colorStyle(routine.color), '--i': index } as StyleVars}>
            <button type="button" className="routine-toggle" aria-pressed={checked} disabled={future} onClick={() => toggle(routine)}>
              <span className={`routine-check ${justChecked ? 'routine-check-pop' : ''}`} aria-hidden="true">
                <svg viewBox="0 0 16 16"><path d="m4 8.4 2.6 2.6L12 5.4" /></svg>
                {justChecked && <span className="routine-burst">{BURST_ANGLES.map((angle) => <i key={angle} style={{ '--a': `${angle}deg` } as StyleVars} />)}</span>}
              </span>
              <span className="routine-icon"><RoutineIcon icon={routine.icon} /></span>
              <span className="routine-copy">
                <span className="routine-name">{routine.name}</span>
                <span className="routine-meta">{count >= 2 && <span aria-hidden="true">🔥 </span>}{meta}</span>
              </span>
            </button>
            <button type="button" className="routine-more" aria-label={`${routine.name} 수정`} onClick={() => setEditingRoutine(routine)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12h.01M12 12h.01m5.5 0h.01" /></svg>
            </button>
          </li>
        })}
      </ul> : <p className="activity-empty">이날 할 루틴이 없어요.</p>}

      {resting.length > 0 && <section className="routine-resting" aria-labelledby="routine-resting-title">
        <h2 id="routine-resting-title">{date === today ? '오늘은 쉬어요' : '이날은 쉬어요'}</h2>
        <ul className="routine-list">
          {resting.map((routine) => <li key={routine.id} className="routine-row routine-row-rest" style={colorStyle(routine.color)}>
            <span className="routine-toggle">
              <span className="routine-icon"><RoutineIcon icon={routine.icon} /></span>
              <span className="routine-copy"><span className="routine-name">{routine.name}</span><span className="routine-meta">{repeatLabel(routine.repeat)}</span></span>
            </span>
            <button type="button" className="routine-more" aria-label={`${routine.name} 수정`} onClick={() => setEditingRoutine(routine)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12h.01M12 12h.01m5.5 0h.01" /></svg>
            </button>
          </li>)}
        </ul>
      </section>}

      <button className="routine-add" type="button" onClick={() => setEditingRoutine(BLANK_ROUTINE)}><span aria-hidden="true">+</span> 루틴 추가</button>
    </>}

    {editingRoutine && <RoutineDialog
      draft={editingRoutine}
      onClosed={() => setEditingRoutine(null)}
      onSave={(draft) => onChange(upsertRoutine(data, {
        id: draft.id ?? newId(),
        name: draft.name.trim(),
        icon: draft.icon,
        color: draft.color,
        repeat: draft.repeat,
        // A routine added while looking at a past day starts from that day, so it can be checked there.
        createdAt: draft.createdAt ?? (date < today ? date : today),
      }))}
      onDelete={(id) => onChange(removeRoutine(data, id))}
    />}
    {editingGoal && <GoalDialog
      draft={editingGoal}
      today={today}
      onClosed={() => setEditingGoal(null)}
      onSave={(draft) => onChange(upsertGoal(data, { id: draft.id ?? newId(), name: draft.name.trim(), date: draft.date, createdAt: draft.createdAt ?? today }))}
      onDelete={(id) => onChange(removeGoal(data, id))}
    />}
  </section>
}

const BURST_ANGLES = [0, 60, 120, 180, 240, 300]
const CONFETTI_COUNT = 18
const CONFETTI_FALLBACK = Object.values(ROUTINE_COLORS)

// A finished day paints the bar in the colors of that day's routines.
function progressGradient(colors: string[]): string {
  const stops = colors.length > 1 ? colors : [colors[0], colors[0]]
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

// A one-off burst from the progress card when the day's last routine is checked.
// Pieces get random spread on mount; a new `key` remounts it for the next celebration.
function Confetti({ colors }: { colors: string[] }) {
  const pieces = useMemo(() => Array.from({ length: CONFETTI_COUNT }, (_, index) => {
    const palette = colors.length ? colors : CONFETTI_FALLBACK
    const spread = (index / (CONFETTI_COUNT - 1) - 0.5) * 2 // -1..1, so pieces fan out evenly
    return {
      color: palette[index % palette.length],
      dx: Math.round(spread * 130 + (Math.random() - 0.5) * 30),
      dy: Math.round(-50 - Math.random() * 60),
      fall: Math.round(70 + Math.random() * 50),
      rot: Math.round((Math.random() - 0.5) * 720),
      delay: Math.round(Math.random() * 60),
      wide: index % 3 === 0,
    }
  }), [])
  return <span className="confetti" aria-hidden="true">
    {pieces.map((piece, index) => <i key={index} className={piece.wide ? 'confetti-wide' : undefined} style={{
      background: piece.color, '--dx': `${piece.dx}px`, '--dy': `${piece.dy}px`, '--fall': `${piece.fall}px`, '--rot': `${piece.rot}deg`, animationDelay: `${piece.delay}ms`,
    } as StyleVars} />)}
  </span>
}

function RoutineDialog({ draft, onClosed, onSave, onDelete }: {
  draft: RoutineDraft
  onClosed: () => void
  onSave: (draft: RoutineDraft) => boolean
  onDelete: (id: string) => boolean
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const { close, dialogProps } = useSheet(onClosed, titleRef)
  const uid = useId()
  const [name, setName] = useState(draft.name)
  const [icon, setIcon] = useState<RoutineIconId>(draft.icon)
  const [color, setColor] = useState<RoutineColorId>(draft.color)
  const [repeat, setRepeat] = useState<RoutineRepeat>(draft.repeat)
  const [failed, setFailed] = useState(false)
  const editing = Boolean(draft.id)
  const valid = name.trim().length > 0 && (repeat.kind !== 'weekdays' || repeat.days.length > 0)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    if (onSave({ ...draft, name, icon, color, repeat })) close()
    else setFailed(true)
  }
  const remove = () => {
    if (!draft.id || !window.confirm(`'${draft.name}' 루틴을 지울까요? 체크한 기록도 함께 지워져요.`)) return
    if (onDelete(draft.id)) close()
    else setFailed(true)
  }
  const toggleDay = (day: number) => {
    if (repeat.kind !== 'weekdays') return
    const days = repeat.days.includes(day) ? repeat.days.filter((item) => item !== day) : [...repeat.days, day].sort((a, b) => a - b)
    setRepeat({ kind: 'weekdays', days })
  }

  return <dialog className="entry-dialog routine-dialog" aria-labelledby={`${uid}-title`} {...dialogProps}>
    <form className="entry-form" onSubmit={submit}>
      <header className="dialog-heading"><div>
        <span className="eyebrow">루틴</span>
        <h2 id={`${uid}-title`} ref={titleRef} tabIndex={-1}>{editing ? '루틴 수정' : '새 루틴'}</h2>
      </div></header>

      <label className="sheet-field">
        <span className="sheet-label">이름</span>
        <input className="sheet-input" value={name} maxLength={NAME_MAX_LENGTH} placeholder="예: 물 마시기" enterKeyHint="done" onChange={(event) => setName(event.target.value)} />
      </label>

      <fieldset className="sheet-fieldset">
        <legend className="sheet-label">아이콘</legend>
        <div className="icon-options" style={colorStyle(color)}>
          {ROUTINE_ICON_IDS.map((id) => <label key={id} className={`icon-option ${icon === id ? 'icon-option-selected' : ''}`}>
            <input className="visually-hidden" type="radio" name={`${uid}-icon`} value={id} checked={icon === id} onChange={() => setIcon(id)} aria-label={ICON_LABELS[id]} />
            <RoutineIcon icon={id} />
          </label>)}
        </div>
      </fieldset>

      <fieldset className="sheet-fieldset">
        <legend className="sheet-label">색</legend>
        <div className="color-options">
          {ROUTINE_COLOR_IDS.map((id) => <label key={id} className={`color-option ${color === id ? 'color-option-selected' : ''}`} style={colorStyle(id)}>
            <input className="visually-hidden" type="radio" name={`${uid}-color`} value={id} checked={color === id} onChange={() => setColor(id)} aria-label={COLOR_LABELS[id]} />
          </label>)}
        </div>
      </fieldset>

      <fieldset className="sheet-fieldset">
        <legend className="sheet-label">반복</legend>
        <div className="segmented" role="radiogroup">
          {([['daily', '매일'], ['weekdays', '요일 선택'], ['weekly', '주 N회']] as const).map(([kind, label]) => <label key={kind} className={`segment ${repeat.kind === kind ? 'segment-active' : ''}`}>
            <input className="visually-hidden" type="radio" name={`${uid}-repeat`} checked={repeat.kind === kind} onChange={() => setRepeat(
              kind === 'daily' ? { kind } : kind === 'weekdays' ? { kind, days: [1, 2, 3, 4, 5] } : { kind, times: 3 },
            )} />
            {label}
          </label>)}
        </div>
        {repeat.kind === 'weekdays' && <div className="weekday-options" role="group" aria-label="요일">
          {WEEKDAY_ORDER.map((day) => <button key={day} type="button" className={`weekday-option ${repeat.days.includes(day) ? 'weekday-option-active' : ''} ${day === 0 ? 'weekday-sun' : day === 6 ? 'weekday-sat' : ''}`} aria-pressed={repeat.days.includes(day)} onClick={() => toggleDay(day)}>{WEEKDAYS_SHORT[day]}</button>)}
        </div>}
        {repeat.kind === 'weekly' && <div className="times-stepper">
          <button type="button" className="step-control" aria-label="횟수 줄이기" disabled={repeat.times <= 1} onClick={() => setRepeat({ kind: 'weekly', times: repeat.times - 1 })}><span aria-hidden="true">−</span></button>
          <p aria-live="polite">일주일에 <strong>{repeat.times}번</strong></p>
          <button type="button" className="step-control" aria-label="횟수 늘리기" disabled={repeat.times >= WEEKLY_MAX_TIMES} onClick={() => setRepeat({ kind: 'weekly', times: repeat.times + 1 })}><span aria-hidden="true">+</span></button>
        </div>}
        <p className="sheet-hint">{repeat.kind === 'weekly' ? '요일 상관없이 일주일(일–토)에 정한 횟수만큼 하면 돼요.' : repeat.kind === 'weekdays' && !repeat.days.length ? '요일을 하나 이상 골라 주세요.' : '시간은 정하지 않아요. 그날 했는지만 체크해요.'}</p>
      </fieldset>

      <footer className="dialog-footer">
        {editing && <button className="delete-entry" type="button" onClick={remove}>루틴 삭제</button>}
        <span className={`save-status ${failed ? 'save-status-error' : ''}`} role="status" aria-live="polite">{failed ? '저장하지 못함' : ''}</span>
        <button className="ghost-button" type="button" onClick={close}>취소</button>
        <button className="save-entry" type="submit" disabled={!valid}>{editing ? '저장' : '추가'}</button>
      </footer>
    </form>
  </dialog>
}

function GoalDialog({ draft, today, onClosed, onSave, onDelete }: {
  draft: GoalDraft
  today: string
  onClosed: () => void
  onSave: (draft: GoalDraft) => boolean
  onDelete: (id: string) => boolean
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const { close, dialogProps } = useSheet(onClosed, titleRef)
  const uid = useId()
  const [name, setName] = useState(draft.name)
  const [date, setDate] = useState<string | null>(draft.date)
  // Remembers the picked date while the user flips to 날짜 없음 and back.
  const [lastDate, setLastDate] = useState(draft.date ?? shiftDate(today, 30))
  const [failed, setFailed] = useState(false)
  const editing = Boolean(draft.id)
  const valid = name.trim().length > 0 && (date === null || parseDateKey(date) !== null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    if (onSave({ ...draft, name, date })) close()
    else setFailed(true)
  }
  const remove = () => {
    if (!draft.id || !window.confirm(`'${draft.name}' 목표를 지울까요?`)) return
    if (onDelete(draft.id)) close()
    else setFailed(true)
  }

  return <dialog className="entry-dialog routine-dialog" aria-labelledby={`${uid}-title`} {...dialogProps}>
    <form className="entry-form" onSubmit={submit}>
      <header className="dialog-heading"><div>
        <span className="eyebrow">목표</span>
        <h2 id={`${uid}-title`} ref={titleRef} tabIndex={-1}>{editing ? '목표 수정' : '새 목표'}</h2>
      </div></header>

      <label className="sheet-field">
        <span className="sheet-label">이름</span>
        <input className="sheet-input" value={name} maxLength={NAME_MAX_LENGTH} placeholder="예: 토익 시험" enterKeyHint="done" onChange={(event) => setName(event.target.value)} />
      </label>

      <fieldset className="sheet-fieldset">
        <legend className="sheet-label">날짜</legend>
        <div className="segmented segmented-two" role="radiogroup">
          <label className={`segment ${date !== null ? 'segment-active' : ''}`}>
            <input className="visually-hidden" type="radio" name={`${uid}-dated`} checked={date !== null} onChange={() => setDate(lastDate)} />디데이
          </label>
          <label className={`segment ${date === null ? 'segment-active' : ''}`}>
            <input className="visually-hidden" type="radio" name={`${uid}-dated`} checked={date === null} onChange={() => setDate(null)} />날짜 없음
          </label>
        </div>
        {date !== null && <div className="goal-date-row">
          <input className="sheet-input" type="date" value={date} aria-label="목표 날짜" onChange={(event) => { setDate(event.target.value); if (event.target.value) setLastDate(event.target.value) }} />
          <strong className="goal-dday-preview">{parseDateKey(date) ? ddayLabel({ id: '', name, date, createdAt: today }, today) : ''}</strong>
        </div>}
        <p className="sheet-hint">{date === null ? '날짜 없이 꾸준히 바라볼 목표로 남겨요.' : '루틴 화면 위쪽에 남은 날짜가 보여요.'}</p>
      </fieldset>

      <footer className="dialog-footer">
        {editing && <button className="delete-entry" type="button" onClick={remove}>목표 삭제</button>}
        <span className={`save-status ${failed ? 'save-status-error' : ''}`} role="status" aria-live="polite">{failed ? '저장하지 못함' : ''}</span>
        <button className="ghost-button" type="button" onClick={close}>취소</button>
        <button className="save-entry" type="submit" disabled={!valid}>{editing ? '저장' : '추가'}</button>
      </footer>
    </form>
  </dialog>
}
