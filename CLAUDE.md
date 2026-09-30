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

On-device checks use the `medium_phone` emulator and adb. Use single-gesture commands (`adb shell input draganddrop x1 y1 x2 y2 1500` for long-press-drag, `input swipe x y x y 1000` for long-press, `input keyevent 4` for back); separate `input motionevent` calls are not seen as one gesture. The WebView is debuggable in debug builds: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` then drive it over CDP.

Pushing to `main` deploys to https://baaaaazi.github.io/girok/ via `.github/workflows/deploy.yml` (runs self-check, then `build:pages`).

## Architecture

- `src/App.tsx` holds nearly all UI as one file of function components: `App` owns every piece of state (data, page, selected date, review mode, theme, multi-select `selection`, `editorHours`) and passes callbacks down. There is no router or state library; `page` is a string union and `<main key={page}>` remounts pages (which replays entrance animations).
- `src/RoutinePage.tsx` is the 루틴 tab (routine list, goal/D-day strip, and their sheets); `App` owns `routineData` and passes `onChange`. `src/sheet.ts` has `useSheet`, the shared open/close/backdrop behavior for new bottom sheets (`EntryDialog` still has its own copy).
- `src/lib/` is pure logic: `date.ts` (date keys are local `YYYY-MM-DD` strings), `records.ts` (immutable edits like `replaceHours`, aggregation like `categoryPresence`, `timeBlocks` for the day timeline), `storage.ts` (localStorage, validation, migration, backup import), `routines.ts` (routine validation, storage, due days, streaks, D-day).
- Data shape (`src/types/record.ts`): `{ version: 2, records: { [dateKey]: { [hour '0'..'23']: { segments: [Activity] | [Activity, Activity] } } } }`. Every write goes through `writeData`, which fully validates and rewrites the whole blob — keep writes infrequent (memo typing is debounced in `EntryDialog`).
- Storage keys: `girok:data:v2` (canonical), `girok:data:v1` (legacy; migrated on read, original bytes preserved), `girok:data:v2:unreadable` (an unparseable v2 blob is parked here before falling back), `girok:routines:v1` (routines, checks, goals — kept apart so the v2 format never changes), theme and hint flags. Backups are `{ version: 2, records, routineData }`; import accepts v1 and v2 files up to 20MB, strips everything but `records` before writing v2, and keeps current routines when a file has no `routineData`.
- Category colors come from one hex per category (`CATEGORY_META`). CSS derives fill/stroke/icon tints for any element whose inline style sets `--category` (the `[style*='--category']` rule in `styles.css`); two-activity cells use `--category-a`/`--category-b`. Icons are hand-drawn SVG paths in `src/icons.tsx`.
- `src/styles.css` is hand-written CSS with tokens on `:root` and `:root[data-theme='dark']` (Tailwind is installed but essentially unused). The theme attribute is set before paint by the inline script in `index.html` and kept in sync by `App`. Motion uses transform/opacity keyframes with stagger via a `--i` custom property, all disabled under `prefers-reduced-motion`.
- Bottom sheets are native `<dialog>` elements shown with `showModal()`. They close from a timer after the exit animation (not the dialog `close` event, which some WebViews defer), on backdrop tap (press and release both on the backdrop), and on `cancel`. Closing a multi-hour sheet without saving keeps the selection.
- Hour-grid multi-select (`HourGrid`): long-press (420ms, with haptic) then drag selects a range; a non-passive `touchmove` listener blocks scrolling only while dragging, and a window `pointerup` ends drags that leave the grid.
- Native vs web: `src/native.ts` exposes `isNative`; Capacitor plugins are imported lazily there so the web bundle does not load them. In the app, backup export goes through Filesystem + Share (WebView blocks `<a download>`), and the Android back button closes the open sheet → clears multi-select → returns to the record page → exits. `vite --mode native` disables the PWA service worker; the web build runtime-caches Pretendard font subsets instead of precaching all of them.

## In-progress work

`ROUTINE_PLAN.md` is the agreed routine roadmap. Steps 1 (the 루틴 tab) and 2 (calendar dot, review completion rates, record-page D-day chip) are done; next is step 3: user-scheduled notifications (Capacitor Local Notifications, APK first). Routines must stay under their own key and must not change the `girok:data:v2` format.
