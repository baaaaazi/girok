# 루틴 기능 계획 (다음 세션 인수인계)

girok은 폰(갤럭시) 위주로 쓰는 개인 하루 기록 앱이다. 웹은 GitHub Pages(https://baaaaazi.github.io/girok/), 안드로이드는 Capacitor APK(`npm run build:android` → `android/`에서 `./gradlew assembleDebug`, JDK 21 경로: `C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`).
사용자가 특히 만족한 것: 애니메이션, 다크 테마. 바텀시트는 바깥을 누르면 닫혀야 한다.

## 사용자가 정한 방향
- 마이루틴 같은 기능을 **별도 앱이 아니라 girok 안에** 넣는다 (하단 탭에 "루틴" 추가).
- 루틴은 **시간과 상관없이** 설정하고, 그날 **했는지/안 했는지만 체크**한다.
- **목표와 디데이**를 설정할 수 있어야 한다 (날짜 없는 목표도 허용).
- 알림은 **사용자가 직접 정한 시간대**에 온다 (예: 점심 12:30 "오전 기록하기", 자기 전 23:00 "오늘 루틴 체크"). 시간과 내용은 추가하고 지울 수 있게.

## 진행 순서
1. **루틴 탭**: 루틴 만들기·수정·삭제, 오늘 체크, 연속 달성(streak), 목표/디데이
2. 달력(날짜별 루틴 달성 표시), 돌아보기(달성률), 기록 화면 위쪽에 가장 가까운 디데이
3. 알림: 사용자 지정 시간 (Capacitor Local Notifications, APK 우선)
4. 나만의 기록 카테고리 (기록 칸용, 루틴과는 별개)
5. 인사이트 문장("지난주보다 수면 40분 줄었어요")과 연속 기록

## 1단계 설계 (확정)
- 데이터: 기존 기록 저장(`girok:data:v2`)은 **건드리지 않는다**. 루틴은 별도 키 `girok:routines:v1`에 `RoutineData`로 저장. 타입은 `src/types/routine.ts`에 작성해 둠.
- 반복: `매일` / `특정 요일`(0=일요일) / `주 N회`(일요일 시작 주). 시간 설정 없음. `createdAt` 이전 날짜에는 표시하지 않는다.
- 연속 달성: 매일·요일 루틴은 해야 하는 날 기준 연속 일수(오늘 아직 안 했으면 어제까지로 계산), 주 N회는 목표를 채운 연속 주 수.
- 디데이: `D-12` / `D-day` / `D+3`, 날짜 없으면 "목표".
- 백업: 내보낼 때 `{ version: 2, records, routineData }` 형태로 넣는다. 예전 앱은 `routineData`를 무시하므로 호환된다. 가져오기에서 `routineData`가 있으면 검증 후 복원. "모든 기록 삭제"는 루틴도 지운다.
- 로직은 `src/lib/routines.ts`(순수 함수: 오늘 해야 하는지, 체크 토글, streak, 주간 횟수, 디데이, 검증, 읽기/쓰기)로 만들고 `scripts/self-check.ts`에 검증을 추가한다. `src/lib`는 `.tsx`를 import하면 안 된다(self-check가 node로 실행됨).
- 화면 (`src/RoutinePage.tsx`):
  - 위: 날짜 이동 `‹ 9월 30일 수요일 ›` (기록 화면과 선택 날짜 공유), 오늘이 아니면 "오늘로"
  - 목표 카드 가로 스크롤 (이름 + 큰 D-n), 탭하면 수정 시트, 없으면 점선 카드로 추가 유도
  - "오늘의 루틴 3/5" + 진행 막대, 루틴 줄: 체크 원 + 아이콘 + 이름 + 연속 🔥/이번 주 1/3, 오른쪽 ⋯ 로 수정
  - 체크하면 원이 색으로 채워지며 튀는 애니메이션, 줄 배경이 카테고리 색으로 옅게 채워짐
  - 오늘 쉬는 루틴은 아래에 흐리게, 미래 날짜는 체크 불가
  - 루틴이 없으면 추천 칩(물 마시기, 운동하기, 책 읽기, 일기 쓰기)
  - 시트: 이름, 아이콘 16개(`ROUTINE_ICON_IDS`), 색 8개(`ROUTINE_COLORS`), 반복 선택. 기존 `.entry-dialog` 바텀시트 스타일과 닫기 동작(바깥 탭, 뒤로 가기, 애니메이션)을 그대로 따른다.
- 하단 탭: 기록 | 루틴 | 달력 | 돌아보기 (4칸). 안드로이드 뒤로 가기 처리(`backHandler`)는 열린 시트를 `cancel` 이벤트로 닫으므로 새 시트도 `onCancel`을 쓰면 된다.

## 확인 방법
- `npx tsc -b`, `npm run self-check`, `npm run build`
- 폰 크기(375px, 320px)와 다크 모드에서 먼저 확인
- 안드로이드 에뮬레이터 `medium_phone` + adb(`input draganddrop`, `input keyevent 4`)로 실제 터치 확인. WebView 디버깅은 `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`
