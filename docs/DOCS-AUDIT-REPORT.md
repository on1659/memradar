# Docs Audit Report — 2026-04-19

> **감사 기준**: memradar v0.2.12 / commit `1d5008a` / 2026-04-19
> **감사 범위**: `docs/` 아래 전체 (18 .md + 2 .html = 20 문서) — 감사 도중 발견된 미커밋 `GROWTH-SECTION-SPEC.md` 포함
> **실행 모델**: 메인 오케스트레이터(Claude Code 메인 스레드) + 문서당 1개 서브에이전트(general-purpose), 4개씩 병렬 배치 × 5배치 + HTML 동기화 1배치 + 추가 1건 = 총 20 서브에이전트
> **규칙**: 각 서브는 해당 문서만 `Edit`으로 직접 수정. 커밋 금지. 전면 리라이트 허용.

---

## 1. Overview

| 구분 | 개수 |
|---|---|
| 수정됨 (updated) | 14 |
| 전면 리라이트 (rewritten) | 5 |
| 무변경 (no-change) | 0 |
| HTML 동기화 | 2 |
| 추가 발견 감사 | 1 (GROWTH-SECTION-SPEC) |
| **총** | **20** |

가장 큰 드리프트 원인: 대부분 문서가 `v0.1.8` 시점 기준으로 작성됐지만 현재는 `v0.2.12`. 그 사이에 Personality 재설계(feb447b, ce9dfca), Dashboard-Personality 병합(3fdeb1a), Unified AI Jobs 차트(f650407), 토큰 가격표 구조화, 테마 FOUC 해결 등이 출시됐으나 문서에 반영되지 않았음.

---

## 2. 문서별 결과

### 2.1 `docs/ARCHITECTURE.md`
- **Status**: updated
- **Summary**: v0.2.12로 버전 드리프트 해소, 스택·컴포넌트 트리·CLI 설명을 출시 현실과 정합.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | `현재(v0.1.8) 구현을 기준으로 작성` | `현재(v0.2.12) 구현을 기준으로 작성` | 버전 드리프트 해소 |
| 2 | React 19 + TS / Vite 8 / Tailwind v4 (bare) | React 19.2 + TS 6, Vite 8.0, Tailwind 4.2, Framer 12.38, Lucide 1.8, date-fns 4, html-to-image, Playwright harness, Vercel config | `package.json`/`vercel.json`과 정합 |
| 3 | `lib/`에 `languageProfile.ts` 누락 | `languageProfile.ts` (28개 언어) 추가; 3축 Personality 8코드(RDM..EWS) 명시 | 해당 모듈 출시 완료 |
| 4 | `components/`에 `MemradarTopBar`, `TopSkills` 누락 | 두 컴포넌트 추가; `PersonalityView`는 Dashboard `sectionMode` 토글로 병합됨을 명시 | 실제 구현 반영 |
| 5 | CLI가 정적 HTML 번들러 전용으로 서술 | HTTP 서버 port 3939, `/api/{sessions,session-content,skills}`, `--static`, `--version`, `MEMRADAR_NO_OPEN`, `/tmp/memradar.html` 기술 | `cli/index.mjs` 실제 동작 |
| 6 | `replay.ts`/`achievements.ts` 파일명 참조 | Achievements/Interactive Replay/Code Evolution/Growth/Community를 "not shipped" 블록으로 재정리 | 존재하지 않는 파일명 제거 |
| 7 | 해시 라우트 나열 없음 | `drop, dashboard, session/<id>, search, wrapped, personality` 추가 | `src/App.tsx` 확인 |

- **Residual**: 없음

---

### 2.2 `docs/ROADMAP.md`
- **Status**: updated (+ 메인 보정 1건)
- **Summary**: Search/Personality를 shipped로 이동, Language Profile·Growth·AI Jobs 반영, 슬라이드 개수 7장으로 정합.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 현재 버전 미표기 | "현재 버전: v0.2.12" | 기준선 명시 |
| 2 | 2.1 슬라이드 "8장 (...Tools/Share)" | "7장 (Intro/Prompts/Model/Hours/Personality/Usage/Share) — `ToolsSlide.tsx`는 향후 확장 슬롯" | `WrappedView.tsx`는 Tools를 import 하지 않음 (orphan) |
| 3 | 2.1b "읽기/실행" 축 레이블 | "탐험가/설계자" | `personality.ts` 실제 라벨 정합 |
| 4 | 2.1c 사용 카테고리 "8종" | "9종 (🧪 품질 감독관 포함) + 통합 AI Jobs 차트" | `usageProfile.ts`에 `test` 포함 |
| 5 | 2.1d Language Profile 행 없음 | "28개 언어, `src/lib/languageProfile.ts`" ✅ 추가 | 출시 완료 |
| 6 | 2.2 검색 🚧 | 2.2 ✅ + 2.2a 고급 필터/URL 쿼리 ⬜ 분리 | 기본 검색 출시, 고급 필터만 잔여 |
| 7 | 1.8 CLI 간략 | port 3939, `--static`, `--version` 명시 | 커밋 ed14f59 반영 |
| 8 | 2.6 토큰 "부분 구현" | 트렌드·모델 분포 ✅, 비용·복잡도 ⬜ | 실제 차트 반영 |
| 9 | Phase 3 성장 지표 누락 | 3.5 성장 지표 행 추가 | Growth는 planned 유지 |
| 10 | "만들지 않을 것"에 커뮤니티 누락 | 커뮤니티/소셜 제외 명시 | 스코프 명확화 |

