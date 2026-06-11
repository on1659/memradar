# 페르소나 진단 쉬운 질문지 + 직업 선택 — 구현 지시서 (Coder canonical source)

> Scout 정찰 + 오케스트레이터 구조 확정 결과. [`persona-quiz-plain-language-spec.md`](persona-quiz-plain-language-spec.md)의 후속 구현 사양.
> **이 문서의 §6 진술 콘텐츠는 canonical source다.** Coder는 §6을 JSON·TS 두 파일에 **verbatim 복사**한다(드리프트는 동기화 테스트가 잡는다).

## 0. 트리아지 / 하네스

`[트리아지: COMPLEX]` — 저장 스키마 bump + 진술 사전 구조 변경(CLI·테스트 3곳 파급) + 새 입력 모델(직업 선택). Scout(완료) → Coder → Reviewer → QA.

## 1. 확정 구조 — 진술 사전 v2 (Shape: general at `statements`, jobs under `lenses`)

기존 `statements` 필드를 **general 렌즈**로 그대로 유지하고(= CLI가 측정하는 baseline), 직군별 렌즈를 새 `lenses` 필드에 추가한다. 이 형태를 택한 이유: CLI 코어 경로(`data.statements[id]`)가 거의 안 바뀌고(version 게이트만), 기존 `eval-sharpness.test.mts`의 `Object.keys(statements).length===9` 단언이 그대로 통과 → 파급·리스크 최소(검수 가능성·롤백 가능성 근거).

```jsonc
{
  "version": 2,
  "language": "ko",
  "statements": { /* general — 필수, 9카테고리×5. CLI sharpness가 이걸 측정 */ },
  "lenses": {
    "developer": { /* 9카테고리×5 (full) */ },
    "pm":        { /* 9카테고리×5 */ },
    "designer":  { /* 9카테고리×5 */ },
    "data":      { /* 9카테고리×5 */ }
  }
}
```

- 카테고리 id 9개 **불변**: `feature, debug, refactor, review, writing, design, devops, data, test`.
- general(`statements`)은 항상 full. 직군 렌즈도 본 지시서에선 모두 full로 제공하지만, **resolve 시 per-category 방어 폴백**(렌즈에 특정 카테고리 누락 시 general 사용)을 둔다.
- `general`은 `lenses`에 중복 넣지 않는다(= `statements`가 general). 직업키 `"general"` 선택 시 `statements` 사용.

## 2. 진술 resolve 로직 (신규)

`src/data/personaStatements.ts`에 추가:

```ts
export type JobLens = 'developer' | 'pm' | 'designer' | 'data' | 'general'

export const JOB_LENSES: ReadonlyArray<JobLens> =
  ['developer', 'pm', 'designer', 'data', 'general']

export interface PersonaStatementsFile {
  version: number
  language: string
  statements: Record<string, string[]>            // general
  lenses?: Record<string, Record<string, string[]>> // 직군별 (부분 가능)
}

/** 직군 → 카테고리별 진술 풀. 렌즈 없거나 카테고리 누락 시 general 폴백(regression 0). */
export function resolveStatements(
  file: PersonaStatementsFile,
  job: JobLens,
): Record<string, string[]> {
  if (job === 'general' || !file.lenses?.[job]) return file.statements
  const lens = file.lenses[job]!
  const out: Record<string, string[]> = {}
  for (const id of Object.keys(file.statements)) {
    out[id] = lens[id] ?? file.statements[id]!
  }
  return out
}
```

- `JobLens` 타입은 **`personaQuiz.ts`로 옮기지 말 것** 충돌 방지: `QuizState.job`이 이 타입을 쓰므로, **`JobLens`는 `personaQuiz.ts`에 정의**하고 `personaStatements.ts`가 import 한다(데이터→로직 단방향). → 아래 §3에서 `personaQuiz.ts`에 `JobLens` 정의. `personaStatements.ts`는 `import type { JobLens } from '../lib/personaQuiz'`.

## 3. personaQuiz.ts 변경

