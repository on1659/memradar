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
- 정찰 깊이, 검수 회수, 리팩터 범위를 줄이는 이유가 "빠름"이라면 그 결정은 무효.
- 단, **리스크 분리·검수 가능성·롤백 가능성**을 위한 단계 분할은 유효 (속도 노선이 아닌 품질 노선).
- "지금 떠오른 가벼운 픽스"가 있을 때 멈춰서 자문: *"근거가 빠름이라면, 정석은 무엇인가?"*

추천/제안 시 적어야 할 근거: 결과물 품질, 정확성, 일관성, 검수 가능성, 롤백 가능성, 리스크 분리, 데이터 안전성. 적지 말아야 할 근거: 빠른 적용, 최소 변경, 변경 라인 수.

## 에이전트 (선택 도구)

강제 파이프라인·선언 절차는 없다. 작업 성격상 필요할 때만 부른다. 정의는 [`.claude/agents/`](.claude/agents/).

- **Scout** — 수정 대상·패턴·의존성·불변조건 정찰 (영향 범위가 불투명할 때)
- **Coder** — 지시서 기반 구현
- **Reviewer** — 타입 안전·패턴 준수·세션 데이터 보호·UI 일관성 검토
- **QA** — 트랜스크립트 다양성·Wrapped 시나리오·CLI 엣지케이스 검증

다음 변경은 파급이 커서 정찰·검수를 붙이는 편이 낫다: `parser.ts`+`types.ts` 동시 변경 / Wrapped 슬라이드 수·순서 변경 / CLI 스키마 변경 / `package.json` 의존성 추가 / 새 출력 포맷 / 세션 데이터 취급 변경.

## 지식/스킬 시스템

경험 → lesson → skill 3단계 누적. 자세히는 [`.claude/knowledge/README.md`](.claude/knowledge/README.md).

- **lessons** — `.claude/knowledge/lessons/{영역}.md` 에 함정/실수 누적
- **skill-candidates** — 같은 패턴이 3회 이상 반복되면 `.claude/knowledge/skill-candidates.md` 에 후보 등록
- **skills** — 사용자 승인 시 `.claude/skills/{name}/` 로 승격 (Anthropic 표준)

에이전트를 쓴 작업이 끝나면 Coder/Reviewer/QA는 발견한 lesson 후보를 보고서 끝에 반드시 제안.
