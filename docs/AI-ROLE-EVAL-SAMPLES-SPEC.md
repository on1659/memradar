# AI Role Eval Samples — 생성 규칙

> 초안 작성일: 2026-04-21
> 상태: 제안 단계 (미실행)
> 목적: `src/lib/usageProfile.ts` 의 역할 분류 정확도를 **합성 라벨링 데이터** 로 평가하기 위한 테스트 샘플 100개를 Haiku 모델로 생성한다.
> 연관: [AI-ROLE-SCORING-REDESIGN.md](./AI-ROLE-SCORING-REDESIGN.md), [AI-ROLE-ACCURACY-REVIEW.md](./AI-ROLE-ACCURACY-REVIEW.md)

---

## 0. 이 문서의 용도

본 문서는 **샘플 데이터 생성 규칙 (spec)** 이며, 실제 평가 스크립트나 결과 문서는 별도 산출물로 분리한다.
Haiku 가 이 문서를 지침으로 받아 100개 세션을 생성하고, 그 결과를 `analyzeUsageTopCategories` 등으로 점수 매긴 뒤 `intendedRole` 과 비교하는 것이 다음 단계다.

---

## 1. 왜 합성 데이터인가

### 1-1. 실제 세션 샘플링의 한계 (이미 논의된 내용)

- **Length 편향**: 실제 세션 평균 1.2 메시지라 99% undecided → 평가 불가능
- **Recall 편향**: 긴 세션만 보면 짧은 세션 실패 사례 놓침
- **정답 편향**: 사람이 자기 세션 판정할 때 기억 흐림, 편애
- **라벨 불명확**: "리팩터링 + 디버깅" 같은 혼합 세션 → 뭐가 정답?

### 1-2. 합성 데이터의 한계 (미리 인정)

- Haiku 가 만드는 대화는 실제 사용자 말투와 분포 다를 수 있음
- "디버깅 세션처럼 쓰라" 지시하면 `에러`, `고쳐줘` 같은 키워드 **과도하게 박아 넣을** 수 있음 → 분류기가 쉽게 맞추는 "over-obvious" 샘플만 나오는 과잉정답 리스크
- 이 한계를 수용하고 **비교지점(benchmark)** 으로만 사용. 실제 세션 분포와 1:1 매칭은 아님.

### 1-3. 판단 기준

평가 결과는 아래 관점으로만 해석한다.

- **정확도 하한선 측정** — 이 수준도 못 맞추면 실전은 더 못 맞춘다
- **오분류 패턴 관찰** — 어떤 역할끼리 헷갈리는지 (예: feature ↔ refactor) 구조적 실마리
- **키워드 튜닝 힌트** — 특정 키워드/문구가 의도와 다르게 동작하는지 점검

---

## 2. 샘플 전체 구조

### 2-1. 총량

- 총 **100개 세션**
- 각 세션 길이: **50~400 메시지** (유저 + assistant 합산)
  - 이 범위는 `UNDECIDED_MIN_MESSAGES(4)` 를 충분히 넘음 → 모든 샘플이 undecided 아닌 classified 결과가 나와야 함
  - undecided 동작 검증은 본 평가 대상이 **아님** (별도 짧은 세션 세트로 분리 가능, 이 스펙 범위 외)

### 2-2. 역할별 분포

기본안:

| 분류 | 개수 | 설명 |
|---|---|---|
| **단일 역할 (pure)** | **72** | 9개 카테고리 × 각 8개 — 역할당 동등 |
| **혼합 역할 (mixed, 2개)** | **20** | 아래 조합에서 균등 |
| **헷갈리는 경계 (ambiguous)** | **8** | 분류기 함정 케이스 의도 제작 |
| **메인 세트 소계** | **100** | 정확도 측정용 |
| **일관성 서브세트 (consistency)** | **+9** | 같은 scenario 3개 × 각 3회 재생성. §2-4 참고 |
| **최종 합계** | **109** | |

**혼합 조합 (20개)**: 실전에서 자주 같이 나오는 페어 우선
- feature + debug (5)
- refactor + debug (3)
- debug + test (3)
- feature + design (2)
- data + feature (2)
- writing + review (2)
- devops + debug (2)
- review + refactor (1)

**Ambiguous 8개 의도**:
- "기능 설명해줘" 처럼 review 와 feature 애매 (3)
- "json 구조 바꿔달라" data 와 refactor 경계 (2)
- "README 에 이 기능 설명 추가" writing + feature 경계 (2)
- "빌드 깨져서 분석 중" devops + debug + review 3-way (1)

※ ambiguous 샘플은 정답이 **단일값이 아님** — "acceptable roles" 배열로 라벨링하여, 분류 결과가 그 안에 들면 정답 처리.

