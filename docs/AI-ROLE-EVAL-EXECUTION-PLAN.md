# AI Role Eval — 실행 계획 (v3 평가 실행)

> 작성일: 2026-05-22
> 상태: 제안 단계 (미실행)
> 목적: 재설계된 역할 분류기(`src/lib/usageProfile.ts`)의 정확도를 v3 평가셋으로
> 처음 측정한다.
> 연관 문서: [AI-ROLE-SCORING-REDESIGN.md](./AI-ROLE-SCORING-REDESIGN.md),
> [AI-ROLE-EVAL-SAMPLES-SPEC.md](./AI-ROLE-EVAL-SAMPLES-SPEC.md),
> [AI-ROLE-ACCURACY-REVIEW.md](./AI-ROLE-ACCURACY-REVIEW.md),
> [AI-ROLE-EVAL-RESULTS.md](./AI-ROLE-EVAL-RESULTS.md)

---

## 문제 정의

memradar의 "AI 직업"(역할 분류기, `src/lib/usageProfile.ts`)이 사용자에게 신뢰할
만한 결과인지 판단하려면 정확도 수치가 필요하나, **현재 엔진의 정확도는 측정된 적이
없다.**

- 기록상 유일한 수치는 v1 평가의 **71.1%** (`AI-ROLE-EVAL-RESULTS.md`, 218샘플).
- 이 71.1%는 무효다. `AI-ROLE-EVAL-SAMPLES-SPEC.md` §0이 명시: v1 샘플은 전부
  "맞나?/확인해줄래?" 어조로 작성돼 거의 모든 역할이 `review`로 오분류됐다
  (EVAL-RESULTS의 sample-101~172에서 직접 확인 가능). 엔진 결함이 아니라 시험지 결함.
- 그 사이 엔진은 `AI-ROLE-SCORING-REDESIGN.md`의 Phase 1·2로 재설계됐다 — 단어
  경계 매칭, phrase/token/weak/negative 3단 가중치, toolUse 보조 가산, undecided.
  `AI-ROLE-ACCURACY-REVIEW.md`가 지적한 substring 오탐(`build` 안의 `ui`)·넓은
  키워드는 코드상 이미 해소돼 있다.
- v3 평가 방법론(400샘플 블라인드 생성, 65~85% 건강 범위)과 평가 스크립트가 대부분
  완비됐으나 **한 번도 실행되지 않았다.** `tests/fixtures/role-eval-samples/`
  디렉터리는 존재하지 않고, 결과 문서는 여전히 v1 그대로다.

따라서 "정확도 개선"의 진짜 선행 병목은 엔진 로직이 아니라 **측정 부재**다.
측정값이 없으면 어디를 개선할지도 알 수 없다.

## 측정으로 얻는 것

이건 기능 추가가 아니라 분류기가 정직한지 확인하는 작업이다. 끝나면:

- "AI 직업 정확도 X%, 9역할별 F1, 9×9 혼동행렬"이라는 검증된 수치가 생긴다.
- 그 수치가 다음 결정("개선할까 / 그대로 둘까 / 카피 톤만 손볼까")을 취향이 아니라
  데이터로 답한다.
- 결과가 건강 범위(65~85%)로 나오면 개선 작업 자체가 불필요해진다 — 그것도
  완결된, 가치 있는 결론이다.

## 제약

- **세션 데이터 외부 전송 금지** (CLAUDE.md). 평가 샘플은 합성 데이터라 이 제약과
  무관하다. 향후 실세션을 쓰게 되면(Approach C) 라벨링은 로컬에서만.
- 9개 역할 카테고리·8장 Wrapped 구조 유지. 이 작업은 측정이며 카테고리 변경이 아니다.
- 외부 AI API 필요 (블라인드 샘플 생성) — `generate-eval-samples-zai.mts`가 쓰는
  Z.AI/GLM(`ZAI_API_KEY`). Codex CLI 경로는 코드상 존재하지 않는다.
- v3 §1-3 건강 범위: 전체 정답률 65~85%. 85% 초과 = 샘플이 엔진 친화적 편향(v2 재발),
  65% 미만 = 엔진 취약점 또는 스펙 모호.

