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

<!-- 추가 lesson은 여기에 -->
