# Generate AI Role Evaluation Samples

AI 역할 분류기(`src/lib/usageProfile.ts`)의 정확도를 측정하기 위한 합성 평가 샘플 109개를 Z.AI (Zhipu GLM-4.6) 로 생성한다.

## 사용법

### 인자 (optional)

- `--model <name>`: Z.AI 모델 지정 (기본: `glm-4.6`). 예: `glm-4.5-air`, `glm-4-plus`
- `--skip-eval`: 생성만 하고 평가는 스킵
- `--clean`: 기존 `tests/fixtures/role-eval-samples/` 비우고 새로 생성
- 그 외 토큰은 무시

## 실행 전 점검

1. **Z.AI 키 확인** — 다음 중 하나 필수:
   - `.env` 파일에 `ZAI_API_KEY=...` (권장, `.gitignore` 처리됨)
   - 또는 환경변수 `export ZAI_API_KEY="..."`
   - 없으면 STOP 하고 사용자에게 `.env.example` 복사 안내:
     ```
     cp .env.example .env
     # .env 에 키 입력
     ```
   - 키 발급: https://z.ai/

2. **모델 확인** — 기본 `glm-4.6` (최신 플래그십). 변경하려면:
   - `.env` 에 `ZAI_MODEL=glm-4.5-air` 같이 지정
   - 사용자가 GLM 5.x 등 새 모델 언급하면 그 이름 그대로 사용 (스크립트가 거르지 않음)

2. **작업 트리 체크** — `tests/fixtures/role-eval-samples/` 기존 파일 확인
   - 파일 있으면 덮어쓰기 여부 `AskUserQuestion` 으로 확인
   - `--clean` 있으면 자동 삭제

3. **네트워크 확인** — 중국 외부 접속 때 Z.AI 가끔 느림. 15분 타임아웃.

## 실행 플로우

1. **생성** (약 10-20분, 109 × API 호출):
   ```bash
   npx tsx scripts/generate-eval-samples-zai.mts
   ```
   - CONCURRENCY=4 로 병렬 호출
   - 실패 샘플은 재시도 3회 후 폐기
   - 결과: `tests/fixtures/role-eval-samples/sample-*.json` (최대 109개)

2. **평가** (`--skip-eval` 아니면 자동 실행):
   ```bash
   npx tsx scripts/eval-role-samples.mts
   ```
   - 각 샘플 → `analyzeUsageTopCategories` 실행
   - top1 역할이 `acceptableRoles` 포함되는지 확인
   - 결과: `docs/AI-ROLE-EVAL-RESULTS.md`

3. **요약 출력**:
   - 전체 정확도
   - 카테고리별 / 난이도별 정확도
   - Top 5 오분류 쌍
   - 생성 성공률 (예: 107/109 = 98.2%)

## 비용 추정

- GLM-4.6 (flagship): 입력 $0.60/1M, 출력 $2.20/1M
- 109 세션 × 평균 200 msgs ≒ 22k input + 35k output tokens
- **총 약 $0.10-0.15** (Haiku 보다 저렴)

## 결과 해석 가이드

### >80% 정확도
Phase 1/2 로직 건강. 튜닝 불필요.

### 50-80% 정확도
혼동행렬 확인. 특정 카테고리 keyword dict 약함 의심.

### <50% 정확도
- GLM-4.6 한국어 bias 가능성 (generator 필드로 추적)
- 또는 Phase 1/2 로직 근본 문제

결과 발표 시 **`generator: glm-4.6`** 명시. 다른 LLM 으로 재생성해서 cross-check 하는 게 ideal.

## 안전 규칙

- **절대 실제 유저 세션 파일 건드리지 않음** — 오직 `tests/fixtures/role-eval-samples/` 만 읽고 씀
- 샘플 내용에 실제 회사/사람 이름 있으면 플래그 (프롬프트에서 금지했지만 누락 가능)
- `.gitignore` 처리된 폴더라 git add 금지

## 에러 핸들링

- **401 Unauthorized**: 키 만료 또는 잘못됨. STOP 하고 키 재발급 안내.
- **429 Rate limit**: CONCURRENCY 낮추고 재시도 (4 → 2).
- **JSON 파싱 실패 반복**: 모델 컨텍스트/온도 튜닝 시도. 또는 `--model glm-4-plus` 로 변경.

## 실행 후 다음 스텝 (참고, 자동 수행 X)

평가 결과 나오면 사용자 선택:
- 만족 → 끝. 결과 문서 리뷰.
- 불만족 → Phase 1/2 키워드 조정 (`src/lib/usageProfile.ts`) 후 재평가.
- Cross-check 원함 → 다른 LLM (Claude Sonnet, GPT-4o) 로 재생성.

## 하지 않는 것

- 하드코딩 샘플 생성 (`make-static-samples.mts` 와 별개)
- 샘플 git 커밋 (의도적으로 .gitignore)
- `usageProfile.ts` 로직 수정 (평가만 담당)
- 실제 유저 세션 분석 (별도 `scripts/analyze-my-data.mts` 담당)