## 전제

1. 71.1%는 무효 측정값이다 (v1 깨진 샘플, review 톤 쏠림).
2. 엔진은 이미 Phase 1·2로 재설계됐다 (코드 반영 완료).
3. 현재 엔진의 정확도는 측정된 적이 없으며, 이 측정 부재가 진짜 병목이다.
4. 측정이 개선보다 선행해야 한다.
5. 합성 평가셋이면 v3 스펙의 블라인드 생성 + 건강 범위 + 주입 사후검증으로 1차
   측정에 충분하다. 실세션 교차검증(Approach C)은 1차 결과가 의심스러울 때의 후속이다.

## 코드/도구 현황 (2026-05-22 기준)

| 자산 | 상태 |
|---|---|
| `src/lib/usageProfile.ts` | Phase 1·2 반영 완료. `analyzeUsageTopCategories`(현 UI 연결) + `analyzeUsageRoles`(Phase 3 mixed/confidence 포함, UI 미연결). 카테고리 신호 사전(`CATEGORY_DATA`)은 현재 미export |
| `scripts/generate-eval-samples-zai.mts` | **외부 API 블라인드 생성기 — 유일** (Z.AI/GLM, `ZAI_API_KEY`). 단 109개 고정·배치 크기 파라미터 없음·`category`에 `consistency` 잔재 → 파일럿용 파라미터화 필요 |
| `scripts/generate-eval-samples.mts` | 파일명과 달리 외부 API 미사용 — 정적 키워드 조합 생성기 (v2 잔재) |
| `scripts/test-eval-and-report.mts` | 평가+HTML 리포트. **혼동행렬 O, 카테고리·난이도 정확도 O.** 단 카테고리 enum이 v1 잔재(`pure/mixed/ambiguous/consistency`)라 v3 4종(`pure/mixed/ambiguous/edge`)과 불일치. 역할별 precision/recall/F1·mixed 완전정답·undecided 비율은 **미구현** (v3 §7.2/§12가 "확장 필요"로 명시). 평가 함수가 `analyzeUsageTopCategories`에 하드와이어 |
| `scripts/eval-role-samples.mts`, `make-static-samples.mts`, `run-eval.mjs` | Scout 판정: 셋 다 obsolete v1/v2 잔재 (각각 test-eval-and-report 부분집합 / v2 정적 생성기 / 엔진 코드 복붙·죽은 경로). 정리는 이번 범위 밖 |
| `scripts/validate-eval-samples.mts` | **존재하지 않음** — Stage 0에서 v3 §5 기준으로 신규 작성 필요 |
| `tests/fixtures/role-eval-samples/` | **디렉터리 부재** — Stage 0에서 생성 필요 (없으면 `test-eval-and-report.mts`가 에러) |
| `/memtest`, `/generate-eval-samples` 스킬 | 이 평가 흐름을 래핑하는 프로젝트 스킬이 이미 존재 |

## 검토한 접근

### Approach A: v3 스펙 실행 + 파일럿 게이트 (채택)
작성된 v3 스펙·스크립트를 그대로 실행하되, 400개 전체 생성 전에 ~30샘플 파일럿으로
파이프라인·샘플 품질을 검증하는 게이트를 둔다.
- 노력 M / 리스크 Low
- 장점: 이미 적대적 검토를 거친 방법론, 실행만 남음 / 파일럿 게이트가 v2식 낭비
  차단 / 기존 스크립트 대부분 재사용
- 단점: 합성 분포 ≠ 실제 분포 리스크는 v3 자체 검증(§5-2 자연성, §8-4 인간검토)에
  의존 / 외부 AI API 비용·시간

### Approach B: 실제 세션 ground-truth 평가
합성 생성 없이 실제 세션 60~100개를 9역할로 손라벨링해 평가.
- 노력 M / 리스크 Med
- 장점: 실제 분포, v1식 톤 쏠림 원천 불가, API 비용 0
- 단점: 희귀 역할(`design`·`data`) 커버리지 구멍, 작은 N, 라벨러 편향

