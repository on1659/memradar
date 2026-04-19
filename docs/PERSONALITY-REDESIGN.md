# Personality System Redesign

> memradar 코딩 성격 유형 시스템 재설계 기록
> 원안 작성일: 2026-04-18 · 최종 업데이트: v0.2.12 / 2026-04-19

---

## 상태: 출시 완료 (v0.2.12, 2026-04-18 commit ce9dfca)

이 문서에 기술된 재설계는 **이미 릴리스되었다**. 관련 커밋:

- `feb447b` — Redesign personality system: user-behavior-based 3-axis algorithm
- `ce9dfca` — 0.2.12 Personality system redesign
- `f650407` — Unify AI jobs chart, polish personality card UI
- `3fdeb1a` — Merge personality view into dashboard, add language profile and release workflow

구현 위치: `src/lib/personality.ts` (3축 8유형, 시그모이드 정규화).
표시 위치: `Dashboard.tsx` (`sectionMode='personality'` 경로로 병합됨. 별도 PersonalityView는 제거되어 있다.)

본 문서는 **설계 히스토리**로서 보존된다 — 문제 정의, 5가지 설계 원칙, 3축 정의, 시그모이드 공식, 8유형 매트릭스는 앞으로의 조정 작업에서도 참고된다.

---

## 1. 문제 정의 (재설계 이전 상태)

### 구 시스템의 결함

재설계 이전 `personality.ts`의 3축 8유형 시스템은 **거의 모든 사용자가 "만능 빌더(EWM)"로 수렴**하는 치명적 문제를 가지고 있었다.

**근본 원인: AI의 행동을 사용자의 성격으로 오귀인(misattribution)**

| 축 | 구 측정 방식 | 문제점 |
|---|---|---|
| Style (R/E) | AI가 사용한 도구 비율 (Read vs Execute) | `edit`, `write`, `bash`는 AI가 알아서 쓰는 도구. 사용자 의도와 무관 |
| Scope (D/W) | `uniqueTools/10 * 0.4 + uniqueProjects/5 * 0.3 + modelVariety/4 * 0.3` | Claude Code는 기본적으로 7-10개 도구를 매 세션 사용. 도구 다양성의 사용자 간 분산이 거의 없음 |
| Rhythm (M/S) | 평균 세션 시간 / 30분 | 대부분의 코딩 세션이 15분 이상이라 거의 모두 Marathon |

**결과**: Style → E, Scope → W, Rhythm → M으로 수렴 → EWM(만능 빌더)만 나옴

### 설계 원칙 (재설계에 적용됨)

1. **사용자가 직접 통제하는 행동**에서만 측정한다
2. AI 도구 호출 데이터(`toolsUsed`)는 성격 축 측정에서 **완전 배제**한다
3. 축 간 상관을 최소화한다 (독립 차원)
4. 절대 임계값 금지 → 시그모이드 기반 상대적 분류를 사용한다
5. 3축 8유형 뼈대는 유지한다 (UI, 콘텐츠 변경 최소화)

---

## 2. 사용 데이터

Session 객체에서 **사용자 행동**을 반영하는 데이터만 사용한다.

| 데이터 | 출처 | 사용자 행동 여부 | 현재 사용처 |
|---|---|---|---|
| `messages[].text` (role=user) | 사용자가 직접 입력 | **O** | 축 1 (대화 방식) |
| `messages[].text` (role=assistant) | AI 생성 | X | 사용 안 함 |
| `startTime`, `endTime` | 세션 타이밍 | **O** | 축 3 (작업 리듬) |
| `cwd` | 사용자가 선택한 작업 디렉토리 | **O** | 축 2 (작업 범위) |
| `toolsUsed` | AI가 자율적으로 호출 | X | **배제** |
| `model` | 사용자가 선택/기본값 혼재 | 불확실 | 배제 |
| `tokenUsage.input` | 사용자 메시지 + 시스템 | 간접적 | 축 1 보조 |
| `tokenUsage.output` | AI 생성 토큰 | 간접적 | 축 1 보조 |

---

## 3. 축 정의 — 출시 버전

