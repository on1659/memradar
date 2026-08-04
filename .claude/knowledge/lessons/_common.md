# 공통 lessons

영역에 묶이지 않는 함정/실수 메모.

추가 형식:

```
## L-{번호}: {1줄 요약}
- **언제 만났나**: {날짜 + 컨텍스트}
- **함정**: X 누락 시 Y 발생
- **회피**: 다음에 어떻게 할지
- **연관 파일/함수**: 경로
```

---

## L-1: 고정 다크 배경 위에는 `text-text` 토큰 금지

- **언제 만났나**: 2026-05-08, paper 테마 제보 — DropZone 첫 화면 다크 터미널 박스(`bg-[#0c1220]`) 안 텍스트가 안 보임
- **함정**: `bg-[#0c1220]` 처럼 **테마 토큰을 거치지 않는 inline-hex 다크 박스** 안에 `text-text/55` 같은 테마 토큰을 그대로 쓰면, paper/light 테마에서 토큰이 어두운 색(`#726756`/`#5f6b7d`)으로 풀려 다크 배경 위 어두운 글자가 된다. 가독성 0. dark/night 테마에서만 검증하면 빠뜨리기 쉬움.
- **회피**: 고정 다크 영역 안에서는 **항상 `text-white/{55,72,85,...}` 흰색 알파 톤** 사용. 의미 색(`text-accent`, `text-green`)은 OK. 검증은 paper 테마로 — 가장 밝은 배경의 토큰이 가장 큰 격차를 만든다. 자세한 가이드: [DESIGN-GUIDE §5.8](../../../docs/DESIGN-GUIDE.md).
- **예외**: Wrapped 슬라이드 (`.wrapped-surface` 컨테이너가 토큰 자체를 라이트 톤으로 덮어쓰므로 `text-text-bright` 등을 그대로 써도 됨)
- **연관 파일/함수**: `src/components/DropZone.tsx:CopyCommand`, `src/index.css` `.wrapped-surface`

## L-2: ReactMarkdown 본문 wrapper에는 `break-words` 필수

- **언제 만났나**: 2026-05-16, SessionView 메시지 본문에서 사용자가 보낸 공백 없는 긴 문자열(`vvvv...` 약 100자)이 메시지 버블 컨테이너 밖으로 튀어나옴
- **함정**: Tailwind 기본은 `overflow-wrap: normal` 이라 공백 없는 단일 토큰은 줄바꿈되지 않는다. `<p>` `<li>` 등 mdComponents 안 요소만 스타일링하고 wrapper에 줄바꿈 규칙을 안 주면, 사용자가 키 반복·base64·긴 URL·해시 등을 붙여넣는 순간 레이아웃이 깨진다. 한국어 텍스트만 테스트하면 발견 못 함.
- **회피**: ReactMarkdown wrapper div에 `break-words` (= `overflow-wrap: break-word`) 추가. `pre`/`code`/`table` 처럼 정렬이 의미를 갖는 블록은 기존 `overflow-x-auto`로 가로 스크롤 처리(잘리면 의미 손실)이므로 wrapper 레벨 `break-words`와 충돌하지 않는다. 사용자 입력을 받는 모든 마크다운 표면에 동일 패턴 적용.
- **연관 파일/함수**: `src/components/SessionView.tsx:MessageContent`, `src/components/markdown.tsx:mdComponents`

## L-3: 설계 문서·스펙의 "스크립트 용도" 기술을 코드 검증 없이 신뢰하지 말 것

- **언제 만났나**: 2026-05-22, AI 역할 평가 Stage 0 정찰 — `generate-eval-samples.mts`가 v3 스펙 §12와 `AI-ROLE-EVAL-EXECUTION-PLAN.md` 현황표에 "외부 API 블라인드 생성기"로 적혀 있었으나, 실제는 외부 호출이 전혀 없는 정적 키워드 조합 생성기였다. 진짜 외부 API 생성기는 `-zai.mts` 하나뿐이었다.
- **함정**: 설계 문서·스펙이 스크립트의 *의도/계획*을 적어두면, 그 스크립트가 다르게 구현되거나 처음부터 다르게 만들어져도 문서는 갱신되지 않은 채 남는다. 파일명(`generate-...`)이나 문서 설명만 보고 지시서를 쓰면, 존재하지 않는 도구 경로(예: Codex CLI 자격증명)를 전제한 작업 계획이 나온다.
- **회피**: 정찰 시 스크립트의 실제 역할은 파일명·문서가 아니라 코드에서 직접 확인한다. "외부 API를 부르는가"는 `fetch`/API 클라이언트 import/`process.env` 키 사용 여부를 grep해 import·호출부로만 판정. 문서는 출발점, 코드가 진실.
- **연관 파일/함수**: `scripts/generate-eval-samples.mts`(정적), `scripts/generate-eval-samples-zai.mts`(실제 외부 API), `docs/AI-ROLE-EVAL-SAMPLES-SPEC.md` §12

