# Memradar 개선사항 로그

> 코드베이스 스캔을 통해 발견한 개선 기회를 회차별로 기록하는 문서. 최대 5회차까지 반복 스캔하며 누적한다.

---

## 회차 1 — 2026-04-17

코드 품질·성능·접근성·보안·DX 관점에서 전체 코드베이스 스캔. 5개 개선사항 발견.

### 1. 파싱 에러가 사용자에게 전달되지 않음 (silent failures)

| 항목 | 내용 |
|---|---|
| **위치** | `src/parser.ts:60-62`, `cli/index.mjs:104-106` |
| **카테고리** | 코드 품질 / 에러 처리 |
| **심각도** | 높음 |

**현재 문제**: JSONL 파일 파싱 시 malformed 라인을 `try/catch` 로 조용히 무시한다. 인코딩 오류나 파일 손상이 있어도 사용자에게 경고 없이 데이터가 누락된다.

**제안**:
- 파싱 결과에 에러 카운터 추가: `{ sessions: Session[], skipped: number, errors: string[] }`
- UI 에 "⚠ N줄을 읽지 못했어요" 경고 배너 노출
- CLI 에 `⚠ Skipped X malformed lines in file Y` 출력

---

### 2. 검색 시 매번 전체 레코드를 재생성

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/search/SearchView.tsx:37-51` |
| **카테고리** | 성능 |
| **심각도** | 중간 |

**현재 문제**: 세션 배열이 바뀔 때마다 `buildSearchRecords()` 가 전체 세션을 순회하며 검색 레코드를 재생성한다. 세션 수가 늘어날수록 검색 응답성이 떨어진다.

**제안**:
- `buildSearchRecords` 결과를 `useMemo` 로 캐싱 (의존성: 세션 배열 길이 또는 해시)
- 중기적으로는 역인덱스(inverted index) 구조 도입 검토

---

### 3. Dashboard `setInterval` 정리 누락 위험

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/Dashboard.tsx:529-546` |
| **카테고리** | 성능 (메모리 누수) |
| **심각도** | 중간 |

**현재 문제**: `setInterval` 로 UI 상태를 10초마다 토글하는데, `dayPatternPinned` / `busyDayPinned` 상태 변경 시 이전 타이머가 정리되지 않고 누적될 가능성이 있다.

**제안**:
- `useEffect` 의존성 배열에 `dayPatternPinned`, `busyDayPinned`, 관련 데이터 값 포함
- cleanup 함수에서 `clearInterval` 이 확실히 호출되는지 검증

---

### 4. CLI 경로 탐색 시 심볼릭 링크·민감 디렉터리 필터링 부족

| 항목 | 내용 |
|---|---|
| **위치** | `cli/index.mjs:28-40` |
| **카테고리** | 보안 / DX |
| **심각도** | 중간 |

**현재 문제**: `findJsonlFiles()` 가 `subagents` 폴더만 제외하고 나머지는 무한 재귀 탐색한다. 심볼릭 링크, `node_modules`, `.git` 같은 디렉터리를 만나면 불필요하게 깊어지거나 민감한 경로에 접근할 수 있다.

**제안**:
- 제외 목록 확대: `subagents`, `node_modules`, `.git`, `.private`
- `fs.realpathSync` 로 심볼릭 링크 순환 방지
- 접근 실패 경로를 verbose 모드(`--verbose`)에서 경고 출력

---

### 5. SVG 차트·도넛 슬라이스의 접근성 미흡

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/Dashboard.tsx` (도넛 차트, 히트맵), `src/index.css:996-1010` |
| **카테고리** | 접근성 |
| **심각도** | 낮음 |

**현재 문제**:
- SVG 인터랙티브 요소(도넛 슬라이스, 히트맵 셀)에 `:focus-visible` 스타일이 없어 키보드 사용자가 포커스 위치를 파악하기 어렵다.
- Light/Paper 테마에서 `text-text/40` (`rgba` 40% 투명도) 텍스트의 WCAG AA 대비(4.5:1) 충족 여부가 불확실하다.
- 차트 SVG 에 `role="img"` 및 `aria-label` 이 없어 스크린리더가 차트 목적을 알 수 없다.

**제안**:
- 모든 인터랙티브 SVG 요소에 `:focus-visible { outline: 2px solid var(--t-accent); outline-offset: 2px; }` 추가
- Light 테마에서 `text-text/40` 계산 값 대비 검증 (최소 `#767676` 수준 = 4.54:1)
- 차트 루트 `<g>` 에 `role="img" aria-label="활동 히트맵"` 추가