코드상의 실제 축 레이블은 다음과 같다(src/lib/personality.ts):

```ts
style:  { label: ['탐험가', '설계자'],   value: 0..1 }   // <0.5 → R(탐험가), ≥0.5 → E(설계자)
scope:  { label: ['한우물', '유목민'],   value: 0..1 }   // <0.5 → D(한우물), ≥0.5 → W(유목민)
rhythm: { label: ['스프린터', '마라토너'], value: 0..1 } // <0.5 → S(스프린터), ≥0.5 → M(마라토너)
```

> TypeCode 접두문자 매핑 주의: **설계자(Architect)는 `E`**, **탐험가(Explorer)는 `R`**로 저장된다. 이는 구 시스템과의 하위 호환(TypeCode 문자열 그대로 유지)을 위해 선택된 것으로, 문서상의 "A/E 축" 언급은 코드의 "E/R 접두사"와 대응한다.

### 축 1: 대화 방식 — 설계자(E) vs 탐험가(R)

> MBTI의 J/P와 유사한 차원.
> "목표를 정해놓고 지시하는 사람" vs "대화하면서 방향을 찾아가는 사람"

#### 심리학적 근거

- **설계자(Architect, code=E)**: 통제 욕구(Need for Control), 계획 지향성. 결과를 미리 정의하고 AI에게 구체적으로 위임.
- **탐험가(Explorer, code=R)**: 개방성(Openness to Experience), 탐색 행동. AI와 대화하며 점진적으로 방향 조정.

#### 행동 지표

| 지표 | 설계자(E) | 탐험가(R) |
|---|---|---|
| 평균 메시지 길이 | 길다 (상세한 명세) | 짧다 (간결한 질문/지시) |
| 세션당 사용자 턴 수 | 적다 (한 번에 많이 담음) | 많다 (여러 번 주고받음) |
| 출력/입력 토큰 비율 | 높다 (사용자 입력 대비 AI 출력 多) | 낮다 (대화 비중 높음) |

#### 구현 수식 (현행 코드)

```ts
avgMsgLen       = mean(m.text.length for m in userMessages)           // fallback 100
turnsPerSession = mean(session.messageCount.user per session)         // fallback 8
tokenRatio      = totalTokens.output / totalTokens.input               // fallback 5

styleValue =
    sigmoid(avgMsgLen,       100, 0.02) * 0.4 +   // 긴 메시지 → Architect
    (1 - sigmoid(turnsPerSession, 8, 0.2)) * 0.3 + // 턴 적음 → Architect
    sigmoid(tokenRatio,      5,   0.3) * 0.3       // AI 출력 비중 높음 → Architect

→ styleValue ≥ 0.5 이면 `E`(설계자), 아니면 `R`(탐험가)
```

#### 사용자 공감 포인트

- 설계자(E): "나는 프롬프트를 길게 써서 한 번에 맡기는 편이야"
- 탐험가(R): "나는 AI랑 대화하면서 점점 원하는 걸 찾아가는 편이야"

---

### 축 2: 작업 범위 — 한우물(D) vs 유목민(W)

> MBTI의 S/N와 유사한 차원.
> "하나에 깊이 파는 사람" vs "여러 곳을 넘나드는 사람"

#### 심리학적 근거

- **한우물(Deep)**: 과제 몰입(Task Persistence), 전문화 경향. 한 프로젝트의 완성도에 집중.
- **유목민(Wide)**: 자극 추구(Novelty Seeking), 멀티태스킹 선호. 여러 프로젝트를 병렬로 진행.

#### 프로젝트 정의 — 현행 구현

```ts
function extractProject(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  // Windows: C:/Users/alice/source/repos/foo 는 depth≈6 필요
  // Unix:    /home/alice/projects/foo       는 depth≈4 필요
  return parts.slice(0, Math.min(parts.length, 6)).join('/')
}
```

> 초기 설계안에서는 depth 3~4를 제안했으나, Windows 경로(`C:/Users/<user>/source/repos/<repo>`)에서 형제 저장소가 하나로 축약되는 문제가 발견되어 **최종적으로 depth 6**을 채택했다.

#### 구현 수식 (현행 코드)

