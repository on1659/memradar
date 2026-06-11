# 내 페르소나 진단 탭 — 설계 사양

> memradar 작업 지시서. 이 문서가 단일 진실 출처(SSOT).

## 목표

memradar 에 "내 페르소나 진단" 탭을 추가해서, 자동 분류(세션 데이터 기반)에 사용자 자기 응답을 결합해 Personality 결과의 정확도를 높인다. **자동 분류는 무변경 — 보정만 추가**.

## 현재 상태

- 프로젝트 루트: `d:\Work\vibe\promptale` (memradar)
- 자동 분류:
  - `d:\Work\vibe\promptale\src\lib\usageProfile.ts` — 9 카테고리 (feature/debug/refactor/review/writing/design/devops/data/test)
  - `d:\Work\vibe\promptale\src\lib\personality.ts` — 3축
- 출력: Wrapped Personality 슬라이드, Dashboard "내 AI의 직업" 카드
- 진술 사전 이미 있음: `d:\Work\vibe\promptale\scripts\eval-sharpness-statements.json` (9 카테고리 × 5 진술, 키 = USAGE_CATEGORIES id)
- CLI 검사 도구: `d:\Work\vibe\promptale\scripts\eval-sharpness.mts` (계산 로직 재사용 가능 — `mulberry32`, `generatePairs`, `computeStats` export 되어 있음)
- lesson: `d:\Work\vibe\promptale\.claude\knowledge\lessons\personality-eval.md` (L-1 바넘, L-2 sharpness)

## 추가 사양

### 1. "내 페르소나 진단" 진입점

- 위치: Dashboard "AI가 자주 한 일" 카드 헤더의 진단 버튼 (`#persona` 라우트로 전체화면 진입)
  - ※ 결정(2026-06-03): 원안 "상단 nav 탭" 대신 카드 헤더 버튼으로 확정. App.tsx 라우팅은 `View` discriminated union + 해시 라우팅(`#persona`) 기반이며 상단 nav 탭 배열 구조가 없음.
- 진입 시 시작 화면: 안내문 + "시작" 버튼
- 미완료 시 종료/이탈하면 다음 방문 시 처음부터

### 2. 검사 UX
- **9쌍**, 카테고리당 정확히 2회 등장 보장 (균등 샘플링)
- 한 화면 한 쌍: 진술 (1), 진술 (2), [선택1] [선택2] [잘 모르겠어요(skip)] 버튼
- 진행률 바 상단 (1/9, 2/9 ...)
- 검사 중 카테고리 정보 노출 절대 금지 (바넘 측정 무결성)
- 진술 사전: `d:\Work\vibe\promptale\scripts\eval-sharpness-statements.json` 그대로 사용
- PRNG: `d:\Work\vibe\promptale\scripts\eval-sharpness.mts` 의 `mulberry32` 재사용
- 페어 생성: 균등 샘플링 로직 신규 (각 카테고리 정확히 2회 등장하도록)

### 3. 재계산 로직 (confidence-weighted blend)

각 카테고리 X 에 대해:

```
quiz_pickrate[X]  = X 진술 선택 비율 (0~1)
quiz_sharpness[X] = |quiz_pickrate[X] - 0.5| * 2
w[X]              = min(quiz_sharpness[X], 0.6)

if quiz_appearances[X] >= 2:
  final[X] = auto[X] * (1 - w[X]) + quiz_pickrate[X] * w[X]
else:
  final[X] = auto[X]
```

- 자동 분류 값은 `usageProfile.ts` 가 산출하는 카테고리별 normalized score (0~1) 를 사용. 만약 raw score 라면 정규화 후 적용.
- 3축 personality (style/scope/rhythm) 는 9 카테고리와 직접 매핑되지 않으므로 보정 안 함 — 이번 작업 scope 외.

### 4. 결과 표시
- 검사 완료 직후: 결과 화면에 검사 전/후 비교 카드
  - 좌: "자동 분류" 카테고리 분포 (기존 distribution 시각화 재사용)
  - 우: "보정 후" 카테고리 분포
  - 차이가 큰 카테고리 1~3개 강조 (예: "리팩터링 전문가가 +18% 강해졌어요")
- Dashboard "내 AI의 직업" 카드: 보정 결과 반영
- Wrapped Personality 슬라이드: 보정 결과 반영
- 보정 결과가 존재하지 않으면 (검사 안 한 사용자) 자동 분류만 표시

### 5. 저장 (localStorage)

