# 내 페르소나 진단 탭 — 설계 문서

> COMPLEX 작업. 자동 분류(usageProfile 9 카테고리)에 사용자 자기응답 검사를 결합해
> Personality 정확도를 높이는 **보정 레이어**를 추가한다. 자동 분류 로직은 무변경.

## 확정 결정 (사용자 승인 2026-06-03)

| 항목 | 결정 | 사유 |
|---|---|---|
| 저장 매체 | **localStorage** (key `memradar.personaQuiz.v1`) | 서버/정적 양쪽 모드 동작, 외부전송 0, 브리지 쓰기 핸들러 불요. 사양의 `~/.memradar` 파일은 정적 모드에서 서버가 없어 동작 불가 → localStorage 영속으로 대체 |
| 정규화 | **top-share** `auto[X] = score[X] / Σscore` | usageProfile는 raw 가중합 출력(정규화 없음). 점유율은 해석 명료(전체의 X%), 기존 도넛/막대 시각화와 일관, 분포 합=1 |
| 라우팅 | **독립 View** `App.tsx`에 `{type:'persona'}` + hash `#persona` | 검사/결과가 독립 화면이라 상태 격리 깔끔, URL·뒤로가기 지원 |

## 스코프 경계

- **무변경(읽기 전용):** `src/lib/usageProfile.ts`, `src/lib/personality.ts`, `WrappedView.tsx`의 8장 slides 배열, `ToolsSlide.tsx`(import 금지)
- **보정 안 함:** 3축 personality(style/scope/rhythm) — 9 카테고리와 직접 매핑 없음, scope 외
- **세션 데이터 외부 전송 금지** (보정/퀴즈 결과도 localStorage에만)

## 신규 파일

| 파일 | 역할 |
|---|---|
| `src/lib/personaQuiz.ts` | mulberry32/균등페어생성/computeCalibration 순수 로직 + 진술 사전 import. eval-sharpness.mts는 Node 전용 import라 프론트 번들 불가 → 순수 함수만 복제 |
| `src/lib/personaQuizStorage.ts` | localStorage 읽기/쓰기 래퍼 (load/save/clear, 스키마 검증) |
| `src/lib/personaQuizStatements.ts` 또는 `src/data/personaStatements.ts` | `scripts/eval-sharpness-statements.json`을 src 안으로 가져옴 (src 밖 JSON은 번들 불가). json import 또는 ts 상수화 |
| `src/components/PersonaQuizView.tsx` | 시작→9쌍 검사→결과 전체 화면 |
| `tests/persona-quiz.test.mts` | 균등 샘플링(각 카테고리 정확히 2회) + computeCalibration 공식 단위 테스트 |

## 수정 파일

| 파일 | 변경 |
|---|---|
| `src/App.tsx` | (1) `View` 유니온에 `{type:'persona'}` (2) `viewFromHash` `#persona` 분기 (3) `handlePopState` 분기 (4) 렌더 분기 + 진입 네비 |
| `src/components/Dashboard.tsx` | "AI가 자주 한 일" 카드 진입 버튼 + 보정 결과를 카드 분포에 반영(localStorage 존재 시) |
| `src/components/wrapped/WrappedView.tsx` | Personality 슬라이드용 데이터에 보정 결과 반영(localStorage 존재 시). **slides 배열 불변** |

## 데이터 흐름

```
[검사] 9쌍 응답 → computeCalibration(answers, autoScores)
   ├ quiz_pickrate[X] = X 선택 / X 등장(2회)
   ├ quiz_sharpness[X] = |pickrate-0.5|*2
   ├ w[X] = min(sharpness, 0.6)
   └ appearances>=2 ? final = auto*(1-w) + pickrate*w : auto
        (auto = score[X]/Σscore, top-share 정규화)
   ↓ localStorage 저장 (memradar.personaQuiz.v1)

[표시] Dashboard 카드 / Wrapped Personality 슬라이드
   localStorage 보정 존재 → final 분포 사용
   없으면 → 자동 분류 그대로 (regression 0)
```

## localStorage 스키마 (사양 quiz.json 동일)

```json
{
  "version": 1,
  "ts": "ISO",
  "seed": 123456,
  "answers": [
    { "leftCategory": "feature", "rightCategory": "debug", "chosen": "left|right|skip" }
  ],
  "calibration": {
    "feature": { "pickRate": 0.5, "sharpness": 0.0, "weight": 0.0, "finalScore": 0.12 }
  }
}
```

## 균등 샘플링 (신규 로직)

- 9 카테고리 각각 정확히 2회 등장 → 총 18 슬롯 → 9쌍
- 같은 쌍에 같은 카테고리 금지(left≠right)
- 시드 기반 결정적(mulberry32) — 재검사 시 새 시드
- 단위 테스트로 "각 카테고리 정확히 2회" 불변 검증

## 검사 무결성 (바넘)

- 검사 중 카테고리 id/라벨 **절대 노출 금지** — 진술 텍스트만 표시
- 선택지는 진술(1)/진술(2)/잘 모르겠어요(skip)

## 불변조건 체크리스트

- [ ] usageProfile.ts / personality.ts 무변경
- [ ] Wrapped 8장 slides 배열·lastSlideIndex 무변경
- [ ] ToolsSlide.tsx import 0
- [ ] 외부 네트워크 호출 0 (DevTools Network)
- [ ] 미검사 사용자 regression 0
- [ ] test:sharpness 36/36 유지
- [ ] test:harness 통과
- [ ] computeCalibration 단위 테스트 신규
