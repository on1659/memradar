---
name: memtest
classification: workflow
classification-reason: "AI 역할 평가 샘플 테스트 및 결과 분석은 여러 단계의 워크플로우 (수집→검증→평가→리포팅)"
deprecation-risk: none
description: |
  AI 역할 평가 샘플 테스트 및 HTML 리포트 생성 워크플로우.
  
  역할 분류 정확도를 검증하고 시각화된 평가 결과를 생성합니다.
  
  Triggers: /memtest, /test-eval-samples, /eval-report
  
  Keywords: 평가, 테스트, 역할 분류, 리포트, AI 성향, eval, role, personality
  
argument-hint: "선택 사항: [--html] [--json] [--sample <id>]"
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash
---

# memtest — AI 역할 평가 테스트 스킬

## 목적

`tests/fixtures/role-eval-samples/` 디렉토리의 AI 역할 평가 샘플을 자동으로 테스트하고, 정확도/혼동/신뢰도를 분석하여 **HTML 리포트**로 생성합니다.

## 사용 시기

- 새로운 평가 샘플을 추가했을 때 정확도 검증
- 역할 분류 알고리즘 개선 후 회귀 테스트
- 역할별/난이도별 성능 분석 필요
- 경영진/팀에 평가 결과 공유

## 워크플로우

### Step 1: 샘플 검증
- 모든 JSON 샘플 파일 로드 (`tests/fixtures/role-eval-samples/`)
- 스키마 검증: `intendedRole`, `acceptableRoles`, `messages` 존재 확인
- 메시지 형식 검증: user/assistant 역할 교대 확인

### Step 2: 각 샘플 평가
- `src/lib/usageProfile.ts`의 `analyzeUsageTopCategories()` 호출
- 예측 역할 + 신뢰도 계산
- 정답 여부 판단: `predictedRole ∈ acceptableRoles`

### Step 3: 집계 통계 계산
- **전체 정확도**: (정답 수) / (전체 샘플 수)
- **카테고리별**: pure / mixed / ambiguous / consistency
- **난이도별**: easy / normal / hard
- **혼동 행렬**: 역할 간 오분류 패턴
- **신뢰도 분포**: 예측 신뢰도별 정확도

### Step 4: HTML 리포트 생성
- 인터랙티브 대시보드 형식
- 차트: 정확도, 혼동 행렬, 신뢰도 분포
- 샘플 상세표: 각 샘플의 예측 결과
- 내보내기: CSV, JSON

## 실행 방법

### 전체 테스트 및 리포트 생성
```bash
npm run test:eval
```

### HTML 리포트 보기
```bash
npm run report:eval
```

### 명령행 직접 실행
```bash
npx tsx scripts/test-eval-and-report.mts
```

## 출력

### 생성 파일

| 파일 | 위치 | 용도 |
|------|------|------|
| **HTML 리포트** | `docs/eval-report.html` | 브라우저에서 보기 |
| **결과 요약** | `docs/AI-ROLE-EVAL-RESULTS.md` | 마크다운 문서 |
| **상세 데이터** | `docs/eval-results.json` | 프로그래밍 접근용 |

### HTML 리포트 구성

1. **Summary Card**
   - 전체 정확도 (%)
   - 테스트한 샘플 수
   - 생성 시각

2. **Performance Breakdown**
   - 카테고리별 정확도 (pure/mixed/ambiguous)
   - 난이도별 정확도 (easy/normal/hard)
   - Bar 차트

3. **Confusion Matrix**
   - 히트맵 형식 (9×9 역할 행렬)
   - 대각선: 정답, 옆: 오분류
   - 셀 클릭으로 상세 보기

4. **Confidence Distribution**
   - 신뢰도 구간별 정확도
   - 신뢰도 높을수록 정확도도 높은지 검증

5. **Sample Details Table**
   - 모든 샘플의 개별 결과
   - 검색, 정렬, 필터링
   - CSV 내보내기

## 예시 결과

```
✓ 샘플 로드: 218개
✓ 평가 완료
─────────────────────────
📊 정확도: 71.1% (155/218)
  • pure:      68.8% (99/144)
  • mixed:     70.0% (28/40)
  • ambiguous: 87.5% (14/16)
  • consistency: 77.8% (14/18)

  • 쉬움:       69.4% (34/49)
  • 보통:       67.3% (74/110)
  • 어려움:      79.7% (47/59)

📄 리포트 생성: docs/eval-report.html
```

## 토픽별 가이드

### 정확도가 낮으면 (< 70%)

1. **혼동 행렬 확인**: 어떤 역할과 자주 헷갈리나?
   - feature ↔ review 높음 → 키워드 구분 필요
   - debug ↔ refactor 높음 → 신호 가중치 조정

2. **난이도별 성능 확인**: hard 샘플에서만 떨어지나?
   - 네 → 신호 강도 기준 상향 필요
   - 아니오 → 알고리즘 전반 재검토

3. **신뢰도 분포 확인**: 높은 신뢰도에서도 틀리나?
   - 네 → 키워드 오버피팅 가능성
   - 아니오 → 신뢰도 임계값 낮춰야 함

### 특정 역할 성능 확인

샘플 상세표에서 역할별 필터링 후:
- 정답 샘플의 공통점 분석
- 오답 샘플의 패턴 찾기

## 관련 파일

- `src/lib/usageProfile.ts` — `analyzeUsageTopCategories()` 함수
- `tests/fixtures/role-eval-samples/` — 평가 샘플 모음
- `docs/AI-ROLE-EVAL-SAMPLES-SPEC.md` — 샘플 생성 명세
- `docs/AI-ROLE-SCORING-REDESIGN.md` — 역할 분류 로직

## 다음 단계

1. **샘플 추가**: 부족한 역할/카테고리에 샘플 추가
2. **튜닝**: 낮은 정확도 역할의 키워드 가중치 조정
3. **재평가**: `npm run test:eval` 다시 실행하여 개선 확인