### 2-3. 길이 분포 (50~400 범위 내)

단조롭게 200 근처에 몰리지 않도록 강제 분산. **메인 세트 100개 기준**:

| 구간 | 개수 | 메시지 수 |
|---|---|---|
| 짧음 | 25 | 50~100 |
| 중간 | 50 | 100~250 |
| 긺 | 25 | 250~400 |

일관성 서브세트 9개 는 이 분포와 무관하게 각 scenario 의 자연스러운 길이로.

### 2-4. 일관성 서브세트 (consistency sub-batch)

**목적**: 같은 시나리오를 여러 번 재생성했을 때 분류기가 같은 결과를 내는지 확인. "분류기의 variance" 측정.

**구성**:
- 3개 scenario 선정: `pure` 1개, `mixed` 1개, `ambiguous` 1개
- 각각 **3회 독립 재생성** → 총 9개 샘플
- 파일명: `sample-consistency-{scenarioName}-run{1|2|3}.json`
- 스키마는 메인 세트와 동일하지만 `category: "consistency"` 필드 추가로 구분

**평가 관점**:
- 같은 scenario 3회 결과의 top1 이 모두 같으면 안정적
- 결과가 흩어지면 "이 scenario 는 경계선 케이스" 증거
- 분류 결과 불안정이 대부분이면 스코어링 로직의 **saturation 도입 필요성 근거** 로 활용 가능 (§Phase 3-6)

---

## 3. 한 샘플의 스키마

### 3-1. 파일 구조

- 저장 위치: `tests/fixtures/role-eval-samples/` — **`.gitignore` 처리** (재생성 가능하므로 리포에 싣지 않음)
- 파일명: `sample-{id}-{intendedRole}.json` (예: `sample-001-debug.json`)
- 포맷: JSON (JSONL 아님 — 메타데이터 + 메시지 배열 같이 담기 위함)

#### 파일명 충돌 방지 규칙 (중요)

생성 작업은 **항상 추가만** 한다. 기존 파일은 절대 덮어쓰지도, 삭제하지도 않는다.

- **시작 id 결정**: 폴더 내 기존 `sample-{id}-*.json` 의 최대 id 를 확인하고, 그 다음 번호부터 시작
  - 예: 기존에 `sample-001` ~ `sample-109` 이 있으면 신규 배치는 `sample-110` 부터
  - 빈 폴더면 `sample-001` 부터
- **109개는 한 번의 생성 단위**. 한 번 더 생성하면 총 218개가 되며, 이는 정상 동작
- 같은 이름 파일이 이미 존재하면 **에러로 중단** — 절대 덮어쓰지 않음
- 기존 파일을 지우거나 폴더를 비우는 행위는 **사용자가 명시적으로 지시한 경우에만** 수행

### 3-2. 스키마

```json
{
  "id": "sample-001",
  "generator": "claude-haiku-4-5-20251001",
  "createdAt": "2026-04-21T00:00:00Z",

  "intendedRole": "debug",
  "acceptableRoles": ["debug"],
  "category": "pure",
  "difficulty": "normal",

  "length": {
    "total": 140,
    "userMessages": 70,
    "assistantMessages": 70
  },

  "scenario": "React 앱에서 useEffect 무한 루프 원인 찾기",

  "messages": [
    {
      "role": "user",
      "text": "이거 왜 무한 렌더링 되지",
      "toolUses": []
    },
    {
      "role": "assistant",
      "text": "useEffect 의존성 배열 확인해봐야겠네요...",
      "toolUses": ["Read"]
    }
  ]
}
```

### 3-3. 필드 규칙

- `intendedRole`: 9개 카테고리 id 중 하나 또는 혼합형의 첫 번째 의도 역할
- `acceptableRoles`: 정답으로 인정할 id 배열
  - `pure` 는 길이 1
  - `mixed` 는 길이 2 (순서 무관)
  - `ambiguous` 는 길이 2~3
- `category`: `pure` | `mixed` | `ambiguous` | `consistency`
- `difficulty`: `easy` | `normal` | `hard`
  - `easy`: 강한 phrase + 전형적 단어 다수
  - `normal`: 도메인 단어 적당, 일반 단어 섞임
  - `hard`: 의도가 한두 문장에만 명시, 나머지는 일반 코딩 대화
- `scenario`: 한 줄 요약 (Haiku 가 일관성 유지용). 공개 레포에 올라갈 수 있으니 **식별 가능한 프로젝트/회사 이름 금지**
- `messages`: 실제 대화 배열
  - `role`: `user` | `assistant`
  - `text`: lowercase 처리 전 원문. 한글/영어 혼합 허용
  - `toolUses`: assistant 메시지에서만 `string[]`. 아래 §6 참조

