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
