# AI Role Eval Samples — 생성 스펙 (v3)

> 작성일: 2026-04-22
> 상태: 활성
> 이전 버전: v2 (2026-04-21) — 30개 샘플로 100% 달성했으나 키워드 노출 생성 방식이라 평가 편향 확인됨. v3는 그 교훈 반영.
> 목적: `src/lib/usageProfile.ts` 의 역할 분류기 `analyzeUsageTopCategories()` 의 **실전 정확도** 를 측정할 샘플 세트를 정의한다.

---

## 0. 버전 교훈 요약

| 버전 | 샘플 수 | 정확도 | 문제점 |
|---|---|---|---|
| v1 | 218 | 71.1% | 모든 user 메시지가 "맞나?/확인해줄래?" 어조 → 죄다 review로 분류됨 |
| v2 | 30 | 100% | 생성 AI에 `phraseStrong`/`tokenStrong` 키워드 직접 주입 → 엔진 친화적 편향. 실전 성능 측정 불가 |
| **v3** | 400 | 측정 목표 | **블라인드 생성**: 생성자는 역할 설명만 받고 키워드 못 봄 |

v2의 실패는 "분류기가 좋다"가 아니라 "샘플이 분류기에 맞게 쓰였다"는 것. v3는 이 착시를 깬다.

---

## 1. 핵심 원칙 (v3 신설)

### 1-1. 블라인드 생성 원칙 (**가장 중요**)

- 생성 AI(코덱스/GPT/글램/클로드 등)는 역할의 **한국어 이름과 업무 설명만** 받는다
- `phraseStrong`, `tokenStrong`, `tokenWeak`, `toolHints` 같은 **스코어링 키워드 리스트를 절대 주지 않는다**
- 이유: 주면 생성 AI가 해당 키워드를 문장에 과다 주입해 "자연스러운 대화가 아니라 키워드 박스"가 됨 (v2의 실제 실패)
- 예외: 스펙에 명시된 "일반 업무 용어"는 허용 (e.g. "로그인 기능 추가"는 feature 설명에 필요) — 단 그 용어를 시그널에 강제 삽입하는 지시는 금지

### 1-2. 자연성 원칙

샘플은 "실제 개발자가 Claude Code에게 일을 시킨 대화"처럼 읽혀야 한다. 구체적으로:

- **짧은 응답 섞기**: "ㅇㅋ", "ㄱㄱ", "음..." 같은 실제 어투
- **말줄임/오타 허용**: "디비", "플젝", "콤폰넌트" 등
- **맥락 이탈 허용**: 중간에 다른 주제로 잠깐 샘 → 본론 복귀 (1-2개 샘플/역할 수준)
- **어긋난 질문**: 사용자가 이해 못하고 재질문, assistant 가 다시 설명
- 100% 격식 / 100% 반말 금지

### 1-3. 정답률 튜닝 원칙

샘플 생성 후 엔진을 돌려본 결과:

- **전체 정답률 65~85%가 건강한 신호** — 너무 높으면 편향, 너무 낮으면 스펙 모호
- 85% 초과면 **샘플이 너무 엔진 친화적** → 재생성 (v2의 100%가 이 경우)
- 65% 미만이면 **스펙이 모호하거나 엔진 취약점 발견** → 둘 다 가치 있음
- 난이도별: easy 90%+, normal 70~85%, hard 50~70% 가 이상적

---

## 2. 전체 구성 (v3)

### 2-1. 총량 400개

| 카테고리 | 개수 | 역할당 | 비고 |
|---|---|---|---|
| pure | 270 | 9 역할 × 30 | easy 10, normal 10, hard 10 |
| mixed | 90 | 조합별 §2-3 | 실전 빈도 가중 |
| ambiguous | 25 | §2-4 | 경계 케이스 |
| edge | 15 | §2-5 | undecided / 영문전용 / 극단 길이 |
| **합계** | **400** | | |

v2의 30개(seed)는 `tests/fixtures/role-eval-samples/` 에서 `_seed/` 로 이동. 재사용 안 함(편향 샘플).

