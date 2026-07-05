# 성향 평가 lessons

memradar의 성향/직업 분류기 출력 평가에 관한 함정·실수 메모. 외부 정답(ground truth)이 약하거나 없는 분류 도메인에서 무엇을 어떻게 측정해야 하는지에 대한 결정 자국.

추가 형식:

```
## L-{번호}: {1줄 요약}
- **언제 만났나**: {날짜 + 컨텍스트}
- **함정**: X 누락 시 Y 발생
- **회피**: 다음에 어떻게 할지
- **연관 파일/함수**: 경로
```

---

## L-1: 분류기 정확도 측정 전에 출력의 반증가능성(falsifiability)부터 검증할 것

- **언제 만났나**: 2026-05-23, `/office-hours` 세션 — v3 평가 정확도 37.8% (5e19095) 측정 후 카피·구조를 "단정 판정 → 분포 표시" 로 재포지셔닝(ba88105) 했음에도, 본인이 본인 데이터로 돌려 Personality 슬라이드를 읽으면 "괜찮은데 널널해 — 맞는 말 같은데 아무나도 해당될 수준" 이라는 자기 인식 응답이 나옴 (바넘 효과, Barnum effect)
- **함정**: 출력이 충분히 일반적이면(추상적 성향 형용사, "당신은 호기심이 많다" 같은 보편 진술) 분류기가 맞춰도 사용자가 "맞다"고 느끼고, 틀려도 "맞다"고 느낀다. 두 경우를 구별할 수 없으니 어떤 평가 척도(정확도·F1·confusion matrix)도 사용자 경험에 도달하지 못한다. 정확도만 추구하면 100% 가 돼도 바넘 출력은 그대로 — 작업 시간이 사용자 체감으로 이어지지 않는다. 분포 표시로 바꿔도 (상위 N개 차원이 모두 일반적 형용사라면) 같은 문제가 한 층 깊은 곳에 남는다.
- **회피**: 분류기 정확도를 측정·개선하기 전에 출력 자체가 **반증가능(falsifiable)** 한 형식인지 먼저 검증한다. 빠른 진단: 같은 차원의 "반대 진술" 을 만들어 본인이 어느 쪽이 자기인지 5~10세트 변별해 본다. 변별률이 우연(50%) 근방이면 그 차원은 바넘 범위 → 출력 표현 자체(추상 → 구체·정량·증거 인용)부터 손봐야 한다. 정확도·sharpness·반증가능성을 별도 척도로 분리해서 트래킹.
- **연관 파일/함수**: `docs/eval-results.json`, `docs/eval-report.html`, `scripts/test-eval-and-report.mts`, Personality 슬라이드 컴포넌트

## L-2: 외부 정답이 없는 도메인에서는 "정확도" 대신 "변별력(sharpness)"을 측정할 것

- **언제 만났나**: 2026-05-23, `/office-hours` 세션 — Big5/MBTI 같은 외부 프레임워크와 매핑하기에는 memradar 입력(프롬프트 텍스트)이 행동 응답 검사와 도메인이 달라 부정확. CLAUDE.md "세션 데이터 외부 전송 금지" 제약상 대규모 사용자 풀로 검증하기도 어려움. 그럼에도 v3 평가는 "정확도 37.8%" 라는 정량 지표를 산출 — 이 숫자가 어떤 결정의 근거가 되어야 하는지 불명확.
- **함정**: 외부 정답(ground truth)이 없는 분류 도메인에서 "정확도" 를 측정하려고 하면 (a) 임의의 자가-라벨링에 의존하거나 (b) Big5 같은 무관 프레임워크와 강제 매핑하거나 (c) 사용자 설문에 의존하는데, 셋 다 도메인 미스매치 또는 데이터 정책 위반을 유발한다. 그런데도 "정확도 N%" 라는 단일 숫자가 정량 지표처럼 보여 결정 근거로 잘못 사용되기 쉽다 — 숫자가 올라가도 사용자 체감은 그대로일 수 있고, 숫자가 내려가도 출력 품질이 좋아진 경우가 있다.
- **회피**: 외부 정답이 없는 분류 도메인의 평가 척도는 "변별력(sharpness)" 로 잡는다. (1) 각 차원에 대해 진술 vs 역진술(반대 진술)을 생성, (2) 본인 또는 동의받은 소수 표본이 자기인지 어느 쪽인지 변별, (3) 변별 성공률 = sharpness. 50%가 우연, 100%가 완벽 변별. 표본 크기는 외부 전송 금지 제약상 본인 + 동의받은 친구 2~3명으로 시작해도 차원별 신호는 잡힌다 — 표본 부족보다 출력 모호성이 더 큰 노이즈원이기 때문. 정확도는 보조 척도로만 유지, 의사결정의 일차 근거는 sharpness.
- **연관 파일/함수**: 신규 `scripts/eval-sharpness.mts`(예정), 신규 `docs/sharpness-report-{date}.json`(예정), `scripts/test-eval-and-report.mts`(병행 보조), `docs/AI-ROLE-EVAL-SAMPLES-SPEC.md`(평가 스펙 영향 검토)

