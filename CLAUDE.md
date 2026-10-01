# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

girok is a personal, serverless day-recording app: a 4×6 grid of 24 hour cells, each holding one or two activities (category + optional memo), plus a day ring, calendar, and day/week/month review. UI copy is Korean. It is used almost entirely on an Android phone (Galaxy), so design and verify at 375px/320px and in dark mode first; desktop only needs to not break. It ships two ways from one codebase: a PWA on GitHub Pages and a Capacitor Android APK.

## Commands

```bash
npm run dev            # Vite dev server (http://localhost:5173)
npx tsc -b             # typecheck only
npm run self-check     # the only test suite: scripts/self-check.ts (plain node:assert, runs top to bottom)
npm run build          # typecheck + web build to dist/
npm run build:pages    # build with --base=/girok/ (what CI deploys)
npm run build:android  # vite build --mode native + cap sync android
```

There is no linter and no per-test runner; `self-check` is one script — add assertions to it and run the whole file. It imports `src/lib/*` and `src/types/*` directly through `node --experimental-strip-types`, so those modules must stay plain `.ts` with explicit `.ts` import extensions and must never import `.tsx`, React, or Capacitor.

APK (needs JDK 21 and the Android SDK at `%LOCALAPPDATA%\Android\Sdk`):

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.101-hotspot"
npm run build:android && (cd android && ./gradlew assembleDebug)
# -> android/app/build/outputs/apk/debug/app-debug.apk (copy to release/girok.apk, which is gitignored)
```

On-device checks use the `medium_phone` emulator and adb. Call it as plain `adb` after `export PATH="$PATH:$LOCALAPPDATA/Android/Sdk/platform-tools"` (not through a `$ADB` variable), so the `Bash(adb *)` allow rule matches; commits, `./gradlew assembleDebug` and copying the APK to `release/` are allowed too, while `git push` (it deploys) still asks. Use single-gesture commands (`adb shell input draganddrop x1 y1 x2 y2 1500` for long-press-drag, `input swipe x y x y 1000` for long-press, `input keyevent 4` for back); separate `input motionevent` calls are not seen as one gesture. The WebView is debuggable in debug builds: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` then drive it over CDP.

Pushing to `main` deploys to https://baaaaazi.github.io/girok/ via `.github/workflows/deploy.yml` (runs self-check, then `build:pages`).

## Architecture