- **Residual**: 없음

---

### 2.3 `docs/DEPLOYMENT.md`
- **Status**: updated
- **Summary**: 듀얼 배포 모델 재정의(primary `npx memradar`, secondary Vercel), CLI 레퍼런스 섹션 신설, 샘플-데이터 → `--static` export 교체.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 공식 배포 = Vercel | primary `npx memradar`, secondary Vercel static | 실제 배포 모델(CLI-first) |
| 2 | 버전 누락 | 헤더 "Memradar v0.2.12" | 버전 핀 |
| 3 | Section B "샘플 데이터 데모" (공개 픽스처) | `--static` export로 self-contained HTML 생성 | 실제 기능 |
| 4 | CLI 플래그/env 섹션 없음 | `CLI 레퍼런스` 추가: `--version`/`--static`, `MEMRADAR_PORT`=3939, `MEMRADAR_NO_OPEN`, `MEMRADAR_OUTPUT_HTML`, `MEMRADAR_PROJECTS_DIR`, `MEMRADAR_CODEX_DIR` | 누락 전면 보완 |
| 5 | `/api/*`, `~/.codex/sessions/` 언급 없음 | 명시 | 실제 CLI 동작 |

- **Residual**: Section C(File System Access API)는 원 의도대로 미래 UX 노트로 보존. MD060 lint 경고는 기존 테이블 스타일과 일치시켜 유지.

---

### 2.4 `docs/COMPETITIVE-ANALYSIS.md`
- **Status**: updated
- **Summary**: memradar 컬럼을 v0.2.12 shipped 현실과 정합; 경쟁사 주장에는 "unverified" 헷지 추가; 날짜·버전 스탬프.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 작성 시점/버전 미표기 | "작성 시점: 2026-04-19 · memradar v0.2.12" + hedge 디스클레이머 | 감사 기준 명시 |
| 2 | 경쟁사 섹션 헷지 없음 | "(unverified — last confirmed 2026-04-19)" 꼬리말 | 위험한 사실 주장 방지 |
| 3 | 토큰·비용 통계 🚧 | ✅ | Dashboard 출시 |
| 4 | 다중 Provider 🚧 (Claude·Codex) | ✅ | 플러그인 아키텍처 출시 |
| 5 | "퍼지 검색" 🚧 | "전체 텍스트 검색" ✅ | Full-text shipped |
| 6 | 매트릭스에 word cloud/top skills/lang profile/personality/npx/web demo 행 없음 | 각 행 추가(memradar=✅, 경쟁사=❌) | 차별자 반영 |
| 7 | 공유 이미지 "✅ (PNG)" | "✅ (PNG · html-to-image)" | 구현 명시 |
| 8 | 차별점 5개 | 7개 (Personality/Language profile 포함) | shipped 차별자 |
| 9 | Code Report 공유 future-tense | PNG 캡처 ✅ shipped | `html-to-image` 활성 |

- **Residual**: 없음

---

### 2.5 `docs/SEARCH-SPEC.md`
- **Status**: rewritten
- **Summary**: Phase A+B 모두 shipped로 기재; URL 쿼리/멀티 툴 필터만 🚧 잔여; 실제 `search.ts` 동작(문자 기반 스니펫, `includes`)으로 수정.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | "기본 풀텍스트 동작(Phase A), 필터·정렬 진행 중" | Phase A+B 전체 ✅, 잔여·Phase C 분리 · v0.2.12/2026-04-19 스탬프 | SearchBar가 role/model/tool/cwd/date + 3-sort 이미 구현 |
| 2 | Phase A 미래 우선순위 | ✅ done + 파일 참조(`SearchView`, `SearchBar`, `SearchResults`, `search.ts`, Ctrl+K/`#search`) | App.tsx 해시 라우트+핫키 확인 |
| 3 | Phase B 전체 미래 | ✅(필터+정렬) / 🚧(URL 쿼리, 멀티 툴 선택) 분리 | URL 쿼리 미구현, 툴 필터 단일 선택 |
| 4 | "여러 단어 AND 검색" 규칙 | 현재 단일 substring `includes`, AND/boolean은 제외 범위 | `search()`는 토크나이즈 없음 |
| 5 | "스니펫: 주변 1~2문장" | 첫 매치 + 80자 컨텍스트, matchCount 전체 카운트, ellipsis | `extractSnippet()`은 문자 기반 |
| 6 | 결과 카드 첫 줄 "세션 제목" | "첫 메시지 스니펫(세션 제목 대용)" + 메타 | `SearchResults.tsx` 실제 렌더 |
| 7 | "메모리 내 배열 필터링" 일반 | 현재 cheap-filter-first + 100 cap; IndexedDB/인버트 인덱스는 Phase C | `search()` 단락 평가 + `.slice` |
| 8 | 진입점 섹션 없음 | Ctrl+K 토글 + `#search` 해시 경로 | 유저 진입 경로 |
| 9 | Phase C 포괄적 | flat 메시지 리스트 그룹핑 + Web Worker 분리 명시 | 구체화 |

