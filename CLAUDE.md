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
