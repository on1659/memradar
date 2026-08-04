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

## C-003: svg-dataviz-checklist (순수 SVG 데이터비주얼 컴포넌트 작성 체크리스트)

- **신호**: 같은 작업 패턴 4회 누적 — recharts 없이 순수 SVG(+framer-motion)로 차트/레이더를 자체 구현할 때의 함정이 `_common.md`에 4개 쌓임: L-7(반응형 `preserveAspectRatio="none"` 비등방 왜곡), L-14(리터럴 유니온 SVG prop `textAnchor` 등 string widening → TS2322), L-15(양극 축 → 레이더 전개 매핑 3중 검산 + 균형 ε), L-16(라벨 폰트 viewBox 단위 → 렌더 px 환산 대조). memradar는 번들 크기·테마 CSS 변수 통합 때문에 차트 라이브러리 대신 자체 SVG를 쓰는 방향이라 이 패턴이 계속 재발할 소지. **추가 신호**: 이제 SVG 레이더가 2개(`PersonalityRadar`·`UsageRadar`)로 동일 규약(viewBox 고정+size 분리 · 12시 시계방향 좌표 · `overflow:visible` 라벨 · CSS 변수 색 · textAnchor 캐스팅 · 조기 return 전 훅 없음)을 공유 — **레이더 컴포넌트 규약 2/3**, 세 번째 레이더 등장 시 즉시 승격 검토.
- **출처 lessons**: `_common.md` L-7, L-14, L-15, L-16
- **예상 스킬 범위**: 순수 SVG 데이터비주얼(차트·레이더·게이지) 작성 표준 체크리스트 — (1) 반응형은 `vectorEffect="non-scaling-stroke"` + 형태 유지 요소는 %좌표 HTML 오버레이(`preserveAspectRatio="none"` 금지), (2) 리터럴 유니온 SVG prop은 계산부에서 `as` 캐스팅, (3) 양극/스펙트럼 축을 다각형으로 펼치면 우극=value/좌극=1−value·라벨 인덱스 정합·180° 대면(합=1) 3중 검산 + 우세 강조 `raw≥0.5+ε`, (4) 색은 전부 `var(--color-*)` CSS 변수(테마 4종·Wrapped 스코프 자동 적응), (5) 라벨 폰트는 렌더 px(`fontSize·size/V`)로 환산해 형제 컴포넌트와 통일 + 나란히 둘 땐 레이더 size 통일·`flex-1` 여백 흡수, (6) 검증은 lint+`tsc`+실데이터 렌더(치우침/균형 2케이스)까지. 신규 SVG 시각화 컴포넌트 착수 시 이 6항목을 자동 점검.
- **승격 결정**: pending

<!-- 새 후보는 여기에 추가 -->
