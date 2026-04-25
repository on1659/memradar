# Memradar 디자인 가이드

이 문서는 Memradar(Promptale)의 실제 코드에서 역추출한 디자인 시스템·원칙·토큰을 하나로 정리한 참조 문서다. 새 컴포넌트를 만들거나 리뷰할 때, 그리고 테마·모션·Copy tone을 맞출 때의 근거가 된다. 기능 명세는 `docs/ARCHITECTURE.md`, `docs/WRAPPED-SPEC.md`, `docs/SEARCH-SPEC.md`를 따로 참조한다.

---

## 목차

1. 디자인 철학
2. 테마 시스템
3. 디자인 토큰
4. 타이포그래피
5. 컴포넌트 패턴
6. 모션·인터랙션
7. Copy Tone & i18n
8. Wrapped 스토리텔링 패턴
9. 접근성
10. 대시보드 전용 규칙
11. UI 변경 시 절차
12. 참조 파일 인덱스

---

## 1. 디자인 철학

실제 코드에서 일관되게 드러나는 5가지 원칙. 새 UI 결정을 내릴 때 우선 이 원칙에 비춰본다.

### 1.1 스토리텔링 우선
정보를 단순 나열하지 않고 내러티브 호(narrative arc)를 따른다. 대표적으로 Wrapped 는 `시간 → 정량 → 분석 → 성격 → 행동 → 공유` 순서로 슬라이드가 배치된다 (`src/components/wrapped/WrappedView.tsx`). 대시보드도 "오늘 요약 → 활동 패턴 → 도구·토큰 분석" 순서로 스캔 친화적이다.

### 1.2 로컬-퍼스트 & 프라이버시
모든 세션 데이터는 브라우저 안에서만 파싱·렌더링된다. 서버 업로드, 백엔드 저장소, 계정 로그인 없음. `DropZone` 과 `npx memradar` CLI 모두 사용자가 파일을 자기 기기에서 스스로 넘기는 구조다. 공유 기능도 **이미지 캡처 후 사용자가 직접 붙여넣는 방식**을 택해 자동 업로드를 피한다.

### 1.3 암묵적 테마 계층 (Token-first)
컴포넌트는 hex 값을 직접 쓰지 않고 CSS 변수(`var(--t-...)`) 또는 Tailwind 토큰(`bg-bg-card`, `text-text-bright`, `border-accent/20`)만 사용한다. 테마가 바뀌어도 컴포넌트 코드는 한 줄도 수정할 필요가 없다. `src/index.css:8-21` 의 `@theme` 블록이 토큰과 변수를 연결한다.

### 1.4 다중 인터랙션 동등 지원
마우스·터치·키보드가 모두 1급 시민이다. Wrapped 는 클릭·스와이프·키보드(← → Space End Escape)가 전부 동작하고, 검색은 `Ctrl/Cmd+K` 로 열린다 (`src/App.tsx:173-180`). 모바일에서는 네이티브 Web Share API 를 우선 시도한다.

### 1.5 모션으로 기다림 달래기
로딩·전환·호버 어디든 부드러운 피드백이 있다. 로딩 화면의 글자 낱개 애니메이션, 대시보드 카드의 드롭 효과, Wrapped 슬라이드의 스프링 기반 숫자 애니메이션 등. 단 모션은 **항상 `prefers-reduced-motion` 을 존중**한다 (§9 참조).

---

## 2. 테마 시스템

4개 배경 테마 × 5개 accent 색상 = **20가지 조합**. Wrapped 는 이 시스템과 독립된 전용 팔레트를 사용한다.

### 2.1 배경 테마

원본: `src/theme/themePresets.ts:3-64`, CSS 적용: `src/index.css:44-82`.

| 테마 | 라벨 | bg | bg-card | bg-hover | border | text | text-bright |
|---|---|---|---|---|---|---|---|
| `dark` | 다크 모드 (기본값) | `#0f141c` | `#171d28` | `#1f2836` | `#2a3444` | `#97a3b6` | `#edf2fb` |
| `night` | 나이트 | `#04070d` | `#0b1018` | `#141b27` | `#1d2634` | `#8794aa` | `#e6edf8` |
| `light` | 라이트 모드 | `#f4f7fb` | `#ffffff` | `#eef2f8` | `#d7deea` | `#5f6b7d` | `#172131` |
| `paper` | 페이퍼 | `#f5efe3` | `#fffaf2` | `#f1e8d9` | `#dfd2bd` | `#726756` | `#2f281f` |

- **Dark**: 기본 작업 테마. 중성 블루-그레이 톤.
- **Night**: AMOLED 최적화. 순수 블랙에 가까운 배경.
- **Light**: 밝고 선명한 화이트. 스크린샷·발표용.
- **Paper**: 따뜻한 아이보리. 장시간 독서용 톤.

### 2.2 Accent 색상

원본: `src/theme/themePresets.ts:66-72`, CSS 적용: `src/index.css:84-114`.

| Accent | 라벨 | color | dim |
|---|---|---|---|
| `indigo` (기본) | 인디고 | `#6366f1` | `#4f46e5` |
| `teal` | 민트 | `#14b8a6` | `#0d9488` |
| `rose` | 로즈 | `#f43f5e` | `#e11d48` |
| `amber` | 앰버 | `#f59e0b` | `#d97706` |
| `violet` | 바이올렛 | `#8b5cf6` | `#7c3aed` |