### Approach C: 하이브리드 (합성 + 실세션 sanity-check)
A의 합성 400으로 역할별 F1 + B의 실세션 손라벨 40~60으로 분포 현실성 교차검증.
- 노력 L / 리스크 Low
- 가장 완전하나 작업량 최대, 평가 경로 두 개를 다 구축

## 채택: Approach A

v3 스펙은 이미 v1·v2 실패 교훈을 반영한 검토된 방법론이고, 빠진 건 실행뿐이다.
파일럿 게이트가 전체 생성 비용 리스크를 막는다. C의 실세션 교차검증은 가장
완전하지만, A 결과가 의심스러울 때 타깃 후속으로 붙이는 게 단계 분리 원칙에
맞다 — A의 숫자가 곧 "C가 필요한가"를 답한다.

### 실행 계획 (4 Stage)

**Stage 0 — 도구 점검·정비** (착수 시 첫 작업)
- `tests/fixtures/role-eval-samples/` 디렉터리 생성 (현재 부재).
- `scripts/validate-eval-samples.mts` **신규 작성** (현재 부재) — v3 §5 기준.
  §5-3 주입검사는 카테고리 `phraseStrong` 사전을 참조해야 하므로,
  `usageProfile.ts`에서 `CATEGORY_DATA` 신호를 별도 export 추가 (UI/엔진 동작 불변).
- `scripts/test-eval-and-report.mts` 확장:
  - 카테고리 enum을 v3 4종(`pure/mixed/ambiguous/edge`)으로 교체 — `consistency`는
    v1 잔재라 제거, `edge`는 신규. 하드코딩된 카테고리 루프(스크립트 L129·L487 등)도 함께 수정.
  - v3 §7.2 지표 추가: 역할별 precision/recall/F1, mixed top1/완전정답, undecided 비율.
- `scripts/eval-role-samples.mts`·`make-static-samples.mts`·`run-eval.mjs` 용도 확인 —
  obsolete면 정리, 재사용 가능하면 흡수.
- `generate-eval-samples-zai.mts` 파라미터화: CLI로 역할·난이도·버킷당 개수를 받게
  확장 (현재 109개 고정) + `category` 타입을 v3 4종으로 정정. 자격증명은 Z.AI/GLM
  (`ZAI_API_KEY`) — Codex CLI 경로는 코드상 없다.
- 평가 대상 함수는 현 UI가 쓰는 `analyzeUsageTopCategories`로 고정. `analyzeUsageRoles`
  (Phase 3, UI 미연결)는 이번 측정 범위에서 제외 (YAGNI — 노출되지 않는 경로).

**Stage 1 — 파일럿 (게이트)**
- 2역할 × easy/normal/hard 각 5 = **30샘플** 블라인드 생성. 역할은 `debug`(정의가
  뚜렷한 흔한 역할 — 정상 케이스) + `data`(v1에서 거의 전부 `review`로 붕괴했던
  역할 — 스트레스 케이스). 두 역할로 정상·취약 양쪽을 함께 찔러본다.
- `validate-eval-samples.mts`로 구조·자연성·주입 검증.
- `test-eval-and-report.mts`로 평가.
- **게이트는 정밀 측정이 아니라 coarse sanity check다** — 버킷당 5샘플이라 1~2개
  변동이 정답률을 크게 흔든다. 정밀 측정은 전체 400에서만.
- 파일럿은 Stage 0에서 새로 추가한 F1·혼동행렬·undecided 리포트 코드 경로도 함께
  스모크 테스트한다 — N=5라 수치는 무의미하나, 확장 코드가 에러 없이 도는지 확인.
- **게이트 통과 기준**: (a) validation 에러 0건, (b) 난이도 순서 경향이 지켜지고
  (easy ≳ normal ≳ hard) 전체 정답률이 대략 55~88% (small-N이라 §제약의
  건강범위 65~85%보다 느슨하게 잡음) — 특정 난이도 버킷이 통째로 무너지면
  (예: easy 40% 이하) 실패, (c) v3 §5-3 주입검사 통과 (pure/easy phraseStrong
  매칭 5회 이하).
