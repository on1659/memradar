> **아카이브: 2026-04-18 리뷰 요청. 2026-04-19 현재 재디자인은 v0.2.12에 출시 완료. 최신 스펙은 `docs/PERSONALITY-REDESIGN.md`, 구현은 `src/lib/personality.ts`.**

# Claude Review Request: Personality Redesign

> 목적: `memradar`의 코딩 성향 3축 8유형 리디자인안이 기획적으로 타당한지, 실제 코드/데이터 구조에서 구현 가능한지 검토받기 위한 문서.

## 검토 대상 문서

- `docs/PERSONALITY-REDESIGN.md`
- `docs/personality-redesign.html`

## 함께 봐야 할 현재 구현 파일

- `src/lib/personality.ts`
- `src/lib/usageProfile.ts`
- `src/parser.ts`
- `src/providers/codex.ts`
- `src/components/PersonalityView.tsx`
- `src/components/wrapped/slides/PersonalitySlide.tsx`

## 배경

현재 `personality.ts`의 3축 8유형 시스템은 다음 신호에 크게 의존합니다.

- `toolsUsed` 기반 read vs execute 비율
- `toolsUsed + cwd + modelsUsed` 기반 scope 다양성
- 평균 세션 길이 기반 rhythm

그런데 이 구조는 실제 사용자 성향보다 AI 에이전트의 자동 행동을 더 많이 반영하는 것 같아서, 거의 모든 사용자가 특정 유형으로 몰리는 문제가 있습니다.

새 기획안은 다음 방향을 제안합니다.

- `toolsUsed`를 성격 축 측정에서 배제
- 사용자 메시지 길이, 사용자 턴 수, 세션 길이, `cwd` 기반 프로젝트 이동, 세션 분포 등을 중심으로 재설계
- 3축 8유형 구조 자체는 유지
- 기존 UI는 가능하면 크게 안 바꾸고 내부 계산 로직만 교체

## 현재 코드/데이터 현실

실제 코드 기준으로 이미 있는 데이터:

- 사용자/어시스턴트 메시지 텍스트
- 세션 시작/종료 시각
- 세션 단위 `cwd`
- Claude 로그의 message-level token usage
- Codex 로그의 session-level total token usage

실제 코드 기준으로 애매하거나 주의가 필요한 부분:

- `cwd`는 세션 단위 하나만 잡히므로 "프로젝트 전환" 정의를 너무 세밀하게 잡으면 오차가 날 수 있음
- Codex는 Claude보다 token granularity가 거칠어서 `tokenRatio` 신뢰도가 떨어질 수 있음
- 현재 UI/타입 정의는 `RDM/RDS/.../EWS` 체계를 직접 사용 중
- `TYPE_DEFS`와 축 설명이 `personality.ts` 외에도 `PersonalityView.tsx` 쪽에 일부 중복돼 있음

## 특히 검토받고 싶은 질문

### 1. 기획 자체

- 이 문제 정의가 맞는지:
  - "현재 분류가 사용자의 성향보다 AI 도구 자동 사용 패턴에 과도하게 끌려간다"
- 성향을 3축 8유형으로 유지하는 게 괜찮은지
- 이걸 "성격"으로 부르는 게 맞는지, 아니면 "사용 성향 / 작업 성향"으로 낮추는 게 맞는지

### 2. 축 설계

- 축 1 `설계자(A) vs 탐험가(E)`:
  - 사용자 메시지 길이
  - 세션당 사용자 턴 수
  - output/input token ratio
  - 첫 메시지 길이 비중
  - 이 조합이 현실적으로 해당 성향을 설명하는지

- 축 2 `한우물(D) vs 유목민(W)`:
  - `cwd` 기반 프로젝트 수
  - 연속 세션 간 프로젝트 전환 빈도
  - top project share
  - 세션 단위 `cwd`만으로 이 축을 안정적으로 뽑아낼 수 있는지