특정 배경 × accent 조합은 명도 대비를 위해 `src/index.css:116-174` 에서 오버라이드된다. 예: `[data-theme="dark"][data-accent="indigo"]` 는 밝은 `#7c83ff`, `[data-theme="light"][data-accent="indigo"]` 는 어두운 `#4338ca` 로 교체된다. 새 accent 를 추가할 때는 각 배경에서 대비가 충분한지 반드시 확인한다.

### 2.3 Wrapped 전용 팔레트

원본: `src/theme/themePresets.ts:74-88`, CSS 적용: `src/index.css:486-504`의 `.wrapped-surface`.

```
bg         #06060e
bg-card    #11101d
bg-hover   #1b1730
border     rgba(255, 255, 255, 0.12)
text       #b7b0c9
text-bright #f3efff
accent     #7b6cf6   (Axis: Style)
accent-dim  #6254db
```

이 팔레트는 **사용자가 고른 테마와 무관하게 항상 적용**된다. Wrapped 가 스토리텔링 모드의 "극장 같은" 분위기를 유지하기 위해서다. Wrapped 안의 컴포넌트는 Tailwind 기본 토큰(`bg-bg`, `text-text-bright`)을 그대로 쓰되, 반투명 요소는 `bg-white/5`, `border-white/10` 같은 흰색 기반 값을 쓴다 (배경이 가장 어두워 흰색 알파가 잘 보이기 때문).

### 2.4 테마 적용 메커니즘

HTML 루트에 `data-theme`, `data-accent` 속성을 붙이면 CSS 변수가 일제히 스위칭된다.

```html
<html data-theme="night" data-accent="violet">
```

훅: `src/components/theme.ts`. 선택된 테마·accent 는 `localStorage` 에 저장되고 초기 로드 시 복원된다. 테마 전환 시 `body` 에 `transition: background 0.3s ease, color 0.3s ease` 가 걸려 있어 자연스럽게 변한다 (`src/index.css:185`).

Wrapped 를 진입하면 `.wrapped-surface` 클래스가 씌워지며 CSS 변수가 Wrapped 팔레트로 덮어써진다. 빠져나오면 자동 복귀.

---

## 3. 디자인 토큰

원본: `src/index.css:23-40`.

### 3.1 간격 토큰

```css
--dashboard-gap-xs:  0.5rem;   /*  8px — 아이콘·배지 내부 */
--dashboard-gap-sm:  0.75rem;  /* 12px — stat 카드 사이 */
--dashboard-gap:     1rem;     /* 16px — 표준 카드 간격 */
--dashboard-gap-lg:  1.5rem;   /* 24px — 섹션 분리 */
```

### 3.2 카드 토큰

```css
--dashboard-card-radius:         1rem;    /* 16px */
--dashboard-card-padding:        1.25rem; /* 20px — 기본 */
--dashboard-card-padding-tight:  1rem;    /* 16px — 작은 사이드 카드 */
--dashboard-card-padding-roomy:  1.5rem;  /* 24px — 강조 카드 */
--dashboard-row-height:          14.75rem;
--dashboard-compact-body-offset: 0.5rem;
```

### 3.3 레이아웃 토큰

현재 `:root` 에 전역 레이아웃 변수는 없고, 활동 그리드 폭은 `.dashboard-activity-grid` 클래스 안에서 직접 `minmax(...)` 로 지정된다 (`src/index.css:209` 부근, 반응형 오버라이드는 `620` 줄 아래). 새 레이아웃 변수를 공용화할 필요가 생기면 §3.1 간격 토큰과 같은 규칙으로 `:root` 에 추가한다.

### 3.4 Z-index 레이어

```css
--dashboard-layer-overlay: 80;  /* 배경 오버레이 (모달 뒤) */
--dashboard-layer-popover: 90;  /* 테마 패널, 드롭다운 */
--dashboard-layer-tooltip: 95;  /* 툴팁 (최상위) */
```

### 3.5 Radius 스케일

Tailwind 기본값을 기준으로 사용처를 고정한다.

| 클래스 | 값 | 주용도 |
|---|---|---|
| `rounded-sm` | 2px | 하이라이트 `mark` |
| `rounded` | 4px | 마크다운 `code` |
| `rounded-md` | 6px | 미세 요소 |
| `rounded-lg` | 8px | 이미지 저장 버튼, 작은 모달 |
| `rounded-xl` | 12px | 메시지 말풍선, 작은 카드 |
| `rounded-2xl` | 16px | 일반 카드, 공유 메뉴 |
| `rounded-full` | ∞ | 배지, 버튼, 진행 표시기, accent pill |

### 3.6 글로벌 색상 토큰

`src/index.css:17-20` 에 테마와 무관한 의미론적 색이 있다.

```css
--color-green: #34d399;  /* 사용자 메시지 배경, 성공 상태 */
--color-amber: #fbbf24;  /* 토큰·비용·검색 하이라이트 */
--color-rose:  #f472b6;  /* 에러·경고 계열 */
--color-cyan:   #22d3ee;  /* 분석·인사이트, Axis Scope */
--color-violet: #a78bfa;  /* Personality Slide accent, TopSkills 바 차트 */
```

---

## 4. 타이포그래피

### 4.1 폰트 스택

