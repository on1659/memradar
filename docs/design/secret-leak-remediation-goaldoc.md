# 시크릿 유출 대응 Goaldoc — Secret Leak Remediation

- 작성일: 2026-06-11
- 브랜치: feat/eval-sharpness
- 상태: DRAFT (사용자 승인 대기)
- 경위: G2(시크릿 마스킹) 완료 후 로컬 빌드로 실데이터 실행 → memradar가 생성한 HTML에서 마스킹 8건 발견 → 포렌식 분석 결과 **과거 릴리스 세션에 실제 npm publish 토큰이 평문으로 유출**되어 있었음이 확인됨.
- **민감 주의**: 이 문서는 git 추적 대상이다. 실제 토큰 값을 절대 적지 않는다 (접두 8자 마스킹 표기만 사용).

---

## 0. 배경 — 무엇이 발견됐나

로컬 빌드 `node cli\index.mjs --no-update-check` 실행으로 실제 세션 220개를 스캔해 정적 HTML을 생성했고, 그 안에서 `[REDACTED:*]` 8건이 잡혔다. 포렌식 추적(로컬 grep, 값 미노출) 결과 두 부류로 갈렸다:

### (A) 메타 — 자기 자신을 스캔한 결과 (7건, 조치 불요)
오늘 promptale 세션(`fc1ee301…`)도 220개 중 하나로 스캔됐고, 이 세션은 마스킹 기능을 만들며 타이핑한 **더미 시크릿으로 가득**하다. 확인된 값:
- `openai-key` ← `sk-aaaaaaaaaaaaaaaaaaaaaaaa` (테스트 더미)
- `aws-access-key` ← `AKIAIOSFODNN7EXAMPLE` (AWS 공식 예시 키)
- `github-token` ← `ghp_000…` (더미)
- `[REDACTED:kind]` ← 마스킹 모듈을 설명한 **대화 문자열 자체** (시크릿 아님)
- `bearer-token`, `credential ×2` ← `Bearer …`·`api_key=…` 패턴 논의용 예시

→ 오탐이 아니라 "시크릿처럼 생긴 더미"를 정상적으로 가린 재귀 현상. 조치 불요.

### (B) 진짜 유출 — npm publish 토큰 (1건, P0 조치 필요)
`npm-token` 1건은 더미가 아니다. **과거 memradar 릴리스 세션**(`484f3212…`, `e2150cd9…`)에서 나온 **실제 고엔트로피 npm 자동화 토큰**이며, 같은 줄 근처에 `publish`·`npmrc` 문맥이 있다. `npm publish` / `.npmrc` 설정 과정에서 토큰이 평문으로 세션 로그에 박혔다.

확인된 실제 토큰 (sha256 지문[:8] — 원문/접두 미기록):
- npm-token `bb64fd63` — 여러 세션에 반복 등장
- npm-token `d00d6398`
- npm-token `4e4b8f9f`

정확한 위치는 `scan:secrets` 산출 리포트(`docs/secret-scan-report-*.json`, gitignore)에 지문→위치로 있다.
연결: memory `[[project_memradar_release]]` — npm 계정 `radar92`, 2FA bypass granular token. 이 토큰들이 그 publish 토큰일 가능성이 높다.

### (C) 오탐 1건 (조치 불요)
MapleWorld 프로젝트의 `ghp_xxxxxxxxxxxxxxxxxxxx` — 전부 `x`인 플레이스홀더. 실제 키 아님. `.txt` tool-result에 있어 memradar 임베드 대상도 아님.

---

## 1. 결정 (사용자 확정 대기)

| ID | 결정 | 근거 |
|----|------|------|
| D1 | 유출된 npm 토큰을 **폐기(revoke) 후 재발급** | 데이터 안전성 — 평문 로그에 남은 토큰은 유효한 한 위험 |
| D2 | 재발급 토큰은 **로그에 안 남는 안전 패턴**으로 재설정 | 재발 방지 — 같은 경로로 또 새지 않게 |
| D3 | 전 프로젝트 로그 **전수 스캔**으로 다른 실제 유출 여부 확인 | 정확성 — npm 외 다른 유출이 더 있을 수 있음 |

(D1·D2·D3는 §6 Open Questions의 답에 따라 범위 확정)

---

## 2. 목표

