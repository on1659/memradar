# Memradar Code Report — 상세 기획

> Spotify Wrapped 스타일의 AI 코딩 회고

사용자의 AI 코딩 대화 데이터를 분석해 **8장의 풀스크린 슬라이드**로 보여주는 인터랙티브 경험. 마지막 슬라이드에서 공유 가능한 카드 이미지를 생성해 SNS에 올릴 수 있다.

- **버전 기준**: memradar v0.2.12
- **마지막 갱신**: 2026-04-19
- **소스 경로**: `src/components/wrapped/WrappedView.tsx`, `src/components/wrapped/slides/*`
- **이미지 캡처**: `html-to-image` (`toPng`)

시각 토큰·모션 어휘는 [DESIGN-GUIDE.md](./DESIGN-GUIDE.md) §8 참조.

---

## 슬라이드 구성 (현재 구현: 8장)

순서는 `WrappedView.tsx` 의 import 순서와 동일하다. `lastSlideIndex = 7`.

### Slide 1: Cover — "Memradar"

- 큰 타이틀: `Memradar` (Instrument Serif, 타이프라이터 진입)
- 서브카피: `당신의 AI 성향은?` / `What is your AI style?`
- 요약: "N개의 세션을 바탕으로 당신의 AI 사용 흐름을 읽어볼게요."
- 타이틀 카드 역할. 본 내러티브는 Slide 2(Intro) 부터 시작한다.

구현: `src/components/wrapped/slides/CoverSlide.tsx`

### Slide 2: Intro — "Your Memradar"

- Eyebrow: `Your Memradar`
- 큰 타이틀: `Memradar` (Instrument Serif)
- 서브카피: `당신의 AI 성향은?` / `What is your AI style?`
- 요약: "N개의 세션을 바탕으로 당신의 AI 사용 흐름을 읽어볼게요."
- 푸터 배지: `첫 기록 YYYY년 M월 D일` / `First recorded on …`

구현: `src/components/wrapped/slides/IntroSlide.tsx`

### Slide 3: Prompts — "Your Prompts"

- 총 프롬프트(유저 메시지) 수를 `AnimatedNumber` 로 카운트업
- 보조 카피: `개의 프롬프트를 작성했습니다`
- 비유 한 줄: `소설 약 N권 분량` (`totalPrompts * 50 / 60000`, 내림)
- 배경 파티클 20개 (deterministic sin-hash)

구현: `src/components/wrapped/slides/PromptsSlide.tsx`

### Slide 4: Model — "Your Favorite Model"

- 가장 많이 사용한 모델 1종 강조 + 상위 4개 비율 바
- 모델 성격 라벨 (`getModelLabel`):
  - `opus` 계열 → "깊이를 추구하는 사색가"
  - `sonnet` 계열 → "효율과 균형의 달인"
  - `haiku` 계열 → "속도를 사랑하는 스프린터"
  - 기타 → "다재다능한 코더"

구현: `src/components/wrapped/slides/ModelSlide.tsx`
알고리즘: `src/lib/personality.ts` — `getModelLabel()`

### Slide 5: Hours — "Your Coding Hours"

- 24시간 활동 분포 막대
- 피크 시간대 라벨 (`getCodingTimeLabel`):

| 피크 시각 | 이모지 | 라벨 |
|---|---|---|
| 02:00~05:59 | 🦉 | Night Owl |
| 06:00~09:59 | 🐦 | Early Bird |
| 10:00~13:59 | ☀️ | Morning Warrior |
| 14:00~17:59 | ⚔️ | Afternoon Warrior |
| 18:00~21:59 | 🌆 | Evening Coder |
| 그 외 | 🌙 | Moonlight Coder |

구현: `src/components/wrapped/slides/HoursSlide.tsx`
알고리즘: `src/lib/personality.ts` — `getCodingTimeLabel()`

### Slide 6: Personality — "Your Coding Personality"