원본: `src/index.css:177-195`.

```css
body {
  font-family: 'Pretendard', 'Noto Sans KR', system-ui, -apple-system, sans-serif;
  letter-spacing: -0.01em;
}

h1, h2 {
  font-family: 'Noto Serif KR', 'Cormorant Garamond', Georgia, serif;
  letter-spacing: -0.02em;
}
```

- **본문 (Pretendard)**: 한글 가독성 최우선. UI 전체에 적용.
- **제목 (Noto Serif KR)**: 감성적 강조가 필요할 때. 대시보드 헤더, 중요한 제목에만.
- **Wrapped 특수 제목 (`Instrument Serif`)**: PersonalitySlide·ShareSlide 의 타이틀에 `style={{ fontFamily: "'Instrument Serif', serif" }}` 인라인으로 적용 (예: `ShareSlide.tsx:168`).

### 4.2 사이즈 스케일 & 용도

| 용도 | 클래스 | 예시 위치 |
|---|---|---|
| Wrapped 특대 타이틀 | `text-7xl md:text-9xl` | IntroSlide, PromptsSlide |
| Wrapped 대 타이틀 | `text-5xl md:text-7xl` | PersonalitySlide 이모지 카드 |
| Wrapped 중 타이틀 | `text-4xl md:text-6xl` | UsageSlide |
| 로딩 브랜드명 | `text-3xl font-bold` | `App.tsx:193` |
| 섹션 제목 (h2) | `text-xl` 또는 `text-lg font-semibold` | Dashboard 각 섹션 |
| 메시지 역할 표시 | `text-xs font-medium` | SessionView user/assistant |
| 본문 | `text-sm` (14px, 기본 13px-15px) | 대부분의 카드 내부 |
| 설명 캡션 | `text-xs` | 서브타이틀, 메타 |
| 미세 라벨 | `text-[10px]` / `text-[11px]` | 배지, 타임스탬프 |

### 4.3 텍스트 강도 계층

배경에 올리는 텍스트는 **6단계 투명도**로 위계를 만든다.

```
text-text-bright   — 최우선 (제목, 핵심 수치)
text-text          — 본문
text-text/60       — 보조 설명
text-text/45       — 약한 설명
text-text/40       — 메타 정보
text-text/30       — 극히 약한 힌트
```

규칙: **위계는 색상보다 투명도로 만든다.** 같은 색에 투명도만 바꾸는 편이 테마 전환 시 자동으로 맞는다.

---

## 5. 컴포넌트 패턴

### 5.1 카드

기본: `.dashboard-card` (`src/index.css:227-237`).

```css
.dashboard-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  border: 1px solid var(--t-border);
  border-radius: var(--dashboard-card-radius);
  background: var(--t-bg-card);
  padding: var(--dashboard-card-padding);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.dashboard-card:hover {
  border-color: color-mix(in srgb, var(--t-accent) 20%, var(--t-border));
}
```

배리언트 (`src/index.css:243-254`):
- `.dashboard-card-tight` — padding `1rem` (작은 사이드 카드)
- `.dashboard-card-roomy` — padding `1.5rem` (강조 카드)
- `.dashboard-card-flush` — padding `0`, overflow hidden (풀 블리드 시각화)

### 5.2 반투명 조합 4가지 패턴

Tailwind 알파 표기로 층위를 만든다.

**A. Subtle 카드** (`ProductUpdates.tsx` 계열)
```
border-border/70  bg-bg/35  p-4
```
→ 배경이 살짝 비치는 2차 카드.

**B. Accent 하이라이트** (중요 알림·CTA 근처)
```
border-accent/20  bg-accent/6  px-3 py-3
```
→ accent 가 아주 옅게 깔려 있어 존재감을 드러냄.

**C. 메시지 역할** (`SessionView.tsx`)
```
/* user    */  border-green/10  bg-green/5   text-text-bright
/* assistant */ border-border   bg-bg-card   text-text
```

**D. Wrapped 흰색 기반** (`PersonalitySlide.tsx`, `ShareSlide.tsx`)
```
border-white/10  bg-white/5   /* 또는 bg-white/[0.05] */
```
→ 배경이 가장 어두운 Wrapped 전용.

### 5.3 버튼

| 타입 | 스타일 | 예시 |
|---|---|---|
| Primary | `bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-dim` | ShareSlide 이미지 저장 |
| Ghost | `bg-white/5 px-5 py-2.5 text-sm text-text-bright hover:bg-white/10` | ShareSlide 공유하기 |
| Pill nav | `rounded-full bg-white/5 p-2 text-text transition-colors hover:bg-white/10 disabled:opacity-20` | WrappedView 좌우 네비 |
| Pill accent | `rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold hover:border-accent/55 hover:bg-accent/20` | 대시보드 복귀 버튼 |

공통 규칙:
- 모든 버튼은 `src/index.css:1009-1010` 의 `button { transition: all 0.2s ease } button:active { transform: scale(0.98) }` 를 자동 상속.
- `disabled` 는 `disabled:opacity-50` (일반) 또는 `disabled:opacity-20` (네비 아이콘).
- 둥글기는 `rounded-lg` (사각), `rounded-full` (pill) 중 맥락에 맞게. 중간 타협 없음.

