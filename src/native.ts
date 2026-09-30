import { Capacitor } from '@capacitor/core'

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
