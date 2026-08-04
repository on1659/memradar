# Architecture

Memradar의 기술 결정·디렉터리 구조·데이터 흐름 문서. 현재(`v0.2.12`) 구현을 기준으로 작성됐고, 미래 계획은 명시적으로 표시한다.

## 기술 결정

| 결정 | 선택 | 이유 |
|---|---|---|
| 플랫폼 | 웹 전용 | 설치 없이 URL 공유 가능 |
| 배포 | Vercel 정적 사이트 | 서버 불필요, 모든 처리 브라우저에서 |
| 저장소 | 메모리 (향후 필요 시 IndexedDB 도입) | 현재는 재파싱 비용이 충분히 낮음. 규모 증가 시 캐시 확장 |
| 상태관리 | React 내장 훅 (`useState`/`useEffect`) | 앱 규모상 외부 라이브러리 불필요. 규모 증가 시 Zustand 검토 |
| 라우팅 | 해시 기반 (`location.hash`) | 정적 배포·`file://` 호환, 의존성 0 |
| 다중 Provider | 플러그인 아키텍처 | 공통 인터페이스 + 자동 감지 |
| 검색 | 메모리 인덱스 → 점진적 캐시 | MVP는 단순하게, 규모 증가 시 확장 |
| 애니메이션 | Framer Motion | Wrapped 슬라이드 전환 |
| 이미지 생성 | html-to-image | SNS 공유 카드 캡처 |

## 현재 스택

- **프레임워크**: React 19.2 + TypeScript 6
- **빌드**: Vite 8.0 (`build` = `tsc -b && vite build`)
- **스타일**: Tailwind CSS v4.2 (`@tailwindcss/vite` 플러그인)
- **아이콘**: Lucide React 1.8
- **날짜**: date-fns 4
- **애니메이션**: Framer Motion 12.38
- **이미지 캡처**: html-to-image 1.11
- **테스트**: Playwright (`test:e2e`) + `test:cli` + 단위 테스트(`tests/*.test.mts` — growth·coding-rhythm·story-of-day·collab-fingerprint·persona·coaching·secretmask 등) + `test:harness`(lint→build→cli→단위→e2e)
- **배포**: Vercel (`vercel.json` = `{buildCommand:"npm run build", outputDirectory:"dist", framework:"vite"}`)

## 현재 디렉터리 구조