```ts
activeWeeks       = max((lastSession - firstSession) / (7일), 1)
projectsPerWeek   = uniqueProjects.size / activeWeeks
switchRate        = (연속 세션에서 project가 다른 횟수) / (projectIds.length - 1)
topProjectShare   = max(count per project) / projectIds.length

scopeValue =
    sigmoid(projectsPerWeek, 2.5, 0.8) * 0.4 +    // 주당 프로젝트 많음 → Wide
    sigmoid(switchRate,      0.3, 5)   * 0.4 +    // 자주 전환 → Wide
    (1 - sigmoid(topProjectShare, 0.6, 5)) * 0.2   // 집중도 낮음 → Wide

→ scopeValue ≥ 0.5 이면 `W`(유목민), 아니면 `D`(한우물)
```

#### 사용자 공감 포인트

- 한우물(D): "나는 한 프로젝트 끝날 때까지 다른 거 안 건드려"
- 유목민(W): "나는 항상 여러 프로젝트를 동시에 굴리는 편이야"

---

### 축 3: 작업 리듬 — 마라토너(M) vs 스프린터(S)

> MBTI의 I/E와 유사한 차원.
> "길게 몰입하는 사람" vs "짧게 자주 하는 사람"

#### 심리학적 근거

- **마라토너(Marathon)**: 몰입(Flow) 경향, 과제 지속성.
- **스프린터(Sprint)**: 주의 전환(Task-switching) 선호, 짧고 빈번한 세션.

#### 세션 종류 분류

세션을 길이에 따라 3종류로 분류하고, 단순 횟수가 아닌 **세션 구성 비율**로 리듬을 판단한다.

| 세션 종류 | 기준 | 의미 | 예시 |
|---|---|---|---|
| **Quick** | 20분 미만 | 빠른 질문, 간단한 수정 | "이거 한 줄만 고쳐줘" |
| **Standard** | 20~60분 | 일반적인 작업 세션 | 기능 구현, 버그 수정 |
| **Deep** | 60분 이상 | 깊은 몰입, 대규모 작업 | 리팩토링, 새 기능 설계 |

#### 구현 수식 (현행 코드)

```ts
durations       = sessions.map(d in minutes).filter(0 < d < 1440)
medianDuration  = median(durations)

// Shannon entropy of stats.hourlyActivity (24시간 분포)
hourlyEntropy   = -Σ p_h * log2(p_h)     // p_h = hour_h / totalActivity
concentration   = 1 - (hourlyEntropy / log2(24))   // 0=분산, 1=집중

quickCount       = durations.filter(d < 20).length
deepCount        = durations.filter(d >= 60).length
sessionTypeScore = deepCount / (quickCount + deepCount)  // 둘 다 0이면 0.5

rhythmValue =
    sigmoid(medianDuration,   45,  0.06) * 0.4 +  // 긴 중앙값 → Marathon
    sigmoid(concentration,    0.5, 4)    * 0.3 +  // 시간대 집중 → Marathon
    sigmoid(sessionTypeScore, 0.5, 4)    * 0.3    // Deep 비중 → Marathon

→ rhythmValue ≥ 0.5 이면 `M`(마라토너), 아니면 `S`(스프린터)
```

#### 사용자 공감 포인트

- 마라토너(M): "나는 한번 앉으면 1-2시간은 기본이야"
- 스프린터(S): "나는 틈틈이 짧게 하는 게 맞아"

---

## 4. 8유형 조합표 (현행)

코드 접두사 매핑: **R = 탐험가(Explorer)**, **E = 설계자(Architect)**.

```
        한우물(D)              유목민(W)
       ┌──────────┬──────────┬──────────┬──────────┐
       │  M(마라톤) │ S(스프린트) │  M(마라톤) │ S(스프린트) │
┌──────┼──────────┼──────────┼──────────┼──────────┤
│  E   │   EDM    │   EDS    │   EWM    │   EWS    │
│설계자 │장인대장장이│ 번개해결사 │ 만능빌더  │카오스크리에이터│
│      │    ⚒️     │    ⚡    │    🏗️    │    🌪️    │
├──────┼──────────┼──────────┼──────────┼──────────┤
│  R   │   RDM    │   RDS    │   RWM    │   RWS    │
│탐험가 │심해잠수부 │ 코드감별사 │ 도서관사서 │ 트렌드헌터 │
│      │    🤿     │    🔎    │    📚    │    🏄    │
└──────┴──────────┴──────────┴──────────┴──────────┘
```