---

### 우선순위 요약

| 순위 | 이슈 | 심각도 | 카테고리 |
|---|---|---|---|
| 1 | 파싱 에러 silent failure | 높음 | 코드 품질 |
| 2 | 검색 레코드 매번 재생성 | 중간 | 성능 |
| 3 | Dashboard setInterval 정리 | 중간 | 성능 |
| 4 | CLI 경로 필터링 부족 | 중간 | 보안 |
| 5 | SVG 차트 접근성 | 낮음 | 접근성 |

---

## 회차 2 — 2026-04-17

1회차에서 다루지 않은 i18n·타입·데이터 정확성 관점 스캔. 5개 개선사항 발견.

### 6. i18n 미적용: WrappedView aria-label 한국어 고정

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/wrapped/WrappedView.tsx:169, 182, 191, 202, 213, 227` |
| **카테고리** | i18n / 접근성 |
| **심각도** | 중간 |

**현재 문제**: 슬라이드 네비게이션 버튼의 `aria-label` 이 전부 한국어 하드코딩. 영어 로케일 사용자의 스크린리더에서 한국어 라벨만 읽힌다.

```tsx
aria-label="이전 슬라이드"
aria-label="다음 슬라이드"
aria-label="마지막 슬라이드로 건너뛰기"
```

**제안**: `src/i18n.tsx` 에 `wrapped.nav.prev` / `wrapped.nav.next` / `wrapped.nav.skip` 키 추가, `t()` 호출로 교체.

---

### 7. i18n 미적용: Dashboard 내 한국어 상수 분산

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/Dashboard.tsx:48-51, 114, 201, 240` |
| **카테고리** | i18n |
| **심각도** | 중간 |

**현재 문제**: `useI18n()` 훅을 쓰고 있지만, `"분"` / `"시간"` / `"세션"` / `"일"~"토"` 같은 상수가 여전히 한국어 리터럴로 남아있다.

**제안**: 시간 단위(`time.minutes`, `time.hours`), 요일 배열(`day.sun`~`day.sat`), 통계 라벨(`stats.session`) 을 i18n 키로 이동.

---

### 8. i18n 미적용: DropZone 에러 메시지

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/DropZone.tsx:85-86` |
| **카테고리** | i18n / UX |
| **심각도** | 중간 |

**현재 문제**: 파일 업로드 실패 시 에러 문자열이 한국어 리터럴. 재시도 버튼도 없어서 에러 상태에서 복구하려면 페이지 새로고침이 필요하다.

**제안**:
- 에러 메시지를 `t('upload.error.noFiles', { count })` 로 이동
- 에러 상태에서 "다시 선택" 버튼 제공

---

### 9. `types.ts` optional 필드 의미 불명확

| 항목 | 내용 |
|---|---|
| **위치** | `src/types.ts:6, 10-31` |
| **카테고리** | 타입 안정성 |
| **심각도** | 낮음 |

**현재 문제**: `RawMessage` 인터페이스의 모든 필드가 `optional(?)` 로 선언돼 있어 실제 필수 필드(예: `message`)가 타입 수준에서 보장되지 않는다.

**제안**: `message` 같은 핵심 필드는 required 로 분리하고, 나머지만 `Partial<>` 처리. 또는 최소한 JSDoc 주석으로 "필수/선택" 의미를 명시.

---

### 10. `tokenPricing.ts` 가격 데이터 모델별 미분화

| 항목 | 내용 |
|---|---|
| **위치** | `src/lib/tokenPricing.ts:9-29, 56-58` |
| **카테고리** | 데이터 정확성 |
| **심각도** | 높음 |

**현재 문제**: Claude 가격이 단일 `ESTIMATED_PRICE` 로 하드코딩돼 Opus / Sonnet / Haiku 구분 없이 동일 가격(`input: 10, output: 30`)을 적용한다. 반면 Codex 쪽은 GPT 모델별로 세분화돼 있어 불일치.

**제안**:
- 모델명 패턴 매칭 도입: `/^claude-opus/i → { input: 15, output: 75 }`, `/^claude-.*-sonnet/i → { input: 3, output: 15 }` 등
- 가격 데이터에 `// Last updated: 2026-04` 주석 추가
- 중기적으로 외부 JSON 설정 파일로 분리

