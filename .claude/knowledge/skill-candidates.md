# 스킬 승격 후보 큐

`lessons/` 또는 반복 작업 패턴이 스킬로 격상될 후보를 모은다. 사용자 승인 시 `.claude/skills/{name}/SKILL.md` 로 승격.

## 후보 형식

```
## C-{번호}: {스킬 이름 후보}
- **신호**: {왜 후보로 올렸나 — lesson 누적 / 반복 요청 / 자동화 가치}
- **출처 lessons**: {연관 lesson 번호 나열}
- **예상 스킬 범위**: {스킬이 무엇을 자동화하거나 표준화할지}
- **승격 결정**: pending / approved / rejected
```

## 승격 신호 (1개 이상 충족 시 후보 등록)

- 같은 영역 lesson 3개 이상 누적
- 사용자가 같은 작업 절차를 3번 이상 요청
- 자동화 가능한 검증/생성 절차

---

## C-001: transcript-fixture-set (예시 후보)

- **신호**: QA 시나리오에서 "큰 세션 / 작은 세션 / tool 가득 / 한영 혼용 / 잘린 jsonl" 5종 픽스처를 매번 재구성하고 있음 (반복 요청 가능성)
- **출처 lessons**: `parser.md` L-001
- **예상 스킬 범위**: 표준 트랜스크립트 픽스처 5종을 `tests/fixtures/` 에 생성하고, parser/Wrapped QA에서 일괄 실행
- **승격 결정**: pending

## C-002: duplicate-with-guard (복제엔 가드 — 재구현/복제물 congruence 가드 강제)

- **신호**: 같은 패턴 반복 2회차 — (1회차) 진술 사전·resolve 로직의 CLI↔프론트 복제 (`personality-eval.md` L-6, deepStrictEqual 동기화 가드로 해결), (2회차) `scripts/analyze-coaching.mts` 룰 보드의 `buildPromptCoaching` 발화 조건 재구현 (`_common.md` L-10, 드리프트 가드 assert + `isEligibleMonth` export 공유로 해결). 3회째 발생 시 승격 검토.
- **출처 lessons**: `personality-eval.md` L-6, `_common.md` L-10
- **예상 스킬 범위**: 코드/데이터를 두 곳에 복제하거나 로직을 재구현할 때 (1) 복제 데이터면 deepStrictEqual verbatim 가드 테스트, (2) 재구현 로직이면 원본 리턴과의 congruence assert를 같은 실행 경로에 생성, (3) 공유 가능한 predicate/상수는 원본 export로 단일화 — 이 3단계 체크리스트를 표준 절차로 자동 적용.
- **승격 결정**: pending

<!-- 새 후보는 여기에 추가 -->
