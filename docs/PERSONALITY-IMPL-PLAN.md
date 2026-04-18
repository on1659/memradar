# Personality System Redesign — Implementation Plan

> 구현 계획서
> 작성일: 2026-04-18

---

## 1. 개요

### 목표
- `computePersonality()` 알고리즘을 **사용자 행동 기반**으로 교체
- UI 축 라벨/설명을 새 축 의미에 맞게 업데이트
- "AI 활용 직업" → "내 AI의 직업" 리브랜딩

### 변경 범위

| 파일 | 변경 내용 | 규모 |
|---|---|---|
| `src/lib/personality.ts` | 알고리즘 전면 교체 | ~80줄 |
| `src/lib/usageProfile.ts` | 카테고리 이름 변경 | 1줄 |
| `src/components/PersonalityView.tsx` | 축 라벨, 설명, 리브랜딩 | ~40줄 |
| `src/components/wrapped/slides/PersonalitySlide.tsx` | 툴팁 텍스트 | ~10줄 |
| `src/components/wrapped/slides/UsageSlide.tsx` | 제목 텍스트 | 1줄 |

### 변경하지 않는 것
- TypeCode 문자열 (RDM, RDS, ... EWS)
- TYPE_DEFS 콘텐츠 (유형 이름, 설명, 이모지)
- PersonalityResult 인터페이스
- ShareSlide.tsx (axes.label 동적 참조 → 자동 반영)
- WrappedView.tsx (computePersonality 호출만 → 자동 반영)

---

## 2. Step 1: `src/lib/personality.ts` — 알고리즘 교체

### 2-1. 삭제할 코드

```
// 삭제 대상 (line 38-51)
const READ_TOOL_HINTS = [...]
const EXECUTE_TOOL_HINTS = [...]
function clamp01(...)
function countToolsByHints(...)
```

### 2-2. 추가할 헬퍼 함수

#### sigmoid — 시그모이드 정규화

```typescript
function sigmoid(x: number, midpoint: number, steepness: number): number {
  if (!Number.isFinite(x)) return 0.5
  return 1 / (1 + Math.exp(-steepness * (x - midpoint)))
}
```

#### extractProject — cwd에서 프로젝트 루트 추출

```typescript
function extractProject(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.slice(0, Math.min(parts.length, 4)).join('/')
}
```

#### median — 중앙값 계산

```typescript
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
```

### 2-3. computePersonality() 내부 교체

#### 축 1: Style — 설계자(A) vs 탐험가(E)

데이터 소스:
- `session.messages` (role=user) → 평균 메시지 길이
- `session.messageCount.user` → 세션당 턴 수
- `stats.totalTokens` → 출력/입력 토큰 비율

```typescript
const userMessages = sessions.flatMap(s =>
  s.messages.filter(m => m.role === 'user')
)
const avgMsgLen = userMessages.length > 0
  ? userMessages.reduce((sum, m) => sum + m.text.length, 0) / userMessages.length
  : 100

const turnsPerSession = sessions.length > 0
  ? sessions.reduce((sum, s) => sum + s.messageCount.user, 0) / sessions.length
  : 8

const tokenRatio = stats.totalTokens.input > 0
  ? stats.totalTokens.output / stats.totalTokens.input
  : 5

const styleValue =
  sigmoid(avgMsgLen, 100, 0.02) * 0.4 +
  (1 - sigmoid(turnsPerSession, 8, 0.2)) * 0.3 +
  sigmoid(tokenRatio, 5, 0.3) * 0.3
```

#### 축 2: Scope — 한우물(D) vs 유목민(W)

데이터 소스:
- `session.cwd` → 프로젝트 ID 추출
- `session.startTime` → 활동 기간 계산

