# Session Role Tags — 기획

> ⬜ **상태: 미구현 / Phase 2 확장 아이디어** · 작성일 **2026-04-21** · 기준 버전 **v3.1.3**
>
> 본 문서는 대시보드 세션 리스트의 각 세션에 **AI 역할 태그**를 부여하고, 태그 클릭 시 해당 역할로 사용된 세션만 필터링하는 기능의 설계 스펙이다. 현재 레포에는 구현체가 없다. 로드맵 [ROADMAP.md §2.2a 고급 필터](./ROADMAP.md) 확장의 한 갈래로 기획되었다.
>
> 연관 자료: [usageProfile.ts](../src/lib/usageProfile.ts), [WRAPPED-SPEC.md §Slide 7 Usage](./WRAPPED-SPEC.md)

---

## 1. 컨셉

대시보드 하단 **대화 기록 리스트**의 각 세션 행에, 그 세션에서 사용자가 AI에게 가장 많이 시킨 "역할" 태그를 1~2개 붙인다. 태그를 클릭하면 해당 역할이 태깅된 세션만 리스트에 남는다.

**비유**: Gmail 라벨 · Notion 태그 · 음악 앱의 "이 아티스트만 듣기"와 동일한 패턴. Memradar 안에서는 "이 역할처럼 쓴 세션만 모아보기"가 된다.

---

## 2. 왜 필요한가

현재 세션 리스트의 **정량 정보**(날짜, 메시지 수, 토큰, 모델)만으로는 "내가 문서 작업하던 세션이 어디였지?"를 찾기 어렵다. 본문 검색(Ctrl+K)은 키워드가 기억날 때만 유효하다.

AI 역할 태그는:
- **회고 시점에 의미 단위로 탐색**을 지원한다 ("요즘 디버깅한 세션들 보자")
- Wrapped Slide 7 Usage에 이미 등장하는 **9개 카테고리**를 리스트 UI로 노출해 일관성을 맞춘다
- 추가 입력 없이 **기존 키워드 매칭 로직을 재활용**한다

---

## 3. 데이터 소스와 재활용

[src/lib/usageProfile.ts](../src/lib/usageProfile.ts) 에 이미 존재하는 9개 카테고리를 그대로 사용한다.

| id | title | emoji | 대표 키워드 |
|---|---|---|---|
| `feature` | 풀스택 기획자 | 🏭 | 만들, 추가, 구현, implement, component |
| `debug` | 버그 헌터 | 🚨 | 버그, fix, 에러, broken |
| `refactor` | 리팩터링 전문가 | 💅 | 리팩터, cleanup, 개선 |
| `review` | 코드 분석가 | 🧐 | 리뷰, 분석, 설명, 왜 |
| `writing` | AI 작가 | ✍️ | 문서, readme, 번역, 요약 |
| `design` | 아트 디렉터 | 🎨 | 디자인, ui, css, 레이아웃 |
| `devops` | 배포 마스터 | 🚀 | 배포, deploy, ci, docker |
| `data` | 데이터 엔지니어 | 🧙 | 데이터, database, sql, json |
| `test` | QA 엔지니어 | 🧪 | 테스트, test, spec, e2e |

기존 `analyzeUsageTopCategories(sessions[])`는 **전체 집계**만 제공. 본 기능은 **세션 단위 집계**가 필요하므로 신규 헬퍼가 요구된다.

### 3.1 신규 헬퍼 시그니처

```typescript
// src/lib/usageProfile.ts 에 추가
export function analyzeSessionCategories(
  session: Session,
  limit = 2,
): UsageCategoryScore[]
```

동작 규칙:
- `session.messages` 중 `role === 'user'`인 메시지만 순회
- 각 메시지 텍스트를 lowercase한 뒤 각 카테고리의 키워드 배열 중 **하나라도 포함**되면 그 카테고리 점수 +1 (카테고리별 1회만)
- 점수 > 0 인 카테고리만 내림차순 정렬 후 상위 `limit` 개 반환
- 0개일 수도 있음(태그 미표시)

### 3.2 집계 비용과 메모이즈

