# 성장 섹션 설계 문서

> **상태: ⬜ 미구현 (Phase 2 계획)** — memradar v0.2.12 기준 (2026-04-19)
>
> 이 문서는 **설계 스펙**이다. 실제 코드에는 아직 반영되어 있지 않다.
>
> - `src/types.ts` 의 `Stats` 인터페이스에 `growth` 필드 **없음**
> - `src/parser.ts` 에 `toMonthKey`, `stripMarkup`, `countWords`, `isStructured`, `buildGrowth` **없음**
> - `src/components/growth/` 디렉터리 **없음**
> - `src/index.css` 에 `.dashboard-growth-grid` **없음**
>
> 구현 착수 시 아래 "사전 확인" 체크리스트부터 돌리고, `src/parser.ts` 의 `BUILTIN_COMMANDS`(현재 module-local `const`)를 `export` 로 승격시켜야 한다.

---

> 대시보드에 "시간에 따른 변화"를 보여주는 5번째 섹션을 추가.
> 카드 3개 · 4열 그리드 `1 / 1 / 2` 레이아웃.
> **LLM 호출 없이** 순수 텍스트 처리로만 계산.

## 배경

대시보드는 DOM 흐름상 이미 4개 블록으로 자연스럽게 나뉜다.

| # | 섹션 | 성격 |
|---|---|---|
| 1 | 대화/토큰 사용 | 합계 스냅샷 |
| 2 | 활동 타임라인 | 빈도 스냅샷 |
| 3 | 사용한 것들 (모델/언어/시간대) | 분포 스냅샷 |
| 4 | 자주 쓴 단어 / 스킬 | 상위 N 스냅샷 |

앞 4개는 모두 "지금까지 얼마나"의 합계/분포다. 여기에 **"시간에 따른 변화"** 라는 새로운 축을 주는 섹션이 비어 있다.

다섯 번째 섹션 **"성장"** 을 추가해서, Wrapped 톤에 맞게 *곡선*이 주인공인 카드 묶음을 만든다.

## 레이아웃

4열 그리드 기준 **1 / 1 / 2**:

| 컬럼 | 카드 | 시각화 |
|---|---|---|
| col 1 (1칸) | **질문 복잡도 변화** | 미니 스파크라인 + 델타 |
| col 2 (1칸) | **재질문 빈도** | 퍼센트 게이지 + Top 마커 |
| col 3-4 (2칸) | **프롬프트 숙련도 곡선** | 월별 라인 차트 (메인) |

반응형:

- 데스크탑(≥1024px): `1 / 1 / 2`
- 태블릿(≥768 <1024): 복잡도 + 재질문이 한 줄(2칸씩) → 곡선이 다음 줄 전폭
- 모바일(<768): 3장 세로 스택

## 지표 설계

### 공용 유틸

월별 버킷은 **UTC ISO 기준**으로 정규화. 기존 `dailyActivity`와 동일 규칙을 따라야 타임존 경계에서 두 차트가 서로 다른 달로 잘리는 버그가 없다.

```ts
function toMonthKey(ts: string | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 7)   // "YYYY-MM"
}
```

마크업 오염 제거 전처리. user 메시지 텍스트에는 `<command-name>` 태그, 코드 블록, 로그 붙여넣기가 섞여서, 이걸 그대로 `split(/\s+/)` 하면 코드/로그를 많이 붙여넣은 달이 "성장"으로 오인된다.

```ts
function stripMarkup(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')    // 코드 펜스
    .replace(/`[^`]*`/g, ' ')            // 인라인 코드
    .replace(/<[^>]+>/g, ' ')            // XML/HTML 태그
    .replace(/https?:\/\/\S+/g, ' ')     // URL
}