### 유형별 상세 (TYPE_DEFS)

| 코드 | 유형 이름 | 서브타이틀 | 설명 | 강점 | 주의 |
|---|---|---|---|---|---|
| **EDM** | 장인 대장장이 ⚒️ | Master Smith | 한 프로젝트에 몰두해서 완성도 높은 결과물을 만드는 타입. | 높은 완성도, 깊은 전문성 | 다른 방법을 놓칠 수 있어요 |
| **EDS** | 번개 해결사 ⚡ | Lightning Fixer | 문제가 보이면 바로 뚝딱 해치우는 타입. | 빠른 실행력, 문제 해결 | 기술 부채에 주의하세요 |
| **EWM** | 만능 빌더 🏗️ | All-round Builder | 이것도 만들고 저것도 만드는 끝없는 에너지. | 풀스택 능력, 멀티태스킹 | 체력 관리가 필요해요 |
| **EWS** | 카오스 크리에이터 🌪️ | Chaos Creator | 동시다발 실험! 정신없지만 결국 뭔가 나오는 타입. | 아이디어 폭발, 빠른 프로토타이핑 | 마무리를 놓치지 마세요 |
| **RDM** | 심해 잠수부 🤿 | Deep Diver | 코드의 깊은 곳까지 잠수해서 진짜 원인을 찾아낸다. | 근본 원인 추적, 아키텍처 이해 | 시작이 느릴 수 있어요 |
| **RDS** | 코드 감별사 🔎 | Code Appraiser | 빠르게 코드를 읽고 핵심을 짚어내는 타입. | 코드 리뷰, 빠른 판단력 | 직접 만드는 건 미룰 수 있어요 |
| **RWM** | 도서관 사서 📚 | Librarian | 넓은 범위를 꼼꼼히 살피며 전체 그림을 그리는 타입. | 전체 파악, 문서화, 기술 조사 | 완벽주의에 빠질 수 있어요 |
| **RWS** | 트렌드 헌터 🏄 | Trend Hunter | 새로운 기술을 빠르게 훑어보고 적용하는 타입. | 최신 기술 도입, PoC | 깊이가 부족할 수 있어요 |

> 폴백: 세션 0개 또는 `totalMessages < 3` 인 경우 `EWS`로 반환된다(기본 axes value=0.5).

---

## 5. 정규화 전략 — 시그모이드

### 배경: 비교 대상이 없다

memradar는 **로컬 전용** 도구다. 서버가 없으므로 "전체 사용자 대비 백분위"를 구할 수 없다.

### 채택: 시그모이드 정규화 + 경험적 기준점

각 feature를 시그모이드 함수로 0~1 범위에 매핑한다. 중심점(midpoint)과 기울기(steepness)를 경험적으로 설정하여, **일반적인 사용 패턴의 중앙이 0.5에 오도록** 했다.

```ts
function sigmoid(x: number, midpoint: number, steepness: number): number {
  if (!Number.isFinite(x)) return 0.5
  return 1 / (1 + Math.exp(-steepness * (x - midpoint)))
}
```

현행 기준점 요약:

| 축 | feature | midpoint | steepness | 가중치 |
|---|---|---|---|---|
| 1 (style)  | avgMsgLen             | 100  | 0.02 | 0.4 |
| 1 (style)  | turnsPerSession (역수) | 8    | 0.2  | 0.3 |
| 1 (style)  | tokenRatio            | 5    | 0.3  | 0.3 |
| 2 (scope)  | projectsPerWeek       | 2.5  | 0.8  | 0.4 |
| 2 (scope)  | switchRate            | 0.3  | 5    | 0.4 |
| 2 (scope)  | topProjectShare (역수) | 0.6  | 5    | 0.2 |
| 3 (rhythm) | medianDuration (분)    | 45   | 0.06 | 0.4 |
| 3 (rhythm) | concentration         | 0.5  | 4    | 0.3 |
| 3 (rhythm) | sessionTypeScore      | 0.5  | 4    | 0.3 |