**MemradarTopBar 레이아웃 (`MemradarTopBar.tsx`)**:  
좌측(브랜드+서브타이틀)과 우측(새소식·코드리포트·테마 버튼 3개)은 `lg:flex-row lg:items-end lg:justify-between`으로 배치한다.  
`items-end`로 우측 버튼이 좌측 서브타이틀 하단 기준선에 맞춰 정렬된다.

### 5.4 배지·라벨

작은 정보성 태그는 공통 원칙: **둥근 `rounded-full` + `text-[10px] font-medium` + `px-2 py-0.5`**.

중립 배지:
```
rounded-full border border-border/70 bg-bg-card px-2 py-0.5 text-[10px] font-medium text-text/65
```

컬러 배지 (의미별):
```
/* 인사이트  */ border-cyan/20  bg-cyan/8   text-cyan
/* 도구 이름 */ bg-amber/10     text-amber/70
/* 경고     */ border-rose/20  bg-rose/8   text-rose
/* 성공     */ border-green/20 bg-green/8  text-green
```

**소스/모델 배지 색 (`getSourceColor`):**  
`src/lib/tokenPricing.ts`의 `getSourceColor(source, theme)`가 현재 테마를 받아 `getAccentTone`으로 색을 결정한다. Claude = amber, Codex = indigo이며 테마별로 명도가 조정된다.

| 테마  | indigo (Codex) | amber (Claude) |
| ----- | -------------- | -------------- |
| dark  | `#7c83ff`      | `#f59e0b`      |
| night | `#818cf8`      | `#f59e0b`      |
| light | `#4338ca`      | `#f59e0b`      |
| paper | `#4f46e5`      | `#b45309`      |

모델 배지는 소스 배지와 동일한 색(`sessionSourceColor`)을 그대로 사용한다. opacity 조정 없음.

"개발중" 같은 상태 표시에는 `bg-white/10 text-[10px] text-text/50` (`ShareSlide.tsx` 공유 메뉴 참조).

### 5.5 메시지 말풍선

`SessionView.tsx` 의 대화 렌더링. 역할별 색을 유지해 스캔 시 즉시 구분된다.

- **User**: `border-green/15 bg-green/5` 버블, `ml-10`으로 우측 들여쓰기.
- **Assistant**: `border-border bg-bg-card` 버블, 좌측 정렬.
- 메시지 본문은 `MessageContent` 컴포넌트가 `cleanClaudeText` → `ReactMarkdown(remarkGfm)`으로 렌더링.
- `interrupted: true`이면 "중단됨" amber 배지 표시.
- 도구 호출: 중복 제거 후 `border-text/15 bg-text/8 text-text/55` 배지로 나열.
- 세션 헤더 제목은 `SessionTitle` 컴포넌트 — 80자 초과 시 접기/펼치기 토글, `#N` 순번 표시.
- **토큰 배지 (통일 스타일):** 세션 헤더·히스토리 목록·메시지 우측 모두 동일한 중립 배지 사용.

  ```text
  rounded-full border border-text/12 bg-bg-hover px-2 py-0.5 text-[10px] font-medium text-text-bright
  ```

  표시 포맷: `{K/M 단위} 토큰`. 값이 0이면 히스토리 목록에서 숨김.
- **세션 헤더 배지 간격:** `gap-x-1.5 gap-y-1` (소스·모델·토큰·메시지수 배지 행).

### 5.6 입력 요소

`src/index.css:995-1000`.

```css
input[type="text"]:focus,
input[type="date"]:focus,
select:focus {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--t-accent) 15%, transparent);
}
```

포커스 링은 2px, accent 15%. 어떤 테마에서도 자연스럽게 떠오른다.

---

## 6. 모션·인터랙션

### 6.1 기본 전환 값

- **Easing**: `cubic-bezier(0.22, 1, 0.36, 1)` (기본 ease-out-strong), `cubic-bezier(0.16, 1, 0.3, 1)` (긴 진입용)
- **Duration**: hover `0.18s`, 일반 상태변화 `0.2s`, 카드 전환 `0.4s`, Wrapped 진입 `0.6s`, 드롭/브랜드 애니 `1.45s ~ 7.2s`
- **Base**: `button { transition: all 0.2s ease }` `button:active { transform: scale(0.98) }`

### 6.2 Framer Motion 재사용 3종

`src/components/wrapped/slides/SlideLayout.tsx` 에 정의된 공용 모션 컴포넌트. Wrapped 슬라이드뿐 아니라 다른 특별 페이지에서도 재사용한다.

**`SlideLayout`** — 전체 슬라이드 컨테이너.
```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.6 }}
/>
```

**`AnimatedNumber`** — 큰 수치 등장.
```tsx
<motion.span
  initial={{ opacity: 0, scale: 0.5, y: 20 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={{ duration: 0.8, delay: 0.3, type: 'spring' }}
/>
```

**`FadeInText`** — 텍스트 페이드 + 16px 슬라이드 업.
```tsx
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6, delay }}
/>
```

규칙:
- 새 슬라이드·단계는 **이 3개 중에서 골라 조합**한다. 새 모션을 만들기 전에 "여기 안에 들어가지 않나?" 부터 확인.
- `delay` 는 순차 등장에 쓰되 누적이 1.2s 를 넘기지 않게 한다 (사용자가 기다리는 느낌 방지).

### 6.3 CSS keyframes 목록