```
src/
├── providers/              # Provider 플러그인
│   ├── index.ts            # 레지스트리 + 자동 감지
│   ├── types.ts            # Provider 인터페이스
│   ├── claude.ts           # Claude Code 파서
│   └── codex.ts            # Codex 파서
├── lib/                    # 순수 로직 (React 없음)
│   ├── personality.ts      # 코딩 성격 3축 8유형 (Reader/Executor·Deep/Wide·Marathon/Sprint → RDM/RDS/RWM/RWS/EDM/EDS/EWM/EWS)
│   ├── languageProfile.ts  # 28개 언어 감지·집계
│   ├── usageProfile.ts     # 사용 카테고리 분석
│   ├── search.ts           # 검색 인덱스·매칭·스니펫
│   ├── modelNames.ts       # 모델명 정규화
│   ├── tokenPricing.ts     # 모델별 가격 데이터 + 테마 인식형 소스 색상
│   ├── cleanClaudeText.ts  # Claude Code .jsonl 노이즈 제거 (XML 태그·브래킷 어노테이션)
│   ├── sessionExport.ts    # 세션 export·복사 (Markdown · 자체완결 HTML 채팅/문서 톤 · 다운로드 헬퍼)
│   ├── promptCoaching.ts   # 성장 지표 기반 프롬프트 코칭 인사이트 (7룰: tip 4 + praise 3, 증거 기반 발화)
│   ├── codingRhythm.ts     # 코딩 리듬 집계 — 로컬 날짜 키 per-day 카운트 + 요일 분포 + 최장 연속 + 활동 밀도 + 시간대 밴드 비율(night/early/office). 활동 캘린더·요일 분포 카드와 AI 협업 지문(hourBandShares.night·totalMessages)의 단일 소스. 리듬 "라벨"/2순위 판정은 2026-06-14 재편으로 제거(코딩 리듬 인사이트 카드 폐지)
│   ├── modelIntensity.ts   # 모델별 사용 강도 — 세션을 model 별 그룹화, 세션당 평균 user 턴/토큰(getSessionTotalTokens 공식). 상위 N, 세션 0/모델 미상 가드. id+수치만 반환 (단축·카피는 UI)
│   ├── authorshipRatio.ts  # 나 vs AI 글 비중 — 역할별 단어 수(user vs assistant 메시지, stripMarkup+countWords) 비율, 0분모 가드. 분수 0~1 raw (% 변환은 UI). 토큰은 캐시·컨텍스트 추정 섞여 부적합
│   ├── storyOfDay.ts       # 그날 이야기 — per-day 협업 집계(buildDailyCollab: 메시지·구조화·토큰 + 가산 필드 단어 수(user/ai)·프로젝트·모델 Set) + 서사 점수 최고일 선정 (4항 가중합·결측 재정규화·source-aware, parser 의 matchRetryMarker/extractSkillNames 재사용)
│   ├── collabFingerprint.ts # AI 협업 지문 — 상호작용 신호 9종(주말 집중·구조화 변화·정정 후 계획·심야 비중·긴 세션 + AI 작성 비중 변화·지시 길이 변화·프로젝트 병행·모델 믹스 변화)의 본인 기준선 대비 lift, top 2~3 분포형. 신규 shift 3종(⑥⑦⑨)은 최근 30일 vs 이전 양방향(rankScore=max(lift,1/lift)) (dailyCollab·rhythm 주입형 — 카드 간 수치 드리프트 방지, parser 의 matchPlanMarker/matchRetryMarker 재사용)
│   ├── personaQuiz.ts      # 페르소나 진단 순수 로직 — 균등 페어 생성(mulberry32 시드, exclude 로 기출 진술 회피) + 보정 계산(computeCalibration). v3 QuizState: runs 누적(정밀 진단 — 회차마다 appearances 2→4→6)·seenStatements
│   └── personaQuizStorage.ts # 진단 결과 localStorage 영속 (memradar.personaQuiz.v3 키, v1/v2 read-through 마이그레이션 + write-through·구키 제거, 외부 전송 0)
├── theme/
│   └── themePresets.ts     # 배경·accent 프리셋
├── components/
│   ├── MemradarTopBar.tsx  # 상단 네비게이션
│   ├── Dashboard.tsx       # Personality(3축)·LanguageProfile·UsageProfile 등을 sectionMode 로 통합
│   ├── DropZone.tsx
│   ├── SessionView.tsx
│   ├── PersonalityView.tsx # (Dashboard 에 병합되어 내부 섹션으로 사용)
│   ├── ErrorBoundary.tsx
│   ├── ThemeSwitcher.tsx
│   ├── Heatmap.tsx         # 컴팩트 캘린더 — 로컬 날짜 키(localDailyCounts) 축. 대시보드 활동 구역은 "코딩 리듬" 카드 1장(캘린더+리듬 서사+접힘 영수증)으로 통합됨 (구 히트맵·streak·밀도·요일 4장 대체)
│   ├── HourChart.tsx
│   ├── WordCloud.tsx
│   ├── PersonalityRadar.tsx # 성향 3축 양극 → 12시 시계방향 6극 육각 레이더 (Dashboard 성향 카드·PersonalitySlide 공유 프리미티브)
│   ├── UsageRadar.tsx      # "AI가 자주 한 일" 역할 분포 단방향 N각형 레이더 (Dashboard 카드, score/maxScore=반지름, 막대 위 보조)
│   ├── theme.ts
│   ├── search/
│   │   ├── SearchView.tsx
│   │   ├── SearchBar.tsx
│   │   └── SearchResults.tsx
│   ├── tools/              # Tool 호출 상세 렌더러 (서버 모드)
│   │   ├── Truncate.tsx    # 긴 콘텐츠 펼치기/접기 토글
│   │   ├── ToolCallView.tsx # Edit/Write/Bash + Generic fallback 렌더러 (+ tier-2 훅 중첩)
│   │   └── HookEventView.tsx # 훅 실행 상세 행 (maskSecrets 먼저 → Truncate)
│   ├── updates/
│   │   └── ProductUpdates.tsx
│   └── wrapped/            # Memradar Code Report
│       ├── WrappedView.tsx
│       └── slides/
│           ├── SlideLayout.tsx
│           ├── IntroSlide.tsx
│           ├── PromptsSlide.tsx
│           ├── ModelSlide.tsx
│           ├── HoursSlide.tsx
│           ├── ToolsSlide.tsx
│           ├── PersonalitySlide.tsx
│           ├── UsageSlide.tsx
│           └── ShareSlide.tsx
├── content/
│   └── productUpdates.ts   # 업데이트 노트 콘텐츠
├── App.tsx
├── main.tsx
├── parser.ts               # Provider 오케스트레이터
├── types.ts
├── i18n.tsx                # 다국어(ko/en) + 로케일 자동 감지
└── index.css               # 테마 변수·keyframes·공유 클래스

cli/
├── index.mjs               # `npx memradar` CLI 진입점 (ESM Node, 기본 포트 3939)
└── lib/
    ├── hookExtract.mjs     # 훅 텔레메트리 공유 수집기 (단일 소스, src 재-export)
    ├── hookScan.mjs        # 훅 설정 인벤토리 스캐너 (scanHooks)
    └── secretMask.mjs      # 시크릿 마스킹 단일 소스
```

