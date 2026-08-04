# Export·HTML lessons

세션 데이터를 HTML/Markdown으로 외부 파일·클립보드로 내보낼 때 만난 함정.

추가 형식:

```
## L-{번호}: {1줄 요약}
- **언제 만났나**: {날짜 + 컨텍스트}
- **함정**: X 누락 시 Y 발생
- **회피**: 다음에 어떻게 할지
- **연관 파일/함수**: 경로
```

---

## L-1: react-dom/server 의 renderToStaticMarkup 은 브라우저에서 동작 — 별도 deps 불필요

- **언제 만났나**: 2026-05-07, SessionView export 기능 구현
- **함정**: react-markdown 결과를 정적 HTML 문자열로 만들고 싶을 때 `marked`/`markdown-it` 같은 신규 의존성을 추가하기 쉽다. `package.json` 의존성이 늘고 번들 사이즈도 커진다.
- **회피**: `react-dom`이 이미 설치돼 있으므로 `import { renderToStaticMarkup } from 'react-dom/server'` 만으로 React 트리 → 정적 HTML 문자열 변환 가능. SSR이 아닌 클라이언트 코드에서도 동작 (`react-dom`이 `server.browser.js`를 함께 노출). 신규 deps 0건으로 끝낼 수 있다.
- **연관 파일/함수**: `src/lib/sessionExport.ts:renderMarkdownToHtml`

## L-2: Tailwind className이 들어간 `mdComponents`를 자체완결 HTML에 그대로 쓰면 스타일 죽음

- **언제 만났나**: 2026-05-07, `buildHtmlChat` / `buildHtmlMarkdown` 작성 중
- **함정**: 화면용 ReactMarkdown은 `components={mdComponents}` (Tailwind 클래스 포함)를 쓴다. 같은 `mdComponents`를 export용 `renderToStaticMarkup`에도 그대로 넘기면 출력 HTML에 `<p class="mb-3 leading-7">…` 같은 클래스만 박힌다. 다운로드된 .html을 열면 외부에는 Tailwind 런타임이 없어 클래스가 죽고 무서식 텍스트만 보인다.
- **회피**: 자체완결 HTML을 만들 때는 `ReactMarkdown`에 `components` prop을 **넘기지 않는다**. 표준 HTML 태그(`<p>`, `<ul>`, `<pre>`, `<code>`, `<blockquote>` 등)로 출력되도록 두고, inline `<style>` 블록에서 그 표준 태그를 직접 스타일링한다. "화면용 컴포넌트"와 "외부 환경에서 열릴 정적 HTML"은 별도 톤으로 다뤄야 한다.
- **연관 파일/함수**: `src/lib/sessionExport.ts:renderMarkdownToHtml`, `buildHtmlChat`, `buildHtmlMarkdown` / 대조: `src/components/markdown.tsx:mdComponents`

## L-3: Blob URL revoke는 click 후 즉시 호출 금지 — Firefox/Safari에서 다운로드 취소

- **언제 만났나**: 2026-05-07, `downloadText` 헬퍼 작성
- **함정**: `URL.createObjectURL` → `<a download>` click → `URL.revokeObjectURL` 을 동기로 같은 tick에 호출하면 Firefox와 Safari 일부 버전에서 다운로드가 무성공으로 취소된다. Chrome은 동작해서 디버깅 시 못 잡고 넘어가기 쉽다.
- **회피**: `setTimeout(() => URL.revokeObjectURL(url), 1000)` 으로 최소 1초 지연. 더 보수적으로 가려면 수십 초도 가능. 단, `setTimeout(..., 0)` 은 Chrome에서는 충분해도 Firefox에서 간헐적 실패가 보고되므로 **1초 권장**. ShareSlide의 `triggerDownload` 패턴과는 별개 — Blob URL은 항상 비동기 revoke.
- **연관 파일/함수**: `src/lib/sessionExport.ts:downloadText`

## L-4: 메시지 "중단됨" 표기는 4개 출력 경로에서 시각·텍스트 일관성 유지

- **언제 만났나**: 2026-05-07, 코드 리뷰 단계
- **함정**: `<turn_aborted>` 태그가 있던 메시지를 (1) 화면 (2) Markdown export (3) HTML 채팅 export (4) HTML 문서 export (5) 메시지 단위 클립보드 — 다섯 출력 경로에서 다르게 처리하기 쉽다. 이모지도 `⚠️`(emoji + variation selector)와 `⚠`(plain) 처럼 비슷해 보이지만 다른 코드포인트가 섞이면 폰트 대응 차이로 일관성이 깨진다.
- **회피**: 출력별 형태(배지/blockquote/inline note)는 매체에 맞춰 다양해도 좋지만 **이모지/단어 선택은 한 번 정해서 통일**한다. memradar의 현재 정책은 `⚠️ 중단됨`. 새 출력 경로를 추가할 때 grep으로 기존 표현을 먼저 찾아 같은 표기를 따른다.
- **연관 파일/함수**: `src/lib/sessionExport.ts` (3곳), `src/components/SessionView.tsx` (1곳, 메시지 단위 복사), `src/lib/cleanClaudeText.ts:interrupted` 플래그