- `export type JobLens = 'developer' | 'pm' | 'designer' | 'data' | 'general'` 추가.
- `PERSONA_QUIZ_VERSION = 1` → **`= 2`**.
- `QuizState`에 `job: JobLens` 필드 추가:
  ```ts
  export interface QuizState {
    version: number
    job: JobLens          // 신규
    ts: string
    seed: number
    answers: Answer[]
    calibration: Calibration
    finalDistribution: Record<CategoryId, number>
  }
  ```
- **보정 함수 3종(`computeCalibration`/`applyCalibration`/`applyCalibrationOverUniverse`)·`generateBalancedPairs`·`normalizeTopShare` 로직 무변경.** 직군은 표시 어휘만 바꾼다.

## 4. 저장 v1→v2 마이그레이션 (personaQuizStorage.ts)

신규 키 read-through 마이그레이션. 데이터 안전·하위호환 명확.

```ts
const STORAGE_KEY = 'memradar.personaQuiz.v2'   // 신규
const LEGACY_KEY_V1 = 'memradar.personaQuiz.v1' // 구
const VALID_JOBS = new Set<JobLens>(['developer','pm','designer','data','general'])

function isJob(v: unknown): v is JobLens {
  return typeof v === 'string' && VALID_JOBS.has(v as JobLens)
}
```

`loadPersonaQuiz()` 절차:
1. `STORAGE_KEY`(v2) 읽어 파싱 → version===2 & job 유효 & 기존 필드 유효면 그대로 반환.
2. v2 없거나 무효면 `LEGACY_KEY_V1` 읽어 파싱:
   - 기존 v1 검증(version===1, ts/seed/answers/calibration/finalDistribution) 통과 시 → `job='general'`로 마이그레이션한 `QuizState`(version:2) 구성.
   - 마이그레이션 성공하면 v2 키에 write-through(`savePersonaQuiz`) → 그 다음 LEGACY 키 제거 시도(실패 무시). write 실패해도 in-memory 반환은 유지(보정은 부가 기능, regression 0).
3. 둘 다 없거나 무효 → null.

`savePersonaQuiz(state)`: v2 키에 저장(version:2, job 포함). `clearPersonaQuiz()`: v2 + LEGACY 키 **둘 다** 제거.

- 검증 함수(`isAnswer`/`isCalibration`/`isFinalDistribution`)는 재사용. v1 페이로드엔 `job`이 없으므로 v1 경로에서는 job 검증 생략하고 general 주입.
- **외부 전송 0 불변 유지** — localStorage만.

## 5. PersonaQuizView.tsx 변경 (intro 직업 선택)

- 상위 컴포넌트 상태에 `const [job, setJob] = useState<JobLens>('general')` 추가(기본 general = 가장 포괄적·무가정 기본값).
- `pairs` 생성 시 resolve된 진술 사용:
  ```ts
  const statementsForJob = useMemo(
    () => resolveStatements(PERSONA_STATEMENTS, job), [job])
  // generateBalancedPairs(CATEGORY_IDS, statementsForJob, seed)
  ```
  job 변경 시 pairs 재생성(intro에서 고르므로, `startQuiz`에서 최종 job 기준으로 pairs 셋업하는 흐름 권장). seed/pairs 관계 유지.
- `IntroPhase`에 직업 선택 UI(칩/버튼 그룹) 추가. props로 `job`, `onJobChange`, `isKorean` 전달.
- **직업 라벨(사용자 본인 직군) 노출 OK. 측정 카테고리 id/title/subtitle 노출 절대 금지**(바넘 무결성, 기존 `QuizPhase` 원칙 동일).
- `finish`에서 `QuizState`에 `job` 포함하여 저장:
  ```ts
  const state: QuizState = {
    version: PERSONA_QUIZ_VERSION, job, ts: ..., seed: usedSeed,
    answers: finalAnswers, calibration, finalDistribution,
  }
  ```
- `restart`도 현재 job 유지하여 pairs 재생성.

### 직업 선택지 라벨 (id → 표시)
| job key | 한국어 | English |
|---|---|---|
| `developer` | 개발자 | Developer |
| `pm` | 기획·PM | Product / PM |
| `designer` | 디자이너 | Designer |
| `data` | 데이터·분석 | Data / Analytics |
| `general` | 기타(일반) | Other |