### G1. npm 토큰 폐기 + 안전 재발급 (P0)
**예상 트리아지: STANDARD** (사용자 액션 + 검증 + memory 갱신)

- **무엇**:
  1. npmjs.com → Account → Access Tokens 에서 npm 토큰(지문 `bb64fd63`/`d00d6398`/`4e4b8f9f`, 및 스캔으로 추가 발견되는 publish 토큰) **revoke**. 지문→세션 위치는 `docs/secret-scan-report-*.json` 참조.
  2. 새 granular automation token 발급 (publish 권한 최소 범위, memradar 패키지 한정).
  3. 새 토큰을 **G3의 안전 패턴**으로 설정 (평문이 로그/명령어에 안 들어가게).
- **왜**: 폐기가 출혈 중단의 핵심. 재발급은 G3 패턴으로만 — 안 그러면 새 토큰도 같은 경로로 샌다.
- **실행 주체**: 토큰 revoke/발급은 사용자(npmjs.com + 2FA 필요, 내가 대신 못 함). 나는 정확한 절차 문서화 + 폐기 검증(아래) 담당.
- **검증**: 구토큰으로 `npm publish --dry-run` 또는 `npm whoami --registry` 시도 시 **401/인증 실패**가 나야 폐기 완료. (이 검증 명령에 구토큰을 인라인하지 말고 임시 `.npmrc`나 환경변수로 — 검증 자체가 또 로그를 남기지 않게.)
- **성공 기준**: 구토큰 3건 전부 무효화 확인 + 새 토큰으로 release 플로우 1회 성공 + `[[project_memradar_release]]` memory 갱신.
- open: §6-Q1 (노출 범위 평가가 심각도를 바꿈)

### G2. 전 로컬 로그 시크릿 전수 스캔 (read-only)
**예상 트리아지: COMPLEX** (새 스크립트 + 새 출력 포맷)

- **무엇**: `cli/lib/secretMask.mjs`의 `maskSecrets`를 **재사용**하는 스캔 스크립트 신설. `~/.claude/projects`(+ `subagents/`, `tool-results/*.txt`) 와 `~/.codex/sessions` 전체를 훑어 실제 유출만 추린 트리아지 리포트 생성.
- **파일**: `d:\Work\vibe\promptale\scripts\scan-secrets.mts` (신규)
- **설계 원칙**:
  1. **읽기 전용** — 로그 파일 절대 수정 안 함. 네트워크 I/O 0.
  2. **단일 소스 재사용** — G2(완료)의 마스킹 모듈을 그대로 씀 (패턴 드리프트 없음). [[[secret-masking]]]
  3. **리포트에 원문 미기록** — 출력은 `{project, sessionFile, lineNo, kind, maskedPreview}` 만. 실제 시크릿 값을 디스크/콘솔에 평문으로 쓰지 않는다.
  4. **더미/실제 분류** — 알려진 더미 제외(`*EXAMPLE`, 전부-x/a/0 반복, `your`/`xxx` 플레이스홀더, 프로젝트 픽스처 경로 `tests/fixtures/`) → "likely real" vs "dummy/test" 라벨.
- **성공 기준**: 알려진 npm 토큰 3건을 "real"로, 오늘 더미(`sk-aaaa`/`AKIA…EXAMPLE`/`ghp_xxx`)를 "dummy"로 정확히 분류. 전 프로젝트에서 추가 실제 유출이 있으면 목록화.
- open: §6-Q2 (스캔 범위)

### G3. 릴리스 플로우 누출 방지
**예상 트리아지: COMPLEX** (`.claude/skills` 메타 변경 + memory)

- **무엇**: 토큰이 **로그에 남는 명령/파일에 절대 안 들어가게** release 절차 하드닝.
- **누출 원인**: `.npmrc`에 토큰을 평문으로 쓰거나, `npm publish` 관련 명령에 토큰을 인라인해서 Claude Code 도구 호출에 값이 캡처됨.
- **안전 패턴 (택1 또는 조합 — G3에서 확정)**:
  - `.npmrc`에 `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` 형태로 **리터럴 토큰 미기록**, `NPM_TOKEN`은 셸 환경변수로 out-of-band 주입 (Claude 도구 호출에 값이 안 보이게).
  - 토큰 파일은 repo·`~/.claude` 로그 밖에 두고 `.gitignore` 확인.
  - release 스킬 지시에 "토큰을 명령/메시지에 붙여넣지 말 것" 명문화.