## L-3: 보정·재정규화는 top-N 절단(slice) **이전 전체 universe**에 적용할 것

- **언제 만났나**: 2026-06-03, 페르소나 진단 탭 검증 — Reviewer가 CRITICAL-1 발견. `analyzeUsageTopCategories(sessions, N)`이 auto 점수 기준 상위 N개로 먼저 자른 뒤 그 부분집합에 `applyCalibration`을 걸어, 검사 응답으로 끌어올려진(자동 분류 하위/0점) 카테고리가 순위에 진입할 수 없었다.
- **함정**: top-N으로 잘린 목록에 보정/재가중/재정규화를 적용하면, 절단 단계에서 사라진 항목은 보정으로도 복구 불가능하다. `analyzeXxxTop(sessions, N)`류 헬퍼는 이미 정렬+절단된 결과를 돌려주므로, 그 위에 분포 변환을 얹으면 "순위 역전"이 구조적으로 불가능해진다 — 보정의 핵심 목적(분포 재배열)이 조용히 무력화되고, 결과 화면(전체 9개 계산)과 Dashboard/Wrapped(절단 후 보정) 표시가 갈린다.
- **회피**: 분포 변환(calibration/reweight)은 **N=전체 universe로 호출 → 변환 → slice** 순서를 강제한다. 절단된 입력만 주어진다면 universe로 0-패딩한 뒤 변환하고, 호출부가 마지막에 `.slice(0, N)`. memradar에서는 `applyCalibrationOverUniverse(auto, finalDistribution, USAGE_CATEGORIES)` 래퍼로 중앙화.
- **연관 파일/함수**: `src/lib/personaQuiz.ts` `applyCalibrationOverUniverse`, `src/lib/usageProfile.ts` `analyzeUsageTopCategories`/`buildRankedScores`(score>0 필터+절단), 소비처 `Dashboard.tsx`/`UsageSlide.tsx`/`WrappedView.tsx`

## L-4: universe 패딩을 거치는 보정 래퍼는 "신호 부재(undecided)"를 별도 분기로 처리할 것

- **언제 만났나**: 2026-06-03, 페르소나 진단 탭 검증 — QA가 WARNING 발견. 세션 데이터가 빈약한(undecided) 사용자가 검사를 완주하면 `analyzeUsageTopCategories`가 `[]`를 반환 → universe 0-패딩 → `applyCalibration`의 `originalTotal<=0` early-return으로 전 카테고리 score 0이 되어, "탐색 중" fallback 대신 0% "유령 분포"가 렌더됐다.
- **함정**: `normalizeTopShare`의 Σ=0 가드와 `applyCalibration`의 originalTotal<=0 early-return이 합쳐지면, 입력이 비었을 때 `length>0`이지만 합계 0인 분포가 나온다. 이는 소비처의 `length>0` fallback 분기를 우회해, 검사 *전*(깔끔한 fallback)보다 검사 *후* 화면이 더 나빠 보이는 회귀를 만든다. git diff만으로는 드러나지 않는 비자명한 상호작용.
- **회피**: universe 패딩을 거치는 보정 래퍼는 auto 신호 부재(`autoTotal<=0`)를 명시적 분기로 처리한다. 결정에 따라 (a) 검사 응답 분포(finalDistribution)를 표시 점수로 승격하거나(자기응답만으로 페르소나 구성), (b) fallback 유지. memradar는 (a) 채택 — auto가 없으면 finalDistribution share를 score로 승격, share 0 제외 후 정렬.
- **연관 파일/함수**: `src/lib/personaQuiz.ts` `applyCalibrationOverUniverse`(autoTotal<=0 분기), `normalizeTopShare`, `applyCalibration`(originalTotal<=0 early-return)