### 2-2. 역할 9종

| id | 한국어 | 업무 설명 (생성 AI에 주는 용도) |
|---|---|---|
| feature | 풀스택 기획자 | 새 기능/화면/API 엔드포인트/컴포넌트를 "처음부터 만드는" 작업 |
| debug | 버그 헌터 | 이미 있는 코드가 원하는 대로 동작 안 할 때 **원인을 찾고 고치는** 작업 |
| refactor | 리팩터링 전문가 | 동작은 유지하되 **구조/가독성/중복**을 개선하는 작업 |
| review | 코드 분석가 | 기존 코드를 **읽고 이해/설명**하는 작업. 수정 거의 없음 |
| writing | AI 작가 | README, 가이드, 블로그, 릴리스 노트 등 **문서 작성** 작업 |
| design | 아트 디렉터 | UI 색상/레이아웃/간격/폰트/애니메이션 등 **시각 디자인** 작업 |
| devops | 배포 마스터 | Docker, CI/CD, 환경변수, 인프라 설정 등 **배포 파이프라인** 작업 |
| data | 데이터 엔지니어 | DB 스키마, 쿼리, 마이그레이션, JSON/CSV 변환 등 **데이터 처리** 작업 |
| test | QA 엔지니어 | unit/e2e/integration 테스트 작성 및 커버리지 작업 |

**주의**: 이 표를 생성 AI에게 줄 때 "업무 설명" 컬럼만 전달하고, 엔진 시그널 키워드는 **절대 주지 않는다**.

### 2-3. Mixed 90개 조합 분포

실전 세션에서 자주 같이 나오는 페어를 가중:

| 조합 | 개수 | acceptableRoles |
|---|---|---|
| feature + debug | 15 | [feature, debug] |
| debug + test | 10 | [debug, test] |
| feature + test | 10 | [feature, test] |
| refactor + test | 8 | [refactor, test] |
| refactor + debug | 8 | [refactor, debug] |
| feature + design | 7 | [feature, design] |
| data + feature | 7 | [data, feature] |
| writing + review | 6 | [writing, review] |
| devops + debug | 6 | [devops, debug] |
| devops + test | 5 | [devops, test] |
| review + refactor | 4 | [review, refactor] |
| data + debug | 4 | [data, debug] |

`intendedRole` 은 대화 전반부의 주도 역할, `acceptableRoles` 에 둘 다 포함.

### 2-4. Ambiguous 25개

경계가 본질적으로 모호한 케이스. 어느 역할로 분류돼도 맞다고 인정.

| 패턴 | 개수 | acceptableRoles |
|---|---|---|
| "이 기능 설명 + 확장 제안" (review vs feature) | 5 | [review, feature] |
| "JSON 구조 바꿔야 하나?" (data vs refactor) | 4 | [data, refactor] |
| "README에 이 API 설명 추가" (writing vs feature) | 4 | [writing, feature] |
| "빌드 왜 느려?" (devops vs debug vs review) | 3 | [devops, debug, review] |
| "테스트가 자꾸 실패" (test vs debug) | 3 | [test, debug] |
| "스타일만 바꾸면 되나 구조도?" (design vs refactor) | 3 | [design, refactor] |
| "마이그레이션 실패 원인" (data vs debug vs devops) | 3 | [data, debug, devops] |

### 2-5. Edge 15개

엔진의 경계 동작을 찔러본다:

| 타입 | 개수 | 목적 |
|---|---|---|
| 짧음 (user msg 3개 이하) | 5 | `UNDECIDED_MIN_MESSAGES=4` 작동 검증 |
| 매칭 거의 없음 (noise-only) | 3 | `UNDECIDED_MIN_MATCHED=2` 작동 검증 |
| 영문 100% | 3 | ASCII 토큰 word boundary 매칭 검증 |
| 극단 길이 (400msg+) | 2 | 긴 세션에서 late-phase 신호가 묻히는지 |
| 역할 스위칭 (3역할 이상) | 2 | mixed 로 폴백하는지 |

