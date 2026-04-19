# cleanClaudeText

Claude Code `.jsonl` 세션 파일의 메시지 텍스트에서 시스템 주입 노이즈를 제거하는 유틸리티.

실제 세션 파일 ~2,000개를 전수조사해서 발견한 패턴을 기반으로 한다.

## 사용법

```ts
const { text, interrupted } = cleanClaudeText(rawMessage)
// text        — 정제된 텍스트 (렌더링용)
// interrupted — <turn_aborted> 블록이 있었으면 true
```

## 제거 대상

### XML 태그형

Claude Code 하네스가 메시지 컨텍스트에 XML 블록으로 주입하는 것들.

| 태그 | 출처 | 예시 |
| --- | --- | --- |
| `<ide_opened_file>` | VSCode 익스텐션 | 현재 에디터에서 열린 파일 경로·내용 |
| `<ide_selection>` | VSCode 익스텐션 | 유저가 선택한 코드 |
| `<ide_diagnostics>` | VSCode 익스텐션 | 현재 파일의 lint/타입 에러 |
| `<system-reminder>` `<system_reminder>` | 하네스 | 대화 중간에 주기적으로 주입되는 리마인더 |
| `<task-notification>` `<task_notification>` | 하네스 | 백그라운드 태스크 상태 업데이트 |
| `<local-command-stdout>` | 슬래시 커맨드 | `/model` 등 실행 결과 |
| `<local-command-caveat>` | 슬래시 커맨드 | 커맨드 출력 면책 문구 |
| `<bash-input>` | Bash 툴 | 실행한 명령어 에코 |
| `<bash-stdout>` | Bash 툴 | 명령어 stdout 에코 |
| `<command-name>` `<command-message>` `<command-args>` | 슬래시 커맨드 | 커맨드 메타데이터 |
| `<summary>` | 컨텍스트 압축 | 컨텍스트 한계 도달 시 주입되는 대화 요약 |
| `<turn_aborted>` | 하네스 | 유저가 응답을 중단했을 때 삽입 — `interrupted: true` 반환 |

### 브래킷 어노테이션형

IDE 익스텐션이 유저 메시지에 인라인으로 삽입하는 `[동사 대상]` 형식.

```text
[opened CLAUDE.md]
[read src/index.ts]
[wrote package.json]
```

인식하는 동사: `opened`, `closed`, `read`, `wrote`, `created`, `deleted`, `edited`, `updated`, `ran`, `viewed`, `searched`, `fetched`

### 이미지 어노테이션형

이미지 첨부 시 자동으로 삽입되는 메타 텍스트.

```text
[Image #1]
[Image: source: C:\Users\user\Desktop\screenshot.png]
[Image: original 1179x2556, displayed at 923x2000. Multiply coordinates by 1.28 to map to original image.]
```

## 반환값

```ts
interface CleanResult {
  text: string        // 정제된 텍스트
  interrupted: boolean // turn_aborted 여부
}
```

`interrupted: true`이면 유저가 Claude 응답을 중간에 중단한 세션이다. UI에서 "중단됨" 뱃지 등으로 표시할 수 있다.

## 패턴 업데이트 추적

Anthropic은 이 injection 패턴들을 공식 문서화하지 않는다. 새 패턴이 추가되는지 확인하는 방법:

1. **실제 세션 파일 재조사** — Claude Code 업데이트 후 `~/.claude/projects/` 하위 `.jsonl` 파일에서 모르는 태그가 생겼는지 확인
2. **공식 changelog 모니터링** — IDE 연동·훅 관련 기능 변경 시 새 태그가 생길 수 있음
   - [Claude Code Changelog](https://code.claude.com/docs/en/changelog.md)

## 특징

- 유저 메시지·어시스턴트 메시지 모두 적용 가능
- 입력 문자열을 변경하지 않음 (순수 함수)
- 정규식을 모듈 로드 시 한 번만 컴파일 (성능)
