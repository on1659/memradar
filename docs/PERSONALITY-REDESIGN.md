# Personality System Redesign Spec

> memradar 코딩 성격 유형 시스템 재설계 명세서
> 작성일: 2026-04-18

---

## 1. 문제 정의

### 현재 시스템의 결함

현재 `personality.ts`의 3축 8유형 시스템은 **거의 모든 사용자가 "만능 빌더(EWM)"로 수렴**하는 치명적 문제가 있다.

**근본 원인: AI의 행동을 사용자의 성격으로 오귀인(misattribution)**

| 축 | 현재 측정 방식 | 문제점 |
|---|---|---|
| Style (R/E) | AI가 사용한 도구 비율 (Read vs Execute) | `edit`, `write`, `bash`는 AI가 알아서 쓰는 도구. 사용자 의도와 무관 |
| Scope (D/W) | `uniqueTools/10 * 0.4 + uniqueProjects/5 * 0.3 + modelVariety/4 * 0.3` | Claude Code는 기본적으로 7-10개 도구를 매 세션 사용. 도구 다양성의 사용자 간 분산이 거의 없음 |
| Rhythm (M/S) | 평균 세션 시간 / 30분 | 대부분의 코딩 세션이 15분 이상이라 거의 모두 Marathon |

**결과**: Style → E, Scope → W, Rhythm → M으로 수렴 → EWM(만능 빌더)만 나옴

### 설계 원칙

1. **사용자가 직접 통제하는 행동**에서만 측정할 것
2. AI 도구 호출 데이터(`toolsUsed`)는 성격 축 측정에서 **완전 배제**
3. 축 간 상관을 최소화 (독립 차원)
4. 절대 임계값 금지 → percentile 기반 상대적 분류
5. 3축 8유형 뼈대 유지 (UI, 콘텐츠 변경 최소화)

---

## 2. 사용 가능한 데이터

Session 객체에서 **사용자 행동**을 반영하는 데이터만 사용한다.

| 데이터 | 출처 | 사용자 행동 여부 | 활용 |
|---|---|---|---|
| `messages[].text` (role=user) | 사용자가 직접 입력 | **O** | 축 1 (대화 방식) |
| `messages[].text` (role=assistant) | AI 생성 | X | 사용하지 않음 |
| `startTime`, `endTime` | 세션 타이밍 | **O** | 축 3 (작업 리듬) |
| `cwd` | 사용자가 선택한 작업 디렉토리 | **O** | 축 2 (작업 범위) |
| `toolsUsed` | AI가 자율적으로 호출 | X | **배제** |
| `model` | 사용자가 선택할 수도 / 기본값일 수도 | 불확실 | 배제 |
| `tokenUsage.input` | 사용자 메시지 + 시스템 | 간접적 | 축 1 보조 |
| `tokenUsage.output` | AI 생성 토큰 | 간접적 | 축 1 보조 |

---

## 3. 축 정의

### 축 1: 대화 방식 — 설계자(A) vs 탐험가(E)

> MBTI의 J/P와 유사한 차원.
> "목표를 정해놓고 지시하는 사람" vs "대화하면서 방향을 찾아가는 사람"

#### 심리학적 근거

- **설계자(Architect)**: 통제 욕구(Need for Control), 계획 지향성. 결과를 미리 정의하고 AI에게 구체적으로 위임.
- **탐험가(Explorer)**: 개방성(Openness to Experience), 탐색 행동. AI와 대화하며 점진적으로 방향 조정.

#### 행동 지표

| 지표 | 설계자(A) | 탐험가(E) |
|---|---|---|
| 평균 메시지 길이 | 길다 (상세한 명세) | 짧다 (간결한 질문/지시) |
| 세션당 사용자 턴 수 | 적다 (한 번에 많이 담음) | 많다 (여러 번 주고받음) |
| 출력/입력 토큰 비율 | 높다 (사용자 입력 대비 AI 출력 多) | 낮다 (대화 비중 높음) |
| 첫 메시지 길이 비중 | 높다 (첫 메시지에 대부분 담음) | 낮다 (점진적으로 전개) |

