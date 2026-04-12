# Architecture

## 기술 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 플랫폼 | 웹 전용 | CCHV가 Tauri 점유. 웹이 공유/바이럴에 유리 |
| 배포 | Vercel 정적 사이트 | 서버 불필요. 모든 처리 브라우저에서 |
| 저장소 | IndexedDB (idb) | 재방문시 재파싱 불필요, 번들 0KB |
| 상태관리 | Zustand | 가볍고 (1.5KB) 보일러플레이트 없음 |
| 라우팅 | React Router v7 | URL 공유, 뒤로가기 지원 |
| 다중 프로바이더 | 플러그인 아키텍처 | Provider 인터페이스로 확장 |
| 검색 | 메모리 인덱스 + 점진적 IndexedDB 캐시 | MVP는 단순하게 시작하고, 데이터가 늘면 캐시 확장 |
| 애니메이션 | Framer Motion | Wrapped 슬라이드 전환용 |
| 이미지 생성 | html-to-image | SNS 공유 카드 생성 |

## 현재 스택

- **프레임워크**: React 19 + TypeScript
- **빌드**: Vite 8
- **스타일**: Tailwind CSS v4
- **아이콘**: Lucide React
- **날짜**: date-fns

## 대상 디렉토리 구조

```
src/
├── i18n/                    # 다국어 지원
│   ├── index.ts
│   └── locales/
│       ├── en.json
│       └── ko.json
├── providers/               # 파서 플러그인
│   ├── index.ts             # 레지스트리 + 자동감지
│   ├── types.ts             # Provider 인터페이스
│   ├── claude.ts            # Claude Code 파서
│   ├── gemini.ts            # Gemini CLI (Phase 3)
│   ├── cursor.ts            # Cursor (Phase 3)
│   └── copilot.ts           # GitHub Copilot (Phase 3)
├── store/                   # 전역 상태
│   ├── index.ts             # Zustand 스토어
│   └── db.ts                # IndexedDB 래퍼
├── lib/                     # 순수 로직 (React 없음)
│   ├── personality.ts       # 코딩 성격 유형 계산
│   ├── shareImage.ts        # 공유 이미지 생성
│   ├── replay.ts            # 리플레이 엔진
│   ├── search.ts            # 검색 인덱스/매칭/스니펫 생성
│   ├── codeTracker.ts       # 파일 변경 추적
│   ├── achievements.ts      # 업적 정의 + 잠금해제
│   ├── pricing.ts           # 모델별 가격 데이터
│   └── ai/                  # AI 인사이트 (Phase 3)
│       ├── client.ts
│       └── prompts.ts
├── components/
│   ├── ErrorBoundary.tsx
│   ├── Dashboard.tsx
│   ├── DropZone.tsx
│   ├── SessionView.tsx
│   ├── Heatmap.tsx
│   ├── HourChart.tsx
│   ├── WordCloud.tsx
│   ├── search/
│   │   ├── SearchBar.tsx
│   │   ├── SearchFilters.tsx
│   │   ├── SearchResults.tsx
│   │   └── SearchResultCard.tsx
│   ├── wrapped/             # Promptale Wrapped
│   │   ├── WrappedView.tsx
│   │   └── slides/
│   │       ├── IntroSlide.tsx
│   │       ├── PromptsSlide.tsx
│   │       ├── ModelSlide.tsx
│   │       ├── HoursSlide.tsx
│   │       ├── BusiestDaySlide.tsx
│   │       ├── ToolsSlide.tsx
│   │       ├── VocabularySlide.tsx
│   │       ├── MarathonSlide.tsx
│   │       ├── PersonalitySlide.tsx
│   │       └── ShareSlide.tsx
│   ├── replay/              # 세션 리플레이
│   │   ├── ReplayView.tsx
│   │   ├── TimelineScrubber.tsx
│   │   └── MessageReveal.tsx
│   ├── evolution/           # 코드 진화
│   │   ├── CodeEvolution.tsx
│   │   └── FileDiffView.tsx
│   ├── achievements/        # 업적
│   │   ├── AchievementPanel.tsx
│   │   └── AchievementBadge.tsx
│   ├── viz/                 # 고급 시각화
│   │   ├── CostCalculator.tsx
│   │   ├── ComplexityRadar.tsx
│   │   └── ProjectBreakdown.tsx
│   └── settings/
│       └── ApiKeySettings.tsx
├── workers/
│   └── parser.worker.ts    # Web Worker 파싱
├── router.tsx
├── App.tsx
├── main.tsx
├── parser.ts                # 오케스트레이터 (프로바이더에 위임)
├── types.ts
└── index.css
```

## 데이터 흐름

```
[.jsonl 파일] → [Provider.detect()] → [Provider.parse()] → [Session 객체]
                                                                ↓
                                                        [Zustand Store]
                                                          ↓         ↓
                                                    [IndexedDB]  [React UI]
                                                     (캐싱)      (렌더링)
                                                          ↓
                                                   [Search Index]
                                             (메시지 단위 인덱싱/필터링)
```

## Provider 인터페이스

```typescript
interface Provider {
  id: string            // 'claude', 'gemini', 'cursor'
  name: string          // 'Claude Code'
  detect(content: string): boolean
  parse(content: string, fileName: string): Session | null
}
```

파일 내용을 각 Provider의 `detect()`에 넘겨서 어떤 도구의 로그인지 자동 판별.

## 검색 아키텍처

검색은 초기 MVP에서 별도 검색 엔진 없이 클라이언트 사이드에서 처리한다.

### 검색 단위

- 기본 검색 단위는 `메시지`
- 결과 이동 단위는 `세션`
- 한 세션 안에서 여러 메시지가 검색될 수 있음

### 검색 인덱스 구조

파싱된 세션으로부터 검색 전용 레코드를 평탄화해서 만든다.

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
2. `SearchRecord[]` 생성
3. 검색어/필터 기준으로 메모리 내 필터링
4. 결과를 관련도순 또는 최신순으로 정렬
5. 스니펫/하이라이트 생성 후 UI 렌더링

### 확장 전략

- MVP: 메모리 배열 필터링
- 세션 수 증가 시: IndexedDB에 검색 캐시 저장
- 더 큰 규모가 필요해질 때만 역색인 또는 Worker 기반 검색 추가

## 의존성 예산

| Phase | 패키지 | 크기 (gzipped) |
|-------|--------|---------------|
| 1 | react-router | ~15KB |
| 1 | zustand | ~1.5KB |
| 1 | idb | ~1.2KB |
| 1 | react-i18next + i18next | ~12KB |
| 2 | framer-motion | ~32KB |
| 2 | html-to-image | ~5KB |
| **합계** | | **~67KB** |

현재 번들 (~180KB) + 추가 (~67KB) = **총 ~250KB gzipped** (합리적)