`src/index.css` 에 정의된 재사용 가능한 keyframes. 새 애니메이션을 추가하기 전에 아래부터 훑어본다.

| Keyframe | 적용 클래스 | 목적 |
|---|---|---|
| `radarSweep` | `.radar-sweep-group` | 브랜드 마크 레이더 |
| `fadeInUp` | `.animate-in` (및 `:nth-child` 계단식) | 리스트 순차 등장 |
| `countUp` | `.count-up` | 숫자 카운트업 진입 |
| `dashboardCycleDrop` | `.dashboard-cycle-drop` | 카드 재진입 드롭 |
| `dashboardButtonPulse` | `.dashboard-button-attention` | CTA 주의환기 박스섀도우 |
| `dashboardButtonIconNudge` | `.dashboard-button-attention-icon` | CTA 아이콘 흔들림 |
| `dashboardButtonBorderRun` | `.dashboard-button-attention-runner` | CTA 테두리 따라 흐르는 점 |
| `dashboardBrandStamp` / `dashboardBrandSpark` | `.dashboard-brand-letter` / `.dashboard-brand-mark` | 브랜드명 주기 애니 |
| `loadingBrandLetter` / `loadingBrandSpark` | `.loading-brand-letter` / `.loading-brand-spark` | 로딩화면 글자·마크 |
| `loadingStatusRotate` | `.loading-status-rotator span` | 로딩 상태 문구 회전 |

### 6.4 Hover 표준값

일관된 감각을 유지하려면 호버 증폭 범위를 일정 수준으로 묶는다.

```css
transform:  scale(1.045 ~ 1.08)     /* 1.045=행, 1.06=slice, 1.08=아이콘 */
filter:     brightness(1.08 ~ 1.12)
transition: 0.18s cubic-bezier(0.22, 1, 0.36, 1)
```

구체 구현 참조: `.dashboard-hover-grow`, `.dashboard-donut-slice`, `.dashboard-pattern-row`, `.dashboard-hour-bar` (`src/index.css:867-932`).

**금지**: scale 1.15 이상의 과한 증폭, 0.3s 넘는 호버 전환, 색상·크기·필터를 동시에 다 움직이는 것.

### 6.5 Active / Press 피드백

`button:active { transform: scale(0.98) }` 가 전역으로 적용돼 있다. 커스텀 버튼이 이를 덮어쓰지 않도록 주의.

---

## 7. Copy Tone & i18n

### 7.1 말투 가이드

상황별 3톤을 구분한다.

**A. 대시보드 — 간결 설명체 ("~합니다", 기능 설명)**
- "세션 새로고침" / "코드 리포트" / "전체 성향 보기"
- "{count}개의 세션에서 발견한 당신의 이야기"

**B. Wrapped — 회고·감성체 ("~했습니다", "~네요")**
- "당신의 이야기가 시작된 날"
- "그 이후로 N개의 세션을 함께했습니다"
- "당신의 AI 스타일은?"

**C. 상태 피드백 — 짧은 완료형**
- "공유를 마쳤어요."
- "이미지를 저장했어요."
- "공유 준비 중 문제가 생겼어요. 다시 시도해 주세요."

**금지어**: 기계적 영어 번역투 ("저장되었습니다" ← 수동 금지), 과한 이모지 남발, 성별·연령 지칭.

### 7.2 슬라이드 내레이션 스타일

각 슬라이드는 **단문 3줄 구조**가 기본이다: (1) 머리말 작게 → (2) 큰 수치/제목 → (3) 해석 한 줄.

예 (`PromptsSlide`):
```
Your Prompts               ← 머리말 (uppercase, tracking-widest)
1,234개의 프롬프트          ← 큰 수치 (AnimatedNumber)
소설 약 1권 분량이에요       ← 친근한 비유 한 줄
```

숫자 옆에는 항상 **직관적 비교** 한 줄을 붙인다 ("소설 약 1권 분량", "평범한 하루의 2배"). 단순 수치 나열을 금지.

### 7.3 번역 키 네이밍

`src/i18n.tsx` 의 키는 **점 표기법 `section.subsection.leaf`**.

```
app.loading.searching
dashboard.wrapped
dashboard.personality
theme.dark.label
theme.dark.description
accent.indigo
```

규칙:
- 같은 section 아래 키는 2단계 이내로 유지
- 변수 보간은 `{name}` 형식 (`dashboard.subtitle` 의 `{count}`)
- 영한 쌍 모두 채워야 키 추가 가능

### 7.4 자동 로케일 감지 순서

`src/i18n.tsx:145-155`.

```
1. URL 쿼리 ?lang=ko
2. 도메인 (.kr / .en)
3. navigator.language
4. timezone (Asia/Seoul → ko)
5. fallback 'en'
```

사용자가 명시적으로 고른 값이 있으면 항상 우선. 자동 감지는 첫 방문 시에만.

---

## 8. Wrapped 스토리텔링 패턴

Wrapped 는 Memradar 의 상징적 경험이라 별도 섹션으로 다룬다. 자세한 기능 명세는 `docs/WRAPPED-SPEC.md`.

### 8.1 슬라이드 내러티브 호

현재 구현된 순서 (`src/components/wrapped/WrappedView.tsx`):