edge 는 `category: "edge"`, `acceptableRoles` 는 케이스별로 명시 (undecided 기대 시 `[]`).

### 2-6. 난이도 정의

| 난이도 | 목표 정답률 | 특징 |
|---|---|---|
| easy | 90%+ | 역할이 **처음 3개 메시지 안에** 명확. 관련 업무만 일관됨 |
| normal | 70~85% | 역할이 명확하되 **중간에 다른 역할 용어 1~2회 등장**. 자연스러운 곁가지 |
| hard | 50~70% | 역할이 간접적 표현으로만 드러남. **2개 이상 역할 용어가 섞여** 스코어 격차 작음. 사람이 봐도 살짝 고민되는 수준 |

**hard 를 만들 때 키워드를 적게 쓰는 게 아니라, "이 역할이 될 만한 자연스러운 곁가지 대화"를 의식해서 넣는다.**

### 2-7. 길이 분포 (pure/mixed/ambiguous 385개 기준)

| 구간 | 비율 | 메시지 수 |
|---|---|---|
| short | 30% | 20~50 |
| mid | 50% | 50~150 |
| long | 20% | 150~300 |

edge 는 길이 제약 예외.

---

## 3. 스키마

### 3-1. 파일 위치 및 이름

- `tests/fixtures/role-eval-samples/` — v3 생성물
- `tests/fixtures/role-eval-samples/_seed/` — v2 30개 보존 (레퍼런스, 평가 제외)
- `tests/fixtures/_archive/` — v1 218개

파일명:
- pure: `sample-{NNN}-{role}.json` (001~270)
- mixed: `sample-{NNN}-{roleA}-{roleB}.json` (271~360)
- ambiguous: `sample-{NNN}-ambig-{shortLabel}.json` (361~385)
- edge: `sample-{NNN}-edge-{shortLabel}.json` (386~400)

### 3-2. JSON 구조

```json
{
  "id": "sample-042",
  "generator": "gpt-5-codex",
  "generatorNotes": "블라인드 생성 (키워드 미노출)",
  "createdAt": "2026-04-22T12:00:00Z",

  "intendedRole": "debug",
  "acceptableRoles": ["debug"],
  "category": "pure",
  "difficulty": "normal",

  "length": {
    "total": 62,
    "userMessages": 31,
    "assistantMessages": 31
  },

  "scenario": "React 폼 제출 후 상태가 초기화되지 않는 문제 추적",
  "scenarioTags": ["react", "state-management"],

  "messages": [
    { "role": "user", "text": "폼 제출 누르고 나면 입력값이 안 지워져요", "toolUses": [] },
    { "role": "assistant", "text": "onSubmit 핸들러 보여주실 수 있어요?", "toolUses": ["Read"] }
  ]
}
```

### 3-3. 필드 규칙

- `id`: 전역 3자리 zero-pad
- `generator`: 실제 생성 모델 ID (`claude-sonnet-4-6`, `gpt-5-codex`, `glm-4.6` 등)
- `generatorNotes`: 자유 메모 (블라인드 여부, 변형 방법 등)
- `intendedRole`: `USAGE_CATEGORIES` 의 9개 id 중 하나 (mixed 는 주도 역할)
- `acceptableRoles`: 정답 배열. 길이: pure=1, mixed=2, ambiguous=2~3, edge=0~3
- `category`: `pure | mixed | ambiguous | edge`
- `difficulty`: `easy | normal | hard`
- `length`: 자동 채움 (생성 후 검증)
- `scenario`: 한 줄, 회사/사람/실서비스명 금지
- `scenarioTags`: 도메인 태그 (분석용, 선택)
- `messages[].role`: `user | assistant`
- `messages[].toolUses`: assistant 에서만 의미 있음. user 는 빈 배열

---

## 4. 블라인드 생성 프로토콜 (v3 핵심)

### 4-1. 생성 AI에 주는 입력 (전부)