#### 측정 수식

```
// Feature 추출
avgMsgLen    = mean(len(m.text) for m in messages where m.role == 'user')
turnsPerSession = mean(count(user messages) per session)
tokenRatio   = totalOutputTokens / totalInputTokens

// 정규화: 각 값을 전체 세션 풀 대비 percentile(0~1)로 변환
// 단일 사용자 모드에서는 시그모이드 정규화 사용 (아래 §5 참조)

// 복합 점수
styleScore = normalize(avgMsgLen) * 0.4
           + normalize(1 / turnsPerSession) * 0.3
           + normalize(tokenRatio) * 0.3

// 분류
styleScore >= 0.5 → A (설계자)
styleScore <  0.5 → E (탐험가)
```

#### 사용자가 인지할 수 있는 차이 (공감 포인트)

- A: "나는 프롬프트를 길게 써서 한 번에 맡기는 편이야"
- E: "나는 AI랑 대화하면서 점점 원하는 걸 찾아가는 편이야"

---

### 축 2: 작업 범위 — 한우물(D) vs 유목민(W)

> MBTI의 S/N와 유사한 차원.
> "하나에 깊이 파는 사람" vs "여러 곳을 넘나드는 사람"

#### 심리학적 근거

- **한우물(Deep)**: 과제 몰입(Task Persistence), 전문화 경향. 한 프로젝트의 완성도를 높이는 데 집중.
- **유목민(Wide)**: 자극 추구(Novelty Seeking), 멀티태스킹 선호. 여러 프로젝트를 병렬로 진행.

#### 행동 지표

| 지표 | 한우물(D) | 유목민(W) |
|---|---|---|
| 주당 고유 프로젝트 수 | 1-2개 | 4개+ |
| 프로젝트 전환 빈도 | 낮음 (연속 세션이 같은 cwd) | 높음 (세션마다 cwd 변경) |
| 최다 프로젝트 집중도 | 높음 (80%+ 한 곳) | 낮음 (분산됨) |

#### 프로젝트 정의

```
// cwd에서 프로젝트 루트를 추출
// 방법: 경로의 상위 3-depth까지를 프로젝트 ID로 사용
// 예: D:/Work/vibe/promptale/src/components → D:/Work/vibe/promptale
//     /home/user/projects/app-a/src/lib    → /home/user/projects/app-a

function extractProject(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/')
  return parts.slice(0, Math.min(parts.length, 4)).join('/')
}
```

#### 측정 수식

```
// Feature 추출
activeWeeks = (마지막 세션 - 첫 세션) / 7일, 최소 1
uniqueProjectsPerWeek = uniqueProjects.size / activeWeeks

switchCount = sessions에서 연속된 두 세션의 project가 다른 횟수
switchRate  = switchCount / (totalSessions - 1)

topProjectShare = 가장 많이 사용한 프로젝트의 세션 비중

// 복합 점수
scopeScore = normalize(uniqueProjectsPerWeek) * 0.4
           + normalize(switchRate) * 0.4
           + normalize(1 - topProjectShare) * 0.2

// 분류
scopeScore >= 0.5 → W (유목민)
scopeScore <  0.5 → D (한우물)
```

#### 사용자가 인지할 수 있는 차이

- D: "나는 한 프로젝트 끝날 때까지 다른 거 안 건드려"
- W: "나는 항상 여러 프로젝트를 동시에 굴리는 편이야"

---

### 축 3: 작업 리듬 — 마라토너(M) vs 스프린터(S)

> MBTI의 I/E와 유사한 차원.
> "길게 몰입하는 사람" vs "짧게 자주 하는 사람"

#### 심리학적 근거

- **마라토너(Marathon)**: 몰입(Flow) 경향, 과제 지속성. 한번 시작하면 긴 시간 집중.
- **스프린터(Sprint)**: 주의 전환(Task-switching) 선호. 짧고 빈번한 세션으로 효율적 처리.