function countWords(text: string): number {
  const m = stripMarkup(text).match(/[a-z가-힣]+/gi)
  return m ? m.length : 0
}
```

---

### 카드 1 — 질문 복잡도 변화

**지표**: 월별 사용자 메시지 평균 단어 수 (마크업 제거 후).

```
monthlyComplexity[month] = {
  totalWords: Σ countWords(msg.text)   (user 메시지만)
  count: user 메시지 수
  avgWords: totalWords / count
}
```

**유효 버킷 조건**: `count >= 5` 인 월만 표시. 저샘플 월은 제외.

**UI**:
- 작은 스파크라인 (SVG polyline, 높이 40~50px)
- "최근 avg: N 단어" + 첫 달 대비 델타 표기
- 델타는 유효 월 ≥ 3 일 때만 표시
- 유효 월 < 2 → "데이터 모으는 중" 빈상태

---

### 카드 2 — 재질문 빈도

**정의**: assistant 응답 직후 user 메시지가 **정정 마커**로 시작한 비율.

정정 마커 사전 (첫 30자 내, `stripMarkup` 적용 후 매칭):

```
["다시", "아니", "그게 아니라", "그거 말고", "수정",
 "아 잠깐", "잠깐만", "말고", "틀렸",
 "no wait", "actually"]
```

**세션 경계 안전성**: 세션 루프 시작마다 `prevRole = null` 로 리셋.
이전 세션이 assistant로 끝나도 다음 세션 첫 user가 follow-up으로 오인되지 않는다.

```
retryStats = {
  totalFollowups: assistant→user 전이 수 (세션 시작 user는 제외)
  retryCount: 그 중 정정 마커 포함 수
  retryRate: retryCount / totalFollowups
  topMarkers: 많이 쓴 마커 Top 3
}
```

**UI**:
- 큰 숫자 `12.4%`
- 라벨: "assistant 응답 뒤에 정정한 비율"
- Top 3 마커를 inline pill로: `"다시" 34 · "아니" 21 · "그게 아니라" 8`

---

### 카드 3 — 프롬프트 숙련도 곡선 (메인)

3개 proxy를 0~1로 정규화해 **source-aware 평균** 낸 값을 월별로 뽑는다.

**proxy A — 구조화 지시 비율** (오탐 보강)

```ts
function isStructured(text: string): boolean {
  const head = stripMarkup(text).slice(0, 500)
  const markers = [
    /(^|\n)\s*#{1,3}\s/.test(head),              // 헤딩
    /(^|\n)\s*[-*]\s+\S/.test(head),             // 불릿
    /(^|\n)\s*\d+\.\s+\S/.test(head),            // 번호
    /(^|\n)\s*(역할|role|당신은|you are)/i.test(head)  // 역할 지정
  ]
  return markers.filter(Boolean).length >= 2     // 2종 이상 섞였을 때만
}
```

서로 다른 구조 마커가 2종 이상 있어야 structured로 판정. 단순한 불릿 한 줄짜리 질문은 제외.

**proxy B — 평균 길이 (단어)**

```
avgWords_month = Σ countWords(msg.text) / count
normalizedB = clamp(avgWords / 80, 0, 1)
```

**proxy C — slash command 다양성 (Claude 전용)**

```
uniqueSkills = Set(claude 세션의 해당 월 slash command).size
normalizedC = clamp(uniqueSkills / 10, 0, 1)
```

`<command-name>` 태그는 Claude 세션에만 존재. Codex 세션은 구조적으로 0에 가까워지므로 **C에서 제외**.

**최종 점수 (source-aware)**

```
if (bucket.hasClaudeSession):
  score = (normalizedA + normalizedB + normalizedC) / 3
else:
  score = (normalizedA + normalizedB) / 2