## L-5: 진술을 "쉬운 표현"으로 재작성한 뒤에는 sharpness를 재측정해 변별력 회귀를 게이트할 것

- **언제 만났나**: 2026-06-04, 페르소나 진단 질문지 쉬운 표현 재작성 + 직업 선택 작업. 9카테고리×5진술을 전문어("SQL·jq·grep", "리팩터링", "스택 트레이스")에서 일반어("숫자·데이터를 뽑아 정리", "더 깔끔하게 다듬고 싶어진다")로 풀었다. 직군 렌즈(개발자/기획·PM/디자이너/데이터/일반)까지 5개판으로 확장.
- **함정**: "쉽게"가 "막연하게"로 미끄러지면 L-1(바넘)이 재발한다. 전문어는 구체적이라 변별이 쉬운데, 일반어로 풀면 "구체·관찰가능 행동"이 흐려져 누구나 yes하는 진술이 되기 쉽다. 텍스트만 바꾸고 변별력을 재측정하지 않으면, 통과한 동기화/타입 테스트는 그린인데 정작 진단 의미(L-2 sharpness)는 조용히 떨어진다 — git diff·CI로는 안 드러난다.
- **회피**: 진술 재작성 후 `npx tsx scripts/eval-sharpness.mts`(기본 `--lens general`)로 본인+소수 표본 변별률을 재측정해 전문어판 대비 sharpness가 떨어지지 않았는지 게이트한다. 직군 렌즈는 `--lens <key>`로 각각 측정. 재작성 PR의 Done 조건에 "sharpness 재측정 ≥ 기존" 을 명시. 각 진술은 반드시 (a) 대비되는 반대 행동이 떠오르고 (b) 추상 형용사("성실한"/"꼼꼼한")가 아닌 관찰가능 동작이어야 한다.
- **연관 파일/함수**: `scripts/eval-sharpness.mts`(`--lens`), `scripts/eval-sharpness-statements.json`(general+lenses), `src/data/personaStatements.ts`(`resolveStatements`), `docs/design/persona-quiz-plain-language-impl.md` §8

## L-6: 같은 데이터·로직을 두 곳에 복제하면 반드시 deep 비교 가드 테스트로 잠글 것

- **언제 만났나**: 2026-06-04, 페르소나 진단 질문지 작업. 진술 사전이 `scripts/eval-sharpness-statements.json`(CLI 원본)과 `src/data/personaStatements.ts`(프론트 번들 복제본) 두 곳에 존재하고, 직군 렌즈 resolve 로직도 앱(`personaStatements.ts`)과 CLI(`eval-sharpness.mts`)에 의도적으로 중복(node script가 `src/data`를 import 지양). v2 확장 시 225개 진술 + resolve가 양쪽에서 어긋날 위험.
- **함정**: 복제·중복 구현은 한쪽만 수정되는 "조용한 드리프트"를 만든다. 두 파일 모두 각자 컴파일·테스트는 통과하므로 git diff·타입체크로는 안 드러나고, 런타임에서 CLI 측정값과 앱 표시값이 갈리거나 동기화 깨진 진술이 노출된다.
- **회피**: 복제 데이터는 `deepStrictEqual` verbatim 비교 테스트로(키집합 + 중첩 배열까지) 잠근다. 중복 로직은 양쪽을 각각 단위 테스트로 커버해 동작 일치를 강제한다. "복제했으면 가드 테스트도 같이"를 규칙화 — 가드 없는 복제는 미완성으로 본다.
- **연관 파일/함수**: `tests/persona-quiz.test.mts`(동기화 가드, lenses deep 비교), `src/data/personaStatements.ts`↔`scripts/eval-sharpness-statements.json`, `resolveStatements`(앱)↔`resolveStatements`(CLI)

## L-7: 시드 PRNG 함수에 옵션 분기를 넣을 때 경로별 rand() 호출 횟수를 보존하고 골든으로 잠글 것