---

### 우선순위 요약 (2회차)

| 순위 | 이슈 | 심각도 | 카테고리 |
|---|---|---|---|
| 1 | tokenPricing 모델별 미분화 | 높음 | 데이터 정확성 |
| 2 | WrappedView aria-label i18n | 중간 | i18n / 접근성 |
| 3 | Dashboard 한국어 상수 분산 | 중간 | i18n |
| 4 | DropZone 에러 메시지 i18n | 중간 | i18n / UX |
| 5 | types.ts optional 의미 불명확 | 낮음 | 타입 |

---

---

## 회차 3 — 2026-04-17

테스트·빌드·모바일 UX·Wrapped 엣지 케이스·메타 태그 관점 스캔. 5개 개선사항 발견.

### 11. Wrapped 세션 0개 엣지 케이스 미처리

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/wrapped/WrappedView.tsx:25-73` |
| **카테고리** | UX / 견고성 |
| **심각도** | 중간 |

**현재 문제**: `sessions` 가 빈 배열일 때 `sortedSessions[0]?.startTime || ''` 로 빈 문자열이 IntroSlide 에 전달된다. 슬라이드 인덱스 연산도 0개 세션에 대해 검증되지 않아 빈 화면이나 런타임 에러 가능.

**제안**: 세션이 없으면 Wrapped 진입 전에 "분석할 세션이 없습니다" 안내 화면을 보여주고 대시보드로 돌려보내는 가드 추가.

---

### 12. ErrorBoundary "다시 시도" 가 실제 복구로 이어지지 않음

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/ErrorBoundary.tsx:19-38` |
| **카테고리** | UX |
| **심각도** | 중간 |

**현재 문제**: "다시 시도" 클릭 시 `setState({ error: null })` 만 호출해서 동일 컴포넌트가 재렌더되지만, 원인(파싱 실패 등)이 해결되지 않으면 같은 에러 반복. 상위 `App` 에서 세션 재로드 트리거도 없다.

**제안**:
- "다시 시도" 에 `window.location.reload()` 또는 상위 `loadSessions` 콜백 전달
- 에러 상세(스택 트레이스 일부)를 접힌 패널로 표시해 디버깅 도움

---