---

## 4. 대화 스타일 규칙

평가의 타당성은 **"합성 대화가 실제 유저 말투에 얼마나 가까운가"** 에 달려있다.

### 4-1. 말투 요구사항

다음을 골고루 섞을 것:

| 레지스터 | 예시 |
|---|---|
| 격식 | "이 함수의 동작 방식을 설명해주시겠어요?" |
| 평어체 | "이 함수 뭐하는 건지 알려줘" |
| 한 줄 지시 | "고쳐" / "왜안됨" / "수정해줘" |
| 생각 나열 | "아 이거 때문이네 그럼... 이것도 체크해야 하나" |

한 세션 안에서 레지스터가 **바뀌는** 게 자연스러움. 한 세션 전체를 격식체로만 쓰면 비현실적.

### 4-2. 한/영 혼합

- 코드 관련 단어 영어 그대로: `const`, `useState`, `props`, `render`, `rebase`, `deploy` 등
- 일반 동사/문장 한국어
- 예: `"이 useEffect 가 왜 매번 리렌더 트리거해? deps 비어있는데"`

### 4-3. 코드 스니펫

- 일부 메시지에 ` ``` ` 블록 포함 허용
- 언어 지시자 있어도 없어도 됨 (현실 반영)
- 스코어링은 코드 블록 내부 텍스트도 긁어감 → **과도한 키워드 삽입 금지** (intentional stuffing 은 반칙)

### 4-4. 비언어적 노이즈

현실성 유지용:
- 간헐적 오타 (의미 유지되는 수준)
- "음..." / "잠깐" / "아 맞다" 같은 간투사
- 같은 맥락에서 유저가 2~3연속 짧은 메시지 보내기도 함

### 4-5. 금지

- 특정 회사/사람 이름 (개인정보 리스크)
- 민감한 기술 스택 디테일 (합성인데도 진짜처럼 보이면 오인 리스크)
- **의도 키워드 과다 반복** — "에러" 를 10번 이상 등장시키기 등 억지 stuffing 금지

---

## 5. 의도 신호 밀도 (difficulty 별)

분류기를 공정하게 평가하려면 난이도를 스펙트럼으로 깔아야 한다. 각 샘플은 **`difficulty`** 에 따라 아래 기준을 따른다.

### 5-1. `easy` (25% 목표)

- `phraseStrong` 매칭 문구 1~2회 등장
- `tokenStrong` 매칭 단어 4~6회
- 툴 사용도 카테고리 `toolHints` 와 명확히 정렬

### 5-2. `normal` (50% 목표)

- `phraseStrong` 0~1회
- `tokenStrong` 2~4회, `tokenWeak` 섞임
- 툴 사용 섞임 (일부만 정렬)

### 5-3. `hard` (25% 목표)

- 의도가 명시된 메시지 1~2개 뿐
- 나머지는 일반 코딩 대화 (중립/다른 role 용어 포함)
- `negative` 키워드 의도적으로 섞기 (분류기가 감점 잘 하는지 테스트)
- 예: debug 세션인데 "리팩터링 해야하나?" 같은 거 잠깐 나옴

---

## 6. toolUses 규칙

### 6-1. 사용 가능한 이름 (실제 provider 와 맞추기)

Claude 측:
`Edit`, `MultiEdit`, `Write`, `Read`, `Grep`, `Glob`, `Bash`, `Task`, `WebFetch`, `WebSearch`, `TodoWrite`

Codex 측:
`apply_patch`, `exec_command`, `shell`, `update_plan`, `view_image`

**그 외 이름 사용 금지** — TOOL_ALIAS 테이블에 없으면 매칭 안 됨.

### 6-2. 현실적인 빈도

- 짧은 세션 (50 msgs): toolUse 총 5~15회
- 긴 세션 (400 msgs): toolUse 총 50~120회
- 한 assistant 메시지에 **0~5개** toolUse (대부분 1~2)

### 6-3. 카테고리별 경향 (참고용, 강제 아님)

| 역할 | 자주 쓰는 툴 | 드문 툴 |
|---|---|---|
| feature | Edit, Write, MultiEdit | |
| debug | Bash, Read, Grep, Edit | Write |
| refactor | Edit, MultiEdit | Bash 자주 X |
| review | Read, Grep, Glob | Edit/Write 거의 X |
| writing | Write, Edit | Bash X |
| design | Edit, Write | Bash X |
| devops | Bash, Edit, Write | |
| data | Read, Edit, Bash | |
| test | Bash, Edit, Write | |

이 경향을 **완벽히 반영하면 분류기가 쉬워짐 → 의도적으로 일부 어긋나게** 할 것 (hard 샘플 특히).

---

## 7. Haiku 생성 프롬프트 원칙

### 7-1. 한 번에 한 세션

- 긴 세션 (400 메시지) 을 한 호출로 만들면 중간에 집중력 흐려짐
- 여러 청크로 나눠 생성하고 합치기 권장. 단 일관성을 위해 **각 청크마다 `scenario` 를 반드시 재전달**

### 7-2. 프롬프트 필수 포함

생성 프롬프트에는 아래가 반드시 들어가야 한다:

1. 이 문서의 `intendedRole` / `acceptableRoles` / `difficulty` / `scenario`
2. 말투 규칙 (§4-1)
3. 금지사항 (§4-5, §5 난이도별)
4. toolUse 이름 화이트리스트 (§6-1)
5. **"의도 키워드를 일부러 많이 박지 말 것"** 명시

### 7-3. 출력 검증

Haiku 출력이 아래 조건을 만족하는지 **자동 검증 스크립트** 가 확인:

- JSON 파싱 가능
- 스키마 (§3-2) 준수
- 메시지 수가 `length.total` 범위 내
- 역할 교대 (연속 user 4개 이상 금지, 연속 assistant 3개 이상 금지)
- toolUse 이름이 화이트리스트 안에 있음
- 특정 키워드 stuffing 탐지 (같은 의도 단어 한 메시지에 5회 이상 반복 시 경고)

실패한 샘플은 재생성 또는 폐기.

---

## 8. 평가 파이프라인 (샘플 생성 후 단계)

> 본 문서 범위 외지만 맥락용.

1. 100개 샘플 → `analyzeUsageTopCategories([sampleAsSession])` 실행
2. top1 역할이 `acceptableRoles` 안에 있는지 체크
3. 집계:
   - 전체 정확도 (top1 ∈ acceptable)
   - Confusion matrix (9×9, 오분류 쌍 확인)
   - 난이도별 정확도 (easy/normal/hard)
   - 카테고리별 precision/recall
4. Phase 3 API (`analyzeUsageRoles`) 도 같이 호출해서 `mixedRole` 플래그 정확도 확인
   - mixed 샘플: mixedRole=true 로 잡혔나
   - pure 샘플: mixedRole=false 로 잡혔나

결과는 별도 문서 `docs/AI-ROLE-EVAL-RESULTS.md` 로 분리.

---

## 9. 샘플링 관점의 공정성 체크리스트

앞서 나눈 대화에서 짚은 "샘플 편향" 문제들 이 스펙에서 어떻게 다뤄지는지 정리:

| 편향 종류 | 이 스펙의 대응 |
|---|---|
| Length 편향 | §2-3 세 구간 강제 분산 |
| Role 편향 | §2-2 카테고리당 8개 균등 |
| 정답 편향 | 합성이므로 라벨 자체가 ground truth |
| 기억 편향 | 해당 없음 (사람 판정 없음) |
| 애매한 경계 | `acceptableRoles` 배열로 허용 |
| Over-obvious 편향 | §5 difficulty 분산, §4-5 stuffing 금지 |
| Provider 편향 | §6-1 Claude/Codex 툴 이름 혼용 |

---

## 10. 확정 사항 / 남은 이슈

### 확정됨 (2026-04-21)

| 항목 | 결정 |
|---|---|
| 난이도 분포 | 25/50/25 (easy/normal/hard) 유지 |
| 혼합 20개 조합 가중치 | 직관 기반 배분 (feature+debug 5, refactor+debug 3, …) 유지 |
| git 커밋 | **하지 않음**. `tests/fixtures/role-eval-samples/` 는 `.gitignore` 처리, 재생성 가능하게 유지 |
| undecided 검증 포함 | **포함하지 않음**. undecided 는 단순 if 두 줄이라 unit test 로 충분. 본 평가 범위는 `길이 50+` 세션의 분류 정확도만 |
| 일관성 서브세트 | **있음**. 메인 100 + 일관성 9 (3 scenarios × 3회) = 총 **109** 샘플. §2-4 |

### 남은 이슈

1. **Haiku 호출 비용/시간** — 109 세션 × 평균 200 msgs ≒ 22k 메시지. 추정 필요.
2. **일관성 서브세트의 3 scenarios 선정** — 어떤 시나리오를 선택할지는 스펙이 아니라 실행 단계에서 결정. 후보는 실행 스크립트에 하드코딩하지 말고 config 파일로 분리 권장.

---

*문서 스탬프: draft / 2026-04-21*
