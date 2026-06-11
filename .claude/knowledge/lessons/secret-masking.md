# lesson: 시크릿 마스킹 (secret-masking)

표시·내보내기 경계에서 시크릿을 가리는 작업의 함정. 단일 소스 모듈 `cli/lib/secretMask.mjs`.

## L-001: 본문만 가리면 샌다 — "잘라서 항상 보여주는" 프리뷰 표면이 진짜 누출 경로

- **언제 만났나**: 2026-06-11, G2 시크릿 마스킹 구현·리뷰
- **함정**: 메시지 본문(MessageContent)만 마스킹하면, 접힌 도구 카드의 헤더 요약(`summaryFor`), export의 `<details><summary>`(`summarizeToolCall`), 세션 목록 제목(80자 슬라이스), 검색 스니펫처럼 **"항상 보이거나 잘라서 보여주는" 프리뷰 표면**에서 원문이 그대로 샌다. 특히 본문이 없는 도구(Grep/Glob)는 summary가 유일한 표시 경로라 빠뜨리기 쉽다.
- **회피**: 마스킹은 "본문 렌더" 한 곳이 아니라 **원문이 사용자에게 도달하는 모든 경계**에 명시 적용. 도구별 분기(Bash/Grep/Glob/Edit/Write/Result)를 추가·수정할 때마다 "이 분기의 summary·body 양쪽에 maskSecrets가 도는가" 자문. 그리고 반드시 **mask → slice 순서** — 먼저 자르면 잘린 시크릿 조각이 패턴 미달로 노출된다.
- **연관 파일/함수**: `src/components/tools/ToolCallView.tsx`(summaryFor/bodyFor), `src/lib/sessionExport.ts`(summarizeToolCall/formatToolInput/formatToolResult), `src/components/Dashboard.tsx`(목록 제목), `src/components/search/SearchResults.tsx`

## L-002: 오탐 가드는 패턴별이 아니라 "치환 직전 값"에 일괄 적용

- **언제 만났나**: 2026-06-11, G2 리뷰에서 bearer 오탐 발견
- **함정**: 오탐 가드(`isGuardedValue`: your/xxx/example/${}/UUID/hex/경로)를 credential 휴리스틱에만 달면, 다른 패턴(bearer 등)이 플레이스홀더·산문을 잡는다. `Bearer authentication-mechanism` 같은 산문에서 `Bearer` 단어까지 먹어버리는 식.
- **회피**: 새 마스킹 패턴을 추가할 때마다 "이 패턴의 매치값에도 가드가 도는가"를 점검. 그룹 캡처로 프리픽스(`Bearer `)는 보존하고 토큰 부분만 치환 + 가드 적용. 고신뢰 우선·미탐 허용이 원칙이면 숫자 1개 이상 요구 등으로 산문 오탐을 줄인다.
- **연관 파일/함수**: `cli/lib/secretMask.mjs`(BEARER_RE/CREDENTIAL_RE/isGuardedValue)

## L-003: credential 휴리스틱은 `key=value`와 `"key":"value"` 두 형태를 모두 테스트

- **언제 만났나**: 2026-06-11, G2 리뷰에서 JSON 따옴표 키 미탐 발견
- **함정**: 도구 입력 표면은 `JSON.stringify` 산출물이라 `"api_key": "..."` 따옴표 키 형태가 오히려 1차 표적인데, 평문 할당문(`api_key=...`)만 테스트하면 통과처럼 보이고 JSON 형태를 통째로 놓친다. 키워드 뒤 닫는 따옴표가 `\s*[:=]`를 막는다.
- **회피**: 키워드 뒤 `['"]?`를 넣어 두 형태를 모두 매칭하고, 테스트에 `{"api_key": "..."}` 양성 + `"max_tokens": 4096` 음성을 둘 다 넣는다. 멱등성(`"token": "[REDACTED:credential]"` 재매칭 없음)도 고정.
- **연관 파일/함수**: `cli/lib/secretMask.mjs`(CREDENTIAL_RE), `tests/secret-mask.test.mts`