```
[역할 이름]: 버그 헌터

[업무 설명]: 이미 있는 코드가 원하는 대로 동작 안 할 때 원인을 찾고
고치는 작업. 에러 메시지 해석, 재현, 로그 확인, 조건문·상태관리·비동기
타이밍 등에서 버그 위치 특정, 수정 후 검증.

[시나리오]: React 폼 제출 후 상태가 초기화되지 않는 문제 추적

[난이도]: normal

[메시지 수]: 60~80 (user 절반, assistant 절반)

[지시사항]:
- 위 업무를 자연스럽게 수행하는 Claude Code 대화를 작성하세요.
- 실제 개발자처럼 말하세요. 반말/존댓말/짧은 응답 섞어 쓰세요.
- 중간에 잠깐 다른 얘기로 샜다가 돌아오는 것도 허용됩니다.
- assistant 는 상황에 맞는 도구를 호출합니다 (Read, Grep, Bash, Edit 등).
- 출력은 JSON 한 덩어리. 스키마는 아래 참고.

[스키마]:
{ "scenario": "...", "messages": [{"role": "user", "text": "...", "toolUses": []}, ...] }

[출력 규칙]:
- JSON 외 텍스트 금지
- messages 는 user 로 시작, user-assistant 엄격 교대
- assistant 의 toolUses 는 Claude Code 도구 이름: Read, Write, Edit, MultiEdit, Glob, Grep, Bash, Task, WebFetch, WebSearch, TodoWrite
```

**절대 금지 (생성자에게 주면 안 되는 것)**:

- `phraseStrong`, `tokenStrong`, `tokenWeak`, `negative`, `toolHints` 배열
- "이 키워드를 N번 사용하라" 같은 지시
- 스코어링 가중치/엔진 동작 설명
- "feature 로 분류되게 해라" 같은 메타 지시

### 4-2. 난이도별 추가 지시

**easy 추가**:
```
이 역할의 대표적인 업무 동사를 첫 3개 메시지 안에서 명확히 드러내세요.
대화 내내 이 역할 업무에 집중하고 곁가지는 최소화하세요.
```

**normal 추가**:
```
이 역할이 주도하되, 자연스럽게 다른 역할의 용어가 1~2번 섞일 수 있습니다.
(예: debug 작업 중 "이 부분은 나중에 리팩터링해야겠네" 같은 혼잣말)
```

**hard 추가**:
```
이 역할임을 직접적으로 말하지 마세요. 사용자는 "이거 좀 봐줘",
"이상한데?", "어떻게 해야 할까?" 같은 간접 표현을 쓰세요.
대신 assistant 의 반응(도구 선택, 제안 방향)으로 역할이 드러나게 하세요.
```

### 4-3. Mixed 생성

두 역할 설명을 모두 준다:

```
[주 역할]: 풀스택 기획자 — (업무 설명)
[부 역할]: 버그 헌터 — (업무 설명)

[진행]: 전반부는 주 역할 작업(기능 추가), 중반쯤 문제 발견, 후반부는
버그 수정. 두 역할이 자연스럽게 섞인 한 세션으로 작성하세요.
```

### 4-4. Ambiguous 생성

경계 설명을 준다:

```
[상황]: 사용자가 요청한 작업이 "새 기능 추가"인지 "기존 기능 설명/리뷰"
인지 경계에 있습니다. 실제로 둘 다로 해석 가능한 대화를 작성하세요.
어느 한쪽에 치우치지 마세요.
```

---

## 5. 검증 (자동)

생성 후 `scripts/validate-eval-samples.mts` (신규) 가 다음을 체크:

### 5-1. 구조 검증

- [ ] JSON 파싱 가능
- [ ] `length.total === messages.length`
- [ ] `length.userMessages + length.assistantMessages === length.total`
- [ ] `messages[0].role === "user"`
- [ ] user/assistant 엄격 교대
- [ ] 모든 toolUses 가 화이트리스트 안
- [ ] `acceptableRoles` 길이가 category 규칙과 일치

### 5-2. 자연성 휴리스틱

