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

_다음 회차에서 추가 개선사항을 이 문서 아래에 누적 기록한다._