```typescript
const projectIds = sessions
  .map(s => s.cwd ? extractProject(s.cwd) : '')
  .filter(Boolean)
const uniqueProjects = new Set(projectIds)

const firstTime = new Date(sessions[0].startTime).getTime()
const lastTime = new Date(sessions[sessions.length - 1].endTime).getTime()
const activeWeeks = Math.max((lastTime - firstTime) / (7 * 24 * 3600000), 1)
const projectsPerWeek = uniqueProjects.size / activeWeeks

let switchCount = 0
for (let i = 1; i < projectIds.length; i++) {
  if (projectIds[i] !== projectIds[i - 1]) switchCount++
}
const switchRate = projectIds.length > 1
  ? switchCount / (projectIds.length - 1) : 0

const projectCounts: Record<string, number> = {}
for (const pid of projectIds) projectCounts[pid] = (projectCounts[pid] || 0) + 1
const topProjectShare = projectIds.length > 0
  ? Math.max(...Object.values(projectCounts)) / projectIds.length : 1

const scopeValue =
  sigmoid(projectsPerWeek, 2.5, 0.8) * 0.4 +
  sigmoid(switchRate, 0.3, 5) * 0.4 +
  (1 - sigmoid(topProjectShare, 0.6, 5)) * 0.2
```

#### 축 3: Rhythm — 마라토너(M) vs 스프린터(S)

데이터 소스:
- `session.startTime/endTime` → 세션 길이
- `stats.hourlyActivity` → 시간대 엔트로피

```typescript
const durations = sessions
  .map(s => (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)
  .filter(d => d > 0 && d < 1440)
const medianDuration = median(durations)

// 시간대 엔트로피
const hours = stats.hourlyActivity
const totalActivity = hours.reduce((a, b) => a + b, 0)
let hourlyEntropy = 0
if (totalActivity > 0) {
  for (const h of hours) {
    if (h > 0) {
      const p = h / totalActivity
      hourlyEntropy -= p * Math.log2(p)
    }
  }
}
const concentration = totalActivity > 0
  ? 1 - (hourlyEntropy / Math.log2(24)) : 0.5

// 세션 종류 비율
const quickCount = durations.filter(d => d < 20).length
const deepCount = durations.filter(d => d >= 60).length
const sessionTypeScore = (quickCount + deepCount) > 0
  ? deepCount / (quickCount + deepCount) : 0.5

const rhythmValue =
  sigmoid(medianDuration, 45, 0.06) * 0.4 +
  sigmoid(concentration, 0.5, 4) * 0.3 +
  sigmoid(sessionTypeScore, 0.5, 4) * 0.3
```

#### 축 라벨 & TypeCode 매핑

```typescript
const axes = {
  style:  { label: ['설계자', '탐험가'], value: styleValue },
  scope:  { label: ['한우물', '유목민'], value: scopeValue },
  rhythm: { label: ['마라토너', '스프린터'], value: rhythmValue },
}

// TypeCode 매핑 (문자열 불변)
const s = styleValue >= 0.5 ? 'E' : 'R'   // 설계자→E, 탐험가→R
const d = scopeValue >= 0.5 ? 'W' : 'D'
const r = rhythmValue >= 0.5 ? 'M' : 'S'
```

---

## 3. Step 2: `src/lib/usageProfile.ts` — 1줄 변경

```
// line 18
- title: '만능 빌더',
+ title: '기능 빌더',
```

---

## 4. Step 3: `src/components/PersonalityView.tsx` — UI 업데이트

### 4-1. AXIS_LABELS 변경 (line 15-22)

```typescript
const AXIS_LABELS: Record<string, [string, string]> = {
  R: ['탐험가', 'Explorer'],     // was 읽기형
  E: ['설계자', 'Architect'],     // was 실행형
  D: ['한우물', 'Deep'],          // was 깊이파
  W: ['유목민', 'Wide'],          // was 넓이파
  M: ['마라토너', 'Marathon'],
  S: ['스프린터', 'Sprint'],
}
```

### 4-2. computePersonalityStatic 축 라벨 (line 385-389)

```typescript
style: { label: ['설계자', '탐험가'], value: styleValue },
scope: { label: ['한우물', '유목민'], value: scopeValue },
rhythm: { label: ['마라토너', '스프린터'], value: rhythmValue },
```

### 4-3. 3축 설명 카드 (line 534-565)

| 축 | 타이틀 | 라벨 | 설명 | 공감 포인트 |
|---|---|---|---|---|
| 1 | Conversation Style | 설계자 vs 탐험가 | 메시지 길이와 대화 턴 수로 측정 | "한 번에 다 설명" vs "대화하면서 찾아감" |
| 2 | Work Scope | 한우물 vs 유목민 | 프로젝트 집중도와 전환 빈도로 측정 | "끝날 때까지 안 건드려" vs "동시에 굴려" |
| 3 | Work Rhythm | 마라토너 vs 스프린터 | 세션 종류(Quick/Standard/Deep) 비율로 측정 | "1-2시간 기본" vs "틈틈이 짧게" |

