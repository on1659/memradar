# 이더(Ether) 하네스 — 모든 요청에 자동 적용

모든 코딩 요청에 대해 이더(Ether) 트리아지를 적용한다.

## 트리아지 판정

요청을 받으면 먼저 실행 수준을 판단해라:

| 수준 | 조건 | 동작 |
|------|------|------|
| **SIMPLE** | 1~2파일, 단일 컴포넌트/함수, 데이터 모델 무관 | 직접 수정 (Hook 가드는 동작) |
| **STANDARD** | UI 변경 또는 파서/타입 단독 변경, 영향 국지 | Scout → Coder → Reviewer |
| **COMPLEX** | 아래 중 하나 이상 해당 | Scout → Coder → Reviewer → QA |

**COMPLEX 트리거 (memradar 컨텍스트):**
- `src/parser.ts` + `src/types.ts` 동시 변경 (세션 데이터 스키마 영향)
- Wrapped 슬라이드 수 변경 또는 슬라이드 순서 변경 (`docs/WRAPPED-SPEC.md` 영향)
- CLI 명령어/플래그 추가·삭제 (`src/index.ts`, `bin/*` 영향)
- `package.json` 버전 bump 또는 의존성 추가
- `.claude/` 또는 `docs/` 메타 작업 다수 파일 변경
- 새 슬라이드 컴포넌트, 새 분석 메트릭, 새 출력 포맷
- 세션 데이터 외부 전송 영향이 있는 모든 변경 (CLAUDE.md 제약)

## SIMPLE일 때

트리아지 판정을 1줄로 밝히고 바로 수정해라.

형식: `[트리아지: SIMPLE] 한 줄 사유`

## STANDARD/COMPLEX일 때

1. 트리아지 판정을 1줄로 밝혀라
2. `.claude/agents/scout.md` 에이전트로 코드베이스 정찰
3. Scout 보고서 기반으로 지시서 작성 (수정 파일 + 영향 범위 + 불변조건)
4. `.claude/agents/coder.md` 에이전트로 구현
5. `.claude/agents/reviewer.md` 에이전트로 리뷰
6. (COMPLEX만) `.claude/agents/qa.md` 에이전트로 검증
7. 최종 결과를 사용자에게 보고

## 재트리아지 규칙

- **"확인"과 "수정"은 별개 단계다.** 조사 중 수정 필요성이 생기면, 바로 고치지 말고 트리아지부터 다시 수행해라.
- 사용자가 조사만 요청한 경우("확인해봐", "분석해봐"), 수정이 필요하다는 판단이 나오면 보고 후 사용자 승인을 받아라.
- Scout가 보고한 영향 범위가 최초 트리아지 수준을 넘어서면(예: SIMPLE로 시작했는데 COMPLEX 트리거에 해당) 수준을 상향 재판정해라.

## 작업 방향 원칙 (Quality-first) — 트리아지·구현·추천 전반에 적용

**우선순위:** 결과물 품질 > 정확성 > 정석 > 속도.

- **추천 근거에서 "빠른 적용", "최소 변경", "변경 라인 수 적음"은 제외.**
- 구현 방향 선택에서도 동일. "이게 더 빠르니까"라는 이유로 정석을 우회하지 마라.
- 트리아지 수준을 낮추거나, 정찰을 생략하거나, 검수를 줄이는 이유가 "빠름"이라면 그 결정은 무효.
- 단, **리스크 분리·검수 가능성·롤백 가능성**을 위한 단계 분할은 유효. 이는 속도가 아닌 품질을 위한 것.
- 옵션 비교 시 추천 근거로 적어야 할 것: 결과물 품질, 정확성, 일관성, 검수 가능성, 롤백 가능성, 리스크 분리, 데이터 안전성, 사용자 의도와의 정합.
- 사용자가 "정석대로", "정확하게", "결과물이 가장 좋게"라고 명시했다면 더더욱 위 원칙을 강하게 적용.

## 항상 지켜야 할 것

- 불변조건(must-preserve contracts)을 Scout가 보고하면 절대 깨뜨리지 마라
- **세션 데이터 외부 전송 금지** (CLAUDE.md 제약 — 분석은 로컬에서만)
- Wrapped 슬라이드는 8장 고정 (Cover → Intro → Prompts → Model → Hours → Personality → Usage → Share). `ToolsSlide.tsx` import 금지
- 참조 문서 우선순위:
  - UI/스타일/테마: `docs/DESIGN-GUIDE.md`
  - 아키텍처/CLI: `docs/ARCHITECTURE.md`
  - 기능 범위: `docs/ROADMAP.md`
  - Wrapped 슬라이드: `docs/WRAPPED-SPEC.md`
  - 검색 기능: `docs/SEARCH-SPEC.md`
- **lesson 후보 능동 제안**: 작업 종료 시 Coder/Reviewer/QA가 함정/실수를 새로 발견했다면 보고서 마지막에 "💡 lesson 후보:" 섹션을 추가하고 사용자에게 `.claude/knowledge/lessons/` 에 추가할지 물어라
- **스킬 승격 신호**: 같은 lesson 또는 같은 작업 패턴이 3회 이상 반복되면 `.claude/knowledge/skill-candidates.md` 에 후보로 올리고 사용자에게 스킬 승격 여부를 물어라

## 지식/스킬 시스템

- **lessons** (`.claude/knowledge/lessons/`) — 함정·실수·발견의 누적. 같은 실수를 두 번 하지 않기 위한 메모.
- **skill-candidates** (`.claude/knowledge/skill-candidates.md`) — 반복되는 lesson/패턴이 스킬로 승격될 후보 큐.
- **skills** (`.claude/skills/`) — 자주 쓰는 작업 절차를 표준 스킬로 격상한 것. Anthropic 스킬 표준 따름.

자세한 운영 규칙: [`.claude/knowledge/README.md`](../knowledge/README.md)

## 상세 참조

- 에이전트 정의: `.claude/agents/*.md`
- Hook 명세: `.claude/hooks/*` + 동작은 `.claude/settings.json` 에서 와이어링
