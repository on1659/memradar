# AI Job Scoring Redesign

> memradar `내 AI의 직업` 시스템 재설계 초안 (v2)
> 초안 작성일: 2026-04-21
> 상태: 제안 단계 (미구현)
> 변경 이력: v1 → v2 (2026-04-21, 구현 가능성 기준으로 범위 재조정)

---

## 0. 용어 원칙

이 문서에서는 아래 원칙을 고정한다.

- 브랜딩 이름: `내 AI의 직업`
- 설명용 표현: `AI가 자주 맡는 역할`

즉, 사용자에게 보이는 카드 제목은 **직업**으로 간다.
다만 실제 계산 로직이 의미하는 바는 "AI가 이번 대화들에서 어떤 일을 자주 맡았는가"에 더 가깝기 때문에, 설명/툴팁/보조 카피에서는 **역할**이라는 단어를 함께 쓴다.

예:

- 카드 제목: `내 AI의 직업`
- 설명 문구: `AI가 자주 맡는 역할을 보여줘요`
- 결과 문구: `가장 자주 맡은 역할은 버그 헌터 쪽이에요`

이 문서에서 말하는 `직업 점수`는 곧 **역할 점수의 브랜딩 표현**이다.

또한 이 문서의 모든 카피는 **확정적 판정**이 아니라 **추정 요약**임을 드러내는 톤을 유지한다.

---

## 1. 문제 정의

현재 `AI 직업`은 `src/lib/usageProfile.ts` 에서 **키워드 substring hit count** 로 계산된다.

```ts
if (text.includes(keyword)) {
  scores[category.id]++
  break
}
```

이 방식은 구현은 단순하지만 아래 문제가 있다.

| 문제 | 설명 |
|---|---|
| substring 오탐 | `ui` in `build`, `add` in `address` 같은 과매칭 가능 |
| 키워드 폭 과다 | `how`, `text`, `read`, `build` 처럼 문맥이 넓은 단어가 많음 |
| 메시지 단위 의미 부족 | 한 메시지 안에서 어떤 요청이 핵심인지 구분하지 못함 |
| 중복 가산 | 한 메시지가 여러 직업에 동시에 쉽게 점수됨 |
| confidence 부재 | 데이터가 적거나 1, 2위 차이가 작아도 결과를 그대로 노출 |
| 로직 중복 | `usageProfile.ts` 와 `PersonalityView.tsx` 에 거의 동일한 분석 로직이 두 벌 존재 |

즉, 현재 방식은 "재미있는 요약"으로는 가능하지만, `직업별 점수`를 더 설득력 있게 만들기에는 거칠다.

---

## 2. 설계 원칙

이 재설계의 원칙은 아래와 같다.

1. **작게 시작한다.** 한 번에 모든 수식을 바꾸지 않는다.
2. **숫자의 확정 시점을 구분한다.**
   - Phase 1·2 의 숫자(가중치 `4.0 / 2.5 / 1.0 / 2.0`, cap `2 / 4 / 5 / 3`, tool weight `1.5`, `MIN_MESSAGES=4`, `MIN_MATCH=2` 등)는 **초기값 (starter value)** 로 박되, Phase 1 배포 후 실측으로 재조정한다.
   - Phase 3 의 파라미터(혼합형 threshold, confidence weight, saturation `K`, `LOW_BAR / MEDIUM_BAR`)는 **실측 전에는 아예 박지 않는다.**
   - 즉, "숫자 금지" 가 아니라 "Phase 3 숫자는 금지, Phase 1·2 숫자는 잠정값"이다.
3. **설명 가능성을 유지한다.** "이 역할이 왜 1등인지" 를 사람이 재현할 수 있어야 한다.
4. `AI 직업`을 단순 키워드 hit count 에서 **가중치 기반 evidence scoring** 으로 점진적으로 바꾼다.
5. 사용자 메시지를 **1차 신호**로, assistant 측 신호(텍스트·toolUse)는 **보조 신호**로만 사용한다.
6. 기존 9개 카테고리 구조는 유지한다.
7. 브랜딩은 `AI 직업`으로 유지하되, 설명 카피는 `AI가 자주 맡는 역할` 기준으로 정리한다.

