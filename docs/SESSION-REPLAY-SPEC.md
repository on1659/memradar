# Session Replay — 상세 기획 / 구현 정책

> ✅ **상태: 구현됨** · 최종 점검일 **2026-05-08**
>
> 인터랙티브 세션 리플레이(타임라인 스크러버·자동재생·키보드 단축키)가 출시되어 있다. 진입점은 `src/components/replay/ReplayView.tsx`, 시간 계산·이벤트 직렬화는 `src/lib/replay.ts`. 본 문서는 현재 구현된 정책과 향후 튜닝 포인트를 함께 담는다.
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
- **배속**: `0.25x / 0.5x / 1x / 2x / 5x` (`ReplaySpeed` 타입, `src/lib/replay.ts:3`). 기본 1x. 0.25x·0.5x는 글을 따라 읽기 위한 슬로우 옵션, 5x는 빠른 훑기용.
- **처음으로**: Home
- **끝으로**: End

### 3.1 글자 노출 / 시간 정책 (`src/lib/replay.ts`)

어시스턴트 메시지는 글자 단위 타이핑 효과로 등장한다. 메시지당 노출 시간은 다음 식으로 계산:

```ts
duration = clamp(MIN, MAX, MIN + len * MS_PER_CHAR)

MIN_MESSAGE_DURATION_MS  = 1_500   // 짧은 메시지도 최소 1.5초
MAX_MESSAGE_DURATION_MS  = 60_000  // 긴 메시지는 최대 60초
MS_PER_CHAR              = 30      // 1글자 30ms — 한국어 평균 읽기 속도(~120ms/글자)의 4배 빠름
```

이전 정책(`MS_PER_CHAR=8`, MAX=4초)은 1x에서도 글자당 4~8ms로 사람이 따라 읽기에 6~15배 빨랐고, 긴 메시지는 4초 cap 때문에 더 빠르게 압축됐다. 사용자가 "글이랑 스크롤이 동시에 내려가서 글을 읽을 수가 없다"고 보고 → MS_PER_CHAR 30, MAX 60초, MIN 1.5초로 재정의 (2026-05-08 / v3.6.1 후보). 5x 옵션이 빠른 훑기 보완.

### 3.2 자동 스크롤 정책 (`ReplayView.tsx`)

메시지가 추가되면 컨테이너가 자동으로 바닥을 따라가지만, **글 읽는 사용자를 방해하지 않도록** 다음 규칙을 따른다:

1. 사용자가 wheel/touchmove로 위로 스크롤 → `stick = false` (영구 정지)
2. 자동 chase가 만든 scroll 이벤트는 `suppressNextScrollEvent` 플래그로 무시 — 사용자 정지가 무력화되지 않음
3. 사용자가 직접 다시 바닥 근처(120px 이내)까지 스크롤하면 자동 chase 재개
4. chase는 매우 완만(`EASE_FACTOR = 0.005`, 프레임당 남은 거리 0.5%) + 최소 step 6px

이전 구현(`USER_PAUSE_MS = 600`)은 사용자 휠 후 0.6초만 멈췄다 자동 재개되어 글을 읽는 도중 화면이 빼앗기는 문제가 있었다. 영구 정지 + 사용자 의도 검증으로 변경.

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