- **Residual**: 없음

---

### 2.6 `docs/WRAPPED-SPEC.md`
- **Status**: rewritten
- **Summary**: 8→7 슬라이드 정정(Tools orphan), 축 라벨·카테고리·Share 로직을 실제 구현 기준으로 전면 재작성.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 슬라이드 8장 (ToolsSlide 포함) | 7장(Intro/Prompts/Model/Hours/Personality/Usage/Share); Tools는 "향후 확장" | `WrappedView.tsx`는 7개만 import |
| 2 | Style 축 "Read/Grep vs Write/Bash 도구 비율" | "탐험가(R) ↔ 설계자(E) — avg msg len × turns × token ratio" | `personality.ts` styleValue는 대화 패턴 기반 |
| 3 | Usage "8 카테고리" | "9 카테고리" (🧪 품질 감독관 포함) + title/subtitle 분리 | `usageProfile.ts`에 `test` 포함 |
| 4 | 슬라이드 타이틀 초안 한국어 | 실제 eyebrow/카피("Your Prompts", "내 AI는 무슨 일을 할까?", "Your Memradar Ending") | 컴포넌트 문자열 단일 소스 |
| 5 | `src/components/WrappedView.tsx` | `src/components/wrapped/WrappedView.tsx` | Glob 확인 |
| 6 | 버전/날짜 없음 | "memradar v0.2.12 / 2026-04-19" | 지시 |
| 7 | Share 일반 설명 + "X·Instagram 개발 예정" | 모바일=`navigator.share`, 데스크톱=`ClipboardItem`+Threads intent, 폴백=PNG, "개발중" 배지 모달 | `ShareSlide.tsx` 실제 로직 |
| 8 | End 점프만 | End+스킵 버튼+2.5초 후 대시보드 프롬프트+X 종료+진행률 바 | WrappedView UI 전체 |
| 9 | 공유 카드 색/패딩 누락 | `#7b6cf6/#22d3ee/#f59e0b`, 패딩 28/28/24 | `ShareSlide` 상수 |
| 10 | "PersonalityView.tsx 공유 사용" | `usageProfile.ts` `analyzeUsageTopCategories`/`getUsageHeadline` | 실제 의존성 |

- **Residual**: 없음

---

### 2.7 `docs/SESSION-REPLAY-SPEC.md`
- **Status**: updated
- **Summary**: Phase 2 미구현 상태를 v0.2.12/2026-04-19과 함께 못박고 `SessionView.tsx` 정적 뷰와 분리 명시.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | "⬜ Phase 2 계획 문서" 한 줄만 | 상태/버전/점검일 + `replay.ts`·`components/replay/` 부재 + "진행 중 아님" 블록 | 미착수 명확화 |
| 2 | 인접 구현물 언급 없음 | `SessionView.tsx`가 정적 전사 뷰, 본 스펙은 그 위의 인터랙티브 레이어 | 경계 분리 |
| 3 | 교차 참조 ROADMAP §2.3만 | DESIGN-GUIDE.md 토큰 참조 추가 | 토큰 준수 유도 |
| 4 | "대화를 영상처럼 재생하는 기능." | "(계획)." 문구 추가 | 계획 명시 |

- **Residual**: 설계 본문(UI 레이아웃·시간 압축·ReplayEngine 인터페이스·키보드 단축키)은 의도대로 보존.

---

### 2.8 `docs/ACHIEVEMENTS.md`
- **Status**: rewritten
- **Summary**: 미구현 Phase 2임을 v0.2.12/2026-04-19로 확정; `types.ts` 실제 필드 + IndexedDB 부재 반영; 19뱃지 보존.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 단일 줄 "⬜ Phase 2" | 굵은 "상태: 미구현" 블록 + 2026-04-19/v0.2.12 스탬프 | 한눈에 미구현 표시 |
| 2 | 현 코드베이스 시그널 소스 언급 없음 | "현재 코드베이스 상태" 섹션(types.ts 필드 + duration/streak 유도 주석) | 미래 구현자 근거 |
| 3 | "데이터 구조" 일반 레이블 | "(계획안)" + import 경로 + `AchievementRecord` IndexedDB 스키마 | 존재 주장 방지 |
| 4 | 뱃지 UI/진행률 현재형 서술 | "(계획안)" 태그 + "현재 IndexedDB 사용처 없음" + 스토어 명 제안 | 부분 구현 오해 제거 |
| 5 | 티어 총계 없음 | "4티어 × 총 19개" 합계 행 | 감사 가능성 |

- **Residual**: 없음. (브리프의 "16 뱃지" vs 원문 19 뱃지 불일치 → 원문 19 유지)

---