세션 N개 × 메시지 M개 × 카테고리 9개 × 키워드 ~15개. 키워드 매칭은 `String.prototype.includes`이고 카테고리 안에서 첫 히트에 early-exit. 실사용 규모(세션 수천 개)에서도 1회성 비용은 낮음.

Dashboard 에서는 **세션 집합이 바뀔 때 한 번만** `Map<sessionId, UsageCategoryScore[]>`을 `useMemo([sessions])` 로 계산해 렌더에서 즉시 조회한다.

---

## 4. UI 스펙

### 4.1 세션 리스트 행

기존 `renderSessionRow` ([Dashboard.tsx:1100 근처](../src/components/Dashboard.tsx)) 의 우측 칩 영역(Claude/모델/토큰) **뒤**에 역할 칩을 덧붙인다.

```
┌─────────────────────────────────────────────────────────────┐
│ 12  리플레이기능 추가한걸로 커밋, 배포...                     │
│     세션 · /Users/radar/Work/memradar                        │
│     2026-04-21  28  12분  [Claude][opus 4.7][342K 토큰]    │
│                                                              │
│                                  [✍️ AI 작가] [🚨 버그 헌터] │ ← 추가
└─────────────────────────────────────────────────────────────┘
```

- 칩 모양: 기존 모델/토큰 칩과 동일한 `rounded-full border px-2 py-0.5 text-[10px]`
- 스타일: `border-text/12 bg-bg-hover text-text-bright hover:border-accent/40 hover:text-accent`
- 활성 상태(현재 필터링 중인 역할): `border-accent bg-accent/15 text-accent`
- **세션 행 자체는 클릭 시 세션 열기**, 칩은 `e.stopPropagation()`으로 부모 동작 차단 후 필터 토글

HTML 중첩 규칙상 `<button>` 안에 `<button>`은 금지이므로, 세션 행을 `<div role="button">`으로 바꾸거나 칩을 `<span onClick>`으로 두 번째 단계에서 결정.

### 4.2 활성 필터 배너

리스트 상단(검색창/날짜 필터 블록 안 또는 바로 아래)에 배너 한 줄:

```
┌─────────────────────────────────────────────────────┐
│ ✍️ AI 작가 · 역할로 사용된 세션만 보기        [해제] │
└─────────────────────────────────────────────────────┘
```

- 스타일: `border-accent/30 bg-accent/8` tint
- `[해제]` 버튼: `setAiRoleFilter(null)`

### 4.3 필터 해제 경로

사용자가 필터를 해제할 수 있는 3가지 경로:
1. 배너의 `해제` 버튼
2. 현재 활성 역할과 같은 칩을 아무 세션 행에서 다시 클릭 (토글)
3. 브라우저 뒤로가기(상태를 해시 라우팅에 태우지 않으므로 **미해당**)

---

## 5. 상태 관리

### 5.1 타입 확장

[src/components/Dashboard.tsx](../src/components/Dashboard.tsx) 의 `DashboardFilters` 에 필드 추가:

```typescript
export interface DashboardFilters {
  sessionFilter: string
  sessionSourceFilter: 'all' | 'claude' | 'codex'
  sessionSort: 'date' | 'tokens'
  dateFrom: string
  dateTo: string
  aiRoleFilter?: string | null   // NEW
}
```

`App.tsx` 의 초기값에도 `aiRoleFilter: null` 추가. `?` 로 optional 선언해 기존 저장 상태(없음)와 호환.

### 5.2 필터 합성

```typescript
const filteredSessions = useMemo(() => {
  return sortedSessions.filter(session => {
    // (기존 source/date/search 필터 통과 후)
    if (aiRoleFilter) {
      const roles = sessionRoles.get(session.id) ?? []
      if (!roles.some(r => r.id === aiRoleFilter)) return false
    }
    return true
  })
}, [..., aiRoleFilter, sessionRoles])
```

- 태그가 **상위 2개**에 드는 세션만 매칭한다. 이 제한은 "세션의 대표 역할"이라는 의미를 유지하기 위함. 확장 시 `limit`을 상향하면 된다.

---

## 6. 엣지 케이스