- 축 3 `마라토너(M) vs 스프린터(S)`:
  - 세션 길이 중앙값
  - 시간대 집중도(entropy inverse)
  - quick/deep session 비율
  - 이 축이 실제 "작업 리듬"을 잘 설명하는지
  - 특히 시간대 집중도가 생활 패턴을 재는 값으로 새지 않는지

### 3. 구현 가능성

- 현재 코드 구조에서 이 문서대로 구현하면 되는지
- 아니면 실제로는 더 바뀌어야 하는 파일이 무엇인지
- 문서에는 `personality.ts`만 주로 바꾸는 것처럼 적혀 있는데, 실제로는:
  - `TypeCode`
  - `TYPE_DEFS`
  - `PersonalityView.tsx`
  - `PersonalitySlide.tsx`
  - 중복된 타입 설명
  - 테스트 fixture
  - 같은 것들이 같이 바뀌어야 하는지

### 4. 문서 내부 불일치

현재 리디자인 문서는 새 축을 `A/E` 코드로 설명하면서도 동시에:

- `TypeCode`, `TYPE_DEFS`는 그대로 유지
- 기존 UI 변경 최소화

를 전제로 두고 있습니다.

이 부분이 가장 헷갈립니다.

검토 요청:

- 내부 코드는 기존 `R/E`를 유지하고 표시 텍스트만 바꾸는 게 맞는지
- 아니면 아예 `TypeCode` 체계를 `ADM/ADS/...`로 바꾸는 게 맞는지
- 둘 중 어떤 방식이 더 현실적인지

### 5. 검증 방식

- 로컬 전용 도구라 전체 사용자 percentile이 없는데, 시그모이드 정규화 방식이 현실적인지
- midpoint / steepness를 실제로 어떻게 잡는 게 좋은지
- "최다 유형 30% 이하" 같은 목표가 실제 제품 기준으로 타당한지
- 최소 데이터가 적을 때는 "판별 유보" 상태를 두는 게 맞는지

## 현재 기준에서 보이는 주요 리스크

- `tokenRatio`를 사용자 통제 신호로 보기엔 provider 간 편차가 있음
- `cwd`를 프로젝트 ID로 바로 쓰면 repo 구조에 따라 왜곡될 수 있음
- `hourlyEntropy`는 작업 리듬보다 생활 루틴을 더 반영할 수 있음
- 8유형은 설명력이 좋지만, 실제 데이터가 부족할 때 과도한 단정처럼 보일 수 있음
- 문서상 "UI 변경 최소화"와 "코드 체계 A/E 전환"이 동시에 성립하지 않을 수 있음

## 원하는 답변 형식

가능하면 아래 순서로 답변해주면 좋겠습니다.

1. 이 기획이 큰 방향에서 맞는지 / 아닌지
2. 3축 각각이 현실적으로 유효한지
3. 8유형 유지가 괜찮은지
4. 현재 코드 구조에서 구현 시 실제 변경 범위
5. 문서에서 반드시 수정해야 할 부분
6. 추천하는 최소 구현안과 검증안

## 참고 메모

현재 내 우선 관심사는 "예쁘게 보이는 이론"이 아니라 아래 두 가지입니다.

- 정말 이 데이터로 저런 분류가 그럴듯하게 나오느냐
- 지금 repo 구조에서 문서가 말하는 수준으로 구현이 실제 가능한가

즉, 심리학적 포장보다도 제품/데이터/코드 관점에서 냉정하게 봐주면 좋겠습니다.

---

## 아카이브 정정 메모 (2026-04-19)

- 본문의 `src/components/PersonalityView.tsx` 참조는 현재 코드에 존재하지 않습니다. v0.2.12에서 Dashboard에 sectionMode로 통합되어 `src/components/Dashboard.tsx` 내부로 흡수되었습니다.
- 본문 중간 표현은 리뷰 당시 상태 보존을 위해 수정하지 않았습니다. 최신 스펙은 `docs/PERSONALITY-REDESIGN.md`, 구현은 `src/lib/personality.ts`를 참조하세요.