- **언제 만났나**: 2026-07-03, 정밀 진단(퀴즈 v3) 작업 — `generateBalancedPairs`에 `exclude`(기출 진술 회피) 옵션을 추가하면서, 분기에 따라 `rand()` 호출 횟수가 달라지면 exclude 미전달 경로의 기존 시드 출력까지 전부 바뀌는 문제를 사전에 식별.
- **함정**: mulberry32 같은 시드 PRNG는 호출 순번이 곧 출력이다. 새 옵션 분기 안에서 `rand()`를 한 번이라도 더/덜 부르면 그 이후 모든 추출이 어긋나, "옵션을 안 쓴" 기존 사용자 경로도 조용히 다른 결과를 낸다. 타입·단위 테스트는 그대로 그린이라 눈치채기 어렵다.
- **회피**: (1) 분기와 무관하게 경로당 `rand()` 호출 횟수를 동일하게 유지한다(부분집합 샘플링도 인덱스 계산만 바꾸고 호출은 1회). (2) 수정 **전** 구현의 출력을 시드 2~3개로 캡처해 리터럴 골든 테스트로 고정하고, 수정 후 옵션 미전달 경로가 바이트 동일함을 증명한다. 골든은 구현에서 재계산하지 말고 리터럴로 박을 것 — 재계산 골든은 회귀를 못 잡는다.
- **연관 파일/함수**: `src/lib/personaQuiz.ts` `generateBalancedPairs`/`drawStatement`, `tests/persona-quiz.test.mts` `GOLDEN_SEED_7/42`

## L-8: 성립 게이트 단위와 영수증 n= 단위가 다른 신호는 미달 문구를 일반형으로 재사용하지 말 것

- **언제 만났나**: 2026-07-03, 지문 신호 ⑥(AI 작성 비중 변화) 작업 — 성립 게이트는 창별 user 메시지 수(≥30)인데 영수증 n=은 단어 수라, 일반형 미달 문구("최근 n=750 · 이전 n=300 — 최소 각 30")를 쓰면 단어 수를 메시지 임계와 비교하는 거짓 영수증이 됨.
- **함정**: 신호마다 "표본"의 축(메시지 수/단어 수/일 수/세션 수)이 다른데 미달 사유 템플릿을 공유하면, 표기된 n과 임계값의 단위가 어긋나 수치는 맞는데 문장은 거짓인 영수증이 나온다. 반증가능 원칙(모든 주장에 정직한 n=)이 문구 재사용 한 줄로 무너진다.
- **회피**: 미달 사유 문구는 게이트가 실제로 검사한 단위를 명시한다("표본 부족 (최근 user 메시지 n=29 — 최소 30)"). 게이트 단위 ≠ 영수증 n= 단위인 신호는 전용 분기를 만들고, 신호 추가 리뷰 체크리스트에 "게이트 단위와 영수증 문구 단위 일치"를 넣는다.
- **연관 파일/함수**: `src/components/Dashboard.tsx` `fingerprintReceiptLine`(⑥ 전용 분기), `src/lib/collabFingerprint.ts` ⑥ viable 조건

## L-9: 방향 동사와 병기하는 수치는 절대값 — 부호 포함 포매터는 동사 없는 영수증 전용

- **언제 만났나**: 2026-07-03, 지문 신호 양방향 카피 리뷰 — ⑥⑨ 감소 방향 서사가 `fmtSignedPp`를 그대로 써서 ko "이전보다 -5%p 줄어든"(중복), en "dropped -5pp"(이중부정 — 방향이 반대로 읽힘)이 됨. Reviewer가 발견, `fmtAbsPp` 신설로 해소.
- **함정**: delta에 부호를 포함해 포맷하는 헬퍼를 "늘어난/줄어든", "rose/dropped" 같은 방향 동사와 병기하면 정보가 중복되고, 영어에서는 이중부정으로 실제 방향이 뒤집혀 읽힌다. ko만 보면 어색한 정도라 리뷰에서 en 쪽 오독을 놓치기 쉽다.
- **회피**: 방향은 동사가 전달하고 수치는 절대값 헬퍼(`fmtAbsPp`)로. 부호 포함 헬퍼(`fmtSignedPp`)는 방향 동사가 없는 표면(영수증 수치 라인, 배지)에만 쓴다. 양방향 신호 카피 추가 시 ko/en 감소 방향 문장을 반드시 둘 다 소리 내 읽어 검증.
- **연관 파일/함수**: `src/components/Dashboard.tsx` `fmtAbsPp`/`fmtSignedPp`, `fingerprintNarrative`(⑥⑨ 케이스)
