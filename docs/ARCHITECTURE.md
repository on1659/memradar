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
- **테스트**: Playwright (`test:e2e`) + `test:cli` + `test:harness`(lint→build→cli→e2e)
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
│   └── tokenPricing.ts     # 모델별 가격 데이터
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
│   ├── Heatmap.tsx
│   ├── HourChart.tsx
│   ├── WordCloud.tsx
│   ├── TopSkills.tsx
│   ├── theme.ts
│   ├── search/
│   │   ├── SearchView.tsx
│   │   ├── SearchBar.tsx
│   │   └── SearchResults.tsx
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
└── index.mjs               # `npx memradar` CLI 진입점 (ESM Node, 기본 포트 3939)
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

## CLI 아키텍처

`cli/index.mjs` 는 Node ESM 스크립트이며 기본 동작은 로컬 HTTP 서버(포트 **3939**)를 띄우는 것이다.

1. `~/.claude/projects/` 및 선택적으로 `~/.codex/sessions/` 를 스캔해 `.jsonl` 세션을 수집
2. `dist/` 번들을 서빙하며 아래 API 를 노출한다:
   - `GET /api/sessions` — 감지된 세션 목록
   - `GET /api/session-content` — 개별 세션 원본 콘텐츠
   - `GET /api/skills` — 스킬 인벤토리
3. 시작 시 `registry.npmjs.org` 에서 최신 버전을 비동기로 확인 — 새 버전이 있으면 TTY 환경에서 Y/n 프롬프트를 표시하고, Y 입력 시 `npm install -g memradar@latest` 를 자동 실행 후 종료. 비TTY 환경에서는 안내 메시지만 출력한다
4. `MEMRADAR_NO_OPEN=1` 이 아니면 기본 브라우저를 자동 오픈
5. `--static` 모드에서는 단일 HTML 파일을 `MEMRADAR_OUTPUT_HTML`(기본 `/tmp/memradar.html`) 로 내보낸다. 세션 데이터는 `window.__MEMRADAR_SESSIONS__`, 스킬 정보는 `window.__MEMRADAR_SKILLS__` 로 인라인 주입된다
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
