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