해시 라우팅(App.tsx)의 뷰는 `drop`, `dashboard`, `session/<id>`, `search`, `wrapped`, `personality` 6종이다.

향후 추가 예정(로드맵): Achievements, Interactive Replay(timeline scrubber), Code Evolution, Growth 섹션, Community 기능 등은 아직 미출시. 상세는 [ROADMAP.md](./ROADMAP.md) 참고.

## 데이터 흐름

```
[.jsonl 파일]
    ↓ (Provider.detect)
[선택된 Provider]
    ↓ (Provider.parse)
[Session 객체]
    ↓
[메모리 배열 + React 상태(useState)]
    ↓              ↓
[React UI]   [Search Index (메시지 단위)]
```

- 파싱은 메인 스레드에서 비동기 `async/await` 로 처리. 대용량이 문제되면 Web Worker 전환을 검토.
- 재방문 시 빠른 로드가 필요해지면 IndexedDB 캐시(`idb`) 도입을 검토한다.

## Provider 인터페이스

`src/providers/types.ts` 에 정의.

```typescript
interface Provider {
  id: string                // 'claude', 'codex'
  name: string              // 'Claude Code'
  detect(content: string): boolean
  parse(content: string, fileName: string): Session | null
}
```

새 Provider 추가 절차:
1. `src/providers/<id>.ts` 작성
2. `src/providers/index.ts` 의 레지스트리 배열에 등록
3. `detect()` 가 해당 로그 시그니처를 명확히 식별하는지 테스트 픽스처로 검증

## Tool 호출 상세 표시

세션 뷰에서 `Edit` / `Write` / `Bash` 등 tool 호출 본문(diff·명령어·결과)을 보여주는 기능은 **2-tier 파싱** 으로 구현됐다.

- **Light parse (기본)**: `parseJsonl(text, fileName)` — 텍스트·토큰·`toolUses: string[]`(이름만) 까지만 추출. 대시보드/분석 경로에서 모든 세션을 부담 없이 읽기 위해 사용. 정적 HTML 모드도 동일.
- **Heavy parse (server 모드 전용·lazy)**: `parseJsonl(text, fileName, { includeToolDetails: true })` — `tool_use` 의 `id`/`name`/`input` 과 `tool_result` 의 `content`/`is_error` 까지 보존하고, `tool_use_id` 로 결과를 호출과 페어링해 `ParsedMessage.toolCalls?: ToolCall[]` 를 채운다.

흐름:

1. 대시보드 진입 시점엔 모든 세션을 light parse 한 결과(`Session.messages`)만 메모리에 둔다. `Session` 에는 서버에서 받은 원본 경로(`Session.filePath`)도 함께 주입한다.
2. 사용자가 세션을 클릭하면 `SessionView` 가 `window.__MEMRADAR_SESSIONS__` 부재(서버 모드)를 감지하고, 같은 세션을 `/api/session-content?path=…` 로 다시 받아 heavy parse 후 로컬 상태로 교체한다.
3. 메시지 렌더 시 `toolCalls` 가 있으면 `components/tools/ToolCallView` 카드로 본문을 펼치고, 없으면 기존의 tool 이름 칩(pill) 표시로 폴백한다.
4. 정적 HTML 모드(`window.__MEMRADAR_SESSIONS__` 존재)에서는 heavy parse 를 시도하지 않고 칩 표시만 사용한다 — HTML 단일 파일 크기를 부풀리지 않기 위함.

