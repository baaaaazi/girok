# girok

조용하게 하루를 기록하는 개인용 웹앱입니다. 4×6 시간 격자에서 한 시간에 최대 두 활동과 짧은 메모를 남기고, 원형 하루 돌아보기와 달력으로 기록을 다시 살펴볼 수 있습니다.

## 개발

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
npm run preview
```

## 기술

- React + Vite + TypeScript
- Tailwind CSS와 작은 범위의 프로젝트 CSS 토큰
- `vite-plugin-pwa` (manifest, 오프라인 서비스 워커)

기록은 서버나 외부 API 없이 브라우저 `localStorage`의 `girok:data:v2` 키에 저장됩니다. 이전 `girok:data:v1` 데이터는 처음 읽을 때 새 형식으로 마이그레이션하며, 기존 키의 원본 바이트는 보존합니다. 테마 선택도 같은 방식으로 저장됩니다.

## JSON 백업과 복원

설정 → 데이터 백업에서 **백업 파일 내보내기**를 눌러 v2 전체 데이터를 내려받을 수 있습니다. 복원할 때는 **백업 파일 가져오기**로 v1 또는 v2 백업 파일을 선택하세요. 가져오기 전에 버전, 날짜, 시간, 카테고리, 메모 길이, 활동 수를 검증하며 검증에 실패한 파일은 현재 데이터를 덮어쓰지 않습니다.

설정 → 정리하기의 데이터 삭제는 브라우저 확인과 별도의 명시적인 영구 삭제 버튼을 모두 거쳐야 합니다.

`npm run self-check`는 날짜 경계, v1→v2 마이그레이션, 저장 안전성, 시간 CRUD, 함께 기록한 활동의 시간별 공존, 카테고리별 기록 시간 집계를 확인하는 작은 실행 검증입니다.

## 배포

- **웹(PWA)**: `main`에 푸시하면 `.github/workflows/deploy.yml`이 GitHub Pages(`/girok/`)에 배포합니다. 폰에서 사이트를 열고 "홈 화면에 추가"로 설치하세요.
- **안드로이드 APK**: JDK 21과 Android SDK가 필요합니다.

```bash
npm run build:android
cd android && ./gradlew assembleDebug
```

결과물은 `android/app/build/outputs/apk/debug/app-debug.apk`입니다. 앱 안에서는 백업 내보내기가 공유 창으로 열리고, 뒤로 가기 버튼은 열린 창 → 여러 칸 선택 → 기록 화면 순서로 닫습니다.