- 메커니즘: 브라우저 **localStorage** 키 `memradar.personaQuiz.v1` (`src/lib/personaQuizStorage.ts`)
  - ※ 결정(2026-06-03): 원안 `~/.memradar/personality-quiz.json` 파일 IO 대신 localStorage로 확정. memradar 프론트는 정적 빌드 + 읽기전용 `cli/index.mjs` 브릿지(`/api/light-sessions`)만 있어 파일 쓰기 endpoint가 없음. localStorage가 번들 경계·데이터 안전성 측면에서 정석이며 외부전송 0 불변조건도 만족.
- 논리 스키마(저장 객체 형태, 키만 다름):

```json
{
  "version": 1,
  "ts": "ISO timestamp",
  "seed": 0,
  "answers": [
    { "leftCategory": "...", "rightCategory": "...", "chosen": "left" }
  ],
  "calibration": {
    "feature": { "pickRate": 0.5, "sharpness": 0.0, "weight": 0.0, "finalScore": 0.42 }
  }
}
```

- `answers` 는 9개, `chosen` 은 `"left" | "right" | "skip"`
- 읽기/쓰기 API: `loadPersonaQuiz` / `savePersonaQuiz` / `clearPersonaQuiz` (`src/lib/personaQuizStorage.ts`, localStorage)
- 외부 네트워크 전송 0

### 6. 재검사
- 결과 화면에 "다시 하기" 버튼
- 클릭 시 새 시드로 9쌍 재생성, 응답 새로 받음, localStorage 덮어쓰기

## 불변 조건 (위반 절대 금지)

- Wrapped 슬라이드 8장 구조 무변경 (Cover→Intro→Prompts→Model→Hours→Personality→Usage→Share)
- `d:\Work\vibe\promptale\src\components\wrapped\ToolsSlide.tsx` import 금지
- 세션 데이터 외부 전송 금지 (CLAUDE.md)
- `d:\Work\vibe\promptale\src\parser.ts` + `types.ts` 동시 변경 시 보고 후 진행
- 자동 분류 로직 (`usageProfile.ts`, `personality.ts`) 무변경 — 보정 결과만 별도 계산
- 검사 응답은 사용자별 (`~/.memradar/` 한 파일) — 외부 공유 0
- 모든 파일 경로는 절대 경로로 응답에 표기

## 하네스

이 작업은 **COMPLEX** (`d:\Work\vibe\promptale\.claude\rules\harness.md`) — 새 UI 컴포넌트(탭+검사+결과), 새 분석 메트릭(보정 결과), 새 파일 IO 패턴. 진행:

1. **Scout** (`d:\Work\vibe\promptale\.claude\agents\scout.md`) — Dashboard 라우팅·탭 구조, Personality 슬라이드 의존성, Node.js 브릿지 IO 패턴, usageProfile 의 출력 형태(raw vs normalized) 정찰
2. 정찰 후 영향 범위가 위 사양과 다르면 멈추고 보고
3. **Coder** (`d:\Work\vibe\promptale\.claude\agents\coder.md`) — 신규 컴포넌트·로직·IO 구현
4. **Reviewer** (`d:\Work\vibe\promptale\.claude\agents\reviewer.md`) — 타입·불변조건·UI 일관성·데이터 안전성
5. **QA** (`d:\Work\vibe\promptale\.claude\agents\qa.md`) — 흐름·재시도·외부 호출 0 검증

## 수용 기준 (Done When)

- [ ] Dashboard 에 "내 페르소나 진단" 탭 표시, 클릭하면 진입
- [ ] 9쌍 검사 완주 → 결과 화면 (전/후 비교)
- [ ] Dashboard 카드 + Wrapped Personality 슬라이드 양쪽에 보정 결과 반영
- [ ] `~/.memradar/personality-quiz.json` 저장 + 재방문 시 결과 유지
- [ ] "다시 하기" → 새 시드, 새 9쌍, 파일 덮어쓰기
- [ ] DevTools Network 탭 외부 호출 0
- [ ] 검사 안 한 사용자는 자동 분류만 표시 (regression 없음)
- [ ] `npm run test:sharpness` 36/36 유지
- [ ] `npm run test:harness` (lint + build + e2e) 통과
- [ ] 보정 공식 단위 테스트 신규 추가 (`computeCalibration` 또는 동등 함수)

## 응답 / 결과물 규칙

- 모든 파일 경로 절대 경로
- 설계 문서는 `d:\Work\vibe\promptale\docs\design\` 에 저장 (gstack 홈 금지)
- 트리아지 1줄 선언 후 진행
- 정찰·구현·리뷰·QA 각 단계 보고서를 사용자에게 짧게 요약
