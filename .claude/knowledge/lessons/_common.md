# 공통 lessons

영역에 묶이지 않는 함정/실수 메모.

추가 형식:

```
## L-{번호}: {1줄 요약}
- **언제 만났나**: {날짜 + 컨텍스트}
- **함정**: X 누락 시 Y 발생
- **회피**: 다음에 어떻게 할지
- **연관 파일/함수**: 경로
```

---

## L-1: 고정 다크 배경 위에는 `text-text` 토큰 금지

- **언제 만났나**: 2026-05-08, paper 테마 제보 — DropZone 첫 화면 다크 터미널 박스(`bg-[#0c1220]`) 안 텍스트가 안 보임
- **함정**: `bg-[#0c1220]` 처럼 **테마 토큰을 거치지 않는 inline-hex 다크 박스** 안에 `text-text/55` 같은 테마 토큰을 그대로 쓰면, paper/light 테마에서 토큰이 어두운 색(`#726756`/`#5f6b7d`)으로 풀려 다크 배경 위 어두운 글자가 된다. 가독성 0. dark/night 테마에서만 검증하면 빠뜨리기 쉬움.
- **회피**: 고정 다크 영역 안에서는 **항상 `text-white/{55,72,85,...}` 흰색 알파 톤** 사용. 의미 색(`text-accent`, `text-green`)은 OK. 검증은 paper 테마로 — 가장 밝은 배경의 토큰이 가장 큰 격차를 만든다. 자세한 가이드: [DESIGN-GUIDE §5.8](../../../docs/DESIGN-GUIDE.md).
- **예외**: Wrapped 슬라이드 (`.wrapped-surface` 컨테이너가 토큰 자체를 라이트 톤으로 덮어쓰므로 `text-text-bright` 등을 그대로 써도 됨)
- **연관 파일/함수**: `src/components/DropZone.tsx:CopyCommand`, `src/index.css` `.wrapped-surface`

## L-2: ReactMarkdown 본문 wrapper에는 `break-words` 필수

- **언제 만났나**: 2026-05-16, SessionView 메시지 본문에서 사용자가 보낸 공백 없는 긴 문자열(`vvvv...` 약 100자)이 메시지 버블 컨테이너 밖으로 튀어나옴
- **함정**: Tailwind 기본은 `overflow-wrap: normal` 이라 공백 없는 단일 토큰은 줄바꿈되지 않는다. `<p>` `<li>` 등 mdComponents 안 요소만 스타일링하고 wrapper에 줄바꿈 규칙을 안 주면, 사용자가 키 반복·base64·긴 URL·해시 등을 붙여넣는 순간 레이아웃이 깨진다. 한국어 텍스트만 테스트하면 발견 못 함.
- **회피**: ReactMarkdown wrapper div에 `break-words` (= `overflow-wrap: break-word`) 추가. `pre`/`code`/`table` 처럼 정렬이 의미를 갖는 블록은 기존 `overflow-x-auto`로 가로 스크롤 처리(잘리면 의미 손실)이므로 wrapper 레벨 `break-words`와 충돌하지 않는다. 사용자 입력을 받는 모든 마크다운 표면에 동일 패턴 적용.
- **연관 파일/함수**: `src/components/SessionView.tsx:MessageContent`, `src/components/markdown.tsx:mdComponents`

## L-3: 설계 문서·스펙의 "스크립트 용도" 기술을 코드 검증 없이 신뢰하지 말 것

- **언제 만났나**: 2026-05-22, AI 역할 평가 Stage 0 정찰 — `generate-eval-samples.mts`가 v3 스펙 §12와 `AI-ROLE-EVAL-EXECUTION-PLAN.md` 현황표에 "외부 API 블라인드 생성기"로 적혀 있었으나, 실제는 외부 호출이 전혀 없는 정적 키워드 조합 생성기였다. 진짜 외부 API 생성기는 `-zai.mts` 하나뿐이었다.
- **함정**: 설계 문서·스펙이 스크립트의 *의도/계획*을 적어두면, 그 스크립트가 다르게 구현되거나 처음부터 다르게 만들어져도 문서는 갱신되지 않은 채 남는다. 파일명(`generate-...`)이나 문서 설명만 보고 지시서를 쓰면, 존재하지 않는 도구 경로(예: Codex CLI 자격증명)를 전제한 작업 계획이 나온다.
- **회피**: 정찰 시 스크립트의 실제 역할은 파일명·문서가 아니라 코드에서 직접 확인한다. "외부 API를 부르는가"는 `fetch`/API 클라이언트 import/`process.env` 키 사용 여부를 grep해 import·호출부로만 판정. 문서는 출발점, 코드가 진실.
- **연관 파일/함수**: `scripts/generate-eval-samples.mts`(정적), `scripts/generate-eval-samples-zai.mts`(실제 외부 API), `docs/AI-ROLE-EVAL-SAMPLES-SPEC.md` §12