| 상황 | 동작 |
|---|---|
| 세션에 태그가 0개 (키워드 매칭 실패) | 세션 행에 칩 미표시. 현재 역할 필터가 활성이면 이 세션은 숨김 |
| 활성 필터와 매칭되는 세션이 0개 | 기존 빈 리스트 레이아웃 (`emptySessionListLabel`) 재사용 + 배너는 유지 |
| 역할 필터 + 검색어 + 날짜 필터 동시 | AND 조건으로 모두 만족해야 표시 (기존 동작 확장) |
| 세션 1만 개 규모 | `useMemo` 캐시로 초기 1회만 계산. 칩 렌더는 가상 스크롤 도입 전까지는 페이지네이션(50개 단위)에 의존 |

---

## 7. i18n

`src/i18n.tsx` 키 2개 추가:

```typescript
'dashboard.roleFilter.banner': '{title} · 역할로 사용된 세션만 보기',
'dashboard.roleFilter.clear': '해제',
// en:
'dashboard.roleFilter.banner': 'Filtered to sessions used as {title}',
'dashboard.roleFilter.clear': 'Clear',
```

카테고리 `title` 자체는 usageProfile 상수에서 ko만 제공 중. 영문 필요 시 별도 필드(`titleEn`) 추가 또는 i18n 키 매핑 테이블 도입은 후속 과제.

---

## 8. 테스트 (Playwright)

```typescript
test('clicking AI role chip filters session list', async ({ page }) => {
  // ... 대시보드 진입
  const chip = page.locator('[data-ai-role-chip="writing"]').first()
  const beforeCount = await page.locator('.divide-y.divide-border > *').count()
  await chip.click()
  await expect(page.locator('[data-ai-role-active="writing"]')).toBeVisible()
  const afterCount = await page.locator('.divide-y.divide-border > *').count()
  expect(afterCount).toBeLessThanOrEqual(beforeCount)
})

test('clear role filter restores list', async ({ page }) => {
  // ... 필터 켠 뒤
  await page.locator('[data-ai-role-active] button', { hasText: /해제|Clear/ }).click()
  await expect(page.locator('[data-ai-role-active]')).toHaveCount(0)
})
```

권장 `data-*` 훅:
- 칩: `data-ai-role-chip="<id>"`
- 활성 배너: `data-ai-role-active="<id>"`

---

## 9. 만들지 않을 것

- ❌ **사용자 수동 태그 편집** — 태그는 키워드 매칭 결과이지 사용자가 관리하는 메타데이터가 아니다. 수동 관리는 로컬 전용 앱의 단순성 원칙을 깬다.
- ❌ **태그 URL 동기화** — 필터 상태를 해시에 실으면 라우팅 복잡도가 커진다. 세션 내 임시 필터로 유지.
- ❌ **다중 역할 AND 필터** — "AI 작가 AND 버그 헌터"는 세션 수 급감으로 실용성 낮음. 단일 역할 필터만.
- ❌ **역할 태그 편집·추가** — `USAGE_CATEGORIES` 상수 유지. 신규 카테고리 도입은 정책 결정 사안이지 UI 기능이 아님.

---

## 10. 구현 순서 (착수 시)

1. `analyzeSessionCategories()` 추가 + 단위 동작 수동 확인
2. `DashboardFilters.aiRoleFilter` 타입 확장 + App.tsx 초기값
3. `sessionRoles` Map `useMemo` + `filteredSessions`에 필터 로직 추가
4. 세션 행에 칩 렌더 + 클릭 토글
5. 활성 배너 + 해제 버튼
6. Playwright 테스트 2개 추가
7. lint + build + test:harness 통과 확인

예상 작업량: 반나절 이내. 스펙이 구체적이고 기존 인프라 재활용이 많아 의사결정 비용 낮음.

---

## 11. 후속 확장 아이디어

- **히스토그램** — 활성 필터에서 해당 역할의 시간대/일별 분포 표시
- **역할 조합 프로필** — 세션별 상위 2개 조합(`writing+refactor` 등)을 집계해 "당신의 AI 작업 패턴"류 시각화로 Wrapped 슬라이드에 역수출
- **부정 필터** — "이 역할 제외하고 보기" 토글
- **임계 튜닝 UI** — 세션당 상위 `limit`을 사용자가 1~3개 사이 선택

*문서 스탬프: v3.1.3 / 2026-04-21*
