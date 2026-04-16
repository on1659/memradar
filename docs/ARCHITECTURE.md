# Architecture

Memradar의 기술 결정·디렉터리 구조·데이터 흐름 문서. 현재(`v0.1.8`) 구현을 기준으로 작성됐고, 미래 계획은 명시적으로 표시한다.

## 기술 결정

| 결정 | 선택 | 이유 |
|---|---|---|
| 플랫폼 | 웹 전용 | 설치 없이 URL 공유 가능 |
| 배포 | Vercel 정적 사이트 | 서버 불필요, 모든 처리 브라우저에서 |
| 저장소 | 메모리 + 필요 시 IndexedDB (idb) | 재방문 시 재파싱 부담 감소, 번들 영향 최소 |
| 상태관리 | Zustand | 가볍고 (1.5KB) 보일러플레이트 없음 |
| 라우팅 | 해시 기반 (`location.hash`) | 정적 배포·`file://` 호환 |
| 다중 Provider | 플러그인 아키텍처 | 공통 인터페이스 + 자동 감지 |
| 검색 | 메모리 인덱스 → 점진적 캐시 | MVP는 단순하게, 규모 증가 시 확장 |
| 애니메이션 | Framer Motion | Wrapped 슬라이드 전환 |
| 이미지 생성 | html-to-image | SNS 공유 카드 캡처 |

## 현재 스택

- **프레임워크**: React 19 + TypeScript
- **빌드**: Vite 8
- **스타일**: Tailwind CSS v4
- **아이콘**: Lucide React
- **날짜**: date-fns
- **애니메이션**: Framer Motion
- **이미지 캡처**: html-to-image

## 현재 디렉터리 구조

```
src/
├── providers/              # Provider 플러그인
│   ├── index.ts            # 레지스트리 + 자동 감지
│   ├── types.ts            # Provider 인터페이스
│   ├── claude.ts           # Claude Code 파서
│   └── codex.ts            # Codex 파서
├── lib/                    # 순수 로직 (React 없음)
│   ├── personality.ts      # 코딩 성격 (3축 8유형)
│   ├── usageProfile.ts     # 사용 카테고리 분석
│   ├── search.ts           # 검색 인덱스·매칭·스니펫
│   ├── modelNames.ts       # 모델명 정규화
│   └── tokenPricing.ts     # 모델별 가격 데이터
├── theme/
│   └── themePresets.ts     # 배경·accent 프리셋
├── components/
│   ├── Dashboard.tsx
│   ├── DropZone.tsx
│   ├── SessionView.tsx
│   ├── PersonalityView.tsx
│   ├── ErrorBoundary.tsx
│   ├── ThemeSwitcher.tsx
│   ├── Heatmap.tsx
│   ├── HourChart.tsx
│   ├── WordCloud.tsx
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
└── index.mjs               # `npx memradar` CLI 진입점
```

향후 추가 예정(로드맵): `src/lib/replay.ts`, `src/lib/achievements.ts`, `src/components/replay/`, `src/components/evolution/`, `src/components/achievements/` 등. 상세는 [ROADMAP.md](./ROADMAP.md) 참고.

## 데이터 흐름

```
[.jsonl 파일]
    ↓ (Provider.detect)
[선택된 Provider]
    ↓ (Provider.parse)
[Session 객체]
    ↓
[메모리 배열 + Zustand 상태]
    ↓              ↓
[React UI]   [Search Index (메시지 단위)]
```

- 파싱은 메인 스레드에서 비동기 `async/await` 로 처리. 대용량이 문제되면 Web Worker 전환을 검토.
- 재방문 시 빠른 로드가 필요해지면 IndexedDB(`idb`) 캐시를 붙인다.

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

`cli/index.mjs` 는 Node 스크립트.

1. `MEMRADAR_PROJECTS_DIR`(기본 `~/.claude/projects`) 과 `MEMRADAR_CODEX_DIR`(기본 `~/.codex/sessions`) 스캔
2. `.jsonl` 파일을 모아 `dist/` 번들과 함께 HTML 하나로 머지
3. `MEMRADAR_OUTPUT_HTML`(기본 `os.tmpdir()`) 에 저장
4. `MEMRADAR_NO_OPEN=1` 이 아니면 기본 브라우저로 오픈

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
| zustand | ~1.5KB | |
| framer-motion | ~32KB | Wrapped 슬라이드 |
| html-to-image | ~5KB | 공유 카드 캡처 |
| date-fns | ~5KB (사용 API만) | tree-shake |
| lucide-react | ~8KB (사용 아이콘만) | tree-shake |

**합계 목표**: ~250KB gzipped. 새 의존성 추가 시 이 범위 안에서 검토한다.