표시 순서: 개발자 → 기획·PM → 디자이너 → 데이터·분석 → 기타(일반). 기본 선택 `general`.
IntroPhase 카피에 "당신의 직업은?"(KO) / "What's your role?"(EN) 라벨 추가. DESIGN-GUIDE 칩 스타일(rounded-full, border, accent on selected) 따름. 선택 칩에 카테고리 id 미노출.

## 6. CLI 변경 (scripts/eval-sharpness.mts)

- `StatementsFile`에 `lenses?: Record<string, Record<CategoryId, string[]>>` 추가.
- `loadStatements`: `data.version !== 1` 게이트 → **`data.version !== 1 && data.version !== 2`** 로 완화(둘 다 허용; 파일은 v2가 됨). `statements`(general) 검증은 기존대로(각 ≥2, 빈 문자열 금지). `lenses` 있으면 각 렌즈의 존재 카테고리에 대해 동일 검증(부분 허용이므로 키 집합 강제는 하지 않되, 존재하는 배열은 ≥2·비빈 검증).
- 반환 객체에 `lenses` 포함.
- **(권장·선택) `--lens <key>` 플래그**: 기본 `general`. 지정 시 해당 렌즈를 general 위에 per-category 폴백 resolve하여 측정 → 직군 렌즈도 sharpness(L-2) 측정 가능(검수 가능성 근거). 미지정 시 기존과 동일(general 측정). resolve 로직은 CLI 내부에 동일 구현(앱과 중복 불가피 — `src/data`는 node script에서 import 지양). `parseArgs`에 `lens` 추가, `--help` 갱신.
- 코어 `generatePairs`/`computeStats`/리포트 로직 무변경.

## 7. 테스트 변경/추가

### 7-1. tests/persona-quiz.test.mts — 동기화 가드 확장
- 기존 verbatim 비교(version·language·statements 키집합·각 배열) 유지하되 **version 기대값 2**.
- **`lenses` 추가 비교**: TS 복제본의 `PERSONA_STATEMENTS.lenses`와 JSON `origin.lenses`를 deep 비교(렌즈 키 집합 + 각 렌즈의 카테고리별 배열 verbatim). 한쪽만 있으면 실패.
- 신규 테스트:
  - `resolveStatements(general)` === statements.
  - `resolveStatements('developer')` 가 developer 렌즈 카테고리는 렌즈값, 누락 카테고리는 general 폴백.
  - `resolveStatements(미지의 job)`/렌즈 없는 job → general.

### 7-2. tests/eval-sharpness.test.mts
- "실제 진술 사전 파일 로드 성공": `data.version` 기대값 **1 → 2**. `Object.keys(statements).length===9` 유지.
- (선택, --lens 구현 시) lens resolve 측정 경로 단위 테스트 1~2개.

### 7-3. 저장 마이그레이션 테스트 (persona-quiz.test.mts에 섹션 추가)
- v2 저장→로드 라운드트립(job 포함) 일치.
- **v1 페이로드 주입 → loadPersonaQuiz가 job='general'·version 2로 마이그레이션 로드(regression 0)**, finalDistribution 보존.
- v2 부재 + v1 부재 → null.
- 무효 job 값 → 거부(null) 또는 general 정규화(택1, 테스트로 고정). **권장: v2 페이로드의 job 무효 시 null**(스키마 엄격), v1 경로는 job 없음이 정상이라 general 주입.
- 마이그레이션 후 write-through로 v2 키 생성 확인(localStorage mock).
- localStorage mock 필요: 기존 테스트에 mock 있으면 재사용, 없으면 최소 in-memory Storage shim 작성.

## 8. 진술 콘텐츠 — CANONICAL (verbatim 복사 대상)

> 아래를 JSON `statements`/`lenses`와 TS `PERSONA_STATEMENTS`에 **글자 그대로** 복사. 따옴표 안 텍스트만 진술. 카테고리 순서: feature, debug, refactor, review, writing, design, devops, data, test.

