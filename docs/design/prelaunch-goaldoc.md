# 홍보 전 마감 Goaldoc — Pre-launch Hardening

- 작성일: 2026-06-11
- 브랜치: feat/eval-sharpness
- 상태: DRAFT (사용자 승인 대기)
- 경위: 홍보 전 보안/문제점 점검 (2026-06-11 세션) 결과 + 사용자 결정 반영. 우선순위 제안 5건 전부 작업하기로 확정.

---

## 0. 배경 — 점검 결과 요약

### 보안/프라이버시 (대체로 합격)
- 세션 데이터 외부 전송 경로 **없음** 확인. 모든 fetch는 로컬 서버(`/api/*`), npm 패키지 `files: ["dist", "cli"]`에 실데이터 미포함, `d:\Work\vibe\promptale\docs\eval-results.json`은 합성 샘플 통계만.
- **불일치 1건**: `d:\Work\vibe\promptale\README.md` 225행 "외부 API 호출 … 일체 없음" ↔ `d:\Work\vibe\promptale\cli\index.mjs` 20행의 npm registry 버전 체크(`https://registry.npmjs.org/memradar/latest`). 세션 데이터는 0바이트도 안 나가지만 문장 자체는 grep 한 번으로 반증 가능 — 프라이버시를 셀링 포인트로 내세우는 도구에서 신뢰 훼손 포인트.
- 잔여 유출면: 정적 HTML 출력에 세션 **전문** 임베드(`cli\index.mjs` 863행 `window.__MEMRADAR_SESSIONS__`), 세션 export(markdown)에 프롬프트 속 시크릿 포함 가능.

### 성향분석 (가장 약한 고리)
- v3 분류기 정확도 37.8% (270문제 중 102), Hard 23.3%. **debug FP 139 (sink)**, refactor F1 0%, test F1 11.8% (`d:\Work\vibe\promptale\docs\eval-results.json`).
- 홍보 관점의 실질 리스크는 수치보다 **debug 쏠림 → 모두 비슷한 결과 → 공유물 동질화** (Wrapped류 바이럴의 치명타).
- UI는 ba88105로 "단정 판정 → 분포 표시" 전환 완료. 면책 구멍 2곳: `PersonaQuizView.tsx` 결과 화면(보정 설명만 있음), `PersonalitySlide.tsx`(확정 어조, 면책 없음).

---

## 1. 이번 사이클의 결정 (사용자 확정, 2026-06-11)

| ID | 결정 | 비고 |
|----|------|------|
| D1 | API 키로 추정되는 문자열은 **경고가 아니라 마스킹** | 사용자 제안 채택. 스크린샷·화면공유가 잦은 홍보 기간엔 "보이는 화면"이 곧 유출면 |
| D2 | 성향분석에서 **정확도와 재미는 동급 목표** | 한쪽을 희생하는 방향 금지 |
| D3 | 우선순위 제안 **5건 전부 작업** | G1~G5 |

---

## 2. 목표

### G1. 프라이버시 주장 정합성 — README 정정 + 버전 체크 opt-out
**예상 트리아지: COMPLEX** (CLI 플래그 추가 트리거)

- **무엇**: README "외부 API 호출, 서버 업로드, 텔레메트리, 분석 수집 일체 없음" 문구를 정확하게 정정("버전 확인을 위한 npm registry 조회 1건 제외 — 세션 데이터 미포함") + 버전 체크 opt-out 추가.
- **왜**: 프라이버시 주장이 제품 정체성. 반증 가능한 문장 1개가 GeekNews/HN 댓글에서 전체 신뢰를 깎는다.
- **파일**: `d:\Work\vibe\promptale\README.md` (222–225행), `d:\Work\vibe\promptale\cli\index.mjs` (20행 부근)
- **성공 기준**: README의 모든 프라이버시 주장이 코드로 반증 불가능. opt-out 활성 시 네트워크 호출 0건.
- open: opt-out 이름 (§5-Q3)

### G2. 시크릿 마스킹 — 표시·내보내기·정적 HTML 전부
**예상 트리아지: COMPLEX** (새 모듈 + 다출력 포맷 적용 + parser 인접)

- **무엇**: API 키/토큰으로 추정되는 문자열을 렌더·직렬화 경계에서 마스킹.
- **설계 원칙**:
  1. **원본 불변** — 디스크의 `.jsonl`은 절대 수정하지 않음(읽기 전용 불변조건). 마스킹은 표시/내보내기 시점에만.
  2. **고신뢰 패턴만** — 접두사 기반: `sk-`/`sk-ant-`(OpenAI/Anthropic), `ghp_`/`gho_`/`ghs_`/`github_pat_`(GitHub), `AKIA`(AWS), `xoxb`/`xoxp`(Slack), `AIza`(Google), `npm_`, `glpat-`(GitLab), PEM 블록(`-----BEGIN … PRIVATE KEY-----`), `eyJ` JWT, `(api[_-]?key|secret|token|password)\s*[:=]` + 고엔트로피 값. **40자리 hex(커밋 SHA)·UUID는 제외** — 오탐 방지.
  3. **UI는 마스킹 기본 ON + 클릭-투-리빌**, export/정적 HTML은 `[REDACTED:종류]` 치환.
- **적용 지점**: `d:\Work\vibe\promptale\src\components\SessionView.tsx` 메시지 렌더, 세션 export 빌더(markdown/HTML), `d:\Work\vibe\promptale\cli\index.mjs` 정적 HTML 임베드. 정확한 모듈 경계는 Scout가 확정.
- **성공 기준**: 알려진 키 포맷 양성 픽스처 100% 마스킹, SHA/UUID/일반 코드 음성 픽스처 오탐 0, `npm run test:harness` 통과.
- open: reveal UX 세부 (§5-Q2)