## L-4: `import.meta.url`을 `new URL().pathname`으로 변환하면 Windows에서 깨진다

- **언제 만났나**: 2026-05-22, AI 역할 평가 Stage 0 — `.mts` 스크립트 3종(`test-eval-and-report`·`validate-eval-samples`·`generate-eval-samples-zai`)이 샘플 디렉터리를 못 찾아, 샘플이 있어도 "0 samples"로 오인.
- **함정**: `new URL(import.meta.url).pathname`은 Windows에서 `/D:/Work/...` 형태(맨 앞 슬래시 + 드라이브 문자)를 돌려준다. 이 경로를 `fs.existsSync`/`readdirSync`에 그대로 넘기면 **에러 없이 조용히 false/빈 결과**가 나와 "파일이 없다"고 오판한다. POSIX에서만 테스트하면 절대 안 잡힌다.
- **회피**: Node 스크립트에서 `__dirname` 대용이 필요하면 항상 `import { fileURLToPath } from 'node:url'` → `fileURLToPath(import.meta.url)`. `new URL().pathname`은 경로 용도로 쓰지 말 것.
- **연관 파일/함수**: `scripts/test-eval-and-report.mts`, `scripts/validate-eval-samples.mts`, `scripts/generate-eval-samples-zai.mts`

## L-5: 0~1 분수와 백분율을 한 파일에서 혼용하면 출력 지점 하나를 빠뜨린다

- **언제 만났나**: 2026-05-22, AI 역할 평가 Stage 0 — `test-eval-and-report.mts`가 `accuracy`를 0~1 분수로 저장하고 콘솔·마크다운·stat-box 출력마다 `* 100`을 곱하는데, HTML 헤드라인 카드 한 곳만 누락돼 `77.8%`가 `0.8%`로 표시됨(ISSUE-001).
- **함정**: 값을 분수(0~1)로 저장하고 표시 시점에 `* 100`을 곱하는 패턴은, 출력 지점이 여러 곳이면 그중 하나를 반드시 빠뜨린다. 빠뜨려도 타입 에러가 안 나고 숫자가 그럴듯해 리뷰에서도 놓치기 쉽다.
- **회피**: 분수↔백분율 변환을 단일 헬퍼(`fmtPct(x)` 등)로 모으고 모든 출력 지점이 그것만 쓰게 한다. 변환을 출력 지점마다 인라인으로 반복하지 말 것.
- **연관 파일/함수**: `scripts/test-eval-and-report.mts` (accuracy 출력 4지점)

## L-6: `Object.freeze`는 얕은 동결 — 중첩 배열/객체는 그대로 가변

- **언제 만났나**: 2026-05-22, AI 역할 평가 Stage 0 — `usageProfile.ts`의 `CATEGORY_SIGNALS` export를 JSDoc에 "read-only"라 적었으나 `Object.freeze`만 써서 내부 `phraseStrong` 배열은 여전히 `push` 가능했다.
- **함정**: `Object.freeze(obj)`는 최상위 프로퍼티만 동결한다. 중첩 배열·객체는 가변인 채로 남아 "read-only 공개"라는 문서 주장과 런타임이 어긋난다. 게다가 export 상수가 다른 모듈의 라이브 객체를 *참조*만 하면, 소비처의 mutate가 원본(엔진 데이터 등)을 오염시킨다.
- **회피**: 중첩 구조를 read-only로 공개할 때는 (1) 깊은 복사로 원본 참조를 끊고, (2) 중첩 배열·객체까지 재귀적으로 `Object.freeze`하고, (3) 타입도 `readonly`/`Readonly<>`로 깊이까지 표현해 문서·타입·런타임을 일치시킨다.
- **연관 파일/함수**: `src/lib/usageProfile.ts:CATEGORY_SIGNALS`

## L-7: 반응형 SVG 차트에 `preserveAspectRatio="none"`을 쓰면 도형이 비등방 왜곡된다