### 8-1. general (= `statements`, 일반인 쉬운 표현)

**feature**
1. 머릿속 아이디어를 새로 만들어 달라고 자주 시킨다
2. 있는 걸 고치기보다 없던 걸 새로 만드는 게 더 신난다
3. 빈 화면에서 처음부터 시작하는 게 즐겁다
4. 어떻게 굴러갈지 모르는 새것을 만들 때 가장 몰입한다
5. 새 화면이나 새 기능을 더 자주 부탁하는 편이다

**debug**
1. 안 되는 게 있으면 원인을 찾을 때까지 붙잡는다
2. 문제가 왜 생겼는지 파고드는 데 시간 가는 줄 모른다
3. 에러 메시지를 보면 먼저 원인부터 추적한다
4. 되게 만드는 것보다 왜 안 됐는지 밝히는 데 더 끌린다
5. 어떻게 하면 그 문제가 다시 나타나는지 재현해 본다

**refactor**
1. 이미 잘 되는 것도 더 깔끔하게 다듬고 싶어진다
2. 비슷한 게 여기저기 흩어져 있으면 하나로 모으고 싶다
3. 겉보기 결과가 똑같아도 속을 정리하는 일에 가치를 둔다
4. 이름이나 순서를 더 알아보기 쉽게 바꾸는 데 시간을 쓴다
5. 새것을 만드는 것보다 기존 걸 정돈하는 게 급할 때가 있다

**review**
1. 남이 만든 걸 살펴보고 고칠 점을 짚어 주는 게 즐겁다
2. 결과물에 의견이나 코멘트를 길게 남기는 편이다
3. 다른 사람이 왜 이렇게 했는지 의도를 파악하는 게 흥미롭다
4. 직접 만들기보다 만들어진 걸 검토하는 역할이 더 맞는다
5. 다 같이 기준을 맞추는 이야기에 관심이 많다

**writing**
1. 만드는 시간만큼 설명을 글로 쓰는 데 시간을 들인다
2. 안내문·설명서·정리 글 쓰는 걸 자주 맡긴다
3. 말로 하기보다 글로 정리하면 머리가 맑아진다
4. 짧은 메모보다 제대로 된 문서를 남기려 한다
5. 결과물 자체보다 그걸 설명하는 글에 더 신경 쓸 때가 있다

**design**
1. 보기 좋고 쓰기 편한 화면을 자주 신경 쓴다
2. 간격·정렬·색이 어긋나면 눈에 거슬려 손본다
3. 기능이 되더라도 모양이 마음에 안 들면 계속 만진다
4. 글자 크기나 위치를 1mm 단위로 맞추는 데 시간을 쓴다
5. 내용보다 첫인상·분위기가 더 신경 쓰일 때가 있다

**devops**
1. 결과물을 실제로 올리고 배포하는 일을 자주 한다
2. 반복되는 작업을 자동으로 돌아가게 만드는 게 즐겁다
3. 올리는 과정이 빨라지고 매끄러워지면 기분이 좋다
4. 잘 돌아가고 있는지 상태나 기록을 자주 들여다본다
5. 만드는 일보다 안정적으로 운영되게 하는 데 더 끌린다

**data**
1. 숫자나 데이터를 뽑아서 정리하는 일을 자주 시킨다
2. 흩어진 자료에서 규칙이나 흐름을 찾는 게 즐겁다
3. 느낌보다 숫자로 확인해야 마음이 놓인다
4. 표나 목록을 원하는 형태로 바꾸는 데 시간 가는 줄 모른다
5. 결과를 통계나 수치로 정리하는 데 끌린다

**test**
1. 제대로 동작하는지 하나하나 확인하고 점검한다
2. 만든 것만큼 확인·점검에 시간을 들인다
3. 이럴 때는 어떻게 되지? 하는 예외 상황을 자주 떠올린다
4. 점검 없이 넘어간 건 영 불안하다
5. 새로 만드는 것보다 빈틈없이 확인하는 역할이 더 맞는다

### 8-2. lenses.developer (개발자 — 기존 전문 어휘 유지·정제)