```
1. Cover        — "Memradar"                       (타이틀 카드)
2. Intro        — "당신의 이야기가 시작된 날"       (시간)
3. Prompts      — "1,234개의 프롬프트"             (정량)
4. Model        — "Your Favorite Model"            (선호)
5. Hours        — "Night Owl 🦉"                   (시간대 분석)
6. Personality  — "만능 빌더 — All-round Builder"  (성격)
7. Usage        — "풀스택 기획자"                   (사용 패턴)
8. Share        — "Made in 이더"                   (공유·퇴장)
```

현재 **실제 탑재된 슬라이드는 8장** (`WrappedView.tsx` 의 import 순서, `lastSlideIndex = 7`). `slides/ToolsSlide.tsx` 파일은 저장소에 남아 있지만 어디에서도 `import` 되지 않는 **orphan** 이다. 도구 분석은 향후 고급 분석 영역이 생길 때까지 노출하지 않는다 (§10.1 참조).

**규칙**: 새 슬라이드를 추가할 때 이 호의 리듬 (시간 → 수치 → 분석 → 정체성 → 행동 → 공유) 을 깨지 않는다. 성격/정체성 슬라이드 뒤에 다시 단순 수치 슬라이드를 붙이지 않는다.

### 8.2 SlideLayout / FadeInText / AnimatedNumber 조합 규칙

- 모든 슬라이드 루트는 **반드시 `SlideLayout`** 으로 감싼다 (`.wrapped-surface` 클래스 주입, opacity 전환, 글로벌 그라데이션).
- 텍스트 진입은 **`FadeInText` + `delay`** 조합. 세 요소라면 delay `0 / 0.2 / 0.4`.
- 큰 숫자는 **`AnimatedNumber`**. 일반 텍스트 숫자에는 사용하지 않는다 (과한 애니메이션 방지).
- 슬라이드 전체 한 번의 몰입은 **1.0s 이내에 완성**한다. 이후 사용자 인풋 대기.

### 8.3 이모지 시각 언어

이모지는 장식이 아니라 **정체성 마커**로 쓰인다.

**성격 8종** (`src/lib/personality.ts:53-126`):

| 코드 | 이모지 | 한국어 | 영문 |
|---|---|---|---|
| RDM | 🤿 | 심해 잠수부 | Deep Diver |
| RDS | 🔎 | 코드 감별사 | Code Appraiser |
| RWM | 📚 | 도서관 사서 | Librarian |
| RWS | 🏄 | 트렌드 헌터 | Trend Hunter |
| EDM | ⚒️ | 장인 대장장이 | Master Smith |
| EDS | ⚡ | 번개 해결사 | Lightning Fixer |
| EWM | 🏗️ | 만능 빌더 | All-round Builder |
| EWS | 🌪️ | 카오스 크리에이터 | Chaos Creator |

**시간대 라벨** (`src/lib/personality.ts:185-195`):

| 시간 | 이모지 | 라벨 |
|---|---|---|
| 02-06 | 🦉 | Night Owl |
| 06-10 | 🐦 | Early Bird |
| 10-14 | ☀️ | Morning Warrior |
| 14-18 | ⚔️ | Afternoon Warrior |
| 18-22 | 🌆 | Evening Coder |
| 기타 | 🌙 | Moonlight Coder |

**사용 카테고리** 는 `src/lib/usageProfile.ts` 에 **9종** 정의 (🧪 QA 엔지니어 포함). 렌더링 컴포넌트는 `src/components/PersonalityView.tsx` 의 `PersonalitySections`. 별도 라우트가 아니라 **Dashboard 가 `sectionMode="personality"` 로 렌더링** 한다 (`src/components/Dashboard.tsx`). 새 유형을 추가할 때는 `usageProfile.ts` 배열에 먼저 추가하고 기존 9종과 중복 여부를 확인한다.

### 8.4 Axis 슬라이더 규칙

`PersonalitySlide.tsx` 의 3축 슬라이더는 Wrapped 의 시그니처 UI.

| 축 | 라벨 쌍 | 색상 | 의미 |
|---|---|---|---|
| style | 탐험가 ↔ 설계자 | `#7b6cf6` (violet) | Explorer/Architect |
| scope | 깊이파 ↔ 넓이파 | `#22d3ee` (cyan) | Deep/Wide |
| rhythm | 마라토너 ↔ 스프린터 | `#f59e0b` (amber) | Marathon/Sprint |

구현 규칙:
- 트랙 높이 `7px`, 배경 `rgba(255,255,255,0.05)`, 라운드 `4px`.
- 값이 0.5 미만이면 **왼쪽에서 중앙까지 채움**, 0.5 이상이면 중앙에서 오른쪽으로 채움.
- 중앙에 `1px` 세로선 (`rgba(255,255,255,0.15)`) 로 기준점 표시.
- 활성 라벨 색 `#e8e6f0`, 비활성 라벨 `rgba(232,230,240,0.35)`.

새 축을 추가할 일이 있으면 색상은 글로벌 토큰(`--color-cyan`, `--color-amber`) 에서 고르되, 3개 이상으로 늘어나면 정보 과다이므로 재고.

### 8.5 Share Card 캡처 규격

`ShareSlide.tsx` 의 공유 카드.