### 4-4. "내 AI의 직업" 리브랜딩

| 위치 | 현재 | 변경 |
|---|---|---|
| UsageHighlights h2 | AI 활용 직업 | **내 AI의 직업** |
| topVerdict (1개 독주) | 당신의 대표 AI 활용 직업은 X입니다 | **당신의 AI는 주로 이런 일을 해요** |
| topVerdict (2개 비슷) | X와 Y 성향이 함께 강해요 | **X와(과) Y, 투잡 뛰는 중** |
| UsageProfileRest h2 | 다른 AI 활용 직업 | **AI의 다른 직업들** |

---

## 5. Step 4: `PersonalitySlide.tsx` — 툴팁 업데이트

```typescript
// line 16-29
const AXIS_HELP: Record<AxisKey, [string, string]> = {
  style: [
    '설계자: 프롬프트를 길게 쓰고 한 번에 맡기는 스타일에 가까워요.',
    '탐험가: AI와 짧은 대화를 주고받으며 탐색하는 스타일에 가까워요.',
  ],
  scope: [
    '한우물: 한 프로젝트에 집중해서 깊게 파는 성향이에요.',
    '유목민: 여러 프로젝트를 동시에 오가며 작업하는 성향이에요.',
  ],
  rhythm: [
    '마라토너: 긴 호흡으로 오래 이어가는 작업 리듬에 가까워요.',
    '스프린터: 짧고 빠른 반복으로 문제를 해결하는 작업 리듬에 가까워요.',
  ],
}
```

---

## 6. Step 5: `UsageSlide.tsx` — 제목 변경

```
// line 19-20
- 당신의 AI 스타일은?
+ 내 AI는 무슨 일을 할까?
```

---

## 7. Edge Case 처리

| 상황 | 처리 |
|---|---|
| 세션 0개 / 메시지 3개 미만 | 기존과 동일: EWS 기본값 |
| 사용자 메시지 0개 | avgMsgLen=100, turns=8 → style 0.5 |
| cwd 전부 undefined | projectIds 빈 배열 → scope ≈ 0.2 (Deep) |
| Quick+Deep 둘 다 0개 | sessionTypeScore = 0.5 (중립) |
| totalTokens.input = 0 | tokenRatio = 5 (midpoint) |
| 세션 1개 | switchRate = 0, 정상 작동 |

---

## 8. TypeCode 매핑 검증

| TypeCode | 새 축 조합 | 유형 이름 | 의미 |
|---|---|---|---|
| EDM | 설계자 + 한우물 + 마라토너 | 장인 대장장이 ⚒️ | 상세 지시, 한 프로젝트 몰입, 길게 |
| EDS | 설계자 + 한우물 + 스프린터 | 번개 해결사 ⚡ | 정확한 지시, 집중, 빠르게 |
| EWM | 설계자 + 유목민 + 마라토너 | 만능 빌더 🏗️ | 큰 그림 설계, 여러 프로젝트, 길게 |
| EWS | 설계자 + 유목민 + 스프린터 | 트렌드 헌터 🏄 | 빠르게 여러 곳 시도 |
| RDM | 탐험가 + 한우물 + 마라토너 | 심해 잠수부 🤿 | 대화하며 깊이 탐구, 길게 |
| RDS | 탐험가 + 한우물 + 스프린터 | 코드 감별사 🔎 | 짧은 대화로 핵심 파악 |
| RWM | 탐험가 + 유목민 + 마라토너 | 도서관 사서 📚 | 대화하며 넓게 탐색, 꼼꼼히 |
| RWS | 탐험가 + 유목민 + 스프린터 | 카오스 크리에이터 🌪️ | 빠른 대화, 여러 곳, 동시다발 |

---

## 9. 검증

1. `npm run build` — 타입 에러 없이 빌드 성공
2. `npm run dev` — 개발 서버 정상 실행
3. 도감 페이지 확인:
   - 새 축 라벨: 설계자/탐험가, 한우물/유목민
   - "내 AI의 직업" 표시
   - 공감 포인트 문구 표시
4. 다양한 유형이 나오는지 확인 (만능빌더 쏠림 해소)
5. Wrapped 슬라이드 정상 렌더링