**feature**
1. 처음부터 새로 짜는 작업이 가장 즐겁다
2. 기존 코드를 고치기보다 새 기능 만들기를 선호한다
3. 빈 파일에서 scratch로 시작하는 게 편하다
4. 0→1이 1→N보다 흥미롭다
5. 새 모듈·페이지를 만들 때 가장 몰입한다

**debug**
1. 스택 트레이스를 끝까지 읽는 게 익숙하다
2. 버그 원인을 찾는 데 시간 가는 줄 모른다
3. 재현 가능한 최소 케이스를 만드는 걸 좋아한다
4. 에러 메시지를 보면 본능적으로 추적부터 시작한다
5. 안 되는 이유를 끝까지 파헤친다

**refactor**
1. 이미 동작하는 코드도 더 나아질 여지를 본다
2. 중복 제거에 묘한 만족감을 느낀다
3. 변수명·구조를 다듬는 데 시간 쓰는 게 아깝지 않다
4. 동작이 그대로인 정리 작업도 가치 있다고 본다
5. 코드 정리가 새 기능보다 더 시급할 때가 있다

**review**
1. 남이 짠 코드를 읽고 피드백 주는 게 즐겁다
2. PR 리뷰 코멘트를 길게 쓰는 편이다
3. 코딩 스타일 합의에 관심이 많다
4. 다른 사람 코드의 의도를 파악하는 게 흥미롭다
5. 직접 짜기보다 리뷰하는 역할이 더 맞는다

**writing**
1. 코드 짜는 시간만큼 문서 쓰는 시간을 들인다
2. README·CHANGELOG에 신경을 많이 쓴다
3. 주석보다 설명 글을 더 길게 쓰는 편이다
4. 설계 문서를 직접 쓰는 게 편하다
5. 글로 설명하면 머리가 정리된다

**design**
1. UI를 픽셀 단위로 조정하는 데 시간 쓰는 게 아깝지 않다
2. Figma·CSS 만지는 게 즐겁다
3. 여백·정렬·색감을 자주 신경 쓴다
4. 기능보다 모양이 더 신경 쓰일 때가 있다
5. 디자인 톤이 안 맞으면 작업이 진행 안 된다

**devops**
1. 배포 파이프라인 다듬는 데 시간 쓰는 걸 마다하지 않는다
2. CI/CD가 빨라지면 기분이 좋다
3. 인프라 설정 다듬는 게 흥미롭다
4. yaml·shell 스크립트 쓰는 게 편하다
5. 로그·메트릭을 자주 들여다본다

**data**
1. 쿼리·필터링 작업에서 시간 가는 줄 모른다
2. SQL로 데이터를 뽑는 게 익숙하다
3. 데이터에서 패턴 찾는 게 즐겁다
4. 스프레드시트·노트북으로 분석하는 게 편하다
5. 수치·통계가 끌린다

**test**
1. 테스트 코드 쓰는 시간을 본 작업만큼 들인다
2. TDD가 자연스럽다
3. 엣지 케이스를 떠올리는 게 즐겁다
4. 픽스처·목 데이터를 만드는 데 정성을 들인다
5. 테스트 안 깔린 코드는 불안하다

### 8-3. lenses.pm (기획·PM)

**feature**
1. 새 기능·서비스를 기획해 달라고 자주 요청한다
2. 개선보다 없던 걸 새로 기획하는 게 더 신난다
3. 빈 문서에서 새 기획을 시작하는 게 즐겁다
4. 검증 안 된 새 아이디어를 구체화할 때 가장 몰입한다
5. 기존 운영보다 새 기획에 더 끌린다

**debug**
1. 지표가 이상하면 원인을 찾을 때까지 파고든다
2. 사용자 불만의 진짜 원인을 추적하는 데 시간 가는 줄 모른다
3. 문제가 보고되면 먼저 원인부터 따져 본다
4. 해결책보다 왜 그 문제가 생겼는지에 더 끌린다
5. 같은 문제가 다시 나는 조건을 끝까지 밝힌다