- 너비 `356px` 고정 (모바일·데스크톱 공통).
- 배경: `linear-gradient(135deg, #0c0c1a 0%, #10081e 50%, #0c0c1a 100%)`.
- 테두리: `1px solid rgba(123,108,246,0.2)`.
- 라운드: `26px`.
- 캡처: `toPng(cardRef, { pixelRatio: 2, cacheBust: true })` (html-to-image).
- 파일명: `memradar-code-report.png`.

공유 플로우 (§5.3 버튼 규칙 및 §1.4 다중 인터랙션 참조):
1. `navigator.canShare({ files })` 지원 시 Web Share API 로 모바일 공유 시트.
2. 아니면 클립보드에 PNG 복사 (`ClipboardItem({ 'image/png': blob })`) → Threads 탭 오픈 → 사용자가 `Ctrl/⌘+V` 로 붙여넣기.
3. 클립보드도 실패 시 PNG 다운로드 폴백.

---

## 9. 접근성

### 9.1 포커스 표시

- input/select 의 포커스: `box-shadow: 0 0 0 2px color-mix(in srgb, var(--t-accent) 15%, transparent)` (`src/index.css:995-1000`).
- 버튼 포커스: Tailwind 기본 `focus-visible` 링 유지, 커스텀 버튼은 `focus-visible:ring-2 focus-visible:ring-accent/40` 을 써도 좋다.
- **아웃라인 `none` 은 반드시 대체 포커스 표시와 함께**.

### 9.2 모션 감소

`src/index.css:1064-1081` 에서 다음 애니메이션을 `prefers-reduced-motion: reduce` 시 끈다.

```
.dashboard-button-attention
.dashboard-button-attention-soft
.dashboard-button-attention-runner
.dashboard-button-attention-icon
.loading-brand-spark
.loading-brand-letter
.loading-status-rotator span
.dashboard-cycle-drop
.dashboard-brand-mark
.dashboard-brand-letter
.dashboard-pattern-bar   /* transition 만 제거 */
```

규칙: **새 무한 반복 애니메이션(`animation: ... infinite`)을 추가할 때는 반드시 위 리스트에 추가**한다. Framer Motion 쪽은 `useReducedMotion()` 훅으로 분기할 수 있지만, 현재 슬라이드 진입 애니메이션은 1회성이라 허용된다.

### 9.3 색상 대비

- 모든 본문은 WCAG AA (4.5:1) 기준을 충족해야 한다. Light/Paper 테마에서 `text-text` 는 `#5f6b7d` / `#726756` 로 의도적으로 어둡게 잡혀 있다.
- 검색 하이라이트 `mark` 는 Light/Paper 에서 배경 투명도를 `0.15 → 0.25` 로 올린다 (`src/index.css:1084-1087`).
- accent pill 배경은 `bg-accent/10 ~ /20` 을 선호. 그 위 텍스트는 `text-accent` 또는 `text-text-bright`.

### 9.4 키보드 네비게이션

| 키 | 동작 | 위치 |
|---|---|---|
| `←` / `→` | 슬라이드 이전/다음 | WrappedView |
| `Space` | 다음 슬라이드 | WrappedView |
| `End` | 마지막 슬라이드 | WrappedView |
| `Escape` | Wrapped 종료 / 오버레이 닫기 | WrappedView, 모달 |
| `Ctrl/Cmd+K` | 검색 오버레이 | `src/App.tsx:173-180` |

새 오버레이/모달을 만들 때는 **반드시 Escape 로 닫히게** 한다.

---

## 10. 대시보드 전용 규칙

기존 `DESIGN-GUIDE.md` 의 대시보드 규칙은 여전히 유효하다. 본 장에 그대로 편입.

### 10.1 레이아웃 규칙

- 공유 토큰(`src/index.css` §3)을 spacing, card radius, row height, overlay layer 에 사용한다.
- 카드는 시각적으로 분리돼 보이게 한다. 테두리가 시각적으로 합쳐져 그룹을 가짜로 만드는 건 금지.
- 동일 높이 카드가 같은 행을 공유해도 되지만, 내용 정렬은 카드 유형에 따라 달라진다.
- **도구(tool) 분석 지표는 메인 대시보드와 Code Report 흐름에서 숨긴다.** 전용 고급 분석 영역이 생길 때만 노출.

### 10.2 카드 내용 정렬

- 데이터 시각화 카드는 **그래픽을 본문 영역 중앙**에 배치.
- 요약 카드는 **내용을 제목 근처에 앵커**한다. 세로 중앙 정렬로 전체를 띄우지 말 것.
- `연속 기록`, `요일별 패턴` 같은 작은 사이드 카드는 **제목 아래 작은 고정 오프셋** 을 유지.
- 제목과 첫 수치 사이의 큰 빈 공간을 피한다.

### 10.3 Compact 사이드 카드 패턴

- 제목 상단 여백: 약 `12px`.
- 제목 하단 본문 오프셋: 약 `8px` (`--dashboard-compact-body-offset: 0.5rem`).
- 지표는 좁은 간격으로 쌓고 첫 지표가 상단 근처에 보이도록.
- 구분선은 그룹을 나누기만 하고 카드 전체를 세로 중앙으로 강제 정렬하지 않는다.

### 10.4 오버레이·툴팁