### 13. 모바일 터치 스와이프 제스처 미지원 (Wrapped)

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/wrapped/WrappedView.tsx:116-146` |
| **카테고리** | 모바일 UX |
| **심각도** | 중간 |

**현재 문제**: 데스크톱 키보드(← → Space End Escape)와 클릭만 지원. 모바일에서 슬라이드 넘기려면 하단 버튼을 탭해야 하고, 좌우 스와이프 같은 네이티브 제스처가 없다.

**제안**: `onTouchStart` / `onTouchEnd` 로 간단한 스와이프 감지 추가 (deltaX > 50px 이면 다음/이전). 또는 Framer Motion 의 `drag="x"` + `onDragEnd` 활용.

---

### 14. `vite.config.ts` 번들 최적화 미설정

| 항목 | 내용 |
|---|---|
| **위치** | `vite.config.ts:80-82` |
| **카테고리** | 빌드 / 성능 |
| **심각도** | 낮음 |

**현재 문제**: 플러그인만 정의돼 있고 코드 분할·sourcemap·chunk 경고 한계 설정이 없다. 번들 크기 목표(~250KB gzipped)를 정량 관리하기 어렵다.

**제안**:
```ts
build: {
  sourcemap: true,
  chunkSizeWarningLimit: 300, // KB
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom'],
        motion: ['framer-motion'],
      },
    },
  },
}
```

---

### 15. `index.html` OG·SEO 메타 태그 부재

| 항목 | 내용 |
|---|---|
| **위치** | `index.html:1-11` |
| **카테고리** | SEO / 소셜 공유 |
| **심각도** | 중간 |

**현재 문제**: `<title>` 만 있고 `og:title` / `og:description` / `og:image` / `twitter:card` / `description` / `theme-color` / `apple-touch-icon` 이 전부 없다. SNS 공유 시 미리보기가 기본값으로만 표시된다.

**제안**:
```html
<meta name="description" content="AI 코딩 세션 로그를 시각화하고 Spotify Wrapped 스타일로 회고하는 도구" />
<meta property="og:title" content="Memradar" />
<meta property="og:description" content="당신의 AI 대화가 들려주는 이야기" />
<meta property="og:image" content="/og-image.png" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#0f141c" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

---

### 우선순위 요약 (3회차)

| 순위 | 이슈 | 심각도 | 카테고리 |
|---|---|---|---|
| 1 | Wrapped 세션 0개 미처리 | 중간 | UX / 견고성 |
| 2 | OG·SEO 메타 태그 부재 | 중간 | SEO / 소셜 |
| 3 | ErrorBoundary 복구 미작동 | 중간 | UX |
| 4 | 모바일 터치 스와이프 없음 | 중간 | 모바일 UX |
| 5 | vite.config 번들 최적화 미설정 | 낮음 | 빌드 |

---

---

## 회차 4 — 2026-04-17

시각화 엣지 케이스·알고리즘 견고성·키보드 접근성·CSS 정리 관점 스캔. 5개 개선사항 발견.

### 16. Heatmap 초기 렌더 시 컨테이너 너비 0으로 깜빡임

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/Heatmap.tsx:113-115` |
| **카테고리** | UX / 시각화 |
| **심각도** | 낮음 |

**현재 문제**: `ResizeObserver` 가 초기 로드 시 정확한 값을 즉시 전달하지 않을 수 있어, 첫 프레임에서 `containerWidth === 0` → `cellSize = 14` 기본값으로 렌더 → 직후 실측값으로 리사이즈돼 깜빡임(layout shift) 발생 가능.

**제안**: 초기 `containerWidth === 0` 일 때 히트맵을 숨기거나 스켈레톤 placeholder 를 보여주고, 첫 유효 값이 들어온 뒤 렌더.

---

### 17. WordCloud 단어 1개 또는 전부 동일 빈도일 때 시각 구별 불가

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/WordCloud.tsx:34-36` |
| **카테고리** | 시각화 / 엣지 케이스 |
| **심각도** | 낮음 |

**현재 문제**: 모든 단어 빈도가 동일하면 `range = maxCount - minCount = 0` → `1` 로 보정되지만, 결과적으로 모든 단어가 동일 크기·굵기로 렌더돼 워드 클라우드의 시각적 의미가 사라진다. 단어가 1개일 때는 `minCount` 가 실제 값이 아닌 `1` 로 폴백돼 비율 왜곡 가능.

**제안**: 단어 1개일 때는 단일 강조 표시로 전환, 빈도 차이 없을 때는 랜덤 크기 변동 또는 "빈도가 비슷합니다" 안내 추가.

---

### 18. personality.ts: 세션 있지만 메시지 0개일 때 무의미한 결과

| 항목 | 내용 |
|---|---|
| **위치** | `src/lib/personality.ts:128-137` |
| **카테고리** | 알고리즘 / 견고성 |
| **심각도** | 중간 |

**현재 문제**: `sessions.length > 0` 이면 분석을 진행하는데, 모든 세션의 메시지가 0개이거나 도구 사용이 전혀 없으면 3축 값이 모두 중간(0.5)이 되면서 항상 `EWS`(카오스 크리에이터) 로 판정된다. "데이터 부족" 상태에 대한 별도 처리가 없다.

