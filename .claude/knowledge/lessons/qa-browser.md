# 브라우저 QA lessons

memradar를 헤드리스/실제 브라우저로 QA할 때의 함정·셋업 메모. 데이터 주입, 초기 뷰 진입 경로 등 "테스트가 화면을 못 찾는" 류의 시간 낭비를 줄이기 위한 결정 자국.

추가 형식:

```text
## L-{번호}: {1줄 요약}
- **언제 만났나**: {날짜 + 컨텍스트}
- **함정**: X 누락 시 Y 발생
- **회피**: 다음에 어떻게 할지
- **연관 파일/함수**: 경로
```

---

## L-1: 데이터 의존 화면 QA는 세션 fixture 주입 + 초기 뷰(Wrapped intro) 닫기를 먼저 셋업할 것

- **언제 만났나**: 2026-06-04, 페르소나 진단 질문지 작업의 QA. browse 스킬로 앱만 띄우면 세션 데이터가 없어 랜딩(빈 상태)만 보이고 대시보드·진단 탭으로 진입할 수 없었다.
- **함정**: memradar의 진단/대시보드/Wrapped는 세션 데이터가 있어야 렌더된다. 데이터 없이 띄우면 빈 랜딩만 보여 QA 대상 화면에 도달조차 못 한다. 또 데이터를 주입하면 초기 뷰가 **Wrapped intro**라, 그걸 닫기 전엔 대시보드·진단이 가려져 "화면이 안 뜬다"고 오판하기 쉽다.
- **회피**: (1) fixture는 Playwright `addInitScript`로 `window.__MEMRADAR_SESSIONS__`에 주입한다(browse 단독 네비게이션으로는 데이터 주입 불가). (2) 주입 후 첫 화면 Wrapped intro를 `aria-label='전체 보기로 돌아가기'` 버튼으로 닫아야 Dashboard·진단에 진입한다. (3) v1→v2 마이그레이션 같은 localStorage 시나리오는 `memradar.personaQuiz.v1` 페이로드를 직접 주입 후 새로고침으로 검증.
- **연관 파일/함수**: `window.__MEMRADAR_SESSIONS__` 주입 지점, `src/App.tsx`(초기 뷰/뷰 전환), Wrapped intro 닫기 버튼(`aria-label='전체 보기로 돌아가기'`), `tests/*.spec.ts`(Playwright addInitScript 패턴)

## L-2: 데이터 의존 UI 스모크는 `npm run dev`가 아니라 `node cli/index.mjs --server`로

- **언제 만났나**: 2026-06-11, 성장 섹션 QA — vite dev로 띄우면 실데이터 대시보드가 안 나와 스모크 불가였고, CLI 서버로 전환해 해결
- **함정**: vite dev 서버는 `/api/light-sessions`·`/api/session-content`를 서빙하지 않는다(이 API는 `cli/index.mjs`의 서버 모드 전용). `npm run dev`로 띄우면 빈 드롭 화면만 보이고, fixture 주입(L-1) 없이는 데이터 의존 섹션(성장·대시보드·Wrapped)에 도달할 수 없다. "기능이 안 뜬다"로 오판하기 쉬움.
- **회피**: 실데이터 스모크는 `node cli/index.mjs --server --no-open`(포트 3939)으로 기동해 `~/.claude/projects` 실세션을 그대로 서빙받는다. 합성 시나리오 검증은 L-1의 fixture 주입 경로를 사용. 단, 서버 모드는 4000자 텍스트 캡이 적용되므로(parser.md L-003) 텍스트 통계 수치가 정적 모드와 다를 수 있음을 감안.
- **연관 파일/함수**: `cli/index.mjs`(`--server`, `/api/light-sessions`), `vite.config.ts`

## L-3: gstack browse의 `js`는 async 표현식 결과를 소실한다 — 시나리오당 goto+단일 mega-js로 묶을 것

- **언제 만났나**: 2026-07-03, 정밀 진단 QA — 멀티스텝 시나리오(문항 클릭 반복→저장 검증)를 `async` IIFE로 돌리자 결과가 안 돌아오고 플로우만 백그라운드에서 계속 돌아 다음 명령과 겹침. plain Promise 체인(continuation 스타일)으로 바꿔 해결.
- **함정**: browse `js`는 plain Promise 반환값만 await·반환하고, `async` 키워드가 포함된 표현식과 `eval <file>`은 결과가 소실된다(에러도 없이). 게다가 데몬이 Bash 호출 사이(때로는 도중)에 죽으면 페이지·localStorage 상태도 함께 소실돼, 명령을 여러 Bash 호출로 쪼개면 어디서 상태가 날아갔는지 추적 불가.
- **회피**: (1) 멀티스텝 로직은 async-free continuation 스타일 Promise를 파일로 만들어 `js "$(cat file)"`로 실행. (2) 시나리오 하나 = Bash 호출 하나(goto→조작→검증→스크린샷 체이닝). (3) 상태가 이상하면 데몬 재시작을 의심하고 goto부터 다시.
- **연관 파일/함수**: gstack browse `js`/`eval`, QA 시나리오 스크립트 패턴

## L-4: memradar는 해시(#dashboard/#persona/#wrapped)로 초기 뷰 직접 진입 가능 — Wrapped intro 닫기(L-1) 생략

- **언제 만났나**: 2026-07-03, 정밀 진단 QA — 매 시나리오마다 Wrapped intro를 닫는 대신 `goto http://localhost:PORT/#persona`로 진단 뷰에 바로 진입해 스텝을 절약.
- **함정**: L-1의 "intro 닫기" 절차를 모든 시나리오에 반복하면 스텝이 늘고, 데몬 사망(L-3)으로 중간 상태가 날아갈 표면도 커진다.
- **회피**: `src/App.tsx`의 `viewFromHash`가 지원하는 해시(`#dashboard`, `#persona`, `#wrapped`)로 목표 뷰에 직접 진입한다. intro 상호작용 자체가 검증 대상일 때만 L-1 절차 사용.
- **연관 파일/함수**: `src/App.tsx` `viewFromHash`/popstate 복원
