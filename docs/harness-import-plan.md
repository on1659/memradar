# Harness Import Plan

> Memradar 테스트 하네스가 "무엇을 가져오고, 무엇을 버리는지" 기준을 잡은 문서. 새 테스트 카테고리를 추가할 때 이 판단 기준을 재사용한다.
>
> _Status stamp: v0.2.12 / 2026-04-19_

## 가져올 것

- [✅ imported] 결정론적 픽스처 기반 테스트 (`tests/fixtures/`, `tests/empty-home/`)
- [✅ imported] 단일 진입점 하네스 명령 (`npm run test:harness` — lint+build+cli+e2e 체인)
- [✅ imported] `vite preview` 대상 Playwright 스모크 테스트 (`tests/memradar.spec.ts`)
- [✅ imported] 버리기 쉬운 출력 경로로 동작하는 CLI 스모크 (`tests/harness-cli.mjs`)
- [✅ imported] GitHub Actions 에서 Playwright 아티팩트 업로드 (`.github/workflows/harness.yml`)

## 부분만 가져올 것

- [🔶 partial] **훅 스타일 품질 게이트** — Memradar 에서는 쉘 가드보다 테스트·린트 룰로 표현한다. (lint 가 `test:harness` 의 첫 단계로 흡수됨)
- [🔶 partial] **모바일 검증** — 개념은 유지하되, 별도 가드 스크립트가 아니라 Playwright 뷰포트 커버리지로 보장한다.
- [🔶 partial] **단계형 파이프라인 사고** — 체크리스트 마인드는 유지하되, 프로젝트 규모를 고려해 저장소 로컬 하네스 한 개로 압축한다.

## 버릴 것

- [❌ discarded] 소켓 보안 가드 (Memradar 는 서버가 없다)
- [❌ discarded] 게임 결과 랜덤성에 묶인 공정성 가드
- [❌ discarded] 에이전트 오케스트레이션(`/build`, `/meeting` 류) 명령 생태계
- [❌ discarded] 특정 제품 QA 플로우에 고정된 멀티플레이어 브라우저-MCP 작업

## 적용 결과

- 로컬: `npm run test:harness`
- CI: `.github/workflows/harness.yml`
- 가이드 문서: [harness.md](./harness.md)