이 원칙 때문에 구현은 **3 단계(Phase 1 → 2 → 3)** 로 쪼갠다. 각 단계는 독립적으로 PR 단위 배포 가능하며, 앞 단계의 결과를 보고 다음 단계를 재평가한다.

---

## 3. 핵심 관점

`personality` 와 `AI 직업`은 질문이 다르다.

| 시스템 | 질문 | 허용 신호 |
|---|---|---|
| personality | "사용자가 AI와 어떻게 일하는가?" | 사용자 통제 신호 위주 |
| AI 직업 | "AI가 이번 요청에서 무슨 역할을 맡았는가?" | 사용자 요청 위주 + assistant 작업 흔적 최소 보조 |

즉, `AI 직업`은 personality 보다 assistant 측 증거를 **일부** 써도 된다. 다만 이 문서는 아래 비대칭을 전제한다.

- **사용자 메시지 신호가 역할 판단의 본체**
- **assistant 텍스트는 Phase 1·2 에서 가중치 `0` (미사용). Phase 3 에서만 실측을 보고 도입 여부 재평가.** ("결과 복기"이지 역할 자체가 아닐 수 있기 때문)
- **toolUse 는 Phase 2 부터 보조 가산으로 도입.** provider 별 명칭 편차가 크므로 §4-1 의 정규화 레이어를 먼저 둔다.

이 한 줄이 §4(데이터 표), §5(분석 단위), §6(점수 구조), §12(구현 순서), §14(한계) 전반에 일관되게 적용되는 공식 방침이다.

---

## 4. 사용 데이터

현재 코드베이스에서 활용 가능한 데이터는 아래와 같다.

| 데이터 | 출처 | 사용 여부 | 역할 | 비고 |
|---|---|---|---|---|
| `user message text` | `messages[].text` | O (1차) | 가장 강한 의도 신호 | 본체 |
| `assistant message text` | `messages[].text` | Phase 1·2 미사용 | — | Phase 3 에서 도입 여부 재평가 |
| `assistant toolUses` | `messages[].toolUses` | Phase 2 부터 | 약한 실행 근거 | §4-1 provider 정규화 선행 |
| `cwd` | `session.cwd` | X (당분간) | devops/data 보조 컨텍스트 | 추후 재검토 |
| `timestamp` | `message.timestamp` | X | 역할 분류에는 직접 필요 없음 | |
| total tokens | session/message token usage | X | 역할 구분엔 직접적이지 않음 | |

### 4-1. tool 이름 정규화

provider 별로 tool 이름이 다르다. Phase 2에서 toolUse 를 쓰기 시작할 때 아래 수준의 정규화 테이블을 둔다.

```ts
TOOL_ALIAS = {
  edit: ['Edit', 'MultiEdit', 'apply_patch', 'str_replace'],
  write: ['Write', 'create_file'],
  read: ['Read', 'view_file', 'view_image'],
  search: ['Grep', 'Glob', 'ripgrep'],
  shell: ['Bash', 'exec_command', 'shell'],
}
```

카테고리 dictionary 는 원시 tool 이름이 아니라 alias 군(`edit`, `shell` 등)을 참조한다.

---

## 5. 분석 단위 — 메시지 + 인접 toolUse (Phase 2)

### Phase 1 — 메시지 단위 유지

Phase 1은 기존 구조대로 **사용자 메시지 1건 = 점수 단위 1** 을 유지한다. turn 추상화를 도입하지 않는다. 이유:

- turn 경계는 실제 로그에서 애매함 (tool loop, interrupted turn, 다중 clarify)
- 메시지 단위로도 §6 의 가중치 개선은 모두 적용 가능
- 범위를 좁게 둬야 회귀 리스크가 낮다

### Phase 2 — 인접 toolUse 가산 (full turn 아님)

본격적인 "turn" 추상화 대신, **같은 그룹(user message → 다음 assistant message)** 의 toolUse 를 해당 메시지의 보조 신호로 가산한다.

```ts
messageGroup_i = {
  userText: user message i,
  toolUses: user message i 이후 첫 assistant message의 toolUses,
}
```

assistant 텍스트 자체는 기본적으로 쓰지 않는다. Phase 3에서 실제 세션으로 검증한 뒤에만 도입한다.