```

Codex만 쓰는 사용자도 곡선이 0으로 붕괴되지 않는다. Claude도 같이 쓰면 C가 추가로 반영되어 다양성 보너스가 생긴다.

**UI**:
- 월별 라인 차트 (SVG polyline, 가로 2칸, 높이 ~140px)
- X축: 월 라벨 (첫/중간/마지막만 표시)
- 상단 큰 숫자: 최근 달 점수(%) + 첫 달 대비 델타
- 각 점 hover → createPortal 툴팁에 A/B/C 값 표시 (기존 TopSkills 툴팁 패턴 재사용)

---

## 리뷰 반영 내역

Codex adversarial review + 내부 검토에서 잡힌 이슈와 반영안:

| # | 원안 문제 | 반영 |
|---|---|---|
| 1 | `msg.timestamp.slice(0,7)` 로컬 슬라이싱 → 기존 일별 집계와 타임존 경계에서 어긋남 | `toMonthKey()` 공용 헬퍼 도입 (UTC ISO 기준 통일) |
| 2 | `prevRole` 선언 누락 + 세션 경계 리셋 없음 | 세션 루프 안에서 `let prevRole = null` 시작 |
| 3 | raw `split(/\s+/)` 가 `<command-name>` 태그·코드·로그를 "단어"로 집계 | `stripMarkup` + `countWords` 로 전처리 |
| 4 | proxy C `uniqueSkills`가 Codex 세션에 없음 → 구조적 0점 | `source === 'claude'` 세션만 C 집계, source-aware 평균 |
| 5 | 구조화 regex가 불릿 한 줄짜리도 structured 판정 | 서로 다른 마커 ≥ 2종 + 서두 500자로 제한 |
| 6 | 첫 달 저샘플 → "+N% 성장" 노이즈 | `count < 5` 월 제외, 델타 표시는 유효 월 ≥ 3 일 때만 |

---

## 구현 단계

### 1. 타입 — `src/types.ts`

`Stats` 인터페이스에 추가:

```ts
growth: {
  monthlyComplexity: { month: string; avgWords: number; count: number }[]
  skillCurve: {
    month: string
    score: number              // 0~1
    structured: number         // proxy A
    avgWords: number           // proxy B raw
    uniqueSkills: number       // proxy C raw
    hasClaudeSession: boolean
    count: number
  }[]
  retryStats: {
    totalFollowups: number
    retryCount: number
    retryRate: number
    topMarkers: [string, number][]
  }
}
```

### 2. 파서 — `src/parser.ts`

- `toMonthKey`, `stripMarkup`, `countWords`, `isStructured` 공용 헬퍼 추가
- `RETRY_RE` 상수 정의
- 메시지 루프를 세션 단위로 감싸서 `prevRole` 세션 경계 안전 확보
- 루프 종료 후 `buildGrowth()` 헬퍼 호출해서 `Stats.growth` 채우기
- `BUILTIN_COMMANDS`가 export 안 되어 있으면 export 추가

### 3. 신규 컴포넌트 — `src/components/growth/`

- `GrowthComplexity.tsx` — 스파크라인 + 델타 (1칸)
- `GrowthRetry.tsx` — 퍼센트 + Top 마커 pill (1칸)
- `GrowthSkillCurve.tsx` — 라인 차트 + hover 툴팁 (2칸)

차트는 **SVG 직접** (외부 라이브러리 없이). 툴팁은 기존 `TopSkills.tsx` 의 createPortal 패턴 재사용.

### 4. 대시보드 — `src/components/Dashboard.tsx`

`.dashboard-analytics-grid` (자주 쓴 스킬 / 자주 쓴 단어) 다음에 새 섹션 블록 추가:

```tsx
<div className="dashboard-growth-grid">
  <div className="dashboard-card dashboard-card-tight animate-in dashboard-growth-card-complexity">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
      <TrendingUp className="h-4 w-4 text-violet" />
      질문 복잡도
    </h2>
    <GrowthComplexity data={stats.growth.monthlyComplexity} />
  </div>
  <div className="dashboard-card dashboard-card-tight animate-in dashboard-growth-card-retry">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
      <RotateCcw className="h-4 w-4 text-violet" />
      재질문 빈도
    </h2>
    <GrowthRetry retryStats={stats.growth.retryStats} />
  </div>
  <div className="dashboard-card dashboard-card-tight animate-in dashboard-growth-card-curve">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
      <LineChart className="h-4 w-4 text-violet" />
      프롬프트 숙련도 곡선
    </h2>
    <GrowthSkillCurve data={stats.growth.skillCurve} />
  </div>
</div>
```

아이콘: `lucide-react` 의 `TrendingUp`, `RotateCcw`, `LineChart`.

### 5. 스타일 — `src/index.css`

기존 `.dashboard-analytics-grid` 패턴과 동일:

```css
.dashboard-growth-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}

@media (min-width: 768px) {
  .dashboard-growth-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dashboard-growth-card-curve { grid-column: 1 / span 2; }
}

