// Daily reminders the user schedules themselves (APK only; the web build cannot fire them while closed).
// Stored apart from records and routines so neither format changes.

export type Reminder = {
  id: number // notification ids are derived from it (see reminderOccurrences), so it stays below REMINDER_ID_LIMIT
  time: string // HH:MM, 24-hour
  text: string
  enabled: boolean
}

export type ReminderData = { version: 1; reminders: Reminder[] }

export const REMINDER_STORAGE_KEY = 'girok:reminders:v1'
export const EMPTY_REMINDER_DATA: ReminderData = { version: 1, reminders: [] }
export const REMINDER_TEXT_MAX_LENGTH = 40
export const REMINDER_MAX = 10
export const REMINDER_ID_LIMIT = 20_000_000 // * 100 + slot still fits Android's 32-bit notification id
// The plugin re-arms its own daily repeats as non-wakeup alarms that Doze can hold back, so each reminder
// is scheduled as one-shot wake-up alarms for the next REMINDER_DAYS days, refreshed whenever the app opens.
export const REMINDER_DAYS = 14

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validTime(value: unknown): value is string {
  return typeof value === 'string' && timePattern.test(value)
}

function validReminder(value: unknown): value is Reminder {
  if (!isPlainObject(value)) return false
  return Number.isInteger(value.id) && Number(value.id) > 0 && Number(value.id) < REMINDER_ID_LIMIT
    && validTime(value.time)
    && typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= REMINDER_TEXT_MAX_LENGTH
    && typeof value.enabled === 'boolean'
}

export function validateReminderData(value: unknown): value is ReminderData {
  if (!isPlainObject(value) || value.version !== 1 || !Array.isArray(value.reminders)) return false
  if (value.reminders.length > REMINDER_MAX || !value.reminders.every(validReminder)) return false
  return new Set(value.reminders.map((reminder) => reminder.id)).size === value.reminders.length
}

export function readReminderData(): ReminderData {
  try {
    const raw = localStorage.getItem(REMINDER_STORAGE_KEY)
    if (!raw) return EMPTY_REMINDER_DATA
    const parsed: unknown = JSON.parse(raw)
    return validateReminderData(parsed) ? parsed : EMPTY_REMINDER_DATA
  } catch {
    return EMPTY_REMINDER_DATA
  }
}

export function writeReminderData(data: ReminderData): boolean {
  if (!validateReminderData(data)) return false
  try {
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function newReminderId(data: ReminderData): number {
  return data.reminders.reduce((max, reminder) => Math.max(max, reminder.id), 0) + 1
}

// Kept in time order so the list reads like the day.
export function upsertReminder(data: ReminderData, reminder: Reminder): ReminderData {
  const rest = data.reminders.filter((item) => item.id !== reminder.id)
  return { version: 1, reminders: [...rest, reminder].sort((a, b) => a.time.localeCompare(b.time) || a.id - b.id) }
}

export function removeReminder(data: ReminderData, id: number): ReminderData {
  return { version: 1, reminders: data.reminders.filter((reminder) => reminder.id !== id) }
}

export function splitTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map(Number)
  return { hour, minute }
}

// "오후 12:30" style, matching how Android shows times in Korean.
export function timeLabel(time: string): { period: string; clock: string } {
  const { hour, minute } = splitTime(time)
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return { period: hour < 12 ? '오전' : '오후', clock: `${twelve}:${String(minute).padStart(2, '0')}` }
}

export type ReminderOccurrence = { notificationId: number; at: Date; text: string }

// Upcoming firings of the enabled reminders, from `now` through the next REMINDER_DAYS days.
// Slot n is n days after today, so a re-sync on a later day reuses the same ids and overwrites them.
export function reminderOccurrences(reminders: Reminder[], now: Date, days = REMINDER_DAYS): ReminderOccurrence[] {
  const occurrences: ReminderOccurrence[] = []
  for (const reminder of reminders) {
    if (!reminder.enabled) continue
    const { hour, minute } = splitTime(reminder.time)
    for (let slot = 0; slot < days; slot += 1) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + slot, hour, minute, 0, 0)
      if (at.getTime() <= now.getTime()) continue
      occurrences.push({ notificationId: reminder.id * 100 + slot, at, text: reminder.text })
    }
  }
  return occurrences.sort((a, b) => a.at.getTime() - b.at.getTime())
}

// Every notification id a reminder can own, so stale ones can be cancelled even after they fired.
export function reminderNotificationIds(reminders: Reminder[], days = REMINDER_DAYS): number[] {
  return reminders.flatMap((reminder) => Array.from({ length: days }, (_, slot) => reminder.id * 100 + slot))
}
