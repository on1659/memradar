# Wrapped 슬라이드 lessons

Wrapped 8슬라이드 / 슬라이드 컴포넌트 관련 함정.

## L-001: 슬라이드 수는 8장 고정

- **언제 만났나**: 초기 설계
- **함정**: 새 슬라이드 추가 시 9장 이상으로 늘어나면 네비게이션/공유 카드/도크 인덱스가 깨짐. `ToolsSlide.tsx`는 향후 확장 슬롯이지만 import하면 안 됨
- **회피**: 신규 슬라이드는 기존 8슬라이드 중 하나의 콘텐츠 확장으로 처리. 9장째 필요 시 `docs/WRAPPED-SPEC.md` 갱신 + COMPLEX 트리아지로 진입
- **연관 파일/함수**: `src/components/SessionView.tsx`, `src/components/tools/`, `docs/WRAPPED-SPEC.md`

<!-- 추가 lesson은 여기에 -->