**제안**: 총 메시지 수 또는 도구 사용 총합이 임계치 미만이면 "데이터가 부족해 성격 분석을 수행할 수 없습니다" 안내를 반환하는 가드 추가.

---

### 19. SearchBar 필터 패널에서 Escape 키 미처리

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/search/SearchBar.tsx:38-204` |
| **카테고리** | 접근성 / 키보드 |
| **심각도** | 낮음 |

**현재 문제**: 필터 패널이 열린 상태에서 `Escape` 키를 눌러도 패널이 닫히지 않는다. 마우스로만 토글 가능. 또한 SearchResults 의 결과 항목이 `onClick` 만 있고 `Enter` 키 핸들링이 없어 키보드 사용자가 결과를 선택하기 어렵다.

**제안**:
- 필터 패널 영역에 `onKeyDown` 추가: `Escape` → 패널 닫기
- 결과 항목을 `<button>` 또는 `role="button" tabIndex={0} onKeyDown={Enter → onSelect}` 로 변경

---

### 20. CSS 미사용 가능성: `dashboard-button-attention-runner` 관련 keyframes

| 항목 | 내용 |
|---|---|
| **위치** | `src/index.css:713-728, 1023-1043` |
| **카테고리** | 번들 / 정리 |
| **심각도** | 낮음 |

**현재 문제**: `@keyframes dashboardButtonBorderRun` + `.dashboard-button-attention-runner` + `@supports not (offset-path: ...)` 폴백까지 약 30줄이 정의돼 있지만, 이 클래스가 실제로 어느 컴포넌트 JSX 에서 사용되는지 확인이 필요하다. 사용처가 없다면 불필요한 CSS.

**제안**: `dashboard-button-attention-runner` 를 코드베이스에서 grep 해 사용처가 없으면 삭제. 있으면 유지하되 주석으로 사용 위치 명시.

---

### 우선순위 요약 (4회차)

| 순위 | 이슈 | 심각도 | 카테고리 |
|---|---|---|---|
| 1 | personality 데이터 부족 미처리 | 중간 | 알고리즘 |
| 2 | Heatmap 초기 깜빡임 | 낮음 | UX |
| 3 | WordCloud 동일 빈도 | 낮음 | 시각화 |
| 4 | SearchBar Escape 미처리 | 낮음 | 접근성 |
| 5 | CSS 미사용 keyframes | 낮음 | 번들 정리 |

---

---

## 회차 5 (최종) — 2026-04-17

테마 FOUC·키보드 충돌·대용량 렌더링 관점 스캔. 3개 개선사항 발견.

### 21. 테마 전환 FOUC — Light/Paper 사용자의 초기 로드 깜빡임

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/theme.ts:92-144`, `index.html` |
| **카테고리** | UX |
| **심각도** | 중간 |

**현재 문제**: `useTheme()` 훅이 `useEffect` 에서 localStorage 를 읽고 `applyTheme()` 를 호출하기 때문에, 첫 렌더에서는 기본 dark 테마 → 직후 사용자 테마로 전환되며 깜빡임(FOUC)이 발생한다. Light·Paper 사용자에게 특히 눈에 띈다.

**제안**: `index.html` `<head>` 에 인라인 스크립트를 추가해 렌더 전에 `data-theme` / `data-accent` 를 즉시 세팅:
```html
<script>
  try{const t=localStorage.getItem('memradar-theme');
  const a=localStorage.getItem('memradar-accent');
  if(t)document.documentElement.setAttribute('data-theme',t);
  if(a)document.documentElement.setAttribute('data-accent',a);
  }catch(e){}
</script>
```

---

### 22. 전역 키보드 단축키 충돌 — Ctrl+K 와 Wrapped 화살표 동시 활성

| 항목 | 내용 |
|---|---|
| **위치** | `src/App.tsx:172-186`, `src/components/wrapped/WrappedView.tsx:130-146` |
| **카테고리** | UX / 키보드 |
| **심각도** | 중간 |