**refactor**
1. 이미 굴러가는 프로세스도 더 깔끔하게 정리하고 싶다
2. 중복된 문서·업무를 하나로 합치는 데 만족을 느낀다
3. 결과는 같아도 일하는 방식을 정돈하는 데 가치를 둔다
4. 용어·기준을 알아보기 쉽게 다듬는 데 시간을 쓴다
5. 새 기획보다 기존 프로세스 정리가 급할 때가 있다

**review**
1. 남이 만든 기획서·산출물을 검토하고 짚어 주는 게 즐겁다
2. 리뷰 코멘트를 길게 남기는 편이다
3. 왜 그렇게 결정했는지 의도를 파악하는 게 흥미롭다
4. 직접 만들기보다 검토하는 역할이 더 맞는다
5. 팀의 기준을 맞추는 논의에 관심이 많다

**writing**
1. 기획서·회의록 쓰는 데 시간을 많이 들인다
2. 결정 사항을 문서로 꼼꼼히 남긴다
3. 말보다 글로 정리하면 머리가 맑아진다
4. 짧은 메모보다 제대로 된 문서를 남기려 한다
5. 산출물보다 그걸 설명하는 문서에 더 신경 쓸 때가 있다

**design**
1. 사용자가 쓰기 편한 화면 흐름을 자주 신경 쓴다
2. 화면 구성이나 동선이 어색하면 계속 손본다
3. 기능이 되더라도 사용 경험이 안 좋으면 마음에 안 든다
4. 버튼 위치·문구를 세세하게 맞추는 데 시간을 쓴다
5. 내용보다 첫인상·사용감이 더 신경 쓰일 때가 있다

**devops**
1. 기능을 실제로 출시하고 배포하는 일을 챙긴다
2. 반복되는 운영 업무를 자동화하는 게 즐겁다
3. 출시 과정이 매끄러워지면 기분이 좋다
4. 출시 후 지표·상태를 자주 들여다본다
5. 기획보다 안정적으로 운영되게 하는 데 더 끌린다

**data**
1. 지표·데이터를 뽑아 분석해 달라고 자주 요청한다
2. 데이터에서 사용자 행동의 흐름을 찾는 게 즐겁다
3. 느낌보다 숫자로 확인해야 마음이 놓인다
4. 데이터를 원하는 형태의 리포트로 바꾸는 데 몰입한다
5. 결과를 지표·통계로 정리하는 데 끌린다

**test**
1. 출시 전에 하나하나 확인·검수하는 걸 챙긴다
2. 기획만큼 검수에 시간을 들인다
3. 이럴 때는 어떻게 되지? 하는 예외 상황을 자주 떠올린다
4. 검수 없이 넘어간 건 영 불안하다
5. 새 기획보다 빈틈없이 점검하는 역할이 더 맞는다

### 8-4. lenses.designer (디자이너)

**feature**
1. 새 화면·새 컨셉을 처음부터 만들어 달라고 자주 요청한다
2. 기존 걸 다듬기보다 새 디자인을 시작하는 게 더 신난다
3. 빈 화면에서 새 시안을 시작하는 게 즐겁다
4. 정해진 게 없는 새 컨셉을 잡을 때 가장 몰입한다
5. 운영보다 새 시안 작업에 더 끌린다

**debug**
1. 디자인이 깨져 보이면 원인을 찾을 때까지 붙잡는다
2. 왜 어색해 보이는지 원인을 파고드는 데 시간 가는 줄 모른다
3. 이상해 보이는 화면은 먼저 원인부터 따진다
4. 새로 만들기보다 어긋난 걸 바로잡는 데 더 끌린다
5. 어떤 조건에서 깨지는지 끝까지 확인한다

**refactor**
1. 이미 괜찮은 화면도 더 깔끔하게 다듬고 싶어진다
2. 제각각인 간격·스타일을 하나로 통일하는 데 만족을 느낀다
3. 보이는 건 그대로여도 구성 요소를 정돈하는 데 가치를 둔다
4. 이름·레이어를 알아보기 쉽게 정리하는 데 시간을 쓴다
5. 새 시안보다 기존 디자인 정리가 급할 때가 있다