- [ ] 한 메시지에 동일 단어 5회+ 반복 → 경고 (stuffing 의심)
- [ ] user 메시지 중 `["맞나", "확인해줄래", "맞게 한", "봐줄래"]` 비율 > 20% → 경고 (v1 review-어조 병)
- [ ] 메시지 평균 길이 < 5자 또는 > 500자 → 경고
- [ ] assistant 메시지 중 toolUses 빈 비율이 전체의 30% 초과 → 경고 (너무 설명만)
- [ ] 동일 문장 3회+ 복붙 → 에러

### 5-3. 신호 주입 검사 (v3 신설)

블라인드 생성이 지켜졌는지 사후 검증:

- 각 샘플에서 `phraseStrong` 매칭 총합이 pure/easy 샘플에서 **5회 초과** 면 경고 (과다 주입 의심)
- hard 샘플에서 `phraseStrong` 매칭이 **3회 이상** 이면 경고 (hard 가 아님)
- 전체 샘플셋에서 role 별 정답률이 **95% 초과** 면 "편향 의심" 플래그 → 재샘플링 권장

### 5-4. 통과 기준

- 에러 0건 → 통과
- 경고만 있으면 사람 리뷰 후 결정
- 에러 발생 샘플은 파일명 뒤에 `.invalid` 붙여 격리, 재생성 대상

---

## 6. 툴 이름 화이트리스트

| Provider | 허용 이름 |
|---|---|
| Claude Code | `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `Bash`, `Task`, `WebFetch`, `WebSearch`, `TodoWrite`, `NotebookEdit` |
| Codex CLI | `apply_patch`, `exec_command`, `shell`, `update_plan`, `view_image` |

그 외 이름은 validation 실패. 대소문자 구분 함.

---

## 7. 평가 실행과 해석

### 7-1. 실행

```bash
npx tsx scripts/test-eval-and-report.mts         # 전체
npx tsx scripts/test-eval-and-report.mts --role debug   # 역할만
npx tsx scripts/test-eval-and-report.mts --category mixed   # 카테고리만
```

### 7-2. 지표 (scripts 확장 필요)

**전체**:
- Overall accuracy
- Category accuracy (pure/mixed/ambiguous/edge)
- Difficulty accuracy (easy/normal/hard)

**역할별 (9종 각각)**:
- Precision: `TP / (TP + FP)` — "debug 로 예측한 것 중 실제 debug 비율"
- Recall: `TP / (TP + FN)` — "실제 debug 중 debug 로 맞춘 비율"
- F1: `2PR/(P+R)`

**편향 탐지**:
- 혼동 행렬 9×9 (대각선 외 핫스팟 찾기)
- 신뢰도 분포 (0.3 미만 예측이 많으면 엔진이 약함)
- Undecided 비율 (edge 외에서 undecided 나오면 비정상)

**Mixed 특화**:
- top1 이 `acceptableRoles` 중 하나면 정답
- top1, top2 둘 다 `acceptableRoles` 안이면 "완전 정답" (별도 지표)

### 7-3. 건강한 기준선 (v3 가설)

| 지표 | 건강 범위 |
|---|---|
| 전체 정답률 | 65~85% |
| pure/easy | 85~95% |
| pure/normal | 70~85% |
| pure/hard | 50~70% |
| mixed top1 | 60~80% |
| mixed 완전정답 | 40~60% |
| ambiguous | "어느 쪽이든 수용"이라 정답률은 측정 안 함, **신뢰도 분포**만 본다 |

85% 초과 시 샘플 편향 의심, 65% 미만 시 엔진 취약점 → 둘 다 문서화 가치.

---

## 8. 생성 워크플로우

### 8-1. 단계

1. **Seed 검수**: v2 seed 30개 확인, 의도적으로 쉬운 샘플로만 구성되어 있음을 인지
2. **배치 계획**: 역할×난이도 조합 27칸(9×3) 각 10개씩 Codex/GPT 에 분산 요청
3. **블라인드 프롬프트 주입**: §4-1 템플릿 사용, 시그널 키워드 제거
4. **생성 실행**: 배치당 10샘플, 한 파일에 JSON 배열로 받음
5. **검증**: `validate-eval-samples.mts` 로 구조/자연성/주입 체크
6. **평가**: `test-eval-and-report.mts` 로 정답률 측정
7. **이상값 조사**: 역할별 정답률이 건강 범위 벗어나면 샘플 재검수
8. **반복**: 문제 발견 → 해당 역할만 재생성

### 8-2. 생성 도구 제안

외부 AI를 쓴다면:

- **Codex CLI (`gpt-5-codex`)**: 코드 중심 대화 자연스러움. 첫 추천.
- **GPT-5 / GPT-o3**: 긴 대화 구조화 우수. mixed/long 샘플 적합.
- **Claude Opus 4.7**: 캐릭터별 말투 편차 우수. 레지스터 혼합 강함.
- **GLM-4.6 / Qwen**: 다양성 확보용. 한국어 품질 확인 필요.

**한 모델만 쓰지 않는다**. 2~3개 모델을 섞어 provider 편향 제거.

### 8-3. 배치 템플릿 (Codex 예시)

```
너는 Claude Code 대화 샘플 데이터를 생성한다.
아래 지시를 따라 10개의 JSON 샘플을 한 배열로 출력하라.