- 테마 피커 같은 **큰 패널은 앱 셸 위 최상위 레이어**(`--dashboard-layer-popover` 또는 포털)로 렌더.
- 작은 툴팁은 컴포넌트에 로컬 붙어도 되지만, **공유 툴팁 레이어 (`--dashboard-layer-tooltip`)** 를 따른다.
- **모션 컨테이너의 `clipPath` 는 자식 툴팁을 잘라낸다.** framer-motion `inset(0 0 0% 0)` 은 끝 상태에서도 bbox 밖을 잘라내므로, 툴팁이 컨테이너 위/옆으로 솟구치는 영역에서는 `clipPath` 트랜지션을 쓰지 않는다 (대신 `y`/`opacity`/`filter` 로 어포던스).

### 10.5 테마 규칙

- 테마 색 정의는 `src/theme/themePresets.ts` 중앙집중. 새 테마 색은 프리셋 파일에 먼저 추가한다.
- `src/index.css` 는 CSS 변수 폴백을 유지해도 되지만, 프리셋이 진실의 소스.
- **Code Report 는 독립 다크 스토리 팔레트.** Light/Paper 테마 색이 Code Report 에 새어 들어가지 않게 한다.
- 테마 적용 로직과 색 정의를 같은 PR 에서 동시에 바꾸지 않는다 (전용 테마 리팩터 때만 예외).

### 10.6 모션 어포던스 규칙

- 클릭을 강하게 유도해야 할 버튼은 subtle 한 주기 애니메이션(`dashboard-button-attention`) 을 쓸 수 있다.
- 큰 움직임보다 **부드러운 테두리 글로우 / 아이콘 너지** 를 우선.
- 대기 상태에서도 인터페이스가 안정감 있어 보이게 루프는 차분하게.
- reduced-motion 에서는 비필수 어포던스 애니메이션을 끈다 (§9.2 리스트).

### 10.7 축 레이블 규칙

- 시간·월 레이블은 **항상 수평 유지** (`.dashboard-axis-label` 의 `writing-mode: horizontal-tb`).
- 차트와 히트맵은 컴포넌트별 자체 스타일이 아니라 **공유 축 레이블 스타일**을 재사용.

---

## 11. UI 변경 시 절차

1. **공유 토큰·공유 클래스부터** 고친다. `--dashboard-*` 변수 또는 `.dashboard-card` 같은 공용 클래스.
2. 공용 배리언트로 안 되면 **일회성 유틸리티 클래스**를 추가. 단, 해당 컴포넌트가 정말 공용 패턴에서 벗어날 때만.
3. 변경 후 체크리스트:
   - [ ] 카드 상단 간격이 동일 행에서 어긋나지 않는가
   - [ ] 같은 행 카드의 높이가 맞는가
   - [ ] 오버레이 z-index 가 올바른 레이어에 속하는가
   - [ ] 차트 라벨이 공유 스타일을 쓰는가
   - [ ] 모든 테마(Dark/Night/Light/Paper) × 주요 accent 에서 대비가 유지되는가
   - [ ] `prefers-reduced-motion` 에서 새 애니메이션이 꺼지는가
   - [ ] 모바일 (640px 이하) 에서 레이아웃이 깨지지 않는가

---

## 12. 참조 파일 인덱스

| 주제 | 파일 | 핵심 라인 |
|---|---|---|
| 테마·accent hex 원본 | `src/theme/themePresets.ts` | 3-88 |
| CSS 변수·keyframes·공유 클래스 | `src/index.css` | 전체 |
| 테마 적용 훅 | `src/components/theme.ts` | 37-47 |
| i18n (번역, 로케일 감지) | `src/i18n.tsx` | 6-76, 145-163 |
| 라우팅·로딩 애니메이션 | `src/App.tsx` | 173-180, 188-225 |
| 대시보드 카드·그리드 실례 | `src/components/Dashboard.tsx` | 246, 579 |
| 메시지 말풍선 패턴 | `src/components/SessionView.tsx` | 58, 78-91, 134-145 |
| Wrapped 컨테이너·키보드 제어 | `src/components/wrapped/WrappedView.tsx` | 72-145 |
| Motion 재사용 컴포넌트 | `src/components/wrapped/slides/SlideLayout.tsx` | 9-48 |
| Personality 슬라이드 | `src/components/wrapped/slides/PersonalitySlide.tsx` | 91-186 |
| Share 슬라이드 | `src/components/wrapped/slides/ShareSlide.tsx` | 60-180 |
| Usage 슬라이드 | `src/components/wrapped/slides/UsageSlide.tsx` | 1-77 |
| 성격 8종 정의 | `src/lib/personality.ts` | 53-126, 185-202 |
| 사용 카테고리 9종 정의 | `src/lib/usageProfile.ts` | (USAGE_CATEGORIES 배열) |
| 사용 카테고리 렌더링 | `src/components/PersonalityView.tsx` | PersonalitySections |
| TopSkills 바 차트 | `src/components/TopSkills.tsx` | 전체 |

---

_최종 업데이트: 실제 코드(`v0.2.12` 기준)에서 역추출._ 새 UI 결정을 이 문서에 꾸준히 반영하고, 차이가 생기면 **코드가 정답**이라 가정하고 이 문서를 갱신한다.

_스택 스냅샷_: React 19.2 · TypeScript 6 · Vite 8 · **Tailwind CSS 4.2 (`@tailwindcss/vite`)** · Framer Motion 12.38 · Lucide React 1.8 · html-to-image 1.11.
