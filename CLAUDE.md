# Memradar

## 참조 문서

- UI/스타일/테마 작업: `docs/DESIGN-GUIDE.md`
- 아키텍처/CLI: `docs/ARCHITECTURE.md`
- 기능 범위/우선순위: `docs/ROADMAP.md`
- Wrapped 슬라이드: `docs/WRAPPED-SPEC.md`
- 검색 기능: `docs/SEARCH-SPEC.md`

## 제약

- Wrapped 슬라이드는 **8장** (Cover → Intro → Prompts → Model → Hours → Personality → Usage → Share) — `ToolsSlide.tsx`는 import 금지 (향후 확장 슬롯)
- 세션 데이터 외부 전송 금지

## 하네스 (이더 트리아지)

모든 코딩 요청은 트리아지 후 진행. 자세한 룰은 [`.claude/rules/harness.md`](.claude/rules/harness.md).

- **SIMPLE** — 1~2파일, 단일 컴포넌트/함수. 직접 수정.
- **STANDARD** — UI 변경 또는 파서/타입 단독 변경. Scout → Coder → Reviewer.
- **COMPLEX** — `parser.ts`+`types.ts` 동시 변경 / Wrapped 슬라이드 수·순서 변경 / CLI 스키마 변경 / `package.json` bump / 새 출력 포맷 / `.claude`·`docs` 다파일 변경. Scout → Coder → Reviewer → QA.

매 코딩 요청 첫 줄에 `[트리아지: SIMPLE|STANDARD|COMPLEX] 한 줄 사유` 선언. 미선언 시 `Edit/Write` 훅 차단.

## 지식/스킬 시스템

경험 → lesson → skill 3단계 누적. 자세히는 [`.claude/knowledge/README.md`](.claude/knowledge/README.md).

- **lessons** — `.claude/knowledge/lessons/{영역}.md` 에 함정/실수 누적
- **skill-candidates** — 같은 패턴이 3회 이상 반복되면 `.claude/knowledge/skill-candidates.md` 에 후보 등록
- **skills** — 사용자 승인 시 `.claude/skills/{name}/` 로 승격 (Anthropic 표준)

작업 종료 시 Coder/Reviewer/QA는 발견한 lesson 후보를 보고서 끝에 반드시 제안.