---

## 6. 점수 구조 — 공통 엔진

핵심 아이디어는 **카테고리마다 완전히 다른 수식**을 만드는 게 아니라,
**공통 scoring engine + 카테고리별 신호 사전(dictionary)** 으로 가는 것이다.

### 6-1. Phase 1 — 단순 3단 가중치 + 그룹 cap

Phase 1 에서는 exp/sigmoid/coverage 같은 비선형 변환을 **쓰지 않는다**. 이유:

- 비선형 수식의 파라미터(saturation 속도, coverage weight 등)는 실제 분포를 보기 전까지 튜닝 불가
- 단순 3단 가중치만으로도 §8 의 단어 경계 개선과 합쳐져 오탐의 큰 비중을 제거함
- "왜 이 점수가 나왔는지" 를 사람이 직접 설명 가능한 수준으로 유지

카테고리 `c`, 메시지 `m` 에 대해:

```ts
phraseHits = cap(count(strong phrase match in userText, c), 2)
tokenHits  = cap(count(strong token match  in userText, c), 4)
weakHits   = cap(count(weak token match    in userText, c), 5)
negHits    = cap(count(negative match      in userText, c), 3)

messageScore(c, m) = max(0,
    phraseHits * 4.0 +
    tokenHits  * 2.5 +
    weakHits   * 1.0 -
    negHits    * 2.0
)
```

- `cap()` 은 한 메시지 안에서 반복 키워드가 점수를 폭주시키지 못하게 한다.
- 모든 매칭은 §8 의 단어 경계 규칙을 따른다.

### 6-2. Phase 2 — toolUse 보조 가산

같은 그룹의 toolUse 가 있을 때만 가산한다.

```ts
toolHits = cap(count(aliased tool match, c), 3)
messageScore(c, m) += toolHits * 1.5
```

assistant 텍스트 신호는 이 단계에서 추가하지 않는다.

### 6-3. Phase 3 — 비선형 saturation / coverage (검증 후 선택)

Phase 1·2 결과가 여전히 "키워드 반복이 많은 세션" 에 편향된다면, 그때 비로소 saturation 을 도입한다.

```ts
saturated(c, m) = 1 - exp(-messageScore(c, m) / K)   // K 는 실측으로 정함
sessionScore(c, s) = Σ saturated(c, m in s)
globalScore(c) = Σ sessionScore(c, all sessions)
```

단, `K` 를 포함한 모든 파라미터는 **실측 세션으로 검증한 뒤에만** 커밋한다. 이 문서에서 숫자를 박지 않는다.

Phase 3 도입 여부 판단 기준:

- Phase 2 결과에서 상위 1~2개 역할이 전체 점수의 80% 이상을 차지하는 사용자가 30% 초과
- 또는 "같은 키워드를 반복 언급했다는 이유만으로 특정 역할이 과대 집계된다" 는 실측 증거가 있을 때

### 6-4. share 계산 (Phase 1부터)

```ts
finalScore(c) = Σ messageScore(c, all messages)  // Phase 1
scoreSum      = Σ finalScore(all categories)
share(c)      = finalScore(c) / scoreSum
```

UI 에서는 아래 둘 다 쓸 수 있다.

- `finalScore(c)` : 절대 근거량
- `share(c)` : 상대 비중

---

## 7. 카테고리별 신호 사전

각 직업은 공통 엔진을 쓰되, `strong/weak/phrase/tool/negative` 사전이 다르다.

아래 키워드/문구 목록은 **초기값**이며, Phase 1 배포 후 실제 오분류 사례를 보면서 조정한다. 모든 영문 짧은 토큰은 §8-2 의 단어 경계 규칙으로만 매칭된다.

---

### 7-1. `feature` — 풀스택 기획자

질문:

> AI가 새 기능을 만들거나 연결하거나 확장하는 일을 했는가?

```ts
feature = {
  phraseStrong: ["구현해줘", "만들어줘", "추가해줘", "새 페이지", "새 기능", "api 연결"],
  tokenStrong: ["구현", "추가", "feature", "component", "endpoint", "route"],
  tokenWeak:   ["페이지", "기능", "create"],         // "build" 는 devops 와 충돌, 제거
  toolHints:   ["edit", "write"],                    // Phase 2
  negative:    ["원인", "왜", "에러", "오류", "리뷰"],
}
```