### G3. 성향분석 — 정확도×재미 동시 개선 (특화도 전환)
**예상 트리아지: COMPLEX** (새 분석 메트릭 + eval 사이클)

- **전략 핵심**: raw 비중 → **특화도(기준선 대비 lift)** 전환.
  - 진단: debug FP 139는 base-rate 문제 — debug 키워드는 모든 개발 대화에 흔해서 raw 점수는 흔한 카테고리가 항상 이긴다.
  - 정확도 효과: 기준선 정규화로 debug 쏠림 해소, refactor/test 같은 저빈도 신호 부상.
  - 재미 효과: "평균 대비 유독 높은 것"은 사람마다 달라짐 → 공유물 다양화. 재미의 본질("내가 뭐가 다른가")이 상대 척도와 일치 — **정확도 수정이 곧 재미 수정** (D2 충족).
- **기준선 출처**: 합성 eval 코퍼스의 카테고리별 키워드 발화율로 1차 캘리브레이션 (Scout/Coder 확정). 세션 데이터 외부 전송 금지 제약 유지 — 기준선은 패키지에 동봉되는 정적 상수.
- **유지**: 퀴즈 보정 블렌딩 (`d:\Work\vibe\promptale\src\lib\personaQuiz.ts`, weight cap 0.6) — 인터랙션(재미) + 개인 신호(정확도)의 두 번째 다리.
- **정합**: 5/23 승인 설계 `d:\Work\vibe\promptale\docs\design\kim-master-design-20260523-205339.md` (반증가능 출력, sharpness 척도)의 연장선. 충돌 없음.
- **측정**:
  - `npm run test:eval` 재실행 → `docs\eval-results.json` 갱신
  - 목표: debug FP 139 → 대폭 감소(구체 수치는 1차 실험 후 캘리브레이션), refactor·test F1 > 0, macro-F1 상승, Hard 23.3% 개선
  - **다양성 신규 지표**: eval 코퍼스에서 top-1 카테고리 분포 엔트로피(전부 debug면 0 수렴 — 동질화를 명시적으로 측정)
  - `npm run sharpness:eval`, `npm run test:persona` 회귀 없음
- open: lift 결과의 카피/서사 방향 (§5-Q1 — office-hours 권장)

### G4. 면책 일관성
**예상 트리아지: STANDARD** (UI 변경)

- **무엇**: UsageSlide 수준의 면책 1줄을 두 곳에 추가.
  - `d:\Work\vibe\promptale\src\components\PersonaQuizView.tsx` 결과 화면 — 현재 보정 방식 설명만 있고 한계 고지 없음
  - `d:\Work\vibe\promptale\src\components\wrapped\slides\PersonalitySlide.tsx` — 현재 확정 어조
- **기준 카피**: `d:\Work\vibe\promptale\src\components\wrapped\slides\UsageSlide.tsx` 85행 ("사용자 메시지 패턴 기반의 가벼운 추정이에요. 정확한 분류는 아닙니다.")
- **제약**: Wrapped 8장 고정 — 슬라이드 추가 없이 기존 슬라이드 내 수정만. `ToolsSlide.tsx` import 금지.

### G5. 정적 HTML 프라이버시 경고
**예상 트리아지: SIMPLE~STANDARD**

- **무엇**: 정적 HTML 출력 시 "이 파일에는 대화 전문이 포함됩니다 — 공유 주의" 경고를 **항상** 출력(기존 200MB 크기 경고와 별개). G2 완료 후에는 임베드 자체가 마스킹 적용 상태.
- **파일**: `d:\Work\vibe\promptale\cli\index.mjs` (863행 임베드, 899–905행 경고 블록 부근)

---

## 3. 순서 / 의존성

```
트랙 A (보안·신뢰):   G1 → G4 → G2 → G5
트랙 B (성향분석):    [office-hours §5-Q1] → G3   (트랙 A와 병행 가능)
```

- G5의 "마스킹된 임베드"는 G2에 의존. 경고 문구만 먼저 넣는 것은 가능.
- 근거: 리스크 분리(작고 독립적인 G1·G4를 먼저 끝내 검수 단위 축소), 검수 가능성(G2는 픽스처 테스트, G3는 eval 사이클로 각각 독립 검증), 롤백 가능성(각 G는 독립 커밋/PR 단위).

## 4. 검증 계획

- 공통: `npm run test:harness` (lint + build + CLI + persona + e2e)
- G2: 신규 마스킹 픽스처 테스트 — 키 포맷 양성 셋 + SHA/UUID/일반 코드 음성 셋
- G3: `npm run test:eval` + 다양성(엔트로피) 지표 + `npm run sharpness:eval` + `npm run test:persona`
- 홍보 직전 최종: /qa 1회 + /code-review 1회

## 5. Open Questions

| # | 질문 | 처리 |
|---|------|------|
| Q1 | G3 재미·공유 서사: lift 결과를 어떤 카피로? ("평균 대비 N배" vs 희소 칭호 vs 서사형) | **office-hours 권장 1건** — 방법론은 5/23 세션에서 승인 완료, 이번엔 제품 서사 측면. G3 착수 전 1회 |
| Q2 | G2 마스킹 reveal UX: 메시지별 클릭-투-리빌 vs 전역 설정 토글 | G2 Scout 보고 후 결정 |
| Q3 | G1 opt-out 이름: `--no-update-check` vs `MEMRADAR_NO_UPDATE_CHECK` vs 둘 다 | G1 착수 시 결정 (둘 다가 정석 — 플래그는 1회성, 환경변수는 영구) |