### 기준점 튜닝 (추후 조정 시 절차)

1. 실제 로그 데이터 수집 후 각 feature의 분포를 히스토그램으로 확인
2. **중앙값(median)을 midpoint로** 설정
3. **IQR(사분위 범위)에서 steepness** 조정: `steepness ≈ 4 / IQR`
4. 8유형 분포를 확인하여 최대 유형 점유율이 30% 이하가 될 때까지 반복

---

## 6. 다른 시스템과의 관계

### personality (3축 8유형) — 재설계 완료

- `computePersonality()` 내부 로직만 교체되었고 외부 인터페이스는 그대로.
- `TypeCode`, `TYPE_DEFS`, `PersonalityResult` 인터페이스는 유지.
- 문자 매핑 호환: 구 `R→탐험가(Explorer)`, `E→설계자(Architect)`, `D/W/M/S`는 동일.
- 뷰 통합: PersonalityView는 **Dashboard.tsx의 `sectionMode='personality'`**로 병합되었으며 독립 뷰 파일은 없다. 3fdeb1a 참조.

### usageProfile (키워드 기반 9개 카테고리) — 독립 유지

| | personality | usageProfile |
|---|---|---|
| 질문 | "AI와 **어떻게** 일하는가?" | "AI를 **뭐에** 쓰는가?" |
| 입력 | 메시지 메타데이터 + 세션 시간 + cwd | 메시지 텍스트 키워드 |
| 출력 | 8유형 중 1개 | 상위 3개 카테고리 |
| 표시 위치 | Dashboard(personality 섹션) | Dashboard(usage 섹션) |

두 시스템은 **병렬 독립**으로 유지된다. `feature` 카테고리 이름은 "만능 빌더"와의 혼동을 피하기 위해 "기능 빌더"로 변경되어 있다.

### languageProfile — 신규 추가

3fdeb1a에서 대시보드에 언어 프로필 섹션이 추가되었다. personality/usage와 병렬로 배치된다.

---

## 7. 실제 변경 범위 (커밋 기준)

| 파일 | 변경 내용 |
|---|---|
| `src/lib/personality.ts` | `computePersonality()` 내부를 3축 행동 기반 측정으로 전면 교체, `sigmoid()` / `extractProject()` 추가 |
| `src/lib/usageProfile.ts` | feature 카테고리 title "만능 빌더" → "기능 빌더" |
| `src/components/Dashboard.tsx` | `sectionMode`로 personality 섹션을 통합 표시 |
| (추가) 언어 프로필 / 사용 프로필 | personality와 나란히 대시보드에 노출 |

### 유지된 것

- `TypeCode` 문자열 집합 (RDM, RDS, RWM, RWS, EDM, EDS, EWM, EWS)
- `TYPE_DEFS` (유형 이름, 설명, 이모지 등)
- `PersonalityResult` 인터페이스
- `WrappedView.tsx`, `ShareSlide.tsx`

---

## 8. 후속 검증 체크리스트

분포 목표 (초기 릴리스 시점 기준):

- 최다 유형: **30% 이하**
- 최소 유형: **3% 이상**
- 상위 3개 유형 합계: **60% 이하**

후속 데이터가 쌓이면 §5의 튜닝 절차를 따라 midpoint/steepness를 재조정한다.

---

## 부록: MBTI와의 대응

| MBTI | memradar | 측정 대상 |
|---|---|---|
| I/E (에너지 방향) | M/S (작업 리듬) | 세션 길이, 시간 분포, 빈도 |
| S/N (인식 기능) | D/W (작업 범위) | 프로젝트 집중도, 전환 빈도 |
| T/F (판단 기능) | — | 해당 없음 (감정 데이터 없음) |
| J/P (생활 양식) | 설계자(E)/탐험가(R) (대화 방식) | 메시지 길이, 턴 수, 위임도 |

---

*문서 스탬프: v0.2.12 / 2026-04-19*