강한 문맥: 새 기능 / 새 파일·페이지·컴포넌트 / API 연결
헷갈리는 상대: `debug`, `refactor`

---

### 7-2. `debug` — 버그 헌터

```ts
debug = {
  phraseStrong: ["에러 원인", "왜 안돼", "깨져", "고쳐줘", "수정해줘", "실패해"],
  tokenStrong: ["버그", "error", "오류", "fix", "debug", "broken", "undefined", "null"],
  tokenWeak:   ["warning", "fail", "crash", "안됨"],
  toolHints:   ["shell", "read", "search", "edit"],
  negative:    ["새 기능", "리팩터링", "문서"],
}
```

강한 문맥: 안 되는 이유 찾기 / 실패 원인 분석 / 깨진 동작 수정

---

### 7-3. `refactor` — 리팩터링 전문가

```ts
refactor = {
  phraseStrong: ["리팩터링", "구조 정리", "코드 정리", "깔끔하게", "나눠줘"],
  tokenStrong: ["refactor", "cleanup", "simplify", "extract", "rename", "restructure"],
  tokenWeak:   ["정리", "개선", "split"],             // "최적화" 는 devops·data 와도 자주 겹침 → weak
  toolHints:   ["edit"],
  negative:    ["버그", "에러 원인", "새 기능"],
}
```

헷갈리는 상대: `feature`, `debug`

---

### 7-4. `review` — 코드 분석가

```ts
review = {
  phraseStrong: ["리뷰해줘", "설명해줘", "분석해줘", "어떻게 동작", "왜 이렇게"],
  tokenStrong: ["review", "분석", "설명", "이해", "확인"],
  tokenWeak:   ["analyze"],                          // "why", "read", "check" 는 너무 일반 → 제거
  toolHints:   ["read", "search"],
  negative:    ["구현", "추가", "고쳐", "배포"],
}
```

강한 문맥: 이 코드 설명 / 왜 이렇게 동작하는지 / 읽고 판단

---

### 7-5. `writing` — AI 작가

```ts
writing = {
  phraseStrong: ["문서 작성", "정리해줘", "요약해줘", "번역해줘", "readme 써줘"],
  tokenStrong: ["문서", "readme", "translate", "summary", "markdown", "report"],
  tokenWeak:   ["작성", "blog"],                      // "write", "email", "text" 는 일반 → 제거
  toolHints:   ["write", "edit"],
  negative:    ["에러", "디버그", "테스트 실패"],
}
```

표시:

- 카테고리 id: `writing` (코드 식별자 유지)
- 카드 제목: `AI 작가`
- 부제: `글은 AI가 쓰고 이름은 내가 올리고` (ghostwriter 뉘앙스 유지)

네이밍 근거: "테크니컬 라이터" 는 외래어라 한국 사용자에게 직관이 약함. "작가" 는 ghostwriter 농담(부제)과 자연스럽게 이어지고, 문서 외 번역/요약/블로그/이메일 초안까지 포괄 가능한 일반 명사라 사전 범위와도 맞다.

---

### 7-6. `design` — 아트 디렉터

```ts
design = {
  phraseStrong: ["디자인 바꿔줘", "ui 손봐줘", "스타일 수정", "레이아웃 바꿔줘", "반응형",
                 "로고 만들어", "이미지 생성", "무드보드", "색감 바꿔"],
  tokenStrong: ["디자인", "ui", "ux", "css", "layout", "responsive", "theme",
                 "브랜딩", "로고", "무드", "palette"],
  tokenWeak:   ["color", "font", "spacing", "style", "이미지", "그래픽", "일러스트"],
  toolHints:   ["edit", "write", "image_gen"],
  negative:    ["빌드", "배포", "테스트 실패"],
}
```

주의:

- `ui` 는 substring 오탐 위험이 크므로 반드시 **단어 경계 기반**으로 매칭한다.
- `style` 도 주석·변수명에서 흔해 token 이 아니라 weak 로 둔다.

표시:

- 카테고리 id: `design` (코드 식별자 유지)
- 카드 제목: `아트 디렉터`
- 부제: `"여기 1px 옮겨" 장인` (현행 유지) 또는 `색감 한 끗에 집착하는 자` 로 교체 가능

네이밍 근거: 기존 "UI 디자이너" 는 CSS/레이아웃만 가리키는 좁은 이미지로 읽힘. 실제 사전은 브랜딩·색감·이미지 생성까지 포괄해야 현실과 맞으므로, 의미상 UI·비주얼 디렉션을 모두 포함하는 **아트 디렉터** 가 더 정확함.

### 7-6-보. 아트 / UI 분리 여부

Phase 1 에서는 **분리하지 않는다**. 이유:

- memradar 는 코딩 세션 분석 도구라 순수 아트 신호(이미지 생성·브랜딩)는 **실측상 소수** 로 추정됨
- 분리하면 대부분 사용자에게 `아트` 카테고리가 지속적으로 비어 있게 되어 UX 노이즈
- 관리할 카테고리가 9 → 10 으로 증가하고, 9-카테고리 전제의 UI(Wrapped 슬라이드, 색상 팔레트)도 재검토 필요

Phase 3 재평가 기준:

- `design` 내부에서 **아트성 phrase/token** 이 차지하는 비율을 실측
- 30% 이상 안정적으로 관측되고, 사용자 설문/피드백에서 `UI` 와 `아트` 를 구분해달라는 수요가 명확할 때만 분리 검토

---

### 7-7. `devops` — 배포 마스터

```ts
devops = {
  phraseStrong: ["배포해줘", "빌드 깨져", "환경 변수", "ci 설정", "github action"],
  tokenStrong: ["deploy", "배포", "docker", "vercel", "env", "pipeline", "workflow"],
  tokenWeak:   ["build", "aws", "npm"],              // "server", "config", "github" 는 일반 → 제거
  toolHints:   ["shell", "edit", "write"],
  negative:    ["설명만", "리뷰", "문서"],
}
```

---

### 7-8. `data` — 데이터 엔지니어

```ts
data = {
  phraseStrong: ["데이터 변환", "쿼리 짜줘", "json 파싱", "schema 바꿔줘", "migration"],
  tokenStrong: ["data", "database", "sql", "query", "json", "csv", "schema"],
  tokenWeak:   ["db", "parse", "migration"],          // "model", "fetch" 는 일반 → 제거
  toolHints:   ["read", "edit", "shell"],
  negative:    ["디자인", "폰트", "레이아웃"],
}
```

---

### 7-9. `test` — QA 엔지니어

```ts
test = {
  phraseStrong: ["테스트 추가", "테스트 작성", "e2e 짜줘", "spec 만들어줘", "재현 케이스"],
  tokenStrong: ["test", "spec", "jest", "playwright", "e2e", "unit", "coverage"],
  tokenWeak:   ["mock", "assert", "expect"],
  toolHints:   ["shell", "edit", "write"],
  negative:    ["배포", "디자인만", "문서"],
}
```

---

## 8. 단어 매칭 규칙 (Phase 1의 핵심)

이 문서에서 **가장 빨리 가장 큰 효과**를 보는 부분은 §6 의 가중치가 아니라 이 §8 이다. Phase 1 에 반드시 포함한다.

### 8-1. phrase > token > weak token

우선순위:

1. strong phrase (완성된 문구)
2. strong token (도메인 특이 단어)
3. weak token (일반적이지만 보조 신호)

예:

- `"에러 원인 찾아줘"` 는 strong phrase
- `"error"` 는 strong token
- `"warning"` 은 weak token

### 8-2. 단어 경계 적용

영문 짧은 토큰은 반드시 단어 경계를 적용한다. 한글 토큰은 기본 substring 유지.

```ts
matchBounded("ui", "improve ui spacing")   // true
matchBounded("ui", "build failed")         // false
matchBounded("add", "add new route")       // true
matchBounded("add", "address parser")      // false
```

구현:

```ts
const word = /\b{keyword}\b/i   // ASCII 경계
// 한글은 경계 개념이 약해 기존 includes 유지 (조사 문제는 Phase 2에서 재평가)
```

### 8-3. 같은 그룹 중복 상한