- 실패 시: 샘플 생성 프롬프트(v3 §4-1) 문제인지 엔진 취약점인지 진단 후 재시도.
  **전체 400은 생성하지 않는다.**

**Stage 2 — 전체 생성**
- 게이트 통과 시 pure 270 + mixed 90 + ambiguous 25 + edge 15 생성.
  2~3개 모델 혼용(provider 편향 제거).
- validate 전수 통과. 인간 검토 40개(10%) 자연성 yes 70% 이상.

**Stage 3 — 평가·기록**
- `test-eval-and-report.mts` 전체 실행 → `docs/eval-report.html`, `docs/eval-results.json`.
- `docs/AI-ROLE-EVAL-RESULTS.md`를 v3 결과로 갱신. 기존 v1 표는 "무효 측정 (참고)"로
  명시해 보존.

**Stage 4 — 결과 분기 (후속 작업 권고)**

이 계획의 범위는 `docs/AI-ROLE-EVAL-RESULTS.md`가 v3 결과로 갱신되는 시점에 끝난다.
아래는 측정 결과에 따른 후속 *권고*이며, 각각 별도 트리아지·계획이 필요한 새 작업이다.

- 전체 65~85% & 혼동행렬 핫스팟 없음 → 엔진 양호. 개선 작업 불필요. (이 계획의
  목표 달성으로 종료)
- 65% 미만 또는 특정 역할 F1 낮음 → 혼동행렬이 지목하는 역할쌍을 타깃 개선
  권고 (키워드 사전 §7 / negative 신호 / 그룹 cap).
- 85% 초과 → 샘플이 엔진 친화적 편향(v2 재발) → 재생성 (Stage 1~3 반복).
- A 결과가 실제 분포와 어긋난 정황 → Approach C(실세션 교차검증) 권고.

## 열린 질문

- 생성 모델 다양화: 현재 외부 블라인드 생성기는 zai(GLM) 단일 — v3 §8-2는 2~3개
  혼용 권장. Claude/Codex 생성 경로를 추가할지.
- 400샘플 생성의 API 비용 예산 상한 — 파일럿 30개 비용으로 전체를 추정한 뒤 확정.

## 성공 기준

- 현재 엔진의 검증된 전체 정확도 + 9역할 precision/recall/F1 + 9×9 혼동행렬이
  `docs/AI-ROLE-EVAL-RESULTS.md`에 기록된다.
- 그 수치가 v3 건강 범위 안이거나, 벗어났다면 "샘플 편향" vs "엔진 취약점"이
  판별돼 있다.
- 파일럿 게이트가 전체 생성 전에 1회 작동했고 통과/실패 근거가 남는다.
- "AI 직업을 개선해야 하는가, 한다면 어느 역할쌍을"이 데이터로 답해진다.

## 산출물 정책

이 작업은 내부 측정이며 배포물이 아니다. v3 §9 기준:
`tests/fixtures/role-eval-samples/`·`docs/eval-report.html`·`docs/eval-results.json`은
`.gitignore`(재생성 가능), 스펙·스크립트·`AI-ROLE-EVAL-RESULTS.md`는 커밋한다.

## 다음 단계

1. **(첫 행동)** Stage 0: 픽스처 디렉터리 생성 + `validate-eval-samples.mts` 신규 작성
   + `test-eval-and-report.mts`에 역할별 F1·v3 4-카테고리 반영. 생성 스크립트 API 키 점검.
2. Stage 1 파일럿: `debug`+`data` 30샘플(2역할×3난이도×5) 생성 → validate → eval →
   게이트 판정.
3. 게이트 통과 시 Stage 2~3, 실패 시 진단·재시도.
4. Stage 4 결과를 `AI-ROLE-EVAL-RESULTS.md`에 기록하면 이 계획은 종료. 후속(개선/
   재생성/Approach C)은 각각 별도 계획.

> Stage 0~1은 파서/타입을 건드리지 않는 스크립트·픽스처 작업이므로 트리아지 STANDARD.
> 전체 실행 단계는 `/memtest` 스킬이 평가·리포트를 래핑하므로 그대로 활용한다.