**현재 문제**:
1. WrappedView 활성 상태에서 `Ctrl+K` 를 누르면 `App.tsx` 의 전역 핸들러가 실행돼 뷰가 검색으로 강제 전환될 수 있다.
2. WrappedView 의 `ArrowLeft` 핸들러에 `e.preventDefault()` 가 빠져있어 브라우저 기본 동작(뒤로가기 등)과 충돌 가능.

**제안**:
- `App.tsx` 에서 현재 뷰가 `wrapped` 일 때 `Ctrl+K` 핸들러를 스킵
- `WrappedView.tsx:135` `ArrowLeft` 분기에 `e.preventDefault()` 추가

---

### 23. 대용량 세션(500개+) 일 때 세션 목록 렌더링 병목

| 항목 | 내용 |
|---|---|
| **위치** | `src/components/Dashboard.tsx:607-613` |
| **카테고리** | 성능 |
| **심각도** | 높음 |

**현재 문제**: `filteredSessions.map(renderSessionRow)` 로 모든 세션을 한 번에 DOM 에 렌더한다. 세션 500개면 500개 노드가 즉시 생성돼 초기 렌더·검색 필터 전환 시 프레임 드롭이 발생할 수 있다. `renderSessionRow()` 내부에서 날짜 포맷·토큰 계산 등 비용이 행마다 반복된다.

**제안**:
- **단기**: `React.memo` 로 `renderSessionRow` 메모이제이션 + 처음 50개만 렌더 후 "더 보기" 버튼
- **중기**: `react-window` 같은 가상화 라이브러리 도입 (번들 ~6KB)
- **보조**: `getSessionDisplayName`, `getSessionTotalTokens` 결과를 `useMemo` 로 캐싱

---

### 우선순위 요약 (5회차)

| 순위 | 이슈 | 심각도 | 카테고리 |
|---|---|---|---|
| 1 | 대용량 세션 렌더링 병목 | 높음 | 성능 |
| 2 | 테마 FOUC 깜빡임 | 중간 | UX |
| 3 | 키보드 단축키 충돌 | 중간 | UX / 키보드 |

---

## 전체 요약 (5회 누적, 23개 개선사항)

### 심각도별 분포

| 심각도 | 개수 | 이슈 번호 |
|---|---|---|
| **높음** | 3개 | #1 파싱 silent failure, #10 tokenPricing 미분화, #23 대용량 렌더링 |
| **중간** | 14개 | #2, #3, #4, #6, #7, #8, #11, #12, #13, #15, #18, #21, #22 + 기타 |
| **낮음** | 6개 | #5, #9, #16, #17, #19, #20 |

### 카테고리별 분포

| 카테고리 | 개수 |
|---|---|
| 성능 | 4개 (#2, #3, #14, #23) |
| i18n | 3개 (#6, #7, #8) |
| UX / 견고성 | 5개 (#11, #12, #13, #21, #22) |
| 접근성 | 3개 (#5, #15, #19) |
| 코드 품질 / 에러 처리 | 2개 (#1, #18) |
| 데이터 정확성 | 1개 (#10) |
| 보안 / DX | 1개 (#4) |
| 시각화 | 2개 (#16, #17) |
| 타입 | 1개 (#9) |
| 번들 / 빌드 | 1개 (#20) |

### 권장 실행 순서

1. **즉시 (데이터 무결성)**: #1 파싱 에러 표면화
2. **단기 (사용자 체감)**: #23 대용량 렌더링, #21 FOUC, #10 tokenPricing, #15 OG 메타
3. **중기 (품질 향상)**: #6~#8 i18n 통합, #22 키보드 충돌, #11 세션 0개, #12 ErrorBoundary
4. **장기 (완성도)**: #5 SVG 접근성, #13 터치 스와이프, #14 vite 번들, 나머지

---

_5/5 회차 완료. 이 문서의 개선사항을 참조해 이슈를 생성하거나 직접 구현할 수 있다._
