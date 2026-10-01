import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { REMINDER_MAX, REMINDER_TEXT_MAX_LENGTH, newReminderId, removeReminder, timeLabel, upsertReminder, validTime, type Reminder, type ReminderData } from './lib/reminders'
import { isNative, reminderPermission } from './native'
import { useSheet } from './sheet'

type ReminderDraft = Omit<Reminder, 'id'> & { id?: number }

// The two reminders the user described when planning the feature.
const PRESETS: ReminderDraft[] = [
  { time: '12:30', text: '오전 기록하기', enabled: true },
  { time: '23:00', text: '오늘 루틴 체크', enabled: true },
]
const BLANK: ReminderDraft = { time: '21:00', text: '', enabled: true }

export function ReminderSettings({ data, onChange }: { data: ReminderData; onChange: (next: ReminderData) => boolean }) {
  const [editing, setEditing] = useState<ReminderDraft | null>(null)
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt' | null>(null)

  // Re-read after every change, since saving may have just asked for the permission.
  useEffect(() => {
    if (!isNative) return
    let active = true
    const timer = window.setTimeout(() => { void reminderPermission().then((value) => { if (active) setPermission(value) }) }, 400)
    return () => { active = false; window.clearTimeout(timer) }
  }, [data])

  const full = data.reminders.length >= REMINDER_MAX
  const enabledCount = data.reminders.filter((item) => item.enabled).length

  return <section className="setting-section" aria-labelledby="reminder-title">
    <div className="setting-heading">
      <div><h2 id="reminder-title">알림</h2><p>{isNative ? '정한 시간에 매일 알림이 와요.' : '알림은 안드로이드 앱에서만 받을 수 있어요. 웹에서는 앱을 닫으면 알림을 보낼 수 없어요.'}</p></div>
      {isNative && data.reminders.length > 0 && <span className="setting-count">{enabledCount ? `${enabledCount}개 켜짐` : '모두 꺼짐'}</span>}
    </div>
    {isNative && <>
      {permission === 'denied' && data.reminders.some((item) => item.enabled) && <p className="setting-hint reminder-warning">알림 권한이 꺼져 있어요. 휴대폰 설정 → 애플리케이션 → girok → 알림에서 켜 주세요.</p>}
      {data.reminders.length > 0 ? <ul className="reminder-list">
        {data.reminders.map((reminder, index) => {
          const { period, clock } = timeLabel(reminder.time)
          return <li key={reminder.id} className={`reminder-row ${reminder.enabled ? '' : 'reminder-row-off'}`} style={{ '--i': index } as CSSProperties}>
            <button type="button" className="reminder-main" onClick={() => setEditing(reminder)} aria-label={`${period} ${clock} ${reminder.text} 알림 수정`}>
              <span className="reminder-time"><span>{period}</span>{clock}</span>
              <span className="reminder-text">{reminder.text}</span>
            </button>
            <button type="button" role="switch" className="switch" aria-checked={reminder.enabled} aria-label={`${reminder.text} 알림 ${reminder.enabled ? '끄기' : '켜기'}`}
              onClick={() => onChange(upsertReminder(data, { ...reminder, enabled: !reminder.enabled }))}>
              <span aria-hidden="true" />
            </button>
          </li>
        })}
      </ul> : <div className="routine-suggestions reminder-presets">
        {PRESETS.map((preset) => {
          const { period, clock } = timeLabel(preset.time)
          return <button key={preset.text} type="button" className="routine-chip" style={{ '--category': '#4A7FCC' } as CSSProperties} onClick={() => setEditing(preset)}>{period} {clock} · {preset.text}</button>
        })}
      </div>}
      <div className="setting-actions">
        <button className="outline-button" type="button" disabled={full} onClick={() => setEditing(BLANK)}>+ 알림 추가</button>
      </div>
      {full && <p className="setting-hint">알림은 {REMINDER_MAX}개까지 만들 수 있어요.</p>}
    </>}
    {editing && <ReminderDialog
      draft={editing}
      onClosed={() => setEditing(null)}
      onSave={(draft) => onChange(upsertReminder(data, { id: draft.id ?? newReminderId(data), time: draft.time, text: draft.text.trim(), enabled: draft.enabled }))}
      onDelete={(id) => onChange(removeReminder(data, id))}
    />}
  </section>
}

function ReminderDialog({ draft, onClosed, onSave, onDelete }: {
  draft: ReminderDraft
  onClosed: () => void
  onSave: (draft: ReminderDraft) => boolean
  onDelete: (id: number) => boolean
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const { close, dialogProps } = useSheet(onClosed, titleRef)
  const uid = useId()
  const [time, setTime] = useState(draft.time)
  const [text, setText] = useState(draft.text)
  const [failed, setFailed] = useState(false)
  const editing = draft.id !== undefined
  const valid = validTime(time) && text.trim().length > 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    // Saving an edited reminder turns it back on; that is almost always why it was opened.
    if (onSave({ ...draft, time, text, enabled: true })) close()
    else setFailed(true)
  }
  const remove = () => {
    if (draft.id === undefined) return
    if (onDelete(draft.id)) close()
    else setFailed(true)
  }

  return <dialog className="entry-dialog routine-dialog" aria-labelledby={`${uid}-title`} {...dialogProps}>
    <form className="entry-form" onSubmit={submit}>
      <header className="dialog-heading"><div>
        <span className="eyebrow">알림</span>
        <h2 id={`${uid}-title`} ref={titleRef} tabIndex={-1}>{editing ? '알림 수정' : '새 알림'}</h2>
      </div></header>

      <label className="sheet-field">
        <span className="sheet-label">시간</span>
        <input className="sheet-input reminder-time-input" type="time" value={time} required onChange={(event) => setTime(event.target.value)} />
      </label>

      <label className="sheet-field">
        <span className="sheet-label">내용</span>
        <input className="sheet-input" value={text} maxLength={REMINDER_TEXT_MAX_LENGTH} placeholder="예: 오전 기록하기" enterKeyHint="done" onChange={(event) => setText(event.target.value)} />
        <span className="sheet-hint reminder-sheet-hint">매일 이 시간에 이 문장으로 알림이 와요.</span>
      </label>

      <footer className="dialog-footer">
        {editing && <button className="delete-entry" type="button" onClick={remove}>알림 삭제</button>}
        <span className={`save-status ${failed ? 'save-status-error' : ''}`} role="status" aria-live="polite">{failed ? '저장하지 못함' : ''}</span>
        <button className="ghost-button" type="button" onClick={close}>취소</button>
        <button className="save-entry" type="submit" disabled={!valid}>{editing ? '저장' : '추가'}</button>
      </footer>
    </form>
  </dialog>
}
