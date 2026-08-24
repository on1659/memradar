# CLI lessons

`cli/index.mjs` 의 명령·플래그·프로세스 수명·외부 호출에서 만난 함정.

추가 형식:

```
## L-{번호}: {1줄 요약}
- **언제 만났나**: {날짜 + 컨텍스트}
- **함정**: X 누락 시 Y 발생
- **회피**: 다음에 어떻게 할지
- **연관 파일/함수**: 경로
```

---

## L-1: win32 에서 `exec()` 스폰 직후 `process.exit()` 하면 자식이 실행 전에 죽는다

- **언제 만났나**: 2026-08-24, 정적 모드에서 브라우저가 열리지 않는 문제 — `openBrowser()` 가 `exec(cmd)` 를 fire-and-forget 으로 던지고 곧바로 `process.exit(0)` 에 도달했다.
- **함정**: `exec()` 는 셸을 비동기로 띄운다. win32 에서 `cmd.exe /c start "" "<url>"` 이 실제로 브라우저를 기동하기 전에 부모가 `process.exit()` 하면 자식이 함께 죽어, **아무 에러 없이 브라우저만 안 열린다.** 정적 모드처럼 "파일 쓰고 → 열고 → 즉시 종료" 하는 흐름에서만 발생하고, 서버 모드는 프로세스가 계속 살아 있어 재현되지 않는다. 종료 코드도 0 이라 CI·테스트로도 안 잡힌다.
- **회피**: `exec()` 를 Promise 로 감싸 콜백에서 resolve 하고, `process.exit()` 앞에서 반드시 `await` 한다. 일반화하면 — **프로세스를 곧 끝낼 경로에서 `exec`/`spawn` 을 호출할 때는 자식의 기동을 기다릴 것.** 반대로 서버 모드처럼 부모가 계속 사는 경로에서는 `await` 가 불필요하다(응답성만 해친다).
- **연관 파일/함수**: `cli/index.mjs:openBrowser` (호출부: 정적 모드는 `await`, 서버 모드는 fire-and-forget 유지)

## L-2: npm 을 향하는 외부 호출을 새로 추가하면 스위치·문서·"외부 요청 N가지" 카운트를 함께 갱신해야 한다

- **언제 만났나**: 2026-08-24, 대시보드 상단에 npm 공개 다운로드 집계("지금까지 N번 불려나왔어요") 추가 — `registry.npmjs.org` 버전 체크에 이어 `api.npmjs.org` 가 두 번째 npm 호출이 됐다.
- **함정**: memradar 는 README Privacy 에 **"외부 요청은 N가지뿐"** 을 숫자로 못 박아 신뢰를 사는 도구다. 새 아웃바운드를 추가하고 이 문장을 안 고치면 문서가 곧 거짓이 되고, 소스가 공개돼 있어(`npm view` / unpkg / 방화벽 로그) 사용자가 직접 확인할 수 있으므로 들키면 기능 하나가 아니라 **프라이버시 주장 전체의 신뢰가 깨진다**. 또 `--no-update-check` 처럼 기존 플래그의 의미 범위를 결정하지 않고 구현하면 "끈다고 했는데 여전히 npm 을 부른다"가 된다.
- **회피**: npm(또는 임의 외부 호스트)으로 나가는 호출을 추가할 때 한 커밋에서 같이 처리한다 — (1) **기존 off 스위치에 편입**할지 새 플래그를 만들지 명시적으로 결정하고 테스트로 고정, (2) README Privacy 의 요청 개수·목록 갱신, (3) `docs/ARCHITECTURE.md` CLI 섹션 갱신, (4) **실패는 무음 + 기능만 생략**(README "네트워크 없어도 동작" 계약 — 부분 실패 시 부분합/0 을 쓰지 말고 값 자체를 `null` 로), (5) 페이로드에 로컬 정보가 없음을 코드 주석으로 남긴다. 이번 결정: 두 호출 모두 npm 을 향하므로 `--no-update-check` / `MEMRADAR_SKIP_UPDATE_CHECK=1` 스위치를 **하나로 유지**.
- **연관 파일/함수**: `cli/index.mjs:fetchNpmDownloads`·`checkForUpdate`·`noUpdateCheck`, 가드 `tests/harness-cli.mjs`, 문서 `README.md` §Privacy·`docs/ARCHITECTURE.md` §CLI 아키텍처

## L-3: 정적 HTML 의 전역 주입 순서는 테스트가 리터럴로 파싱하는 계약이다 — 새 전역은 `__MEMRADAR_HOOKS__` **앞**에

- **언제 만났나**: 2026-08-24, `window.__MEMRADAR_NPM__` 추가 — HOOKS 뒤에 붙이려다 `tests/hook-events.test.mts` 가 깨질 상황을 사전에 발견.
- **함정**: `tests/hook-events.test.mts:extractEmbedded` 가 `window.__MEMRADAR_HOOKS__=` 부터 **`;</script>`** 까지를 문자열 인덱스로 잘라 `JSON.parse` 한다. HOOKS 뒤에 새 전역을 붙이면 종료 마커 탐색이 새 전역 뒤의 `;</script>` 를 잡아 잘린 구간에 `];window.__MEMRADAR_X__=…` 가 섞여 파싱이 깨진다. 주입부(`cli/index.mjs`)만 보면 이 결합이 안 보이고, 순서를 지켜야 한다는 단서가 코드에 없었다.
- **회피**: 새 전역은 **`__MEMRADAR_SKILLS__` 와 `__MEMRADAR_HOOKS__` 사이**에 끼워 넣는다(HOOKS 를 항상 마지막으로 유지). 순서 계약은 `tests/harness-cli.mjs` 가 가드한다 — HOOKS 슬라이스 안에 다른 `window.__MEMRADAR_` 가 없는지 + `JSON.parse` 성공까지 검증. **정규식 `/HOOKS=.*?;<\/script>/s` 로 가드하면 lazy 매칭이 뒤에 붙은 전역을 삼켜 조용히 통과하므로 무의미하다** — 실제 테스트와 같은 방식으로 잘라서 검사할 것. 새 가드를 쓸 때는 일부러 위반시켜 실패하는지 확인한다.
- **연관 파일/함수**: `cli/index.mjs` (정적 스트리밍 쓰기의 전역 주입 라인 + 그 위 주석), `tests/hook-events.test.mts:extractEmbedded`, 가드 `tests/harness-cli.mjs`, 문서 `docs/ARCHITECTURE.md` §CLI "주입 순서 불변식"