#### 행동 지표

| 지표 | 마라토너(M) | 스프린터(S) |
|---|---|---|
| 세션 중앙값 길이 | 60분+ | 20분 이하 |
| 시간대 집중도 (엔트로피 역수) | 높음 (특정 시간에 몰림) | 낮음 (하루 전체 분산) |
| Deep 세션 비중 | 높음 (60분+ 세션이 대부분) | 낮음 (20분 미만 세션이 대부분) |

#### 세션 종류 분류

세션을 길이에 따라 3종류로 분류하여, 단순 횟수가 아닌 **세션 구성 비율**로 리듬을 판단한다.

| 세션 종류 | 기준 | 의미 | 예시 |
|---|---|---|---|
| **Quick** | 20분 미만 | 빠른 질문, 간단한 수정 | "이거 한 줄만 고쳐줘" |
| **Standard** | 20~60분 | 일반적인 작업 세션 | 기능 구현, 버그 수정 |
| **Deep** | 60분 이상 | 깊은 몰입, 대규모 작업 | 리팩토링, 새 기능 설계 |

이 분류의 장점:
- 하루 10번 쓰더라도 7번이 Deep이면 → **마라토너** (기존: 세션수 10회라 스프린터로 오분류)
- 하루 2번만 쓰더라도 둘 다 Quick이면 → **스프린터** (기존: 세션수 2회라 마라토너로 오분류)
- 세션 횟수가 아닌 **작업 스타일**을 직접 반영

#### 측정 수식

```
// Feature 추출
medianDuration = median(session durations in minutes)

// 시간대 엔트로피: 24시간 활동 분포의 Shannon entropy
// 최대값 = log2(24) ≈ 4.58 (완전 균등 = 분산)
// 최소값 = 0 (한 시간대에 100% 집중)
hourlyProbs = hourlyActivity.map(h => h / sum(hourlyActivity))
hourlyEntropy = -sum(p * log2(p) for p in hourlyProbs where p > 0)
concentration = 1 - (hourlyEntropy / log2(24))  // 0=분산, 1=집중

// 세션 종류 비율
quickCount = sessions where duration < 20min
deepCount  = sessions where duration >= 60min
sessionTypeScore = deepCount / (deepCount + quickCount)  // 0=Quick만, 1=Deep만
// quickCount와 deepCount가 모두 0이면 (Standard만) → 0.5 (중립)

// 복합 점수
rhythmScore = normalize(medianDuration) * 0.4
            + normalize(concentration) * 0.3
            + normalize(sessionTypeScore) * 0.3

// 분류
rhythmScore >= 0.5 → M (마라토너)
rhythmScore <  0.5 → S (스프린터)
```

#### 사용자가 인지할 수 있는 차이

- M: "나는 한번 앉으면 1-2시간은 기본이야"
- S: "나는 틈틈이 짧게 하는 게 맞아"

---

## 4. 8유형 조합표

```
        한우물(D)              유목민(W)
       ┌──────────┬──────────┬──────────┬──────────┐
       │   M(마라톤) │   S(스프린트) │   M(마라톤) │   S(스프린트) │
┌──────┼──────────┼──────────┼──────────┼──────────┤
│  A   │   ADM    │   ADS    │   AWM    │   AWS    │
│설계자 │ 장인대장장이│ 번개해결사 │ 만능빌더  │ 트렌드헌터 │
│      │    ⚒️     │    ⚡    │    🏗️    │    🏄    │
├──────┼──────────┼──────────┼──────────┼──────────┤
│  E   │   EDM    │   EDS    │   EWM    │   EWS    │
│탐험가 │ 심해잠수부 │ 코드감별사 │ 도서관사서 │카오스크리에이터│
│      │    🤿     │    🔎    │    📚    │    🌪️    │
└──────┴──────────┴──────────┴──────────┴──────────┘
```

