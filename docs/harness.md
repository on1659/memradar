# Test Harness

Memradar 는 린트·빌드·CLI 스모크·브라우저 E2E 를 한 번에 검증하는 결정론적 테스트 하네스를 제공한다. 개발 중에도 CI 에서도 동일하게 동작한다.

## 명령어

| 명령 | 역할 |
|---|---|
| `npm run lint` | ESLint 전수 검사 |
| `npm run build` | 프로덕션 번들 생성 |
| `npm run test:cli` | 픽스처 로그로 단독 HTML 아티팩트를 만들고, 번들이 정상 임베드됐는지 검증 |
| `npm run test:e2e` | `vite preview` 대상 Playwright 스모크 |
| `npm run test:harness` | 위 4단계(lint → build → cli → e2e)를 한 번에 실행 |

## 픽스처 설계

- 브라우저 테스트는 앱 부팅 전에 파싱된 픽스처 세션을 주입한다. 실제 `~/.claude/projects/` 경로에 의존하지 않는다.
- CLI 테스트는 환경 변수로 입력·출력 경로를 픽스처 영역에 고정한다.
  - `MEMRADAR_PROJECTS_DIR=tests/fixtures/logs`
  - `MEMRADAR_OUTPUT_HTML=<임시 파일>`
- Playwright 실패 시 스크린샷·트레이스는 `test-results/` 에 쌓이고, CI 에서 아티팩트로 업로드된다.

## 설계 원칙

- **결정론**: 동일 입력이면 동일 출력을 보장해야 한다. 로컬 세션 폴더 같은 외부 상태에 의존하지 않는다.
- **분리된 실패 신호**: CLI 번들링 문제와 브라우저 렌더링 문제는 서로 다른 단계에서 실패한다.
- **단일 진입점**: `npm run test:harness` 하나로 전체 품질 게이트를 돌릴 수 있다.

## CI 연동

`.github/workflows/harness.yml` 에서 push/PR 마다 위 하네스를 실행한다. Node 20 + Playwright(chromium) 환경에서 동작하며, `test-results/` 는 실패 시 아티팩트로 자동 업로드된다.