3축 × 2값 = **8 유형** (`src/lib/personality.ts`).

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

3축 라벨 (슬라이더 좌/우, 코드 문자):

| 축 | 좌(<0.5) | 우(≥0.5) | 코드 |
|---|---|---|---|
| **Style** | 탐험가 (Explorer) | 설계자 (Architect) | R / E |
| **Scope** | 한우물 (Deep) | 유목민 (Wide) | D / W |
| **Rhythm** | 스프린터 (Sprint) | 마라토너 (Marathon) | S / M |

- Style: 평균 메시지 길이 × 턴 수 × 입출력 토큰 비율
- Scope: 프로젝트 수/주 × 프로젝트 전환율 × 집중도
- Rhythm: 세션 중앙값 × 시간대 엔트로피 × Deep/Quick 세션 비율

슬라이더 라벨·핸들에는 한/영 툴팁이 달리며, `|axis.value − 0.5| < 0.04` 인 경우 "균형형 / Balanced" 로 표시된다. 카드에는 STRENGTHS / HEADS UP 블록이 따라붙는다.

구현: `src/components/wrapped/slides/PersonalitySlide.tsx`
알고리즘: `src/lib/personality.ts` — `computePersonality()`

### Slide 7: Usage — "내 AI는 무슨 일을 할까?"

사용자 메시지의 키워드 매칭으로 분류한 **9 카테고리 TOP 3**. 1위는 대형 이모지로, 2·3위는 칩으로 표시된다.

| 이모지 | 라벨 | 서브 |
|---|---|---|
| 🏭 | 풀스택 기획자 | 기능 뚝딱 제조기 |
| 🚨 | 버그 헌터 | AI 119 신고 전문 |
| 💅 | 리팩터링 전문가 | 못생긴 코드 참을 수 없는 자 |
| 🧐 | 코드 분석가 | "이거 왜 이렇게 짰어?" 전문가 |
| ✍️ | AI 작가 | 글은 AI가 쓰고 이름은 내가 올리고 |
| 🎨 | 아트 디렉터 | "여기 1px 옮겨" 장인 |
| 🚀 | 배포 마스터 | npm publish 중독자 |
| 🧙 | 데이터 엔지니어 | JSON을 금으로 바꾸는 자 |
| 🧪 | QA 엔지니어 | 통과할 때까지 테스트하는 집착러 |

헤드라인은 `getUsageHeadline()` 규칙:

- TOP1 있음 → `가장 자주 보인 역할은 {카테고리} 쪽이에요`
- TOP1 없음 → `당신의 AI 활용 스타일은 아직 탐색 중이에요`

구현: `src/components/wrapped/slides/UsageSlide.tsx`
알고리즘: `src/lib/usageProfile.ts` — `analyzeUsageTopCategories()`, `getUsageHeadline()`

### Slide 8: Share — "Your Memradar Ending"

- 전체 요약 카드 (1장 이미지로 캡처)
- 포함 정보: 이모지, 성격 유형 타이틀/서브, `usageHeadline`, 3축 슬라이더, Sessions, Messages, Rhythm(`codingLabel`), Top Model
- 공유 버튼:
  - **이미지 저장** — `memradar-code-report.png` PNG 다운로드
  - **공유하기** — 플랫폼 모달 (Threads 활성, X · Instagram "개발중" 배지)
- **전체 보기로 돌아가기** — 마지막 슬라이드 도달 2.5초 뒤 하단 버튼 노출
- 워터마크: `Made in 이더`

공유 동작:

1. 모바일/PWA: `navigator.canShare({ files })` → 네이티브 공유 시트로 PNG 전달 (`navigator.share`)
2. 데스크톱: PNG 를 `ClipboardItem` 으로 클립보드에 복사 → Threads 작성창 탭 오픈 → 사용자가 `Ctrl/⌘+V`
3. 클립보드 API 실패 시: PNG 다운로드 + Threads 탭 오픈 폴백