### 2.9 `docs/DESIGN-GUIDE.md`
- **Status**: updated
- **Summary**: v0.2.12로 버전 스탬프, 스택 스냅샷 추가, ToolsSlide orphan 명시, 틀린 CSS 토큰 값·이름 정정.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | Footer "v0.1.8 기준" | v0.2.12 + 스택 스냅샷(React 19.2/TS 6/Vite 8/Tailwind 4.2/Framer 12.38/Lucide 1.8/html-to-image 1.11) | 버전 정합 |
| 2 | 8.1 슬라이드 7개 나열하되 ToolsSlide 상태 미기재 | 7장 import(`lastSlideIndex=6`), `ToolsSlide.tsx` orphan 명시 | 실제 코드 |
| 3 | 사용 카테고리는 `PersonalityView.tsx`에 8종 | `PersonalitySections`가 Dashboard `sectionMode='personality'`로 렌더; 카테고리는 `usageProfile.ts`(9종) | Dashboard 병합 + 카테고리 개수 |
| 4 | `--dashboard-row-height: 15.75rem` | `14.75rem` | `src/index.css:33` 실제 값 |
| 5 | `--dashboard-activity-main/-side-sm/-side-lg` 토큰 존재 주장 | 루트에 해당 토큰 없음, 폭은 `.dashboard-activity-grid` 내부에 존재 | Grep 확인 |

- **Residual**: 테마 accent hex 값과 일부 줄 번호(예: `src/index.css:44-82`, 995-1000)는 재검증하지 않음.

---

### 2.10 `docs/UI-UX-PRINCIPLES.md`
- **Status**: updated
- **Summary**: v0.2.12/2026-04-19 스탬프, Code Report 7슬라이드·Dashboard-Personality 섹션 병합·CLI/웹 위상 정합.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 상단 버전·검증일 없음 | "v0.2.12 / 2026-04-19" 스탬프 | 기준선 고정 |
| 2 | 성향 분석을 독립 화면으로 정의 | Dashboard `sectionMode` 토글 섹션 모드 | App.tsx·Dashboard.tsx 머지 반영 |
| 3 | Code Report 슬라이드 수/키 제어 추상 | 7장(Intro→…→Share), End 키, `html-to-image` 공유 명시 | `WrappedView` `lastSlideIndex=6` |
| 4 | 제품 태도에 웹/CLI 위상 구분 없음 | "CLI 1순위, Vercel 호스팅 웹은 보조 채널" 명시 | 정책 반영 |
| 5 | 별도 라우트처럼 서술 | `sectionMode="personality"` 토글, 상단바/테마 공유 | `App.tsx:261-269` |
| 6 | `PersonalitySections` 설명 누락 | Dashboard 섹션으로 임베드 주석 | 구조 이해 |

- **Residual**: 없음

---

### 2.11 `docs/IMPROVEMENTS.md`
- **Status**: updated
- **Summary**: 5회차 개선 로그에서 **11개 이슈를 커밋 참조로 resolved 주석**; 상단에 진행 현황 블록 추가(11 resolved / 12 open).
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 상단 상태 헤더 없음 | "진행 현황 — 2026-04-19 (v0.2.12 기준 감사)" 블록 | 감사 기준선 |
| 2 | #3 `setInterval` cleanup open | Fixed in 3fdeb1a (`WrappedView.tsx:919-948`) | 실제 cleanup 추가 |
| 3 | #4 CLI path filter open | Fixed in 3fdeb1a (`SKIP_DIRS`); realpath/`--verbose` 잔여 | `cli/index.mjs:39` 확인 |
| 4 | #10 `tokenPricing` hardcoded open | Fixed in 3fdeb1a (`CLAUDE_MODEL_PRICING` + `CODEX_MODEL_PRICING`, `cachedInput`, Last updated) | 구조화된 가격표 |
| 5 | #11 Wrapped zero-sessions crash open | Fixed in 3fdeb1a (`WrappedView.tsx:89` guard) | empty-state 렌더 |
| 6 | #15 OG/SEO meta 누락 open | Fixed in 3fdeb1a; `og:image`/`apple-touch-icon` 잔여 | `index.html` 실 meta 존재 |
| 7 | #18 personality data-dearth open | partial(feb447b/ce9dfca); 가드 있으나 전용 UI 없음 | `personality.ts:143` |
| 8 | #19 `SearchBar` Escape 누락 | partial; Escape→필터 패널→뷰 닫힘, 결과 Enter 잔여 | `SearchBar.tsx:51-56` |
| 9 | #20 `dashboard-button-attention-runner` 미사용 의심 | `MemradarTopBar.tsx` 실제 사용 주석 | 사실 정정 |
| 10 | #21 theme FOUC & #22 키보드 충돌 open | 둘 다 Fixed in 3fdeb1a (inline bootstrap + viewRef guard + ArrowLeft preventDefault) | `index.html:17-22`, `App.tsx:183-185`, `WrappedView.tsx:155-166` |

- **Residual**: 미해결 항목 #1/#2/#5/#6/#7/#8/#9/#12/#13/#14/#16/#17/#20은 원문 보존. 프리-existing MD060 lint은 스코프 밖.

---