- **파일**: memradar release 스킬(`.claude/skills/release/` 추정 — Scout가 위치 확정), `[[project_memradar_release]]` memory.
- **성공 기준**: 새 release 1회 수행 후, 그 세션 로그를 `scan-secrets.mts`로 재스캔했을 때 토큰 0건.
- open: §6-Q3 (패턴 선택)

### G4. 과거 로그 정화 (선택)
**예상 트리아지: COMPLEX** (사용자 `~/.claude` 로그 파괴적 변경 — /careful 또는 /guard 권장)

- **무엇**: 유출 토큰이 박힌 historical `.jsonl`을 `[REDACTED:*]`로 치환.
- **주의**: 사용자 세션 히스토리를 수정하는 **파괴적 작업**. 백업 필수, 세션 무결성 손상 위험.
- **위상**: G1 폐기 완료 시 토큰은 무력화되므로 **정화는 위생 목적의 선택 사항**. 우선순위 낮음.
- open: §6-Q4 (정화 여부 — 기본 권장: rotation-only, 정화는 보류)

---

## 3. 순서 / 의존성

```
즉시(병행):   G2 (read-only 전수 스캔)  +  G3 (안전 패턴 설계)
        ↓ 스캔으로 전체 유출 목록 확정 + 패턴 확정
P0:          G1 (구토큰 revoke → G3 패턴으로 새 토큰 발급/설정 → 폐기 검증)
선택(마지막): G4 (로그 정화 — careful 모드)
```

- 근거: G2는 읽기 전용이라 리스크 0 — 먼저 돌려 **전체 노출 범위**부터 확정(정확성). G3 패턴이 정의돼야 G1 재발급이 안전(재발 방지). 폐기(revoke)는 가장 급하나 "안전 재설정"이 G3에 의존하므로 묶어서 P0. G4는 파괴적이라 토큰 무력화 후로 미뤄 롤백 가능성 확보.

## 4. 검증 계획

- G1: 구토큰 인증 실패(401) 확인 + 새 토큰으로 release dry-run 성공
- G2: 알려진 케이스(npm real / 오늘 더미) 분류 정확도 100%, 리포트에 원문 0
- G3: release 후 해당 세션 로그 재스캔 → 토큰 0건
- 공통: 스캔/검증 명령 자체가 새 평문 토큰을 로그에 남기지 않는지 점검 (메타 안전)

## 5. 불변조건

- 이 문서를 포함해 git 추적 산출물에 **실제 토큰 값 절대 미기록**.
- `scan-secrets.mts`는 **읽기 전용** — 로그 수정 금지, 네트워크 I/O 0, 리포트에 원문 미기록.
- 세션 데이터 외부 전송 금지 (CLAUDE.md) — 모든 스캔·검증 로컬.
- G4 외 어떤 목표도 사용자 `~/.claude` 로그를 수정하지 않는다.
- 마스킹 모듈 재사용 — 패턴 중복 구현 금지(드리프트=누출).

## 6. Open Questions — 확정 (2026-06-11)

| # | 질문 | 결정 |
|---|------|------|
| Q1 | **노출 범위**: 오늘 이전 산출물을 외부 공유했나? | **없음 — 로컬에서만 확인.** 유출은 로컬 `~/.claude` 로그로 한정, 심각도 안정. 토큰 폐기로 충분 |
| Q2 | **진행 범위** | **G2 + G3 동시** (스캔 + 릴리스 하드닝). 폐기(G1)는 그 다음 P0 |
| Q3 | **G3 패턴** | **`${NPM_TOKEN}` 환경변수 주입** (가장 단순·로그 안전) |
| Q4 | **G4 로그 정화** | **rotation-only — 정화 보류** (파괴적·세션 손상 위험) |

---

## 부록 — 관련 산출물

- G2 마스킹 구현: `d:\Work\vibe\promptale\cli\lib\secretMask.mjs`, `d:\Work\vibe\promptale\tests\secret-mask.test.mts`
- 홍보 전 마감 goaldoc: `d:\Work\vibe\promptale\docs\design\prelaunch-goaldoc.md`
- 유출 토큰 소재 세션 (로컬, 값 미기록): `~/.claude/projects/D--Work-vibe-promptale/484f3212-…jsonl`, `…/e2150cd9-…jsonl`