- `src/App.tsx` holds nearly all UI as one file of function components: `App` owns every piece of state (data, page, selected date, review mode, theme, multi-select `selection`, `editorHours`) and passes callbacks down. There is no router or state library; `page` is a string union and `<main key={page}>` remounts pages (which replays entrance animations).
- `src/RoutinePage.tsx` is the 루틴 tab (routine list, goal/D-day strip, and their sheets); `App` owns `routineData` and passes `onChange`. `src/sheet.ts` has `useSheet`, the shared open/close/backdrop behavior for new bottom sheets (`EntryDialog` still has its own copy).
- `src/lib/` is pure logic: `date.ts` (date keys are local `YYYY-MM-DD` strings), `records.ts` (immutable edits like `replaceHours`, aggregation like `categoryPresence`, `timeBlocks` for the day timeline), `storage.ts` (localStorage, validation, migration, backup import), `routines.ts` (routine validation, storage, due days, streaks, D-day), `categories.ts` (custom record categories: validation, storage, `categoryMeta` lookup, `reassignCategory`), `insights.ts` (period-over-period category changes per recorded day, recording streak, Korean 이/가 particle), `heatmap.ts` (the 돌아보기 1년 tab: last 365 days with hour-based levels 0–4 and the `dayComplete` dot, Sunday-first week columns, month labels, the year's stat tiles, and per-month daily averages for the month bars), `reminders.ts` (daily reminders: validation, storage, `reminderOccurrences`).
- Data shape (`src/types/record.ts`): `{ version: 2, records: { [dateKey]: { [hour '0'..'23']: { segments: [Activity] | [Activity, Activity] } } } }`. `Activity.category` is a built-in id or a custom `c-…` id; records accept any well-formed custom id even without its definition (it renders as "지운 카테고리"), and deleting a custom category first moves its hours to `other`. Every write goes through `writeData`, which fully validates and rewrites the whole blob — keep writes infrequent (memo typing is debounced in `EntryDialog`).
- Storage keys: `girok:data:v2` (canonical), `girok:data:v1` (legacy; migrated on read, original bytes preserved), `girok:data:v2:unreadable` (an unparseable v2 blob is parked here before falling back), `girok:routines:v1` (routines, checks, goals — kept apart so the v2 format never changes), `girok:categories:v1` (up to 12 custom categories: name, icon, color), `girok:reminders:v1` (up to 10 daily reminders; device-local, not in backups), `girok:widget:v1` (widget background opacity; device-local), theme and hint flags. Backups are `{ version: 2, records, routineData, categoryData }`; import accepts v1 and v2 files up to 20MB, strips everything but `records` before writing v2, and keeps current routines/categories when a file lacks them. "모든 기록 삭제" clears records and routines but keeps custom categories.
- Category colors come from one hex per category (`CATEGORY_META` for built-ins, `CATEGORY_COLORS` for custom ones); components resolve any id through `useCategories()` from `src/CategorySheet.tsx` (a context `App` provides), and `CategoryIcon` lives there too. All glyphs are one path table in `src/icons.tsx`. CSS derives fill/stroke/icon tints for any element whose inline style sets `--category` (the `[style*='--category']` rule in `styles.css`); two-activity cells use `--category-a`/`--category-b`. Icons are hand-drawn SVG paths in `src/icons.tsx`.
- `src/styles.css` is hand-written CSS with tokens on `:root` and `:root[data-theme='dark']` (Tailwind is installed but essentially unused). The theme attribute is set before paint by the inline script in `index.html` and kept in sync by `App`. Motion uses transform/opacity keyframes with stagger via a `--i` custom property, all disabled under `prefers-reduced-motion`.
- Bottom sheets are native `<dialog>` elements shown with `showModal()`. They close from a timer after the exit animation (not the dialog `close` event, which some WebViews defer), on backdrop tap (press and release both on the backdrop), and on `cancel`. Closing a multi-hour sheet without saving keeps the selection.
- Hour-grid multi-select (`HourGrid`): long-press (420ms, with haptic) then drag selects a range; a non-passive `touchmove` listener blocks scrolling only while dragging, and a window `pointerup` ends drags that leave the grid.
- Native vs web: `src/native.ts` exposes `isNative`; Capacitor plugins are imported lazily there so the web bundle does not load them. In the app, backup export goes through Filesystem + Share (WebView blocks `<a download>`), and the Android back button closes the open sheet → clears multi-select → returns to the record page → exits. `vite --mode native` disables the PWA service worker; the web build runtime-caches Pretendard font subsets instead of precaching all of them.
- Reminders (APK only; the web settings section just says so): `src/ReminderSettings.tsx` edits them, `syncReminders` in `src/native.ts` books them through `@capacitor/local-notifications`. The plugin re-arms its own daily `on` repeats as non-wakeup `RTC` alarms that Doze can delay, so each reminder is instead booked as one-shot `allowWhileIdle` alarms for the next 14 days (notification id = reminder id × 100 + day slot) and re-synced whenever the app becomes visible; syncs are queued so quick edits do not interleave. The manifest adds `USE_EXACT_ALARM` so exact alarms work without the "Alarms & reminders" settings detour; the status-bar icon is `res/drawable/ic_stat_girok.xml`. Verify on the emulator with `dumpsys alarm` (expect `RTC_WAKEUP ... exactAllowReason=policy_permission`) and `dumpsys notification`.
- Home-screen widget (APK only): `GirokWidgetProvider.java` draws today's hours (24-cell strip, four groups of six) and today's due routines with tap-to-check; `WidgetStore.java` keeps its data in SharedPreferences `girok_widget`. The app pushes a `widgetSnapshot` (`src/lib/widget.ts`: hour colors, routines with weekday rules, today/yesterday checks, theme, background opacity from 설정 → 홈 화면 위젯, and each routine's right-hand label — 🔥 streak or this week's count — for today both undone and done, so a widget tap can flip it) through the `GirokWidget` plugin (`WidgetPlugin.java`, registered in `MainActivity`) whenever records/routines/categories/theme change. Widget taps write the snapshot and queue `{date, id, done}` ops; the app takes them on open/visible and applies them with `applyWidgetOps`, and pending ops are laid over every new snapshot until then. The widget computes due routines itself (mirrors `isDue`) and redraws at midnight via an exact non-waking `RTC` alarm. Theme `system` uses `values-night` colors; `light`/`dark` override them in code. To check on the emulator: add it from the launcher's widget picker, then read `run-as io.github.baaaaazi.girok cat shared_prefs/girok_widget.xml` and `dumpsys alarm | grep widget.REFRESH`.

## Roadmap status

The routine roadmap (루틴 tab, calendar/review/D-day integration, notifications, custom record categories, review insights and recording streak) is complete, plus a celebration pass on routine checks. The user uses the web build day to day and plans to move to the APK once the app feels finished.

## Next up (agreed with the user, 2026-10-01)

1. ~~1년 잔디 (year heatmap)~~ — done (2026-10-01): 돌아보기 → 1년 tab, `YearHeatmap` in `App.tsx`, logic in `src/lib/heatmap.ts`.
2. ~~홈 화면 위젯 (APK only)~~ — done (2026-10-01): see the widget bullet under Architecture. Still to do with the user when they move to the APK: walk them through moving data from the web build (설정 → 백업 파일 내보내기 on the web, then 가져오기 in the app).

The user explicitly declined a streak-freeze feature.