### 2.12 `docs/PERSONALITY-REDESIGN.md`
- **Status**: rewritten
- **Summary**: 계획 → 출시 완료 상태 전환; 축/공식/TypeCode를 `personality.ts`와 정합; v0.2.12/2026-04-19 스탬프.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | "작성일 2026-04-18" 만, 미래형 계획 | "상태: 출시 완료 (v0.2.12, commit ce9dfca)" 배너 + 관련 커밋·배포 위치 | 출시 상태 명시 |
| 2 | "현재 시스템의 결함" 현재형 | "문제 정의 (재설계 이전 상태)"로 이동 + 역사적 동기 | 히스토리 보존 |
| 3 | Axis 1 라벨 A(설계자)/E(탐험가), 8-type ADM…EDM… | TypeCode **E=설계자/R=탐험가**로 정정, 8-type EDM/EDS/EWM/EWS / RDM/RDS/RWM/RWS | `personality.ts` TypeCode 일치 |
| 4 | TYPE_DEFS 초안 (EDM=번개해결사 등) | 실제 매핑(EDM=장인대장장이, EDS=번개해결사, EWM=만능빌더, EWS=카오스크리에이터, RDM=심해잠수부, RDS=코드감별사, RWM=도서관사서, RWS=트렌드헌터) | TYPE_DEFS 미러 |
| 5 | `extractProject` depth 3 | depth 6 + Windows 경로 근거 | `Math.min(parts.length, 6)` |
| 6 | 의사코드 `normalize` | 축별 sigmoid midpoint/steepness/weights 인라인 + 요약 테이블 | 튜너 신뢰성 |
| 7 | 변경 범위 "2개 파일 ~60줄" | "실제 변경 범위(커밋 기준)" Dashboard sectionMode 병합 + 언어 프로파일 포함 | 3fdeb1a 실제 스코프 |
| 8 | §6 "PersonalitySlide, PersonalityView" | "Dashboard(personality 섹션)" + PersonalityView 머지 | 현재 UI |
| 9 | 미래형 동사 다수 | 과거/현재형("교체되었다", "유지되었다") | 출시 내러티브 |
| 10 | 푸터 버전 없음 | "v0.2.12 / 2026-04-19" | 지시 |

- **Residual**: MD024/MD060 lint (원본 동일 패턴)은 디자인 히스토리 가독성 유지를 위해 보존.

---

### 2.13 `docs/PERSONALITY-IMPL-PLAN.md`
- **Status**: updated
- **Summary**: 계획 → 완료(✅) 전환; 각 step 체크, 실제 구현 차이 메모, "사후 검증 결과" 테이블 추가.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | "구현 계획서 / 작성일 2026-04-18" | "상태: ✅ 완료 (v0.2.12, ce9dfca)" 배너 + 관련 커밋 | 지시 |
| 2 | Step 1 "알고리즘 교체" (status 없음) | "✅ 완료" + 4항목 체크리스트 | 완료 기록 |
| 3 | `extractProject` `Math.min(parts.length, 4)` | `6`으로 정정 + 이유 주석 | 코드 정합 |
| 4 | axes 라벨 `['설계자','탐험가']`/`['마라토너','스프린터']` | `['탐험가','설계자']`/`['스프린터','마라토너']` + left=low/right=high 관례 | `personality.ts:244-248` |
| 5 | Step 2 "1줄 변경 → title: '기능 빌더'" | "✅ 완료" + 최종 값 `'풀스택 기획자'`로 정정 | `usageProfile.ts:18` |
| 6 | Step 3 (status 없음) | "✅ 완료" + Dashboard `sectionMode` 병합 메모(3fdeb1a) | 구조 변화 |
| 7 | Step 4/5 (status 없음) | 각각 "✅ 완료" + 요약 | 완료 전환 |
| 8 | "검증" flat 체크리스트 | "검증(원 계획)" + "사후 검증 결과 (v0.2.12)" 8행 테이블(✅/⏳) | 지시 |

- **Residual**: 없음

---

### 2.14 `docs/codex/HANDOFF.md`
- **Status**: updated
- **Summary**: 아카이브 스냅샷 배너 + 각 합의/빌드 순서 항목에 ✅/⬜ 현재 상태 태그.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 제목만, 스냅샷 배너 없음 | 볼드 배너(아카이브, ROADMAP/ARCHITECTURE 우선, 점검일 2026-04-19 v0.2.12) | 지시 |
| 2 | "Code Report를 첫 피처로" | "✅ shipped (Wrapped, 7 slides)" | Wrapped 출시 |
| 3 | "기록 검색은 리텐션" | "✅ shipped (full-text + 필터/정렬)" | Search 출시 |
| 4 | "세션 리플레이는 차별화…이후 작업" | "⬜ planned (스크러버 미착수)" | 미구현 |
| 5 | Build order 1~3 (품질/CodeReport/검색) | 각 "✅ shipped" | 출시 |
| 6 | Build order 4 (세션 리플레이) | "⬜ planned" | 미구현 |
| 7 | Build order 5 (Provider + AI 인사이트) | 세분 상태(Provider/Personality/Language/CLI ✅, Achievements/Code Evolution/Growth ⬜) | 실제 분리 |

- **Residual**: 없음

---