### 유형별 상세

| 코드 | 유형 이름 | 서브타이틀 | 설명 | 강점 | 주의 |
|---|---|---|---|---|---|
| **ADM** | 장인 대장장이 ⚒️ | Master Smith | 한 프로젝트에 상세한 지시를 내리며 길게 몰두. 완성도의 끝을 본다. | 높은 완성도, 깊은 전문성 | 다른 방법을 놓칠 수 있어요 |
| **ADS** | 번개 해결사 ⚡ | Lightning Fixer | 정확한 지시로 빠르게 해결하고 사라진다. 효율의 화신. | 빠른 실행력, 문제 해결 | 기술 부채에 주의하세요 |
| **AWM** | 만능 빌더 🏗️ | All-round Builder | 여러 프로젝트를 오가며 큰 그림을 설계. 풀스택의 화신. | 풀스택 능력, 멀티태스킹 | 체력 관리가 필요해요 |
| **AWS** | 트렌드 헌터 🏄 | Trend Hunter | 빠르게 여러 프로젝트를 시도하며 새로운 가능성을 탐색. | 최신 기술 도입, PoC | 깊이가 부족할 수 있어요 |
| **EDM** | 심해 잠수부 🤿 | Deep Diver | AI와 깊은 대화로 한 주제를 끝까지 탐구. 진짜 원인을 찾아낸다. | 근본 원인 추적, 아키텍처 이해 | 시작이 느릴 수 있어요 |
| **EDS** | 코드 감별사 🔎 | Code Appraiser | 짧은 대화로 핵심을 짚어낸다. 리뷰의 달인. | 코드 리뷰, 빠른 판단력 | 직접 만드는 건 미룰 수 있어요 |
| **EWM** | 도서관 사서 📚 | Librarian | 여러 프로젝트를 넘나들며 AI와 대화로 전체를 파악. | 전체 파악, 문서화, 기술 조사 | 완벽주의에 빠질 수 있어요 |
| **EWS** | 카오스 크리에이터 🌪️ | Chaos Creator | 짧은 대화를 빠르게 여러 프로젝트에서 쏟아낸다. 해커톤의 왕. | 아이디어 폭발, 빠른 프로토타이핑 | 마무리를 놓치지 마세요 |

---

## 5. 정규화 전략

### 문제: 비교 대상이 없다

memradar는 **로컬 전용** 도구다. 서버가 없으므로 "전체 사용자 대비 백분위"를 구할 수 없다.

### 해결: 시그모이드 정규화 + 경험적 기준점

각 feature를 시그모이드 함수로 0~1 범위에 매핑한다. 중심점(midpoint)과 기울기(steepness)를 경험적으로 설정하여, **일반적인 사용 패턴의 중앙이 0.5에 오도록** 조정한다.

```typescript
function sigmoid(value: number, midpoint: number, steepness: number): number {
  return 1 / (1 + Math.exp(-steepness * (value - midpoint)))
}

// 축 1: 대화 방식
// 평균 메시지 길이: 중앙 100자, 기울기 0.02 (50자=0.27, 100자=0.5, 150자=0.73)
normalize_msgLen = sigmoid(avgMsgLen, 100, 0.02)

// 세션당 턴 수(역수): 중앙 8턴
normalize_turns = 1 - sigmoid(turnsPerSession, 8, 0.2)

// 토큰 비율: 중앙 5.0 (출력이 입력의 5배)
normalize_tokenRatio = sigmoid(tokenRatio, 5, 0.3)
```

```typescript
// 축 2: 작업 범위
// 주당 프로젝트 수: 중앙 2.5개
normalize_projects = sigmoid(uniqueProjectsPerWeek, 2.5, 0.8)

// 전환 빈도: 중앙 0.3 (30% 세션에서 프로젝트 변경)
normalize_switch = sigmoid(switchRate, 0.3, 5)

// 최다 프로젝트 집중도(역수): 중앙 0.6
normalize_concentration = 1 - sigmoid(topProjectShare, 0.6, 5)
```