긴 본문(`old_string`/`new_string`/`Bash` 출력 등)은 `components/tools/Truncate` 가 일정 글자 수 이상이면 잘라 보여주고 "더 보기" 토글로 펼치도록 한다. 메모리·스크롤 부담 모두 줄이는 게 목적이다.

## 훅 활동 분석

Claude Code 세션 JSONL 의 훅 텔레메트리(`{type:"attachment", attachment:{type:"hook_*"}}` 실행/동반 레코드, `{type:"system", subtype:"stop_hook_summary"}` Stop 원장, PreToolUse 거부 `tool_result`)를 수집해 대시보드 **훅 활동 카드**(`자주 쓴 스킬` 슬롯 대체)와 SessionView **훅 표시**로 노출한다. 모든 처리는 로컬 — 세션 데이터 외부 전송 없음. 상세 설계는 `docs/goal/hooks-analytics.md` (D1~D12).

- **공유 수집기 (`cli/lib/hookExtract.mjs` + `src/lib/hookExtract.ts` 재-export)** — 두 파서(`src/parser.ts`, `cli/index.mjs`)가 라인 루프의 role-drop 가드 직전에 `collect(raw)` 를 호출하고, 종료 후 `finalize()` 로 결과를 받는다. `secretMask.mjs` 와 동일한 mjs/TS 경계 계약: plain-JS 수집기가 완전한 summary 스키마를 방출하고 TS `buildHookStats` 는 `Session.hookSummary` **만** 소비한다(raw 레코드 재해석 금지) — cli/index.mjs 가 TypeScript 를 import 할 수 없으므로 이 선언이 곧 두 파서의 공유 스키마이며, 정적 모드(브라우저 `computeStats`)에서도 결과가 동일하다.
- **2-tier 데이터 모델** — tier-1 `Session.hookSummary`(페이로드-프리, 전 모드): `HookSummaryRow` 에는 command/stdout/stderr/content 필드가 타입 차원에서 없고 `commandKey` 는 비가역 sha256-8 다이제스트다. 정적 임베드가 Session 전체를 직렬화하므로 타입이 곧 프라이버시 방어선이다. tier-2 `HookExecutionDetail`(command/stdout/stderr/additionalContext 포함): 서버 heavy parse(`collectHookExecutions(text)`) 전용이며 **절대 `Session` 에 할당하지 않고** `SessionView` 로컬 상태로만 보관한다. `Stats.hooks: HookStats` 는 `buildHookStats(sessions)` 가 `Session.hookSummary` 만 집계해 만든다(비율 지표는 `sessionsWithHooks/eligibleSessions` 만 허용).
- **설정 인벤토리 (`cli/lib/hookScan.mjs`, `scanHooks()`)** — 관리형·사용자·현재 프로젝트·활성 플러그인(설치 ∩ 활성) 설정만 읽어(프로젝트 루트=실행 루트, 트랜스크립트 유래 cwd 금지 · UNC 거부 · realpath 봉쇄 · 1MB 캡 · `hooks` 키만 추출) 텔레메트리와 대조해 관측 여부·확신도(command/event)를 계산한다. 서버는 `GET /api/hooks`(command 는 직렬화 경계에서 maskSecrets 적용, loopback 전용), 정적은 `window.__MEMRADAR_HOOKS__`(command 원문·filePath 없음, 비가역 commandKey 만)로 노출한다.
- **정적 모드는 heavy parse 를 하지 않는다 (불변식).** tier-1 summary 는 정적 임베드에도 실리지만 tier-2 실행 상세는 서버 재-파싱에서만 만든다 — 정적 HTML 은 훅 command/stdout 텍스트를 절대 담지 않으며(구조적 프라이버시), SessionView 훅 표시 토글도 서버 모드(`window.__MEMRADAR_SESSIONS__` 부재)에서만 나타난다. 구버전 산출물/업로드에 `Session.hookSummary`·`window.__MEMRADAR_HOOKS__` 가 없으면 no-data 로 관용 처리한다(버전 톨러런스).

## CLI 아키텍처

`cli/index.mjs` 는 Node ESM 스크립트이며 기본 동작은 정적 HTML 모드 — 세션이 임베드된 단일 HTML 파일을 생성해 브라우저로 연다. `--server` 플래그를 주면 로컬 HTTP 서버(포트 **3939**, 바인딩 **`127.0.0.1`**)를 띄운다. 같은 네트워크의 다른 기기에서 접근해야 한다면 `--host 0.0.0.0` 또는 `MEMRADAR_HOST=0.0.0.0` 로 바인딩을 풀 수 있다 — 비-loopback 시 콘솔에 LAN URL 목록 + 보안 경고가 함께 출력된다.