### 2.15 `docs/community/CLAUDE-PERSONALITY-REDESIGN-REVIEW.md`
- **Status**: updated
- **Summary**: 아카이브 배너 + `PersonalityView.tsx` 부재 정정 메모만 추가, 본문 보존.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 본문 곧바로 시작 | "아카이브: 2026-04-18 리뷰 요청, v0.2.12 출시 완료" 배너 + 최신 스펙/구현 경로 | 히스토리 스냅샷 표식 |
| 2 | 마지막이 평문 문장 | "아카이브 정정 메모" 섹션 추가, `PersonalityView.tsx` 부재 + Dashboard `sectionMode` 흡수 안내 | 파일 경로 각주 |

- **Residual**: 없음

---

### 2.16 `docs/harness.md`
- **Status**: updated
- **Summary**: v0.2.12/2026-04-19 스탬프 + `MEMRADAR_NO_OPEN=1` env 기록.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 버전/날짜 스탬프 없음 | `_v0.2.12 / 2026-04-19_` | 지시 |
| 2 | env 섹션에 `MEMRADAR_PROJECTS_DIR`, `MEMRADAR_OUTPUT_HTML`만 | `MEMRADAR_NO_OPEN=1` 추가 | CLI harness가 브라우저 자동 오픈 억제에 사용 |

- **Residual**: MD036 (스탬프를 emphasis-as-heading) 경고는 의도된 스타일로 보존.

---

### 2.17 `docs/harness-import-plan.md`
- **Status**: updated
- **Summary**: 계획 항목별 `[✅ imported]` / `[🔶 partial]` / `[❌ discarded]` 태그 + v0.2.12 스탬프.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | "가져올 것" 5항목 상태 없음 | 전부 `[✅ imported]` + 실제 앵커(`test:harness`, Playwright, CLI smoke, workflow) | 저장소에 존재 확인 |
| 2 | "부분만" 3항목 | 전부 `[🔶 partial]`; lint gate는 `test:harness` 체인 포함 | 체이닝 구조 |
| 3 | "버릴 것" 4항목 | 전부 `[❌ discarded]` | socket guard/randomness/agent/multiplayer 파일 부재 |
| 4 | 버전/날짜 없음 | `_Status stamp: v0.2.12 / 2026-04-19_` | 지시 |

- **Residual**: 없음

---

### 2.18 `docs/personality-impl-plan.html` *(HTML sync)*
- **Status**: updated
- **Summary**: MD 완료 상태와 완전 동기화(상태 배너, `extractProject` depth 6, 축 라벨 반전, `풀스택 기획자`, Dashboard 병합 메모, 사후 검증 표); **CSS/구조 전부 보존**.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | Hero "IMPLEMENTATION PLAN" + 2026-04-18 | Hero "COMPLETED · v0.2.12" + v0.2.12/2026-04-19 스탬프, 녹색 callout 상태 배너(commit ce9dfca) | MD 상태 플립 |
| 2 | Step 2 "만능 빌더 → 기능 빌더" | "만능 빌더 → 풀스택 기획자" + ✅ 완료 | MD §3 정합 |
| 3 | `Math.min(parts.length, 4)` | `6` + 이유 주석 | MD §2-2 |
| 4 | Step 타이틀 완료 표시 없음 | Step 1–5 "✅ 완료", Step 3에 3fdeb1a Dashboard 병합 설명 | MD 체크 |
| 5 | 축 라벨 규약 서술 없음 | orange callout에 `['탐험가','설계자']`/`['스프린터','마라토너']` 반전 배치 | MD §2-3 |
| 6 | Step 2 전용 섹션 부재 | "Step 2: 카테고리 이름 변경" 섹션 신설 | MD §3 별도 블록 |
| 7 | Step 3 Dashboard 병합 언급 없음 | blue callout "commit 3fdeb1a sectionMode 병합" + 스니펫 | MD §4 |
| 8 | 문서 끝 검증 체크리스트 1개 + 푸터 2026-04-18 | "사후 검증 결과 (v0.2.12)" 8행 표 + 푸터 "✅ 완료 v0.2.12 / 2026-04-19" | MD §10 |

- **Residual**: 없음

---

### 2.19 `docs/personality-redesign.html` *(HTML sync)*
- **Status**: updated
- **Summary**: MD 출시 완료 상태와 완전 동기화(TypeCode E/R, 8-type 재매핑, depth 6, inline 공식, 과거형 변경 범위, v0.2.12 배너/푸터); **CSS/구조 전부 보존**.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | Hero subtitle "재설계 명세서 · 2026-04-18" | "재설계 기록 · 원안 2026-04-18 · 최종 2026-04-19" + 녹색 callout(출시 완료 v0.2.12 ce9dfca) | 출시 기록으로 전환 |
| 2 | Axis 1 A/E | E/R (E=Architect, R=Explorer) | TypeCode 반전 |
| 3 | 축 공식 generic `normalize()` | `sigmoid(x, midpoint, steepness) * weight` 인라인 | MD inline 요구 |
| 4 | 8-type row 1 ADM/ADS/AWM/AWS, row 2 EDM/EDS/EWM/EWS | row 1 EDM/EDS/EWM/EWS, row 2 RDM/RDS/RWM/RWS | TYPE_DEFS 재매핑 |
| 5 | 8 type-cards 구 매핑 | 새 TYPE_DEFS(장인/번개/만능/카오스, 심해/감별사/사서/트렌드) | 카드·코드 정합 |
| 6 | `extractProject` depth 4 | depth 6 + Windows 근거 | MD 실제값 |
| 7 | "6. 변경 요약" 미래형 | "6. 변경 범위 (v0.2.12 출시 기준)" 과거형 + Dashboard 병합 + 언어 프로파일 | 출시 스코프 |
| 8 | `PersonalityView.tsx`/`PersonalitySlide.tsx` 라이브 타깃 | Dashboard `sectionMode='personality'` 병합 안내(3fdeb1a) | 파일 제거 반영 |
| 9 | TypeCode 검증 "EWS=트렌드 헌터"/"RWS=카오스" | "EWS=카오스"/"RWS=트렌드" | 네이밍 스왑 |
| 10 | Footer "Spec v1.0 · 2026-04-18" | "v0.2.12 / 2026-04-19" | 출시 버전 핀 |

