# Release lessons

npm publish, GitHub 배포 관련 함정.

## L-001: GitHub Actions로 publish 불가

- **언제 만났나**: 2026-04-19 이후
- **함정**: GitHub Actions 정책 차단으로 CI publish가 실패. CI에 의존한 파이프라인이 깨짐
- **회피**: 로컬 `.npmrc` + 로컬 `npm publish` 경로 고정. npm 계정 `radar92`, 2FA bypass용 granular token 필요. 자세한 절차는 `.claude/skills/release/` 스킬 참조
- **연관 파일/함수**: `package.json`, `.npmrc`, `.claude/skills/release/`

<!-- 추가 lesson은 여기에 -->
