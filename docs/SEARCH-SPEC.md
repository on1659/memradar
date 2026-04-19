# Search — 상세 기획

> Memradar 를 "보는 툴"에서 "다시 찾는 아카이브"로 바꾸는 기능

**버전:** v0.2.12 · **갱신일:** 2026-04-19

현재 상태: Phase A(풀텍스트)와 Phase B(필터·정렬·역할/모델/도구/프로젝트/날짜) 전부 구현 완료. 남은 것은 Phase C(IndexedDB 역색인·Web Worker·그룹핑 고도화)와 URL 쿼리 동기화. 상세 로드맵은 [ROADMAP.md §2.2](./ROADMAP.md) 참고.

## 컨셉

사용자가 쌓아둔 AI 대화 기록 안에서 원하는 작업·질문·파일·도구 사용 흔적을 빠르게 다시 찾을 수 있게 한다.

Code Report 가 처음의 "와"를 만드는 기능이라면, Search 는 계속 돌아오게 만드는 기능이다.

---

## 목표

- 특정 작업을 했던 세션을 빠르게 다시 찾기
- 예전에 어떤 프롬프트/질문/도구 조합을 썼는지 회고하기
- "이거 전에 어디서 했지?"를 해결하는 기본 탐색 도구 만들기

---

## 구현 범위

### 1. 풀텍스트 검색 ✅

- 세션 전체와 메시지 텍스트를 대상으로 검색
- 사용자 메시지와 assistant 메시지 모두 검색 대상
- 도구 사용 이름은 필터로 지원 (텍스트 자체에 포함되면 풀텍스트로도 히트)
- `cwd`·모델·파일명이 메시지 본문에 나타나면 그대로 매칭됨

예시:

- `zustand`
- `useEffect`
- `vercel deploy`
- `read_file`
- `~/projects/my-app`

### 2. 필터 ✅

검색 결과를 아래 기준으로 좁힐 수 있다. 모두 `SearchFilters` 인터페이스에 반영되고 `SearchBar` 패널에서 조작 가능.

- 모델 (`model` 드롭다운, facets 기반)
- 툴 사용명 (`tool` 단일 선택 드롭다운, facets 기반)
- 프로젝트 경로 (`cwd` 드롭다운, facets 기반, 표시는 `shortenCwd` 로 마지막 2세그먼트)
- 날짜 범위 (`dateFrom` / `dateTo`, `YYYY-MM-DD` 비교)
- 역할
  - user만
  - assistant만
  - 전체

### 3. 결과 리스트 ✅

각 결과는 아래 정보를 포함한다.

- 세션 첫 메시지 스니펫 (세션 제목 대용)
- 매칭된 문장 스니펫(양쪽 80자 컨텍스트, 시작/끝 잘림 시 `...`)
- 일치 개수(`matchCount`) — 관련도 정렬 기준
- 타임스탬프(월/일/시:분, `ko-KR` 로케일)
- 모델
- `cwd` (최대 150px 말줄임)
- 사용 도구 최대 3개 + 나머지 개수

### 4. 세션 이동 ✅

- 결과 클릭 시 `onSelectResult(session, messageIndex)` 로 세션 상세로 전환
- 해당 메시지 위치로 스크롤 및 검색어 하이라이트는 세션 상세 렌더링에서 수행

### 5. 정렬 ✅

세 가지 정렬 모드를 지원 (`SearchSort`).

- 관련도순 (`relevance`, 기본) — `matchCount` 내림차순
- 최신순 (`newest`) — `timestamp` 내림차순
- 오래된순 (`oldest`) — `timestamp` 오름차순

---

## UX 흐름

1. Ctrl+K 또는 해시 라우트 `#search` 로 검색 뷰 진입
2. 검색 입력창 자동 포커스, 키워드 입력 (200ms debounce)
3. 결과 리스트 즉시 갱신 (최대 100건)
4. 필터 패널 토글 후 모델/도구/프로젝트/날짜/역할 적용
5. 정렬 변경
6. 결과 클릭 → 세션 상세에서 해당 맥락 확인
7. Esc 로 뒤로 나가기

---

## UI 구성

### 검색 바 (`SearchBar.tsx`)

- 메인 입력 placeholder: `메시지 검색...`
- autoFocus, Esc → 필터 패널 닫기 또는 뷰 종료
- 입력 내용 있으면 X 버튼으로 즉시 clear
- 200ms debounce (`SearchView` 내부에서 관리)
- 오른쪽에 필터 토글 버튼과 닫기 버튼 배치

### 필터 패널

- 발신자 토글: 전체 / User / Claude
- 모델 드롭다운 (facets.models 기반, 값 있을 때만 노출)
- 도구 드롭다운 (facets.tools 기반, 값 있을 때만 노출) — 현재 단일 선택
- 프로젝트 드롭다운 (facets.cwds 기반)
- 날짜 범위: `from` / `to` `<input type="date">`
- 필터 초기화 버튼 (쿼리는 유지)

