# parser.ts lessons

`src/parser.ts` 트랜스크립트 파싱 관련 함정.

## L-001: 대규모 세션에서 RangeError

- **언제 만났나**: 2026-04~05 (3.4.7로 회피)
- **함정**: 매우 큰 jsonl(수만 라인)을 한 번에 처리하거나, 큰 배열을 spread로 합치면 V8 RangeError(Invalid array length / call stack)가 터짐
- **회피**: 라인 단위 스트리밍 파싱, 청크 누적 후 push, spread 대신 for-of 또는 Array.prototype.push.apply with chunk
- **연관 파일/함수**: `src/parser.ts`

## L-002: 평가 도구의 단발 `JSON.parse` 패턴을 실세션 파서에 옮기지 말 것

- **언제 만났나**: 2026-05-22, AI 역할 평가 Stage 0 — eval 도구(`scripts/validate-eval-samples.mts`, `test-eval-and-report.mts`의 `loadSamples`)가 `readFileSync` + `JSON.parse` 단발로 샘플을 읽는다.
- **함정**: 평가 샘플은 스펙상 ≤400 메시지로 크기가 한정돼 단발 `JSON.parse`로 충분하다. 하지만 이 "간단해서 OK"인 패턴을 실제 `~/.claude/projects` 트랜스크립트 파서(`src/parser.ts`)에 그대로 옮기면 L-001의 RangeError가 재발한다 — 실세션 jsonl은 크기 상한이 없다.
- **회피**: 파일 읽기 패턴을 "크기가 한정된 합성 데이터(eval 픽스처)"와 "크기 무한정인 사용자 트랜스크립트"로 구분해 기억한다. eval 도구의 단발 파싱을 보고 "파서도 이렇게 하면 되겠네" 하지 말 것 — 실세션 파서는 L-001대로 스트리밍.
- **연관 파일/함수**: `src/parser.ts`, `scripts/validate-eval-samples.mts`, `scripts/test-eval-and-report.mts` (`loadSamples`)

## L-003: 서버 모드 4000자 캡 마커가 텍스트 집계를 오염시킨다

- **언제 만났나**: 2026-06-11, 성장 섹션(단어 수·구조화 비율 집계) 구현 — Coder가 Scout 보고로 사전 차단
- **함정**: 서버 모드에서 `cli/index.mjs`의 `applyTextCap`(light 캐시 `buildLightCache(4000)`)이 메시지 텍스트를 4000자로 자르고 `…[잘림 — 세션 클릭 시 전체 보기]` 한국어 마커를 덧붙인다. 이 마커의 단어("잘림", "클릭" 등)가 단어 수·키워드 집계에 그대로 들어가고, 정적 모드와 서버 모드의 분석 수치가 달라진다. 마커는 한 메시지당 6단어라 티가 안 나서 리뷰로 못 잡는다.
- **회피**: 신규 텍스트 분석 기능의 전처리(`stripMarkup` 류) 첫 단계에서 마커를 제거한다. `src/parser.ts`의 `CLI_TRUNCATION_MARKER` 상수를 재사용할 것. 또 이 상수는 `cli/index.mjs` 리터럴의 사본(브라우저 번들 ↔ 런타임 mjs라 import 불가)이므로, cli 소스를 `readFileSync`로 읽어 포함 여부를 어설션하는 드리프트 가드 테스트를 함께 둔다(`tests/growth.test.mts` 참고).
- **연관 파일/함수**: `cli/index.mjs:applyTextCap`, `src/parser.ts:CLI_TRUNCATION_MARKER`/`stripMarkup`, `tests/growth.test.mts`(드리프트 가드)

## L-004: 제외 가드 정규식은 본체 패턴과의 교집합을 양성 테스트로 검증할 것 + stripMarkup 뒤 공백은 `\s*`

- **언제 만났나**: 2026-07-04, 정정 마커 매처 재설계 리뷰 — Tier B 가드에서 (1) `PPUNMAN_ANIRA_RE=/뿐만\s?아니라/`가 본체 `/[가게이]\s?아니라/`와 교집합이 공집합("뿐만" 뒤엔 [가게이]가 없음)이라 dead guard였고, 정작 "뿐만이 아니라"는 `이 아니라`로 본체에 걸려 오탐. (2) `\s?`가 이중 공백을 못 잡아 "묻지  말고"(stripMarkup이 인라인 코드/태그를 공백 치환한 결과)가 금지형 가드를 뚫음.
- **함정**: (1) 제외 가드 정규식이 매치하는 집합이 본체 패턴 매치 집합과 교집합이 없으면, 가드는 있어도 아무것도 제외하지 못하고(dead guard) 진짜 걸러야 할 변형은 놓친다. (2) `stripMarkup`은 코드펜스·인라인 코드·태그·URL을 공백 1개로 치환해 정규화 텍스트에 연속 공백이 구조적으로 생긴다 — 고정 `\s?`(0~1개) 가드는 이 경로에서 조용히 무력화된다.
- **회피**: (1) 제외 가드를 추가하면 "본체에 매치되지만 가드로 걸러지는" 양성 케이스 테스트를 반드시 1개 이상 작성해 교집합 존재를 강제한다(가드 없이도 통과하는 문장은 무력함을 못 잡는다). (2) stripMarkup 뒤에 도는 정규식의 공백은 `\s?`가 아니라 `\s*`/`\s+`로.
- **연관 파일/함수**: `src/parser.ts` `matchRetryMarker`(Tier B 가드 `PROHIBITIVE_MALGO_RE`/`ANIRA_CORRECTION_RE`/`PPUNMAN_ANIRA_RE`), `stripMarkup`, `tests/growth.test.mts`(가드 양성 케이스)

## L-005: 진단 스크립트(전체 텍스트)와 라이브 대시보드(4000자 절단)의 집계는 구조적으로 다르다 — 임계값 보정은 라이브 경로 기준으로

- **언제 만났나**: 2026-07-04, 코칭 검증 — `scripts/analyze-coaching.mts`(src/parser.ts로 전체 텍스트 파싱)의 avgWords가 라이브 대시보드(cli/index.mjs가 4000자로 절단한 텍스트를 브라우저 buildGrowth에 먹임)와 어긋남(136 vs 124, 같은 판정월). retry율은 마커가 head 30자 기반이라 양쪽 동일.
- **함정**: 진단 스크립트는 파서 원본으로 전체 텍스트를 읽지만 라이브는 L-003의 4000자 캡을 거친 텍스트를 쓴다. avgWords·structured·score 같은 길이 의존 지표는 두 경로에서 구조적으로 다를 수 있어, 진단 수치를 "사용자가 보는 값"으로 신뢰하면 임계값 경계에서 어긋난 발화가 난다.
- **회피**: 길이 의존 임계값(예: `LONG_PROMPT_MIN_AVG_WORDS`)의 실측 보정·검증은 라이브 경로(절단 적용) 기준 수치로 한다. 진단 스크립트에 라이브와 동일한 캡을 옵션으로 적용하거나, 최소한 두 경로의 avgWords 차이를 리포트에 병기한다. head 기반 지표(정정 마커 등)는 절단 무관하므로 예외.
- **연관 파일/함수**: `scripts/analyze-coaching.mts`, `cli/index.mjs`(`applyTextCap`/`buildLightCache(4000)`), `src/parser.ts`(`buildGrowth`), 관련 `lessons/parser.md` L-003

<!-- 추가 lesson은 여기에 -->
