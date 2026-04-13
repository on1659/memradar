# Memradar

> 당신의 AI 대화가 들려주는 이야기

Claude Code, Gemini CLI 등 AI 코딩 어시스턴트와 나눈 대화를 시각화하고 회고하는 도구.

## Quick Start

```bash
npx memradar
```

`~/.claude/projects/` 폴더를 자동으로 스캔하고, 브라우저에서 대시보드를 띄워줍니다.
데이터는 로컬에서만 처리됩니다.

## Web

https://memradar.vercel.app 에서 `.claude` 폴더를 직접 업로드할 수도 있습니다.

## Features

- **자동 세션 스캔** — `npx memradar` 한 줄이면 끝
- **활동 히트맵** — GitHub 스타일 일별 활동 시각화
- **시간대별 활동** — 언제 가장 활발히 코딩했는지
- **워드 클라우드** — 자주 사용한 단어/키워드
- **세션 브라우저** — 대화 내역을 쉽게 탐색
- **토큰 & 모델 통계** — 사용량 한눈에 파악
- **Wrapped** — Spotify Wrapped 스타일 AI 코딩 결산

## Dev

```bash
npm install
npm run dev
```

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS v4
- Framer Motion
- Lucide Icons

## License

MIT
