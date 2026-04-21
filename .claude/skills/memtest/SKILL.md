---
name: memtest
classification: workflow
classification-reason: "AI 역할 평가 샘플 테스트 및 결과 분석은 여러 단계의 워크플로우"
deprecation-risk: none
description: |
  AI 역할 평가 샘플 테스트 및 HTML 리포트 생성.
  
  /memtest 실행 시: scripts/test-eval-and-report.mts를 npx tsx로 실행하고, 
  생성된 docs/eval-report.html을 브라우저에서 엽니다.
  
  Triggers: /memtest, 평가 테스트, AI 역할 테스트, eval test
  Keywords: 평가, 테스트, 역할 분류, 리포트, AI 성향, eval, role, personality
argument-hint: "(인수 없음)"
user-invocable: true
allowed-tools:
  - Bash
  - Read
---

# memtest — AI 역할 평가 실행 스킬

## 즉시 실행 (Claude에게 지시)

이 스킬이 호출되면 **반드시 아래 단계를 순서대로 실행**해라:

### Step 1: 테스트 스크립트 실행

Bash 도구로 다음 명령을 실행:

```bash
cd /Users/radar/Work/memradar && npx tsx scripts/test-eval-and-report.mts
```

### Step 2: 결과 확인

스크립트 출력에서 정확도 수치를 확인하고 사용자에게 요약 보고:
- 전체 정확도
- 카테고리별 정확도 (pure/mixed/ambiguous/consistency)
- 난이도별 정확도 (easy/normal/hard)

### Step 3: HTML 리포트 열기

Bash 도구로 리포트 파일을 브라우저에서 열기:

```bash
open /Users/radar/Work/memradar/docs/eval-report.html
```

### Step 4: 사용자에게 최종 보고

다음 형식으로 짧게 보고:

```
✅ 테스트 완료

📊 정확도: X.X% (N/총합)
📄 리포트: docs/eval-report.html (브라우저에서 열림)

주요 발견:
- [카테고리/난이도별 간단 요약]
- [개선 포인트 1-2개]
```

## 관련 파일

- **실행 스크립트**: `scripts/test-eval-and-report.mts`
- **분류 로직**: `src/lib/usageProfile.ts`
- **샘플 디렉토리**: `tests/fixtures/role-eval-samples/` (218개)
- **출력 HTML**: `docs/eval-report.html`
- **출력 JSON**: `docs/eval-results.json`
- **출력 마크다운**: `docs/AI-ROLE-EVAL-RESULTS.md`

## 에러 처리

- **샘플 파일 없음**: `tests/fixtures/role-eval-samples/` 디렉토리 확인 지시
- **tsx 에러**: `scripts/test-eval-and-report.mts` 파일 존재 확인
- **HTML 생성 실패**: 에러 메시지 그대로 보고

## 중요 제약

- 이 스킬은 **스크립트를 실행하는 역할만** 한다
- 코드를 수정하지 마라 (읽기 전용)
- `analyzeUsageTopCategories()` 로직을 변경하지 마라
- 샘플 JSON 파일을 수정하지 마라