- **언제 만났나**: 2026-06-11, 성장 섹션 차트 — 320×140 viewBox를 ~530px 카드로 스트레치하자 데이터 점 circle(r=5)이 약 17×10px 타원이 되고 stroke 굵기도 축마다 달라짐. Reviewer 단계에서 발견(major)
- **함정**: `preserveAspectRatio="none"`은 SVG 좌표계를 컨테이너에 비등방 스케일하므로, 폭이 가변인 카드 안에서는 원·점·텍스트·stroke가 전부 찌그러진다. 좁은 viewBox로 그려놓고 데스크탑에서만 확인하면 모바일/태블릿에서 왜곡 정도가 달라져 더 늦게 발견된다.
- **회피**: 라인/폴리라인에는 `vectorEffect="non-scaling-stroke"`를 주고, 점 마커·툴팁 히트 영역처럼 형태가 유지돼야 하는 요소는 SVG 밖 % 좌표 HTML 오버레이(absolute positioning)로 분리한다. 패턴 구현 예: `src/components/growth/GrowthSkillCurve.tsx`, `GrowthComplexity.tsx`.
- **연관 파일/함수**: `src/components/growth/GrowthSkillCurve.tsx`, `src/components/growth/GrowthComplexity.tsx`

## L-8: check-triage 훅은 assistant 텍스트가 transcript에 flush되지 않는 환경에서 응답 첫 줄 선언을 못 본다

> **무효 (2026-08-01)** — 트리아지 하네스 제거로 `.claude/hooks/check-triage.sh`가 삭제됐다. 아래는 기록 보존용. transcript를 grep해 assistant 선언을 검사하는 훅을 다시 만들 때 같은 함정에 빠지지 않도록 남긴다.

- **언제 만났나**: 2026-07-03, 정밀 진단+지문 신호 작업 — 응답 첫 줄에 `[트리아지: COMPLEX]`를 선언했는데도 Edit이 반복 차단됨. 원인: 이 환경의 transcript JSONL에 assistant 텍스트 블록이 도구 호출 시점까지 기록되지 않아, "마지막 user 메시지 이후" 구간에 키워드가 없었음. 도구 입력(에이전트 프롬프트/Bash description)에 키워드가 포함된 뒤에야 통과.
- **함정**: `check-triage.sh`는 transcript에서 마지막 real user 메시지 이후 내용을 grep하는데, assistant 텍스트 flush 타이밍은 하네스/호스트별로 다르다. 선언을 분명히 했는데 차단되면 "선언 형식이 틀렸나"로 오판해 시간을 낭비한다.
- **회피**: 선언했는데도 차단되면 형식을 의심하지 말고 flush 문제로 보고, 키워드가 도구 입력에 실리도록 한다(예: `echo "[트리아지: ...]"` Bash 1회 — 우회가 아니라 동일 선언의 기록 경로 보정). 근본 해결은 훅이 tool_use 입력·assistant 텍스트를 모두 보도록 개선하는 것 — 훅 수정 기회에 반영할 것.
- **연관 파일/함수**: `.claude/hooks/check-triage.sh`(L17 last_user 탐색, L25~28 grep 구간)

## L-9: Tailwind v4 자동 소스 스캔은 docs/*.md의 `\`+16진수 경로 조각을 CSS 이스케이프로 해석해 빌드를 깨뜨린다