**review**
1. 남의 디자인을 살펴보고 고칠 점을 짚어 주는 게 즐겁다
2. 피드백을 자세히 남기는 편이다
3. 왜 이렇게 디자인했는지 의도를 파악하는 게 흥미롭다
4. 직접 그리기보다 리뷰하는 역할이 더 맞는다
5. 팀의 디자인 기준을 맞추는 논의에 관심이 많다

**writing**
1. 디자인 의도를 설명하는 글을 쓰는 데 시간을 들인다
2. 가이드·설명 문서를 자주 남긴다
3. 말보다 글로 정리하면 머리가 맑아진다
4. 짧은 메모보다 제대로 된 가이드를 남기려 한다
5. 시안보다 그걸 설명하는 글에 더 신경 쓸 때가 있다

**design**
1. 여백·정렬·색을 1px 단위로 맞추는 데 시간 쓰는 게 아깝지 않다
2. 톤이나 색감이 안 맞으면 작업이 진행이 안 된다
3. 글자 크기·자간까지 세세하게 신경 쓴다
4. 기능이 되더라도 모양이 마음에 안 들면 계속 만진다
5. 내용보다 분위기·완성도가 더 신경 쓰일 때가 있다

**devops**
1. 완성한 디자인을 실제 제품에 반영·배포하는 걸 챙긴다
2. 반복되는 작업을 컴포넌트·템플릿으로 자동화하는 게 즐겁다
3. 전달·반영 과정이 매끄러워지면 기분이 좋다
4. 반영된 화면이 잘 나오는지 자주 들여다본다
5. 새 시안보다 안정적으로 운영되게 하는 데 더 끌린다

**data**
1. 사용 데이터를 뽑아 디자인 결정에 쓰는 걸 자주 요청한다
2. 데이터에서 사용 패턴을 찾는 게 즐겁다
3. 느낌보다 숫자로 확인해야 마음이 놓인다
4. 데이터를 보기 좋은 표·그래프로 바꾸는 데 몰입한다
5. 결과를 수치로 정리하는 데 끌린다

**test**
1. 여러 화면·기기에서 제대로 보이는지 하나하나 확인한다
2. 시안 만드는 만큼 검수에 시간을 들인다
3. 이 경우엔 어떻게 보이지? 하는 예외 상황을 자주 떠올린다
4. 확인 안 하고 넘어간 화면은 영 불안하다
5. 새로 그리기보다 빈틈없이 점검하는 역할이 더 맞는다

### 8-5. lenses.data (데이터·분석)

**feature**
1. 새 분석·새 대시보드를 처음부터 만들어 달라고 자주 요청한다
2. 기존 걸 고치기보다 새 분석을 시작하는 게 더 신난다
3. 빈 노트북에서 처음부터 분석을 시작하는 게 즐겁다
4. 답이 안 보이는 새 질문을 파고들 때 가장 몰입한다
5. 운영보다 새 분석 작업에 더 끌린다

**debug**
1. 숫자가 이상하면 원인을 찾을 때까지 붙잡는다
2. 데이터가 안 맞는 이유를 파고드는 데 시간 가는 줄 모른다
3. 이상치가 보이면 먼저 원인부터 추적한다
4. 새 분석보다 틀어진 데이터를 바로잡는 데 더 끌린다
5. 어떤 조건에서 그 오류가 나는지 끝까지 밝힌다

**refactor**
1. 이미 돌아가는 분석도 더 깔끔하게 정리하고 싶어진다
2. 중복된 쿼리·표를 하나로 합치는 데 만족을 느낀다
3. 결과는 같아도 분석 과정을 정돈하는 데 가치를 둔다
4. 컬럼명·구조를 알아보기 쉽게 다듬는 데 시간을 쓴다
5. 새 분석보다 기존 데이터 정리가 급할 때가 있다

**review**
1. 남의 분석을 살펴보고 고칠 점을 짚어 주는 게 즐겁다
2. 리뷰 코멘트를 자세히 남기는 편이다
3. 왜 이렇게 분석했는지 의도를 파악하는 게 흥미롭다
4. 직접 분석하기보다 검토하는 역할이 더 맞는다
5. 팀의 분석 기준을 맞추는 논의에 관심이 많다