한 문장에 strong phrase 가 여러 번 반복돼도 폭주하지 않도록 그룹별 cap 을 둔다 (§6-1 재인용).

```ts
phraseStrongHitsCapped = min(phraseStrongHits, 2)
tokenStrongHitsCapped  = min(tokenStrongHits, 4)
tokenWeakHitsCapped    = min(tokenWeakHits, 5)
negativeHitsCapped     = min(negativeHits, 3)
```

### 8-4. 오탐 방지를 위해 제거된 초기 키워드

§7 의 사전은 `src/lib/usageProfile.ts` 현재 구현 대비 아래 키워드를 **의도적으로 삭제**했다. 너무 일반적이라 direction 이 잡히지 않기 때문이다.

- `review`: `how`, `what`, `read`, `check`, `why`
- `writing`: `write`, `text`, `email`
- `devops`: `server`, `config`, `github`, `action`
- `data`: `model`, `fetch`
- `feature`: `add` (단어 경계로도 "add new X" 외에 잡히는 경우가 많아 삭제. Phase 1 결과에 따라 weak 로 재도입 검토)
- `design`: `animation` (디자인 외 문맥에서도 흔해 삭제. Phase 1 결과에 따라 weak 로 재도입 검토)

삭제된 키워드는 Phase 1 배포 후 실제 오분류 로그를 보며 재도입 여부를 결정한다.

---

## 9. 혼합형 판단 (Phase 3)

현재는 점수 정렬 후 상위 1개를 거의 대표처럼 보여준다.
Phase 3 에서는 **top1/top2 차이**를 같이 본다.

```ts
topShare = topScore / scoreSum
gapRatio = (topScore - secondScore) / max(topScore, 1)

isMixedRole =
    secondScore > 0 &&
    topShare < TOP_SHARE_THRESHOLD &&
    gapRatio < GAP_RATIO_THRESHOLD
```

`TOP_SHARE_THRESHOLD`, `GAP_RATIO_THRESHOLD` 는 **실측 분포를 본 뒤에 정한다.** 초기값은 각각 `0.42`, `0.18` 로 제안되어 있으나 검증 없이 박지 않는다.

도입 조건:

- Phase 1·2 결과에서 "단일 역할로 표시되었지만 실제로는 2~3개가 거의 동률" 인 세션이 눈에 띌 때
- 특히 top1 share 가 0.5 미만인 사용자의 비중이 충분히 크다고 관측될 때

해석:

- `topShare` 가 너무 낮고
- 1, 2위 격차가 작으면
- 단일 직업보다 `혼합형` 으로 보여주는 쪽이 정직하다

예:

- `버그 헌터 + QA 엔지니어`
- `풀스택 기획자 + 리팩터링 전문가`

---

## 10. confidence 계산식 (Phase 3)

직업 자체의 점수와 별개로, 결과가 얼마나 믿을 만한지도 계산한다. **이 섹션의 모든 수치 파라미터는 실측 데이터로 튜닝되기 전까지 박지 않는다.**

### 10-1. confidence feature

```ts
matchedMessages = count(any category messageScore >= MIN_SCORE)
matchedCoverage = matchedMessages / totalMessages

topShare = topScore / scoreSum
gapRatio = (topScore - secondScore) / max(topScore, 1)
supportMessages = count(messageScore(topCategory, m) >= MIN_SCORE)
```

### 10-2. confidence index (초안)

```ts
confidenceIndex =
    f(matchedCoverage) * W1 +
    f(topShare)        * W2 +
    f(gapRatio)        * W3 +
    f(supportMessages) * W4
```

여기서 `f()` 는 saturation 함수(예: sigmoid), `W1..W4` 는 가중치다. 파라미터는 **Phase 3 착수 시점에 실측으로 결정**한다.

### 10-3. confidence label

```ts
if confidenceIndex < LOW_BAR     -> low
if confidenceIndex < MEDIUM_BAR  -> medium
else                             -> high
```

의미:

- `low`: 탐색 중 / 참고용
- `medium`: 꽤 그럴듯함
- `high`: 반복 패턴이 충분히 모였음

---

## 11. 탐색 중 / 판별 유보 (Phase 2)

