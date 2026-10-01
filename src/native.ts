import { Capacitor } from '@capacitor/core'
import { reminderNotificationIds, reminderOccurrences, type Reminder } from './lib/reminders'

// True inside the Android app build; the web/PWA build keeps using browser APIs.
export const isNative = Capacitor.isNativePlatform()

// WebView blocks <a download>, so the app writes the backup to its cache and opens the share sheet
// (Drive, My Files, KakaoTalk, ...). Plugins load lazily so the web bundle never pulls them in.
export async function shareBackup(fileName: string, json: string): Promise<'shared' | 'cancelled'> {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  const { uri } = await Filesystem.writeFile({ path: fileName, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
  try {
    await Share.share({ title: 'girok 백업', url: uri, dialogTitle: '백업 파일 저장' })
    return 'shared'
  } catch {
    // Share rejects when the user dismisses the sheet.
    return 'cancelled'
  }
}

export async function listenBackButton(handler: () => void): Promise<() => void> {
  const { App } = await import('@capacitor/app')
  const listener = await App.addListener('backButton', handler)
  return () => { void listener.remove() }
}

export async function exitApp(): Promise<void> {
  const { App } = await import('@capacitor/app')
  await App.exitApp()
}

export type ReminderSyncResult = 'scheduled' | 'denied' | 'failed'

export async function reminderPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const { display } = await LocalNotifications.checkPermissions()
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
}

// Replaces every scheduled reminder notification with one-shot wake-up alarms for the enabled reminders
// (see reminderOccurrences). `prompt` asks for the notification permission when needed; at app start it
// stays false so opening the app never pops a dialog. `previous` lets ids of deleted reminders be cleared too.
// Syncs run one at a time: two quick edits must not interleave one's cancel with the other's schedule.
let syncQueue: Promise<unknown> = Promise.resolve()

export function syncReminders(reminders: Reminder[], prompt: boolean, previous: Reminder[] = []): Promise<ReminderSyncResult> {
  const run = syncQueue.then(() => syncRemindersNow(reminders, prompt, previous))
  syncQueue = run
  return run
}

async function syncRemindersNow(reminders: Reminder[], prompt: boolean, previous: Reminder[]): Promise<ReminderSyncResult> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const pending = await LocalNotifications.getPending()
    // Fired one-shots stay in the plugin's storage until cancelled, so cancel every id a reminder can own.
    const ids = new Set([...pending.notifications.map(({ id }) => id), ...reminderNotificationIds([...reminders, ...previous])])
    if (ids.size) await LocalNotifications.cancel({ notifications: [...ids].map((id) => ({ id })) })
    const occurrences = reminderOccurrences(reminders, new Date())
    if (!occurrences.length) return 'scheduled'
    let { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted' && prompt) display = (await LocalNotifications.requestPermissions()).display
    if (display !== 'granted') return 'denied'
    await LocalNotifications.createChannel({ id: 'reminders', name: '기록 알림', description: '직접 정한 시간에 오는 알림', importance: 4, visibility: 1 })
    await LocalNotifications.schedule({
      notifications: occurrences.map(({ notificationId, at, text }) => ({
        id: notificationId, title: text, body: '', channelId: 'reminders', smallIcon: 'ic_stat_girok', iconColor: '#4A7FCC',
        schedule: { at, allowWhileIdle: true },
      })),
    })
    return 'scheduled'
  } catch {
    return 'failed'
  }
}
