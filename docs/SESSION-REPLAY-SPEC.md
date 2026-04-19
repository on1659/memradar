# Session Replay — 상세 기획

> ⬜ **상태: 미구현 / Phase 2 계획 문서** · 기준 버전 **v0.2.12** · 최종 점검일 **2026-04-19**
>
> 본 문서는 **아직 구현되지 않은** 인터랙티브 세션 리플레이(타임라인 스크러버·자동재생·키보드 단축키)의 설계 스펙이다. 현재 레포에는 `src/lib/replay.ts` 파일도, `src/components/replay/` 디렉터리도 존재하지 않는다. 착수 시점은 정해지지 않았으며 "진행 중"이 아님을 명확히 한다.
>
> 현재 리플레이와 인접하여 **이미 제공되는 기능**은 `src/components/SessionView.tsx` 의 **정적 세션 전사(static transcript) 뷰**이다. 세션의 메시지를 순차적으로 포맷팅해 보여주지만, 재생 컨트롤·시간 압축·스크러버는 없다. 본 스펙은 그 정적 뷰 **위에 얹을 인터랙티브 레이어**를 정의한다.
>
> 전체 로드맵은 [ROADMAP.md §2.3](./ROADMAP.md), 시각 토큰·컴포넌트 규약은 [DESIGN-GUIDE.md](./DESIGN-GUIDE.md) 참고.

대화를 영상처럼 "재생"하는 기능 (계획).

## 컨셉

세션의 메시지들이 실제 시간 흐름대로 순차적으로 나타나는 인터랙티브 리플레이.
비디오 플레이어처럼 재생/일시정지/스킵 가능.

---

## UI 레이아웃

```
┌─────────────────────────────────────────┐
│  ← Back                    1x 2x 5x    │  헤더
├─────────────────────────────────────────┤
│                                         │
│  [User] "이 버그 좀 봐줘"               │  메시지 영역
│                                         │  (스크롤, 아래로 쌓임)
│        ── 3분 후 ──                     │  시간 간격 표시
│                                         │
│  [Claude] "네, 확인해볼게요..."          │
│    🔧 Read src/app.tsx                  │  도구 사용 표시
│    🔧 Edit src/app.tsx                  │
│                                         │
│  [User] "오 잘 됐다"                    │
│                                         │
├─────────────────────────────────────────┤
│  ▶ ━━━━━━━━━━━━━●━━━━━━━━━ 12:34/45:00 │  타임라인 스크러버
│  ⏮   ⏪   ▶/⏸   ⏩   ⏭               │  컨트롤 바
└─────────────────────────────────────────┘
```

## 핵심 기능

### 1. 메시지 순차 표시
- 메시지가 하나씩 타이핑 애니메이션으로 등장
- 유저 메시지: 즉시 표시 (사람이 보낸 것이므로)
- 어시스턴트 메시지: 글자 단위로 타이핑 효과

### 2. 시간 압축
실제 대화의 시간 간격을 인터랙티브하게 표현:

| 실제 간격 | 리플레이 표현 |
|-----------|-------------|
| < 10초 | 즉시 다음 메시지 |
| 10초~1분 | 1초 대기 |
| 1~5분 | 2초 대기 + "N분 후" 표시 |
| 5~30분 | 3초 대기 + "N분 후" 카드 |
| 30분+ | 3초 대기 + "N시간 후..." 카드 |

### 3. 재생 컨트롤
- **재생/일시정지**: Space바
- **다음 메시지**: → 화살표
- **이전 메시지**: ← 화살표
- **배속**: 1x (기본), 2x, 5x
- **처음으로**: Home
- **끝으로**: End

### 4. 타임라인 스크러버
- 진행률 바 (드래그 가능)
- 현재 시간 / 전체 시간 표시
- 메시지 밀도 표시 (대화가 활발한 구간을 밝게)

### 5. 도구 사용 시각화
- Read: 📖 파일명
- Edit: ✏️ 파일명
- Write: 📝 파일명
- Bash: 💻 명령어 일부
- 접히는 패널로 입출력 확인 가능

---

## 기술 구현

### 재생 엔진 (src/lib/replay.ts)

```typescript
interface ReplayState {
  messages: ParsedMessage[]
  currentIndex: number
  isPlaying: boolean
  speed: 1 | 2 | 5
  elapsedMs: number
  totalMs: number
}

interface ReplayEngine {
  play(): void
  pause(): void
  seekTo(index: number): void
  setSpeed(speed: 1 | 2 | 5): void
  onMessage: (callback: (msg: ParsedMessage, index: number) => void) => void
  onTimeGap: (callback: (gap: TimeGap) => void) => void
}
```

### 시간 계산
1. 모든 메시지의 타임스탬프를 파싱
2. 메시지 간 간격(delta) 계산
3. 시간 압축 규칙 적용
4. 총 리플레이 시간 계산

### 애니메이션
- 메시지 등장: `framer-motion` AnimatePresence
- 타이핑 효과: CSS `@keyframes` + `overflow: hidden` + `white-space: nowrap`
- 스크러버: `requestAnimationFrame` 기반 진행