아래 조건에서는 억지로 대표 직업을 주지 않는다. 이 임계값은 상대적으로 안전하게 작동하므로 Phase 2 에 포함한다.

```ts
if totalMessages < MIN_MESSAGES -> undecided    // 초기값 4
if matchedMessages < MIN_MATCH  -> undecided    // 초기값 2
if scoreSum < MIN_SCORE_SUM     -> undecided    // 초기값: Phase 1 결과 중위값 기준
```

표시 문구 예:

- `아직 탐색 중`
- `메시지가 더 쌓이면 역할 패턴이 또렷해져요`

`MIN_SCORE_SUM` 은 Phase 1 배포 후 실제 세션들의 scoreSum 분포를 보고 결정한다. 초기값을 박지 않는다.

---

## 12. 구현 순서 (3 Phase)

### Phase 1 — 단어 경계 + dictionary 정비 + 중복 제거

목표: 현재 오탐의 가장 큰 원인을 제거하고, 이후 단계의 기반을 만든다. 수식 복잡도는 올리지 않는다.

- `src/lib/usageProfile.ts` 에 공통 scoring engine 을 둔다.
  - phraseStrong / tokenStrong / tokenWeak / negative 4개 그룹
  - §6-1 의 단순 가중치 + §8-3 의 그룹 cap
  - §8-2 의 단어 경계 매칭 (영문만, 한글 substring 유지)
- `src/components/PersonalityView.tsx:100-130` 의 로컬 `analyzeUsageCategories` 를 제거하고 공통 엔진을 import 하도록 한다.
- **카피 톤 교체는 하지 않는다.** `당신의 AI 직업은 "X" 입니다`, `투잡 뛰는 중` 같은 표현은 이 제품의 핵심 농담이며, Phase 1 에서 분석 로직 자체가 정교해지므로 §2-2 의 "카피-로직 불일치" 우려는 해소된다. 톤 조정은 Phase 3 의 혼합형/confidence UX 도입 시점에 종합적으로 재검토한다.
- **카테고리 타이틀 이름 변경** (§7-5, §7-6)
  - `writing`: `테크니컬 라이터` → `AI 작가`
  - `design`: `UI 디자이너` → `아트 디렉터` (+ 사전에 아트 계열 신호 추가)
  - `USAGE_CATEGORIES.subtitle` 은 현행 유지 (ghostwriter / "1px 옮겨" 농담 유지)
  - `USAGE_CATEGORY_HELP` (`PersonalityView.tsx:80-90`) 의 `design` 설명에 `브랜딩/이미지 생성` 포함되도록 한 줄 보강
- 카테고리 id / emoji / color 는 변경하지 않는다 (저장된 세션 결과나 기존 차트 색상 매핑 호환 유지).

성공 기준:

- 눈에 띄는 오탐 케이스(`build` → design, `address` → feature 등) 가 실제 세션 기준으로 사라진다.
- Dashboard / PersonalityView / Wrapped 세 화면의 상위 역할이 일치한다.

### Phase 2 — 메시지 그룹 + toolUse 보조 가산 + undecided

목표: user 메시지만으로 잡히지 않는 실행 근거를 보조적으로 반영하고, 데이터가 얇을 때 결과를 강요하지 않는다.

- §4-1 의 tool alias 테이블 도입
- §5 의 메시지 그룹(user → next assistant) 빌더 추가
- §6-2 의 toolUse 보조 가산 (weight 1.5, cap 3)
- §11 의 `undecided` 상태 반환 및 UI 처리
- 반환 타입 확장

```ts
interface UsageRoleScore {
  id: string
  rawScore: number
  finalScore: number
  share: number
  matchedMessages: number
}

interface UsageRoleAnalysis {
  categories: UsageRoleScore[]
  undecided: boolean
  totalMessages: number
  matchedMessages: number
}
```

성공 기준:

- tool 기반 작업이 많은 세션(예: 대량 Edit) 에서 `feature` / `refactor` 구분이 Phase 1 보다 또렷해진다.
- 메시지 4개 미만 세션에서 대표 직업이 강제로 붙지 않는다.

### Phase 3 — 혼합형 / confidence / (선택) 비선형 saturation

목표: 실측 데이터로 튜닝 가능한 영역을 연다. **Phase 1·2 결과를 최소 1주 이상 관찰한 뒤 착수한다.**