[공통 설정]
- 각 샘플은 "debug" 역할, "normal" 난이도
- 메시지 수: 50~80 (샘플마다 다르게)
- 시나리오: 아래 10개 중 하나씩 정확히 할당

[시나리오 10개]
1. React 폼 제출 후 상태가 초기화되지 않음
2. useEffect 의존성 배열 문제로 무한 렌더
3. Next.js API route 에서 CORS 에러
...

[역할 설명]
(§4-1 debug 업무 설명)

[지시]
(§4-1 지시사항 + §4-2 normal 추가 지시)

[출력]
[{...}, {...}, ...] (JSON 배열만, 다른 텍스트 없이)
```

### 8-4. 인간 검토 (샘플링)

- 생성 400개 중 **10%(40개) 무작위 추출 → 사람이 읽어 자연성 평가**
- 평가 항목: "이게 실제 개발자 대화처럼 보이는가?" yes/no
- 70% 미만 yes 면 전체 배치 재생성

---

## 9. Git 정책

- `tests/fixtures/role-eval-samples/` — `.gitignore` (재생성 가능)
- `tests/fixtures/role-eval-samples/_seed/` — `.gitignore` (참고용)
- `tests/fixtures/_archive/` — `.gitignore`
- 본 스펙 문서, 생성/검증 스크립트, 평가 리포트 스크립트는 커밋

`docs/eval-report.html`, `docs/eval-results.json` 은 생성물이므로 `.gitignore` 대상.

---

## 10. v3 공정성 체크리스트

| 편향 종류 | v3 대응 |
|---|---|
| Review 어조 편향 (v1 병폐) | §5-2 자동 검증 + §4-1 역할별 업무 설명 |
| 툴 랜덤 편향 (v1 병폐) | §4-1 지시에 "상황에 맞는 도구" 문구, 강제 비율은 두지 않음 (자연성 우선) |
| **시그널 키워드 주입 편향 (v2 병폐)** | **§1-1 블라인드 원칙 + §5-3 주입 사후 검증** |
| **정답률 상향 편향 (v2 병폐)** | **§1-3 건강 범위 정의, 85% 초과 시 재샘플링** |
| Length 편향 | §2-7 3구간 분포 |
| Role 편향 | §2-1 역할당 30개 균등 |
| Provider 편향 | §8-2 2~3 모델 혼용 |
| Difficulty 편향 | §2-6 명확한 정의 + §2-1 균등 분포 |
| 한국어 편향 | §2-5 영문 edge 샘플 3개 |

---

## 11. v2 에서 발견한 실전 Failure Mode (반영 필수)

v3 생성 시 다음 실패 패턴을 **의도적으로 피한다**:

### 11-1. `추가` 오염

**증상**: design/devops 샘플에 "섹션 추가", "스텝 추가" 가 너무 많이 들어가 feature 로 분류됨.

**대처**:
- design 에서는 "반영", "적용" 사용
- devops 에서는 "구성", "설정" 사용
- 하지만 이걸 **생성 AI 에게 직접 지시하지 않는다** (v2 실패). 역할 업무 설명만으로 자연스럽게 유도

### 11-2. Write/Bash 범용 도구 오염

**증상**: refactor 는 Edit 만 강하게 매칭되는데, Write/Bash 가 섞이면 devops(Edit+Write+Bash) 가 이김.

**대처**:
- 각 역할의 "상황에 맞는 도구" 가 자연스럽게 쓰이면 자동 해결
- 억지로 Edit 만 쓰게 하지 않는다 (자연성 해침)

### 11-3. 범용 검토 어조 오염 (v1 재발 방지)

**증상**: "고쳐줘" (debug) 가 refactor 샘플에 자주 들어가는 현상.

**대처**:
- `§4-1 업무 설명` 이 "동작은 유지하되 구조 개선" 이라는 차별점 명시
- "고쳐줘" 가 들어가도 정말 refactor 맥락이면 OK, 반복되면 v3 검증에서 경고

### 11-4. review 역할의 오염 (v1 재발 방지)

**증상**: 모든 user 메시지가 "맞나?" 어조로 쏠림.

**대처**: §5-2 자동 검증에서 20% 초과 시 재생성.

---

## 12. 스크립트 확장 계획 (필수 작업)

본 스펙이 요구하는 신규/확장 스크립트:

| 파일 | 상태 | 역할 |
|---|---|---|
| `scripts/generate-eval-samples.mts` | **신규** | 블라인드 프롬프트로 외부 AI 호출 (Codex/GPT API) |
| `scripts/validate-eval-samples.mts` | **신규** | §5 검증 (구조/자연성/주입) |
| `scripts/test-eval-and-report.mts` | 확장 | §7 precision/recall/F1 + mixed 완전정답 + undecided 비율 |
| `scripts/eval-sampling-human-review.mts` | **신규** | 40개 무작위 추출 후 CLI 로 yes/no 입력받아 기록 |

---

## 13. 확정 사항 (v3, 2026-04-22)

| 항목 | 결정 |
|---|---|
| Generator | 2~3 모델 혼용 (Codex/GPT + Claude + GLM 등) |
| 샘플 수 | 400 (pure 270 + mixed 90 + ambig 25 + edge 15) |
| 블라인드 | 필수. 시그널 키워드 노출 금지 |
| 난이도 분포 | pure 역할당 easy 10, normal 10, hard 10 |
| 길이 분포 | 30/50/20 (short/mid/long) |
| git | `.gitignore`, 재생성 가능 |
| v2 seed | `_seed/` 이동, 평가 제외 |
| 건강 기준 | 전체 65~85%, hard 50~70% |
| 인간 검토 | 10% 샘플링, 자연성 yes 비율 70%+ |

---

## 14. 빠른 시작 체크리스트

v3 샘플을 0 부터 만들려면:

1. [ ] 기존 `tests/fixtures/role-eval-samples/*.json` 을 `_seed/` 로 이동
2. [ ] `scripts/validate-eval-samples.mts` 작성
3. [ ] `scripts/generate-eval-samples.mts` 작성 (§4-1 블라인드 프롬프트)
4. [ ] pure/easy 부터 1개 역할(예: debug) 10샘플 생성 → 검증 → 평가
5. [ ] 정답률 85~95% 확인 → 나머지 8역할 easy 확장
6. [ ] normal, hard 동일 패턴으로 확장
7. [ ] mixed, ambiguous, edge 생성
8. [ ] 전체 400개 평가, 혼동행렬/F1 분석
9. [ ] 인간 검토 40개 샘플링, yes 비율 체크
10. [ ] 결과 `docs/eval-report.html` 과 `docs/AI-ROLE-EVAL-RESULTS.md` 에 기록

---

*문서 스탬프: v3 / 2026-04-22*
