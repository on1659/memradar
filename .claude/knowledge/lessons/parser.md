# parser.ts lessons

`src/parser.ts` 트랜스크립트 파싱 관련 함정.

## L-001: 대규모 세션에서 RangeError

- **언제 만났나**: 2026-04~05 (3.4.7로 회피)
- **함정**: 매우 큰 jsonl(수만 라인)을 한 번에 처리하거나, 큰 배열을 spread로 합치면 V8 RangeError(Invalid array length / call stack)가 터짐
- **회피**: 라인 단위 스트리밍 파싱, 청크 누적 후 push, spread 대신 for-of 또는 Array.prototype.push.apply with chunk
- **연관 파일/함수**: `src/parser.ts`

<!-- 추가 lesson은 여기에 -->
