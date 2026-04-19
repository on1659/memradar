# Development Snapshot

> **이 문서는 핸드오프 스냅샷(작성 후 보존). 최신 상태는 [ROADMAP.md](../ROADMAP.md) / [ARCHITECTURE.md](../ARCHITECTURE.md) 참조. 점검일: 2026-04-19 (v0.2.12).**
>
> 개발 진행 중간 단계에서 남긴 방향 메모. 현재 최신 상태는 [ROADMAP.md](../ROADMAP.md) 와 [ARCHITECTURE.md](../ARCHITECTURE.md) 를 우선 참조한다.

## 합의된 제품 방향

- 로드맵 자체는 넓게 두되, 실행 순서는 좁고 명확하게 가져간다. ✅ shipped
- **Memradar Code Report** 를 제품의 첫 "와" 피처로 삼는다. ✅ shipped (Wrapped, 7 slides)
- **기록 검색**은 Memradar 를 "보는 툴"에서 "아카이브 도구"로 만들어주는 리텐션 피처다. ✅ shipped (full-text + 필터/정렬)
- **세션 리플레이**는 차별화 피처지만 Code Report · 검색 이후의 작업으로 둔다. ⬜ planned (Interactive Replay 스크러버 미착수)

## 권장 빌드 순서

1. 앱 품질 안정화: 텍스트·인코딩 정리, 기본 폴리싱, lint·build 상태 유지. ✅ shipped
2. **Memradar Code Report** 구현. ✅ shipped
3. **기록 검색** 구현. ✅ shipped
4. **세션 리플레이** 구현. ⬜ planned
5. Provider 확대 및 AI 인사이트 피처는 초기 제품 신호를 본 뒤 재평가. ✅ shipped (Provider: Claude + Codex 플러그인, Personality 3축 / Language profile / CLI `--static`·`--version` 포함 · Achievements·Code Evolution·Growth metrics 는 ⬜ planned)

## 검색 MVP 범위 (기록용)

채택된 범위:

- 세션·메시지 풀텍스트 검색
- 모델·툴·프로젝트(`cwd`)·날짜 필터
- 결과 스니펫과 검색어 하이라이트
- 세션 상세로 클릭 이동

MVP 에서 제외:

- 벡터 검색
- 자연어 의미 검색
- 복잡한 쿼리 문법

상세는 [SEARCH-SPEC.md](../SEARCH-SPEC.md).