```typescript
// 축 3: 작업 리듬
// 세션 중앙값: 중앙 45분 (일반적 코딩 세션 기준)
normalize_duration = sigmoid(medianDuration, 45, 0.06)

// 시간대 집중도: 중앙 0.5
normalize_timeConc = sigmoid(concentration, 0.5, 4)

// 세션 종류 비율: 중앙 0.5 (Deep과 Quick이 균등)
normalize_sessionType = sigmoid(sessionTypeScore, 0.5, 4)
```

### 기준점 튜닝 방법

1. 실제 로그 데이터 수집 후 각 feature의 분포를 히스토그램으로 확인
2. **중앙값(median)을 midpoint로** 설정
3. **IQR(사분위 범위)에서 steepness** 조정: `steepness ≈ 4 / IQR`
4. 결과 8유형의 분포를 확인하여 최대 유형이 30% 이하가 될 때까지 반복

---

## 6. 기존 시스템과의 관계

### personality (3축 8유형) — 변경 대상

- `computePersonality()` 함수의 내부 로직만 변경
- `TypeCode`, `TYPE_DEFS`, `PersonalityResult` 인터페이스는 그대로 유지
- 기존 코드 매핑: `R→E(탐험가)`, `E→A(설계자)`, `D/W/M/S`는 동일

### usageProfile (키워드 기반 9개 카테고리) — 독립 유지

| | personality | usageProfile |
|---|---|---|
| 질문 | "AI와 **어떻게** 일하는가?" | "AI를 **뭐에** 쓰는가?" |
| 입력 | 메시지 메타데이터 + 세션 시간 + cwd | 메시지 텍스트 키워드 |
| 출력 | 8유형 중 1개 | 상위 3개 카테고리 |
| 표시 위치 | PersonalitySlide, PersonalityView | UsageSlide |

두 시스템은 **병렬 독립**으로 유지한다. 단, usageProfile의 `feature` 카테고리 이름을 "만능 빌더" → "기능 빌더"로 변경하여 personality의 EWM 유형과의 혼동을 제거한다.

---

## 7. 변경 범위

### 수정 파일

| 파일 | 변경 내용 | 규모 |
|---|---|---|
| `src/lib/personality.ts` | `computePersonality()` 내부 로직 전면 교체 | ~60줄 |
| `src/lib/usageProfile.ts` | feature 카테고리 title "만능 빌더" → "기능 빌더" | 1줄 |

### 변경하지 않는 것

- `TypeCode` 타입 정의 (RDM, RDS, ... EWS)
- `TYPE_DEFS` 객체 (유형 이름, 설명, 이모지 등)
- `PersonalityResult` 인터페이스
- `PersonalityView.tsx`, `PersonalitySlide.tsx` 등 UI 컴포넌트
- `WrappedView.tsx`, `ShareSlide.tsx`

---

## 8. 검증 계획

### 분포 목표

- 최다 유형: **30% 이하**
- 최소 유형: **3% 이상**
- 상위 3개 유형 합계: **60% 이하**

### 검증 방법

1. 기준점(midpoint, steepness) 초기값으로 구현
2. 본인 로그 데이터로 1차 테스트
3. 기준점 조정 후 다양한 사용 패턴의 mock 데이터로 2차 테스트
4. 8유형 분포 히스토그램 출력하여 목표 달성 확인

---

## 부록: MBTI와의 대응

| MBTI | memradar | 측정 대상 |
|---|---|---|
| I/E (에너지 방향) | M/S (작업 리듬) | 세션 길이, 시간 분포, 빈도 |
| S/N (인식 기능) | D/W (작업 범위) | 프로젝트 집중도, 전환 빈도 |
| T/F (판단 기능) | — | 해당 없음 (감정 데이터 없음) |
| J/P (생활 양식) | A/E (대화 방식) | 메시지 길이, 턴 수, 위임도 |
