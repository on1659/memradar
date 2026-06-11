# Release lessons

npm publish, GitHub 배포 관련 함정.

## L-001: GitHub Actions로 publish 불가

- **언제 만났나**: 2026-04-19 이후
- **함정**: GitHub Actions 정책 차단으로 CI publish가 실패. CI에 의존한 파이프라인이 깨짐
- **회피**: 로컬 `npm publish` 경로 고정. 인증은 **안전 패턴만** — `.npmrc`(gitignore됨)에 `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` 보간 형식 한 줄만 두고(토큰 평문 미기록), 실제 토큰은 사용자가 본인 셸에 `NPM_TOKEN` 환경변수로 직접 주입(Claude 도구 호출에 토큰 값 미전달). npm 계정 `radar92`, 2FA bypass용 granular token 필요. 자세한 절차는 `.claude/skills/release/SKILL.md` "## npm 인증 (안전 패턴)" 참조
- **연관 파일/함수**: `package.json`, `.npmrc`, `.claude/skills/release/SKILL.md`

## L-002: release 스킬이 인증 세팅을 문서화 안 하면 토큰이 세션 로그에 평문으로 박힌다

- **언제 만났나**: 2026-06-11, G2 마스킹으로 실데이터 HTML 생성 중 과거 release 세션(`484f3212…`, `e2150cd9…`)에서 실제 npm publish 토큰 평문 유출 발견 (시크릿 유출 대응 goaldoc §0-B)
- **함정**: release 절차가 npm 인증 세팅(`.npmrc` 토큰 주입)을 **전혀 문서화하지 않으면**, 매 릴리스마다 즉흥적으로 `echo ...>>.npmrc`/`npm config set ...:_authToken=...` 류 명령으로 토큰을 주입하게 되고, 그 토큰 값이 Claude Code 도구 호출(Bash/PowerShell) 인자로 **세션 로그에 평문 캡처**된다. 토큰이 로그에 박히면 폐기 전까지 계속 유출 위험. "인증은 알아서 되겠지"라고 절차를 비워두는 게 근본 원인.
- **회피**: 안전 인증 절차를 **스킬 본문에 명문화**한다. (1) `.npmrc`엔 `${NPM_TOKEN}` 보간만(리터럴 토큰 미기록, npm 10.9.4+ 지원), (2) 토큰은 사용자가 본인 셸 환경변수로 out-of-band 주입(도구 호출에 값 미전달), (3) 토큰을 `.npmrc`에 쓰거나 명령에 인라인하거나 stdout으로 찍는 명령을 금지 명령으로 명시, (4) release 후 세션 로그를 `npm run scan:secrets`로 재스캔해 토큰 0건 자체검증. 인증을 "문서화 안 함"으로 두면 즉흥 명령이 반드시 들어온다.
- **연관 파일/함수**: `.claude/skills/release/SKILL.md` ("## npm 인증 (안전 패턴)", Post-verify 자체검증), `scripts/scan-secrets.mts`, `cli/lib/secretMask.mjs`, `docs/design/secret-leak-remediation-goaldoc.md`

<!-- 추가 lesson은 여기에 -->