- **언제 만났나**: 2026-07-03, QA 빌드 게이트 — `docs/goal/fix-coaching-accuracy.md`(병행 세션 산출물) 안의 Windows 스크래치패드 경로 GUID 조각 `\dc8c601c-…`를 Tailwind v4 스캐너가 unescape하다 `RangeError: Invalid code point 14453856`(=0xDC8C60)으로 `npm run build` 전체 실패. 해당 파일을 치우면 805ms에 성공.
- **함정**: Tailwind v4는 클래스 후보를 찾으려 `docs/**/*.md`까지 스캔하며, 코드펜스 안이라도 읽는다. `\` 뒤에 16진수로 시작하는 GUID/해시 경로가 있으면 CSS 이스케이프 시퀀스로 오해석돼 소스와 무관한 파일이 빌드를 깨뜨린다 — 에러 메시지에 원인 파일이 안 나와 추적이 어렵다.
- **회피**: docs에 Windows temp/스크래치패드 경로를 적을 때 `\` 구분자 + 16진수 시작 조각을 피한다 — `/` 구분자로 표기하거나 GUID 조각을 생략. 빌드가 `Invalid code point`로 깨지면 최근 추가된 .md에서 `\[0-9a-f]` 패턴부터 grep. 근본 해결 후보: vite/tailwind 설정에서 docs 디렉터리를 스캔 대상에서 제외.
- **연관 파일/함수**: `vite.config.ts`(@tailwindcss/vite), `docs/goal/*.md`

## L-10: 재구현 보드의 파생 설명 문자열은 원본과의 congruence assert가 전제일 때만 참

- **언제 만났나**: 2026-07-03, 프롬프트 코칭 정확도 수정 — `scripts/analyze-coaching.mts`의 5룰 상태 보드는 `buildPromptCoaching` 발화 조건의 의도적 재구현(마진 표시 목적)인데, 원본에 월 eligibility 로직이 추가되면서 보드의 latest/latestClaude/improving 종점 선택이 원본과 갈라질 수 있었다. 드리프트 가드 3(eligible id 집합 == 리턴 id 집합)이 같은 실행 경로에 있어 갈라짐이 즉시 assert로 잡히는 구조였고, 이번 수정에서 eligibility 판정 자체는 `isEligibleMonth` export 공유로 단일화했다.
- **함정**: 진단/리포트용 재구현 보드가 "조건 충족 ✓/✗ (margin ±N)" 같은 파생 설명 문자열을 출력하면, 그 문자열은 원본 로직과의 일치가 **assert로 강제될 때만** 참이다. 가드 없이 복제하면 원본만 수정되는 조용한 드리프트가 생겨, 보드가 실제로는 발화하지 않는 룰을 "충족"으로 설명하는 거짓 리포트가 된다 — personality-eval L-6("복제엔 가드")의 재발 사례(2회차).
- **회피**: 재구현 보드를 만들면 반드시 (1) 원본 함수 실제 리턴과 보드 판정을 deep 비교하는 congruence assert를 같은 실행 경로에 심고, (2) 공유 가능한 판정 조각(predicate·상수)은 원본 모듈에서 export해 재구현 표면적을 줄인다. assert 삭제로 통과시키는 것은 금지 (가드가 곧 계약).
- **연관 파일/함수**: `scripts/analyze-coaching.mts`(buildRuleBoard + 드리프트 가드 3), `src/lib/promptCoaching.ts`(`isEligibleMonth`, `MIN_ELIGIBLE_ACTIVE_DAYS`), 원사례 `lessons/personality-eval.md` L-6

## L-11: 지시서·문서가 하드코딩한 lesson/note 번호를 그대로 쓰면 병행 세션 추가분과 충돌한다

- **언제 만났나**: 2026-07-04, 프롬프트 코칭 작업 — 지시서가 "_common.md에 L-8 추가"라고 못박았는데 병행 세션이 이미 L-8/L-9를 추가해 둔 상태라 그대로 쓰면 번호가 겹쳤다(실제 L-10으로 배정). impl-note "#6", skill-candidate "C-002"도 같은 위험.
- **함정**: goal 문서·지시서를 쓰는 시점과 실행 시점 사이에 다른 세션이 같은 지식 파일에 항목을 추가하면, 하드코딩된 번호가 최신 상태와 어긋난다. 지시서를 곧이곧대로 따르면 중복 번호가 생기고 cross-ref가 엉킨다.
- **회피**: 지식 파일(lessons/skill-candidates)·스펙 impl-note에 항목을 추가하기 직전, 대상 파일에서 `^## L-`/`^## C-`/impl-note 최대 번호를 grep해 실제 다음 번호를 배정한다. 지시서의 번호는 "추가하라"는 신호로만 읽고, 실제 번호는 실행 시점에 결정.
- **연관 파일/함수**: `.claude/knowledge/lessons/*`, `.claude/knowledge/skill-candidates.md`, `docs/GROWTH-SECTION-SPEC.md`(impl-note 번호)

## L-12: 룰/항목 "개수" 라벨은 코드에서 파생하거나 congruence로 동시 갱신할 것

- **언제 만났나**: 2026-07-04, 코칭 칭찬 룰 추가 — 보드 룰을 5→7로 늘렸는데 주석·헤더·스펙 impl-note·ARCHITECTURE가 "6룰"로 적혀(원래 5 + 신규 2 = 7인데 사람이 잘못 셈) 진단 스크립트 자기 출력이 실제 항목 수와 어긋났다.
- **함정**: 사람이 손으로 센 개수 문자열("5룰", "6룰", "테스트 26개")은 룰/테스트를 추가할 때 코드 실제 개수와 조용히 어긋난다. 기능·가드에는 무해해 리뷰에서 놓치기 쉽지만, 진단 도구의 자기 라벨이 거짓이 되면 신뢰가 떨어진다. L-10 congruence의 "개수" 변형.
- **회피**: 개수는 가능하면 코드에서 파생(`rules.length`)해 출력한다. 문서·주석에 개수를 손으로 적어야 하면, 룰/테스트 추가를 "코드 라벨 + doc + 테스트 카운트 동시 갱신" 하나의 congruence 항목으로 묶어 체크리스트화한다.
- **연관 파일/함수**: `scripts/analyze-coaching.mts`(§4 보드 헤더), `docs/GROWTH-SECTION-SPEC.md`(헤더 테스트 개수·impl-note), `docs/ARCHITECTURE.md`, 관련 원칙 `lessons/_common.md` L-10

## L-13: 상호배타 룰 쌍이 있으면 slice(0, MAX) 절단 상한이 도달 불가능한 방어코드가 된다

- **언제 만났나**: 2026-07-04, 코칭 칭찬 룰 추가 — 룰이 상호배타 쌍(high-retry↔low-retry, low-skill↔high-skill) 3쌍 + improving 1개라 동시 최대 발화가 4개인데 MAX_INSIGHTS도 4. "5개 발화 → 4개로 절단" 테스트를 쓰려 해도 그런 입력이 구조적으로 존재하지 않는다.
- **함정**: slice(0, MAX) 류 상한을 넣고 "절단이 동작한다"는 테스트를 작성하려는데, 룰 간 상호배타 구조 때문에 동시 발화 최대치가 MAX와 같거나 작으면 절단이 실제로는 절대 트리거되지 않는다. 모르면 도달 불가능한 방어코드를 검증하려 픽스처를 억지로 만들거나, 반대로 "절단 미검증"을 결함으로 오판한다.
- **회피**: 상한을 넣을 땐 "이 상한이 실제로 트리거되는 입력이 존재하나"를 먼저 따진다. 존재하지 않으면 상한은 순수 방어코드로 문서화하고, 테스트는 "동시 최대 발화 == MAX"까지만 검증한다. 독립(비상호배타) 룰을 추가하거나 MAX를 낮추면 그때 절단 테스트가 유의미해진다.
- **연관 파일/함수**: `src/lib/promptCoaching.ts`(MAX_INSIGHTS, 상호배타 룰 쌍), `tests/prompt-coaching.test.mts`

## L-14: SVG 프레젠테이션 prop(textAnchor·dominantBaseline)을 map/삼항에서 계산하면 string widening으로 TS2322

- **언제 만났나**: 2026-07-22, 성향 육각 레이더(`PersonalityRadar.tsx`) 구현 — 6극 라벨의 `textAnchor`를 `poles.map()` 반환 객체 안에서 `Math.abs(sin)<0.001 ? 'middle' : sin>0 ? 'start' : 'end'` 삼항으로 계산했더니, `<text textAnchor={p.anchor}>` 사용부에서 TS2322. `npm run build`(tsc) 1회차에서 발견.
- **함정**: React의 SVG 프레젠테이션 attribute 타입(`textAnchor`, `dominantBaseline` 등)은 좁은 리터럴 유니온(`'start'|'middle'|'end'|...`)이다. `.map()` 반환 객체나 중간 변수에 삼항/조건으로 담으면 TS가 값을 넓은 `string`으로 추론해, JSX에 꽂는 **사용부**에서만 TS2322가 터진다 — 값 자체는 유효한 리터럴이라 런타임은 멀쩡하고, 에러 위치가 계산부가 아니라 사용부라 원인 추적이 어긋난다. eslint는 통과하고 tsc에서만 잡힌다.
- **회피**: 계산부에서 `as 'start' | 'middle' | 'end'` 명시 캐스팅하거나 삼항 결과에 `as const`. 리터럴 유니온 SVG prop을 map/변수로 우회해 담을 땐 캐스팅을 기본값으로 두고, 데이터비주얼 컴포넌트는 lint뿐 아니라 `npm run build`(tsc)까지 돌려 확인.
- **연관 파일/함수**: `src/components/PersonalityRadar.tsx`(`poles.map` anchor), 계열 lesson `_common.md` L-7(SVG 차트 비등방 왜곡)

## L-15: 양극(bipolar) 축을 레이더/다각형으로 펼칠 땐 극·값·라벨·각도 정합을 3중 검산하고 균형에 ε을 둘 것

- **언제 만났나**: 2026-07-22, 성향 육각 레이더 구현 — 3축 양극 스펙트럼(탐험가↔설계자 등, `value` 0~1)을 12시부터 시계방향 6꼭짓점으로 펼치며 우극/좌극 매핑. Reviewer가 blocker급 최우선 검증 항목으로 지목(결과는 정확), 추가로 `value=0.5`(무데이터 기본값)에서 한 축 양극이 동시 강조되는 문제를 개선 권고.
- **함정**: 양극 축(한 `value`로 좌우 두 극을 표현)을 다각형 꼭짓점으로 풀면 세 가지가 동시에 맞아야 한다 — (a) 우극 v=value·좌극 v=1−value 변환, (b) 라벨 인덱스가 극과 정합(`label[0]`=좌극/`label[1]`=우극, en 상수도 ko의 `[left,right]` 순서와 같은 배열), (c) 같은 축 두 극이 180° 대면(v합=1). 하나만 어긋나도 build는 통과한 채 **좌우가 조용히 반전되거나 축이 뒤바뀐다**(타입·린트로 안 드러남). 또 `v>=0.5` 강조 판정은 value=0.5에서 양극을 동시에 강조해 "균형" 표현이 사라진다.
- **회피**: 위 (a)(b)(c)를 구현과 리뷰에서 각각 명시 확인. 우세극 강조는 `raw >= 0.5 + ε`(ε=0.04, 기존 양방향 막대 UI의 균형 임계와 통일)로 균형·무데이터에서 양극 동시 강조를 막는다. 최종 검증은 실데이터 렌더를 눈으로 — 치우친 유형(폴리곤이 우세극 방향으로 뻗음) + 균형/무데이터(정다각형·라벨 전부 흐림) 두 케이스.
- **연관 파일/함수**: `src/components/PersonalityRadar.tsx`(`POLES`/좌표식 `x=cx+R·v·sinθ`/`dominant`), 데이터 규약 `src/lib/personality.ts`(`AxisScore` label 순서), 소비처 `Dashboard.tsx`·`src/components/wrapped/slides/PersonalitySlide.tsx`

## L-16: SVG 레이더 라벨 폰트는 viewBox 단위 — 실제 렌더 px = fontSize·(size/V), 형제 레이더와 대조할 것

- **언제 만났나**: 2026-07-23, 역할 분포 레이더(`UsageRadar`) 추가 — viewBox `V=280`을 `size=190`으로 렌더해 `fontSize=11`이 실제 11·(190/280)≈**7.46px**가 됐고, 자매 컴포넌트 `PersonalityRadar`(V260·size220·fs12 → ~10.15px)보다 ~27% 작아 긴 한글 라벨("데이터 엔지니어")이 안 읽혔다. Reviewer 지적 → `size 210·fs14`로 보정.
- **함정**: SVG의 `fontSize`는 viewBox 좌표 단위라 `width={size}`로 축소 렌더하면 화면 실제 px = `fontSize·(size/V)`로 줄어든다. viewBox·size·fontSize가 컴포넌트마다 다르면 같은 `fontSize` 숫자라도 화면 크기가 제각각이라, 기존 레이더를 참고해 새로 만들 때 fontSize 숫자만 맞추면 실제로는 어긋난다. 라벨이 더 길수록(한글 역할명 등) 더 커야 하는데 오히려 작아지기도 한다. 코드/타입/린트로는 안 드러나고 렌더에서만 보인다.
- **회피**: SVG 차트 라벨 폰트는 항상 **실제 렌더 px(=`fontSize·size/V`)로 환산해 형제 컴포넌트와 대조**한다. 목표 렌더 px를 먼저 정하고 fontSize를 역산(`fontSize = 목표px·V/size`). 라벨이 더 길면 목표 px를 키운다. 최종 검증은 실데이터 렌더를 브라우저 실측(`svg.getBoundingClientRect()`)으로. + 형제 카드에 나란히 놓을 땐 레이더 자체 size도 통일하고, 콘텐츠가 짧은 카드는 `flex-1`로 여백을 흡수해 카드 높이를 맞춘다.
- **연관 파일/함수**: `src/components/UsageRadar.tsx`·`src/components/PersonalityRadar.tsx`(`fontSize`·`size`·`V`), 계열 `_common.md` L-7·L-14