구현: `src/components/wrapped/slides/ShareSlide.tsx`

---

## 슬라이드 전환 규칙

- 클릭 또는 `→` / `Space`: 다음 슬라이드 (인터랙티브 요소·`[data-wrapped-control]` 제외)
- `←`: 이전 슬라이드
- `End`: 마지막 슬라이드로 점프
- `Escape`: 대시보드 프롬프트가 열려 있으면 닫고, 아니면 Wrapped 종료
- 우상단 **스킵** 버튼: 마지막 슬라이드로 직행
- 우상단 `X` 버튼: Wrapped 즉시 종료
- 마지막 슬라이드 도달 2.5초 후 화면 클릭 시 "대시보드로 이동?" 프롬프트가 열림
- 상단에는 슬라이드 진행률 바, 하단에는 이전/도트/다음 컨트롤

구현: `src/components/wrapped/WrappedView.tsx`

## 모션 & 재사용 컴포넌트

공용 모션 프리미티브는 `src/components/wrapped/slides/SlideLayout.tsx` 에 정의.

- `SlideLayout` — 슬라이드 루트(페이드 in/out, 그라디언트 배경, Wrapped 팔레트 주입)
- `FadeInText` — 텍스트 페이드 + 16px 슬라이드 업, `delay` 지원
- `AnimatedNumber` — 큰 숫자 스프링 등장

상세 값·규칙은 [DESIGN-GUIDE.md §6.2](./DESIGN-GUIDE.md) 참조.

## 공유 카드 캡처 규격

- 너비: `356px` 고정, 패딩 `28px 28px 24px`
- 배경: `linear-gradient(135deg, #0c0c1a 0%, #10081e 50%, #0c0c1a 100%)`
- 테두리: `1px solid rgba(123,108,246,0.2)`, 라운드 `26px`
- 캡처: `toPng(cardRef, { pixelRatio: 2, cacheBust: true })`
- 파일명: `memradar-code-report.png`
- 축 색상: `style #7b6cf6`, `scope #22d3ee`, `rhythm #f59e0b`

## Wrapped 팔레트

Wrapped 는 사용자가 고른 테마와 무관하게 전용 팔레트를 강제 적용한다 (스토리텔링 몰입 유지).

```
bg           #06060e
bg-card      #11101d
bg-hover     #1b1730
border       rgba(255, 255, 255, 0.12)
text         #b7b0c9
text-bright  #f3efff
accent       #7b6cf6   (Axis Style 색)
accent-dim   #6254db
```

정의: `src/theme/themePresets.ts`, `src/index.css` (`.wrapped-surface`)

---

## 향후 확장 아이디어

아직 구현되지 않았거나 보류 중인 아이디어. 도입 전에 [UI-UX-PRINCIPLES.md](./UI-UX-PRINCIPLES.md) §9 의 "대시보드 vs Code Report 무드 분리" 원칙을 재확인한다.

- **Tools 슬라이드** — `slides/ToolsSlide.tsx` 에 구현체는 남아 있으나 현재 `WrappedView` 가 렌더하지 않는다. 재도입 시 순서/필요성 재검토 필요.
- **Busiest Day 슬라이드** — 달력에서 가장 바빴던 날 하이라이트
- **Vocabulary 슬라이드** — 원형 확장 워드 클라우드
- **Marathon Session 슬라이드** — 가장 긴 세션 정보
- **Cost 슬라이드** — 모델별 누적 비용
- **다국어 내레이션** — 영어 버전 내러티브 톤 정비

초기 기획의 `10장 슬라이드` 초안은 위 아이디어들을 포함한 것이었다. 현재는 **8장 구성**(Cover 포함, Tools 제외)이 실제 셀릭된 상태이며, 위 아이디어는 로드맵 [ROADMAP.md](./ROADMAP.md) §2.6 과 연동된다.