**writing**
1. 분석 결과를 설명하는 리포트를 쓰는 데 시간을 들인다
2. 결과를 문서로 꼼꼼히 남긴다
3. 말보다 글로 정리하면 머리가 맑아진다
4. 짧은 메모보다 제대로 된 리포트를 남기려 한다
5. 분석 자체보다 그걸 설명하는 글에 더 신경 쓸 때가 있다

**design**
1. 보기 좋고 읽기 쉬운 그래프·표를 자주 신경 쓴다
2. 축·색·간격이 어수선하면 눈에 거슬려 손본다
3. 결과가 맞아도 차트가 안 예쁘면 계속 만진다
4. 라벨 위치·글자 크기를 세세하게 맞추는 데 시간을 쓴다
5. 내용보다 첫인상·가독성이 더 신경 쓰일 때가 있다

**devops**
1. 분석 결과가 자동으로 갱신되게 파이프라인을 만드는 걸 챙긴다
2. 반복되는 집계를 자동화하는 게 즐겁다
3. 데이터 갱신 과정이 매끄러워지면 기분이 좋다
4. 데이터가 제때 잘 들어오는지 자주 들여다본다
5. 분석보다 안정적으로 돌아가게 하는 데 더 끌린다

**data**
1. 숫자·데이터를 뽑아 정리하는 일에서 시간 가는 줄 모른다
2. 흩어진 자료에서 규칙·흐름을 찾는 게 즐겁다
3. 느낌보다 숫자로 확인해야 마음이 놓인다
4. 데이터를 원하는 형태로 가공하는 데 몰입한다
5. 결과를 통계·수치로 정리하는 데 끌린다

**test**
1. 분석이 맞는지 데이터를 하나하나 검증한다
2. 분석만큼 검증에 시간을 들인다
3. 이 값이 틀리면 어떻게 되지? 하는 예외를 자주 떠올린다
4. 검증 안 하고 낸 숫자는 영 불안하다
5. 새 분석보다 빈틈없이 검증하는 역할이 더 맞는다

## 9. 불변조건 (위반 금지)

- `src/lib/usageProfile.ts` / `src/lib/personality.ts` 무변경. 9카테고리 id·개수 무변경.
- 보정 함수 3종 + `generateBalancedPairs` + `normalizeTopShare` 로직 무변경.
- 진술 원본(JSON) ↔ 번들 복제본(TS) **verbatim 동기화** — §8 콘텐츠를 양쪽에 동일 복사.
- 측정 중(QuizPhase) 카테고리 id/라벨 노출 0. 직업 선택 칩엔 직군 라벨만(카테고리 미노출).
- `finalDistribution` 저장 계약 유지(Dashboard/WrappedView 소비).
- 외부 네트워크 전송 0 — localStorage만.
- Wrapped 8장 구조·순서 무변경, `ToolsSlide.tsx` import 금지(이 작업과 무관하나 확인).
- 모든 경로 절대 경로로 응답 표기.

## 10. 수용 기준 (Done When)

- [ ] general 9×5가 전문용어 없이 일반인이 이해 가능 + 구체·변별 가능(바넘 아님).
- [ ] intro에 "당신의 직업은?" 선택, 고른 직군 눈높이 문장 표시. general 선택 시 일반판.
- [ ] 직업 선택·진술에 측정 카테고리 id/라벨 노출 0.
- [ ] 보정 결과는 여전히 9카테고리 매핑(직군은 어휘만).
- [ ] 저장 v2 + `job`, v1 결과 하위호환 로드(regression 0).
- [ ] 진술 원본↔복제본 verbatim 동기화 테스트(렌즈 포함) 통과.
- [ ] `npm run test:sharpness` 통과, `npm run test:persona` 통과(+직군·마이그레이션 신규 테스트).
- [ ] `npm run test:harness` 전체 그린.
- [ ] DevTools Network 외부 호출 0(QA).