- §9 혼합형 감지
- §10 confidence index (파라미터는 실측으로)
- §6-3 비선형 saturation (도입 조건 충족 시에만)
- (선택) assistant 텍스트 신호 재평가

성공 기준:

- 혼합형 표시가 사용자에게 과소·과다 노출되지 않는 범위로 파라미터가 안정된다.
- confidence low 로 표시된 결과와 high 로 표시된 결과가 수동 검토 시 납득 가능하다.

---

## 13. 이 설계의 장점

1. 단순 substring 카운트보다 설명 가능성이 높다.
2. 각 단계가 독립적으로 배포 가능해 롤백이 쉽다.
3. "왜 이 역할이 나왔는지" 를 메시지 evidence 로 역추적할 수 있다.
4. 한두 개 키워드 우연 매칭에 덜 흔들린다.
5. 혼합형 / confidence / undecided 를 자연스럽게 붙일 수 있다(Phase 3).
6. 기존 9개 역할 UI를 유지한 채 내부만 정교화한다.
7. Phase 3 매직 넘버(혼합형 threshold·confidence weight·saturation `K`)를 실측 전에 확정하지 않기 때문에, 튜닝 비용이 덜 든다. Phase 1·2 숫자도 "초기값"으로만 두고 실측 후 재조정하므로, 잘못된 수치에 프로젝트가 잠기지 않는다.

---

## 14. 이 설계의 한계

1. 여전히 규칙 기반이므로 완전한 의미 이해는 아니다.
2. 한/영 혼합 문장에서 dictionary 품질에 많이 의존한다.
3. provider 별 tool 이름 차이를 흡수하는 보정이 필요하다(§4-1).
4. assistant text 는 결과 복기이지 역할 자체가 아닐 수 있어, 이 문서는 의도적으로 가중치 0 으로 시작한다.
5. Phase 3 이전까지는 "혼합형 / confidence" 같은 UX 장치가 없어, 단일 대표 직업 + "추정" 카피 톤으로 정직성을 유지해야 한다.

---

## 15. 추천 결론

`AI 직업`은 personality 처럼 "축 기반 유형"보다는, 아래 구조가 더 맞다.

- **공통 스코어 엔진**
- **직업별 signal dictionary**
- **점진적 도입 (Phase 1 → 2 → 3)**

즉, 각 직업마다 완전히 다른 수식을 만들기보다:

> 같은 계산식 틀을 공유하고, 직업마다 어떤 신호를 얼마나 강하게 볼지만 다르게 두는 방식

이 구현/설명/튜닝 면에서 가장 현실적이다.

그리고 이 문서의 제일 중요한 원칙은 아래 한 줄이다.

> **Phase 3 숫자는 실측 전에 박지 않는다.** 혼합형 threshold, confidence weight, saturation `K` 등은 Phase 1·2 결과를 본 뒤에 결정한다. Phase 1·2 숫자(가중치·cap·undecided 임계값)는 **초기값으로 박되 실측 후 재조정**한다.

추가로, 사용자-facing copy는 아래 원칙으로 가는 것이 가장 자연스럽다.

- 제목: `내 AI의 직업`
- 설명: `AI가 자주 맡는 역할을 보여줘요`
- 결과: `가장 자주 맡은 역할은 X 쪽이에요`
- 탐색 중: `아직 탐색 중이에요`

---

## 부록 A. Phase 별 변경 요약

| 영역 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| 매칭 | 단어 경계, phrase/token/weak 3단 | 동일 | 동일 |
| 단위 | 메시지 1건 | 메시지 + 인접 toolUse | 동일 |
| 가중치 | 선형 + 그룹 cap | + toolUse 가산 (1.5) | (선택) saturation |
| assistant text | 미사용 | 미사용 | 재평가 |
| undecided | 없음 | 있음 | 있음 |
| 혼합형 | 없음 | 없음 | 있음 |
| confidence | 없음 | 없음 | 있음 |
| 로직 중복 | 제거 | - | - |
| 카피 톤 | 판정 → 추정 | - | 혼합형/confidence 카피 추가 |

---

*문서 스탬프: draft v2 / 2026-04-21*
