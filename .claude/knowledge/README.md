# memradar 지식/스킬 시스템

> 자주 부딪히는 함정과 자주 쓰는 작업 절차를 누적·승격하는 시스템.

## 3단계 구조

```
경험 → lesson → skill
```

| 단계 | 위치 | 의미 |
|------|------|------|
| **lesson** | `.claude/knowledge/lessons/{영역}.md` | "X 누락 시 Y 발생" 같은 함정·실수 메모. 다음 사람(또는 다음 세션)이 같은 실수를 안 하게. |
| **skill-candidate** | `.claude/knowledge/skill-candidates.md` | 같은 lesson/패턴이 3회 이상 반복돼 스킬 승격을 검토할 큐. |
| **skill** | `.claude/skills/{name}/SKILL.md` | 자주 쓰는 작업 절차의 표준화. Anthropic 스킬 표준 따름. |

## 운영 규칙

### Lesson 추가 (Coder/Reviewer/QA → 사용자 승인 → 파일 추가)

1. 에이전트가 작업 끝에 "💡 lesson 후보:" 섹션을 보고서에 포함
2. 사용자가 OK 하면 `.claude/knowledge/lessons/{영역}.md` 에 추가
3. 형식 (1 lesson = 1 항목):
   ```markdown
   ## L-{번호}: {1줄 요약}
   - **언제 만났나**: {날짜 + 한 줄 컨텍스트}
   - **함정**: {X 누락 시 Y 발생 — 인과형}
   - **회피**: {다음에 어떻게 할지}
   - **연관 파일/함수**: {경로}
   ```

### Lesson 작성 기준 (모두 yes일 때만)

- 같은 실수를 다음 작업에서 반복할 가능성이 있는가?
- 코드/git에서 직접 derive할 수 없는 인사이트인가? (단순 버그 수정은 lesson 아님 — 커밋 메시지에 남으니까)
- "X 누락 시 Y 발생" 같은 인과 형태로 표현 가능한가?

### 스킬 승격 (lesson → skill)

다음 신호 중 1개 이상이면 `skill-candidates.md` 에 후보 등록:
- 같은 영역 lesson 3개 이상 누적
- 사용자가 같은 작업 절차를 3번 이상 요청 (예: "릴리즈 절차", "새 슬라이드 추가")
- 자동화 가능한 검증/생성 절차 (예: 트랜스크립트 다양성 테스트, Wrapped 슬라이드 추가 보일러플레이트)

후보 등록 후 사용자 승인 → `.claude/skills/{name}/SKILL.md` 작성 → Anthropic 스킬 표준 따름.

## Lesson 영역 (memradar)

권장 분류:

- `_common.md` — 영역에 안 묶이는 공통 함정
- `parser.md` — `src/parser.ts` 트랜스크립트 파싱 관련
- `wrapped.md` — Wrapped 8슬라이드 / 슬라이드 컴포넌트 관련
- `cli.md` — CLI 명령/플래그/도움말 관련
- `release.md` — npm publish, GitHub master 배포 관련
- `types.md` — `src/types.ts` 스키마 변경의 파급
- `meta.md` — `.claude/` 자체 운영 함정

새 영역이 필요하면 사용자에게 물은 뒤 새 파일을 만든다.

## 검색

```bash
# 특정 키워드로 lesson 찾기
grep -ri "RangeError" .claude/knowledge/lessons/

# 영역별 lesson 개수 (스킬 승격 신호)
wc -l .claude/knowledge/lessons/*.md
```

## 참조

- 에이전트 정의: [`.claude/agents/`](../agents/)
- 프로젝트 제약: 루트 `CLAUDE.md`