- **Residual**: 없음

---

### 2.20 `docs/GROWTH-SECTION-SPEC.md` *(감사 중 발견, 미커밋 상태였음)*
- **Status**: updated
- **Summary**: "미구현 (Phase 2 계획)" 상태 배너 추가(v0.2.12 / 2026-04-19), 파일/라인 참조 2곳 정확도 보정, BUILTIN_COMMANDS export 필요 경고 추가.
- **Key changes**

| # | Before | After | Why |
|---|---|---|---|
| 1 | 바로 blockquote로 시작, 상태 모호 | "상태: ⬜ 미구현 (Phase 2 계획) — v0.2.12 기준 (2026-04-19)" 배너 + 누락 파일/심볼 체크리스트 | `types.ts`/`parser.ts`에 `Stats.growth` 부재 명시 |
| 2 | `src/components/TopSkills.tsx:68~86` | `TopSkills.tsx` (L2 import, L69~ 사용) | 실제 라인 보정 |
| 3 | `BUILTIN_COMMANDS` — `src/parser.ts` (slash 필터링) | `src/parser.ts:144` (현재 미export) — 구현 시 export 필요 | parser.ts:144 `const` 선언, export 안 됨 |
| 4 | `<command-name>` 정규식 — `src/parser.ts` | `src/parser.ts:196` | `matchAll` 호출 라인 명시 |
| 5 | blockquote 직후 리스트 → MD032 경고 | 빈 `>` 라인 삽입 | markdownlint 해소 |

- **Residual**: 계산 규칙·인터페이스 설계·UI 카드·"리뷰 반영 내역" 표 모두 원본 유지.

---

## 3. Cross-cutting fixes (문서 간 정합성)

감사 과정에서 드러난 문서 간 불일치와 그 해소:

1. **버전 표기 통일 → v0.2.12 / 2026-04-19**
   - 적용: ARCHITECTURE, DESIGN-GUIDE, ROADMAP, DEPLOYMENT, COMPETITIVE-ANALYSIS, UI-UX-PRINCIPLES, IMPROVEMENTS, PERSONALITY-REDESIGN, PERSONALITY-IMPL-PLAN, SEARCH-SPEC, WRAPPED-SPEC, SESSION-REPLAY-SPEC, ACHIEVEMENTS, harness.md, harness-import-plan.md, codex/HANDOFF, community/REVIEW, 두 HTML
2. **Personality 시스템: planned → shipped**
   - PERSONALITY-REDESIGN, PERSONALITY-IMPL-PLAN이 "완료" 상태로 플립. community REVIEW는 아카이브 표식.
3. **Search: 진행중 → shipped**
   - ROADMAP §2.2 ✅ 이동, SEARCH-SPEC Phase A+B ✅, COMPETITIVE-ANALYSIS 매트릭스 ✅.
4. **Wrapped 슬라이드 수: 8 → 7**
   - WRAPPED-SPEC 정정 후 ROADMAP §2.1, DESIGN-GUIDE §8.1, UI-UX-PRINCIPLES까지 **7장 일괄 적용**. `ToolsSlide.tsx`는 파일 존재하되 import 되지 않은 orphan으로 명시(향후 확장 슬롯).
5. **Personality view 병합 (3fdeb1a)**
   - DESIGN-GUIDE, UI-UX-PRINCIPLES, PERSONALITY-REDESIGN, PERSONALITY-IMPL-PLAN, ARCHITECTURE, community REVIEW, 두 HTML에서 "Dashboard `sectionMode='personality'` 토글로 렌더됨" 공통 서술.
6. **CLI dual deployment**
   - DEPLOYMENT, ARCHITECTURE, COMPETITIVE-ANALYSIS, UI-UX-PRINCIPLES에서 primary = `npx memradar` / secondary = Vercel 정책 일관.
7. **Usage 카테고리 수 8 → 9**
   - ROADMAP §2.1c, WRAPPED-SPEC, DESIGN-GUIDE 모두 9종(🧪 품질 감독관 포함).

## 4. 남은 제안 (TODO / 감사 범위 밖)

