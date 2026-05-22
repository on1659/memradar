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

<!-- 추가 lesson은 여기에 -->