1. `~/.claude/projects/` 및 선택적으로 `~/.codex/sessions/` 를 스캔해 `.jsonl` 세션을 수집
2. `dist/` 번들을 서빙하며 아래 API 를 노출한다:
   - `GET /api/sessions` — 감지된 세션 목록
   - `GET /api/session-content` — 개별 세션 원본 콘텐츠
   - `GET /api/skills` — 스킬 인벤토리
   - `GET /api/hooks` — 훅 설정 인벤토리 + 관측 매칭 (command 는 maskSecrets 적용, loopback 전용)
3. 시작 시 `registry.npmjs.org` 에서 최신 버전을 비동기로 확인 (세션 데이터 미포함 — `--no-update-check` 플래그 또는 `MEMRADAR_SKIP_UPDATE_CHECK=1` 로 생략 가능) — 새 버전이 감지되면 `npx --yes memradar@<latest>` 로 child 를 띄워 자동 재실행한 뒤 본 프로세스를 종료한다. child 에는 `MEMRADAR_SKIP_UPDATE_CHECK=1` 을 주입해 자기 자신을 또 업데이트하려 시도하지 않게 한다 — npx 캐시가 옛 버전이면 재귀 spawn 으로 무한 재시도가 되던 문제를 회피한다
4. `MEMRADAR_NO_OPEN=1` 이 아니면 기본 브라우저를 자동 오픈
5. `--static` 모드(기본값) 에서는 단일 HTML 파일을 `MEMRADAR_OUTPUT_HTML`(기본 `os.tmpdir()/memradar.html`) 로 내보낸다. 세션 데이터는 `window.__MEMRADAR_SESSIONS__`, 스킬 정보는 `window.__MEMRADAR_SKILLS__`, 훅 설정 인벤토리(공개 형태 — command 원문·filePath 미포함, 비가역 commandKey 만)는 `window.__MEMRADAR_HOOKS__` 로 인라인 주입된다. 직렬화는 세션을 하나씩 스트리밍 방식으로 디스크에 기록해 V8 max string length(~512MB) 한계를 회피한다. 출력 HTML 이 200MB 를 넘으면 브라우저 부담 안내 + 서버 모드 권장 메시지를 출력하고 자동 열기는 생략한다
6. `--version` 플래그 지원

출력된 HTML 은 파일 시스템(`file://`) 또는 배포된 URL 양쪽에서 동일하게 동작하도록 해시 라우팅을 쓴다.

## 검색 아키텍처

초기 MVP 는 별도 검색 엔진 없이 클라이언트에서 처리. 자세한 기획은 [SEARCH-SPEC.md](./SEARCH-SPEC.md).

### 검색 단위

- 기본 검색 단위: **메시지**
- 결과 이동 단위: **세션**
- 한 세션 안에서 여러 메시지가 매칭 가능

### 검색 인덱스 구조

```typescript
interface SearchRecord {
  sessionId: string
  messageIndex: number
  text: string
  role: 'user' | 'assistant'
  model?: string
  cwd?: string
  timestamp: string
  tools: string[]
}
```

### 검색 흐름

1. 세션 파싱 완료
2. `SearchRecord[]` 생성 (평탄화)
3. 검색어·필터 기준 메모리 내 필터링
4. 관련도 또는 최신순 정렬
5. 스니펫 생성 후 UI 렌더링

### 확장 전략

- **MVP**: 메모리 배열 필터링
- **세션 수 증가**: IndexedDB 검색 캐시 도입
- **추가 규모**: 역색인 또는 Web Worker 기반 검색

## 의존성 예산

| 패키지 | gzipped 크기 | 비고 |
|---|---|---|
| react + react-dom 19 | ~45KB | |
| framer-motion | ~32KB | Wrapped 슬라이드 |
| html-to-image | ~5KB | 공유 카드 캡처 |
| date-fns | ~5KB (사용 API만) | tree-shake |
| lucide-react | ~8KB (사용 아이콘만) | tree-shake |

**합계 목표**: ~250KB gzipped. 새 의존성 추가 시 이 범위 안에서 검토한다. Zustand·idb 같은 후보는 실제로 필요해질 때 추가한다.