@media (min-width: 1024px) {
  .dashboard-growth-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .dashboard-growth-card-complexity { grid-column: 1 / span 1; }
  .dashboard-growth-card-retry      { grid-column: 2 / span 1; }
  .dashboard-growth-card-curve      { grid-column: 3 / span 2; }
}
```

---

## 수정 파일 요약

- `src/types.ts` — `Stats.growth` 필드 추가
- `src/parser.ts` — 공용 헬퍼 + 월별 버킷팅 + `buildGrowth()`
- `src/components/growth/GrowthComplexity.tsx` — 신규
- `src/components/growth/GrowthRetry.tsx` — 신규
- `src/components/growth/GrowthSkillCurve.tsx` — 신규
- `src/components/Dashboard.tsx` — 새 섹션 블록 + 아이콘 import
- `src/index.css` — `.dashboard-growth-grid` + 3개 카드 클래스

---

## 재사용 자산

| 자산 | 위치 | 용도 |
|---|---|---|
| `BUILTIN_COMMANDS` 세트 | `src/parser.ts:144` (현재 미export) | slash command 필터링 — 구현 시 `export` 필요 |
| `<command-name>` 정규식 | `src/parser.ts:196` | skill 추출 |
| createPortal 툴팁 패턴 | `src/components/TopSkills.tsx` (L2 import, L69~ 사용) | GrowthSkillCurve hover 툴팁 |
| `dailyActivity` 버킷팅 | `src/parser.ts` | `monthly*` 집계 스타일 참고 |
| `dashboard-card`, `-tight`, `animate-in`, `text-violet` | `src/index.css` | 카드 스타일 상속 |

---

## 검증

1. `npm run dev` 로컬 기동 후 대시보드 진입.
2. 데스크탑(≥1024px): 성장 3개 카드가 `1 / 1 / 2` 배치.
3. 태블릿(≥768 <1024): 복잡도+재질문이 2칸, 곡선이 다음 줄 전폭.
4. 모바일(<768): 3장 세로 스택.
5. 데이터 2개월 이상 세션:
   - 복잡도 스파크라인 그려짐 + 델타 값 표시
   - 숙련도 라인에 hover → 툴팁에 A/B/C proxy 값 노출
6. 데이터 1개월 세션: 빈상태 메시지 정상.
7. 재질문 빈도: 샘플 JSONL에서 "다시"/"아니" 로 시작하는 user 메시지 수동 카운트 → 카드 값과 일치.
8. Codex-only 세션만 로드 시 곡선이 0으로 붕괴하지 않는지 확인 (source-aware 평균 검증).
9. `npx tsc -b` 타입 체크 통과.
10. 콘솔 `stats.growth` 스팟체크:
    - `retryRate` 0~1 범위
    - `skillCurve[*].score` 0~1 범위
    - `monthlyComplexity[*].count >= 5`

## 사전 확인 (구현 직전)

- [ ] `package.json` 에 `recharts`/`chart.js` 등 차트 라이브러리 설치 여부
- [ ] `msg.timestamp` 포맷이 정말 ISO인지, null 가능성 처리 확인
- [ ] `BUILTIN_COMMANDS` export 여부
- [ ] `Session.source` 타이핑 확인 (`src/types.ts`)
- [ ] 기존 `dailyActivity` 가 UTC ISO 기준인지, 아니면 로컬 포맷인지 확인 → 필요시 `toDayKey` 로 같이 정리

---

## 리스크 및 Open Questions

- **proxy B의 "길다 = 숙련"** 단순화는 반론 여지 있음. 오래 쓰면 일부러 짧게 쓰는 숙련자 패턴도 있음. 일단 Wrapped 톤에 맞춰 단순화하고, 추후 A 단독 또는 A+C 조합으로 대체 옵션 검토.
- **정정 마커 한국어 편향**: 영어 사용자는 `no wait`, `actually` 만으로는 커버리지 낮음. 영어 마커 사전 확장 고려.
- **월별 < 5 샘플 제외**가 오래 쉬었다가 다시 쓴 사용자한테 "곡선이 비어 보인다" 느낌을 줄 수 있음. 스파크라인에 gap 표시 UX 고민 필요.
- **`session.source` 필터**가 대시보드 상단에서 걸리는 경우: 성장 지표도 필터 이후 세션만 계산할지, 전체로 계산할지 결정 필요.
