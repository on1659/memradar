# lesson: 시크릿 전수 스캔 (secret-scan)

`~/.claude`·`~/.codex` 로그를 훑어 평문 유출을 찾는 읽기 전용 스캐너(`scripts/scan-secrets.mts`)의 함정. 마스킹 모듈을 재사용한다.

## L-001: 스캐너의 자기검증은 단위테스트만으론 부족 — 실리포트를 grep해 0건 확인

- **언제 만났나**: 2026-06-11, G2 전수 스캔 구현·리뷰
- **함정**: 분류 함수 단위테스트가 다 통과해도, 실제 출력(콘솔·리포트 JSON)에 시크릿 원문이 새는지는 별개다. 보안 도구의 핵심 약속("원문 미기록")은 단위테스트가 보장하지 못한다.
- **회피**: `scan:secrets`를 실제 로그에 돌린 뒤, 산출 리포트를 토큰 접두 정규식(`npm_`/`sk-`/`AKIA`/`ghp_`/`AIza` + 고엔트로피 본문)으로 grep해 **0건**을 진짜 안전 게이트로 삼는다. 식별은 원문이 아니라 sha256 지문[:8] + 길이로만. 리뷰어도 반드시 실행 후 직접 grep.
- **연관 파일/함수**: `scripts/scan-secrets.mts`(toRelative/fingerprint/report), `.gitignore`(`docs/secret-scan-report-*.json` 제외)

## L-002: 전수 스캐너와 뷰어 워커는 SKIP_DIRS가 정반대여야 한다

- **언제 만났나**: 2026-06-11, G2 워커 설계
- **함정**: cli/vite의 `findJsonlFiles`는 `subagents/`를 의도적으로 스킵한다(뷰어 노이즈 제거). 전수 보안 스캔이 이 워커를 재사용하면 서브에이전트 트랜스크립트·tool-results를 통째로 놓쳐 미탐이 된다 — 정작 시크릿이 가장 잘 박히는 도구 입출력이 거기 있다.
- **회피**: 보안 스캔은 전용 워커(`collectFiles`)로 **subagents/ + tool-results/*.txt 포함**, memory/·*.meta.json·sessions-index.json만 제외. 한 코드베이스에 워커가 둘 공존하면 리뷰 시 SKIP_DIRS 차이를 명시 대조.
- **연관 파일/함수**: `scripts/scan-secrets.mts`(collectFiles/SKIP_DIRS), `cli/index.mjs`(findJsonlFiles)

## L-003: 엔트로피로 더미 분류 시 짧은 값은 false-negative 위험 — real 보수 처리

- **언제 만났나**: 2026-06-11, G2 리뷰
- **함정**: Shannon 엔트로피 상한은 `log2(길이)`라 짧고 다양한 실토큰도 임계 미달로 dummy 오분류될 수 있다. 보안 분류에서 실토큰을 dummy로 놓치는 false-negative는 가장 위험한 방향이다.
- **회피**: 엔트로피 더미 룰은 길이가 충분한 값(예: ≥20자)에만 적용하고, 짧은 값은 real로 보수 처리한다. 분류는 항상 "놓치면 안 되는" 쪽(real 과대)으로 기운다. 노이즈는 dedup + 신뢰도 티어(포맷 고유 접두=high, credential/bearer 휴리스틱=low)로 줄인다.
- **연관 파일/함수**: `scripts/scan-secrets.mts`(classify/shannonEntropy/dedupe)

## L-004: 보안 검증 명령은 '값'이 아니라 'boolean/지문'만 출력

- **언제 만났나**: 2026-06-11, G3 릴리스 하드닝 리뷰
- **함정**: 존재·형식·정합을 확인한다며 `echo $TOKEN`·`cat .npmrc`로 원문을 stdout에 올리면, 검증 명령 자체가 누출원이 되어 세션 로그에 평문이 박힌다.
- **회피**: 존재 확인은 `Boolean(env)`, 형식 확인은 `/regex/.test()`, 정합은 `whoami` 계정명 — 전부 값이 아닌 결과만 출력. scan-secrets가 원문 대신 지문만 내는 것과 같은 원칙.
- **연관 파일/함수**: `.claude/skills/release/SKILL.md`(프리플라이트/Post-verify)