### 결과 카드 (`SearchResults.tsx`)

- 역할 아이콘 (User / Bot), 초록 vs accent 색 구분
- 스니펫: `<mark>` 로 매치 하이라이트, 최대 3줄 `line-clamp`
- 메타 정보 한 줄: 타임스탬프, 모델, 프로젝트 경로, 사용 도구 목록
- 세션 첫 메시지 preview(60자) — 세션 식별 보조

---

## 검색 동작 규칙

### 매칭 규칙 ✅

- 대소문자 구분 없음 (`toLowerCase` 비교)
- 부분 일치 허용 (`String.includes`)
- 현재는 단일 토큰 매칭 — 여러 단어는 하나의 substring 으로 취급
- AND 검색, 정규식 검색, boolean 문법 미지원 (제외 범위)

### 스니펫 규칙 ✅

- 첫 매치 기준 앞뒤 80자 컨텍스트 추출
- 잘린 쪽에 `...` 부착
- 매치 개수는 전체 텍스트 기준으로 계산 (하이라이트는 스니펫 구간만)
- 특수문자 이스케이프 처리(`escapeRegex`)

### 결과 그룹핑

- 현재는 메시지 단위로 평면 리스트 (최대 100건)
- 같은 세션 결과 시각적 그룹핑은 Phase C 항목

---

## 기술 구현

### 인덱싱

세션 파싱 후 `buildSearchRecords(sessions)` 로 메시지 단위 레코드를 만든다.

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

`extractFacets(sessions)` 는 드롭다운용 모델/도구/cwd 집합을 뽑는다.

- 현재는 메모리 내 배열 선형 스캔 (`search()` 함수)
- 값싼 필터(role/model/tool/cwd/date) 먼저 적용, 텍스트 매칭 마지막
- Phase C 에서 IndexedDB + 역색인 전환 검토

### 상태 관리

`SearchView` 로컬 상태로 관리:

- `filters: SearchFilters` (query 포함)
- `debouncedQuery`
- `sort: SearchSort`

URL 쿼리 스트링 연동은 **미구현** — 현재 진입점은 `#search` 해시와 Ctrl+K 핫키만. 향후 확장:

- `/search?q=zustand`
- `/search?q=deploy&model=claude-sonnet&tool=bash`

### 진입점 ✅

- `App.tsx` 에서 `Ctrl+K` 단축키로 `search` 뷰 토글
- 해시 라우트 `#search` 로 직접 진입
- Esc 로 대시보드 복귀

### 하이라이트 ✅

- 검색어 기준으로 문자열 분리 후 `<mark>` 렌더링 (`HighlightedSnippet`)
- 정규식 이스케이프 처리 (`escapeRegex`)

---

## 성능 기준

- debounce 200ms 적용 중
- 현재 결과 상한 100건으로 대용량 세션 UI 멈춤 방지
- 값싼 필터 → 텍스트 매칭 순서로 최적화
- Web Worker 분리는 Phase C (후순위)

---

## 제외 범위

현재 구현에서 다루지 않는 기능:

- 벡터 검색
- 자연어 의미 검색
- AI 기반 검색어 추천
- 복잡한 쿼리 문법 (AND/OR/NOT)
- 정규식 검색
- 저장된 검색
- 검색 결과 공유 링크의 완전한 재현성 보장

---

## 성공 기준

- 사용자가 예전 작업 세션을 10초 안에 다시 찾을 수 있다
- 특정 키워드로 원하는 메시지 문맥을 바로 열 수 있다
- Memradar가 단순 시각화가 아니라 "기록 도구"처럼 느껴진다

---

## 단계별 상태

### Phase A ✅ done (v0.2.12)

- 검색 입력창 (`SearchBar.tsx`)
- 풀텍스트 검색 (`src/lib/search.ts`)
- 메시지 단위 결과 (`SearchResults.tsx`)
- 세션 이동 + 검색어 하이라이트
- Ctrl+K / `#search` 진입점

### Phase B ✅ done (v0.2.12)

- 모델 / 툴 / 프로젝트(cwd) / 날짜 범위 / 역할 필터 — 모두 `SearchFilters` 에 반영
- 정렬 옵션 3종 (relevance / newest / oldest)
- 도구·모델·프로젝트 드롭다운은 `extractFacets` 결과로 자동 채움

### Phase B 잔여 🚧

- URL 쿼리 스트링 동기화 (`/search?q=...&model=...`) — 미구현
- 도구 다중 선택 (현재 단일 선택 드롭다운)

### Phase C ⬜ planned

- IndexedDB 기반 검색 캐시 / 역색인
- 결과 그룹핑 고도화 (세션 단위 묶기)
- Web Worker 분리 및 대용량 세션 성능 최적화
