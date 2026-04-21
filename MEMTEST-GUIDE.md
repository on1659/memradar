# memtest — AI 역할 평가 테스트 스킬 가이드

## 🎯 개요

**memtest**는 AI 성향 분류 정확도를 자동으로 검증하고 시각화된 HTML 리포트를 생성하는 프로젝트 스킬입니다.

- **위치**: `.claude/skills/memtest/SKILL.md`
- **스크립트**: `scripts/test-eval-and-report.mts`
- **npm 명령**: `npm run test:eval`

## ⚡ 빠른 시작

### 1. 테스트 실행
```bash
npm run test:eval
```

### 2. 결과 보기
```bash
npm run report:eval
```

또는 직접:
```bash
open docs/eval-report.html
```

## 📊 생성되는 결과물

| 파일 | 크기 | 용도 |
|------|------|------|
| `docs/eval-report.html` | 119KB | 📊 대시보드 (브라우저) |
| `docs/eval-results.json` | 93KB | 📋 상세 데이터 (JSON) |
| `docs/AI-ROLE-EVAL-RESULTS.md` | - | 📝 요약 (마크다운) |

## 🔍 리포트 상세 구조

### Summary Section
```
┌─────────────────────────────────────────┐
│  🎯 AI 역할 평가 리포트                    │
│                                         │
│  정확도: 71.1% (155/218)                │
│  샘플 수: 218개                         │
│  높은 신뢰도: 156개                     │
└─────────────────────────────────────────┘
```

### Performance Breakdown
- **카테고리별** (Pure/Mixed/Ambiguous/Consistency)
  - 막대 차트로 정확도 비교
  - 각 카테고리별 통과/실패 수

- **난이도별** (Easy/Normal/Hard)
  - 라인 차트로 추세 표시
  - 난이도별 정확도 변화

### Confusion Matrix
- 9×9 역할 행렬
- 대각선 = 정답 (초록색)
- 옆칸 = 오분류 (빨강색)

### Confidence Distribution
- 신뢰도 5단계 (0%-30%, 30%-50%, 50%-70%, 70%-85%, 85%-100%)
- 각 구간별 정확도
- 신뢰도와 정확도 상관관계 시각화

### Sample Details Table
- 모든 218개 샘플의 개별 결과
- 검색 가능한 표 형식
- 필터링 옵션

## 📈 해석 가이드

### 정확도가 높으면 (> 80%)
✅ 역할 분류 알고리즘이 안정적

### 정확도가 낮으면 (< 70%)
❌ 다음을 확인해야 함:

1. **혼동 행렬 확인**
   - 어떤 역할끼리 자주 헷갈리나?
   - 예: feature ↔ review 많음 → 키워드 구분 필요

2. **난이도별 성능 확인**
   - hard 샘플에서만 떨어지나?
   - easy에서 떨어지면 기본 신호가 약함

3. **신뢰도 분포 확인**
   - 높은 신뢰도에서도 틀리나? → 키워드 오버피팅
   - 낮은 신뢰도에서만 틀나? → 임계값 조정 필요

## 🔧 커스터마이징

### 새로운 샘플 추가
```bash
# tests/fixtures/role-eval-samples/에 JSON 파일 추가
# 형식: sample-{id}-{intendedRole}.json
```

### 기존 샘플 수정
1. JSON 파일 수정
2. `npm run test:eval` 다시 실행

### 알고리즘 튜닝
1. `src/lib/usageProfile.ts`의 키워드 가중치 수정
2. `npm run test:eval` 실행
3. HTML 리포트에서 결과 확인

## 📁 관련 파일

```
memradar/
├── .claude/skills/memtest/
│   └── SKILL.md                    ← 이 스킬
├── scripts/
│   └── test-eval-and-report.mts    ← 테스트 실행 스크립트
├── src/lib/
│   └── usageProfile.ts             ← 역할 분류 로직
├── tests/fixtures/role-eval-samples/
│   ├── sample-001-feature.json
│   ├── sample-114-debug.json       ← 당신의 샘플
│   └── ... (218개 샘플)
└── docs/
    ├── eval-report.html            ← 생성된 리포트
    ├── eval-results.json           ← 생성된 데이터
    ├── AI-ROLE-EVAL-RESULTS.md     ← 생성된 요약
    └── ...
```

## 🚀 다음 단계

### Phase 1: 검증
```bash
npm run test:eval
# 현재 정확도 71.1% 확인
```

### Phase 2: 분석
1. HTML 리포트 열기
2. 혼동 행렬에서 문제점 찾기
3. 높은 오분류 쌍 식별

### Phase 3: 튜닝
1. `src/lib/usageProfile.ts`의 CATEGORY_DATA 수정
2. 키워드 가중치 조정 (docs/AI-ROLE-SCORING-REDESIGN.md 참조)
3. 다시 테스트

### Phase 4: 검증
```bash
npm run test:eval
# 개선된 정확도 확인
```

## 📝 예시 리포트 해석

```
정확도: 71.1% (155/218)
       ↓
카테고리:
  • pure:      68.8%  ← 단순 역할 샘플
  • mixed:     70.0%  ← 혼합 역할 샘플
  • ambiguous: 87.5%  ← 여러 역할 가능 샘플 (높음!)
  • consistency: 77.8% ← 일관성 샘플

난이도:
  • easy:      69.4%  ← 쉬운 샘플
  • normal:    67.3%  ← 보통 샘플 (가장 낮음)
  • hard:      79.7%  ← 어려운 샘플 (역설적으로 높음!)
```

**해석**:
- hard 샘플이 normal보다 정확도가 높은 이유?
  - hard 샘플은 명확한 1-2개 신호에 의존
  - normal 샘플은 혼재된 신호로 혼동

## 🛠️ 문제 해결

### "샘플을 찾을 수 없습니다"
```bash
# 확인
ls tests/fixtures/role-eval-samples/ | wc -l
# 0이면 샘플 생성 필요
npm run generate:samples  # 또는
npx tsx scripts/generate-eval-samples.mts
```

### HTML 리포트가 안 열려요
```bash
# 직접 경로 확인
ls -l docs/eval-report.html

# 수동으로 열기
open docs/eval-report.html
```

### 차트가 안 나타나요
- 인터넷 연결 확인 (Chart.js는 CDN에서 로드)
- 브라우저 콘솔에서 에러 확인

## 📚 추가 자료

- `docs/AI-ROLE-EVAL-SAMPLES-SPEC.md` — 샘플 명세
- `docs/AI-ROLE-SCORING-REDESIGN.md` — 분류 로직
- `src/lib/usageProfile.ts` — 구현 코드

---

**마지막 실행**: 2026-04-21  
**테스트된 샘플**: 218개  
**정확도**: 71.1%
