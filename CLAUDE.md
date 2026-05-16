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

## 작업 방향 원칙 (Quality-first)

**모든 코딩/디자인 의사결정에 동일하게 적용된다.**

- **결과물 품질 > 정확성 > 정석 > 속도** 순서로 결정.
- **"빠르게 적용 가능"은 추천 근거에서 제외**, 구현 방향 선택에서도 제외.
- 트리아지 상향, 정찰 깊이, 검수 회수, 리팩터 범위를 줄이는 이유가 "빠름"이라면 그 결정은 무효.
- 단, **리스크 분리·검수 가능성·롤백 가능성**을 위한 단계 분할은 유효 (속도 노선이 아닌 품질 노선).
- "지금 떠오른 가벼운 픽스"가 있을 때 멈춰서 자문: *"근거가 빠름이라면, 정석은 무엇인가?"*

추천/제안 시 적어야 할 근거: 결과물 품질, 정확성, 일관성, 검수 가능성, 롤백 가능성, 리스크 분리, 데이터 안전성. 적지 말아야 할 근거: 빠른 적용, 최소 변경, 변경 라인 수.

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