이번 감사 선에서 손대지 않았으나 후속으로 정리하면 좋은 항목들:

- **DESIGN-GUIDE 전면 재검증**: 테마 accent hex 값(예: `#7b6cf6`), 일부 줄 번호(src/index.css:44-82, 995-1000 등)는 샘플링만 수행. 전체 토큰 테이블 재검증은 별도 이슈 권장.
- **IMPROVEMENTS open 12항목**: #1 parser silent fail, #2 search memoization, #5 SVG a11y, #6/#7/#8 i18n, #9 types optional, #12 ErrorBoundary reload, #13 touch swipe, #14 vite build config, #16 heatmap FOUC, #17 WordCloud uniform, #20 dashboard-button-attention 사용처 주석 — 해결은 코드 PR에서 다룰 것.
- **ROADMAP ↔ COMPETITIVE-ANALYSIS 경쟁사 정보**: 경쟁사 피처 표는 이번 감사에서 hedge만 추가. 분기별로 경쟁사 실제 상태 재확인 필요(2026-07-19 목표).
- **HTML 재생성 파이프라인 부재**: `personality-*.html`은 MD→HTML 변환 스크립트가 없어 수동 동기화 중. 향후 doc-to-html generator 혹은 `@11ty`/`marked`+템플릿 도입을 권장.
- **Growth / Achievements / Interactive Replay / Code Evolution**: 여전히 spec 단계. 우선순위 조정은 ROADMAP에서 결정할 것.

## 5. 사후 추가 기능 반영 (Post-audit Addendum)

감사 완료 후 작업 트리에 추가·변경된 기능을 문서에 반영. 커밋 대상 아님 — 현재 미커밋 상태.

### 신규 기능

| 기능 | 변경 파일 | 설명 |
|---|---|---|
| **TopSkills 카드** | `src/components/TopSkills.tsx` (신규), `src/parser.ts`, `src/types.ts` | 슬래시 커맨드 사용 빈도 바 차트. `Stats.topSkills [string, number][]` 신규 필드. BUILTIN_COMMANDS 필터링 |
| **세션 길이 분포** | `src/parser.ts`, `src/types.ts`, `src/components/Dashboard.tsx` | 1-5턴/6-20턴/21-50턴/51+ 버킷. `Stats.sessionLengthDist` 신규 필드 |
| **`/api/skills` 엔드포인트** | `vite.config.ts`, `cli/index.mjs` | `~/.claude/commands/`, `~/.claude/skills/`, 설치된 플러그인을 스캔해 커맨드·스킬 설명 반환 |
| **`window.__MEMRADAR_SKILLS__`** | `cli/index.mjs` | `--static` 모드에서 HTML에 스킬 맵 인라인 주입 |
| **DonutChart "기타" 버킷** | `src/components/Dashboard.tsx` | 5위 밖 모델을 "기타 모델" 슬라이스로 통합; 6번째 색상 `color-mix(in srgb, var(--color-text) 36%, transparent)` 추가 |
| **`--color-violet: #a78bfa`** | `src/index.css` | 글로벌 색상 토큰 추가. TopSkills 바·Personality 슬라이드 accent에 사용 |
| **Personality 축 헬프 툴팁** | `src/components/Dashboard.tsx` | DASHBOARD_AXIS_HELP, DASHBOARD_PERSONALITY_PANEL_HELP 상수 추가 |
| **`GenericDonutChart`** | `src/components/Dashboard.tsx` | 모델 외 데이터(세션 길이 등)용 범용 도넛 차트 |

### 반영된 문서 변경

| 문서 | 변경 내용 |
|---|---|
| `docs/ROADMAP.md` | 2.1e "스킬 사용 분석" ✅ 추가; 2.6 "세션 길이 분포·DonutChart 기타 버킷 ✅" 반영 |
| `docs/DESIGN-GUIDE.md` | §3.6 `--color-violet` 추가; §8.3 사용 카테고리 8→9종·usageProfile.ts 소스 수정; §8.4 style 축 라벨 "읽기형↔실행형" → "탐험가↔설계자"; §12 TopSkills.tsx 행 추가 |
| `docs/ARCHITECTURE.md` | CLI §4 static 모드에 `__MEMRADAR_SKILLS__` 주입 명시 |

---

## 6. 작업 메타

| 항목 | 값 |
|---|---|
| 감사 실행일 | 2026-04-19 |
| 진실 기준 commit | `1d5008a` (2026-04-18 19:19 KST) |
| 대상 버전 | memradar v0.2.12 |
| 수행자 | Claude Code (메인) + 19 개 `general-purpose` 서브에이전트 |
| 배치 구성 | 4개 병렬 × 5배치 (MD 17) + 2개 병렬 × 1배치 (HTML 2) |
| 수정 원칙 | 코드=단일 진실. 문서↔코드 불일치는 무조건 코드 쪽에 맞춤. 전면 리라이트 허용. |
| 출력물 | 본 보고서(`docs/DOCS-AUDIT-REPORT.md`) + 19개 문서 수정 |
| 제외 | git commit/push는 사용자 승인 후 별도 수행 |

---

*Generated by memradar docs audit orchestrator — 2026-04-19*
