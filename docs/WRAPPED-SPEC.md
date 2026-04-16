# Memradar Code Report — 상세 기획

> Spotify Wrapped 스타일의 AI 코딩 회고

사용자의 AI 코딩 대화 데이터를 분석해 **8장의 풀스크린 슬라이드**로 보여주는 인터랙티브 경험. 마지막에 공유 가능한 카드 이미지를 생성해 SNS에 올릴 수 있다.

시각 토큰·모션 어휘는 [DESIGN-GUIDE.md](./DESIGN-GUIDE.md) §8 참조.

---

## 슬라이드 구성 (현재 구현: 8장)

### Slide 1: Intro — "당신의 이야기가 시작된 날"

- 첫 번째 세션 날짜 + 총 세션 수
- 배경: 은은한 그라디언트 + 최소 파티클
- 분위기: 따뜻하고 회고적

구현: `src/components/wrapped/slides/IntroSlide.tsx`

### Slide 2: Prompts — "N개의 프롬프트"

- 총 프롬프트(유저 메시지) 수
- 큰 숫자 `AnimatedNumber` 로 카운트업
- 비유 한 줄: "소설 약 N권 분량" 등 직관적 비교

구현: `src/components/wrapped/slides/PromptsSlide.tsx`

### Slide 3: Model — "Your Favorite Model"

- 가장 많이 사용한 모델 1종 강조
- 모델 성격 라벨:
  - `opus` 계열 → "깊이를 추구하는 사색가"
  - `sonnet` 계열 → "효율과 균형의 달인"
  - `haiku` 계열 → "속도를 사랑하는 스프린터"
  - 기타 → "다재다능한 코더"
- 모델 사용 비율 시각화

구현: `src/components/wrapped/slides/ModelSlide.tsx`
알고리즘: `src/lib/personality.ts` — `getModelLabel()`

### Slide 4: Hours — "Your Coding Hours"

- 24시간 활동 분포
- 피크 시간대 라벨:

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

### Slide 5: Tools — "Your Top Tools"

- 가장 많이 사용한 도구 랭킹 (1~5위)
- 순위 공개 애니메이션
- 각 도구 아이콘 + 사용 횟수

구현: `src/components/wrapped/slides/ToolsSlide.tsx`

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

3축 라벨:
- **Style**: 읽기형(R) ↔ 실행형(E) — Read/Grep 계 도구 대 Write/Bash 계 도구 비율
- **Scope**: 깊이파(D) ↔ 넓이파(W) — 도구 다양성 × 프로젝트 수 × 모델 다양성
- **Rhythm**: 마라토너(M) ↔ 스프린터(S) — 평균 세션 길이

구현: `src/components/wrapped/slides/PersonalitySlide.tsx`

### Slide 7: Usage — "당신의 AI 스타일"

사용 패턴 기반 8 카테고리 (`src/components/PersonalityView.tsx` 에서 공유 사용).

| 이모지 | 라벨 | 핵심 |
|---|---|---|
| 🏭 | 풀스택 기획자 / 기능 뚝딱 제조기 | 기능 생성 비율 |
| 🚨 | 버그 헌터 / AI 119 신고 전문 | 버그 해결 키워드 |
| 💅 | 코드 성형외과 | 리팩토링 키워드 |
| 🧐 | 코드 감정사 | 설명 요청 비율 |
| ✍️ | AI 고스트라이터 | 문서·글쓰기 비율 |
| 🎨 | AI 아트 디렉터 | UI·디자인 키워드 |
| 🚀 | 배포 마스터 | 배포 키워드 |
| 🧙 | 데이터 연금술사 | 데이터 변환 키워드 |

구현: `src/components/wrapped/slides/UsageSlide.tsx`
알고리즘: `src/lib/usageProfile.ts`

### Slide 8: Share — "Made in 이더"

- 전체 요약 카드 (1장 이미지로 캡처)
- 포함 정보: 성격 유형, 총 세션, 총 메시지, 선호 모델, 코딩 시간대
- 공유 버튼:
  - **이미지 저장** — PNG 다운로드
  - **공유하기** — 플랫폼 선택 (현재 Threads. X·Instagram 개발 예정)
- **대시보드로 돌아가기** — 마지막 슬라이드에서만 노출

공유 동작:
1. 모바일/PWA: `navigator.canShare({ files })` → 네이티브 공유 시트
2. 데스크톱: 클립보드에 PNG 복사 + Threads 작성창 오픈 → 사용자가 `Ctrl/⌘+V`
3. 클립보드 실패 시: PNG 다운로드 폴백

구현: `src/components/wrapped/slides/ShareSlide.tsx`

---

## 슬라이드 전환 규칙

- 클릭 또는 `→` / `Space`: 다음 슬라이드
- `←`: 이전 슬라이드
- `End`: 마지막 슬라이드로 점프
- `Escape`: Wrapped 종료 (대시보드 복귀)
- 마지막 슬라이드 도달 후 일정 시간 뒤 "대시보드로" 버튼이 활성화

구현: `src/components/wrapped/WrappedView.tsx`

## 모션 & 재사용 컴포넌트

공용 모션 프리미티브는 `src/components/wrapped/slides/SlideLayout.tsx` 에 정의.

- `SlideLayout` — 슬라이드 루트(페이드 in/out, Wrapped 팔레트 주입)
- `FadeInText` — 텍스트 페이드 + 16px 슬라이드 업, `delay` 지원
- `AnimatedNumber` — 큰 숫자 스프링 등장

상세 값·규칙은 [DESIGN-GUIDE.md §6.2](./DESIGN-GUIDE.md) 참조.

## 공유 카드 캡처 규격

- 너비: `356px` 고정
- 배경: `linear-gradient(135deg, #0c0c1a 0%, #10081e 50%, #0c0c1a 100%)`
- 테두리: `1px solid rgba(123,108,246,0.2)`, 라운드 `26px`
- 캡처: `toPng(cardRef, { pixelRatio: 2, cacheBust: true })`
- 파일명: `memradar-code-report.png`

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

정의: `src/theme/themePresets.ts:74-88`, `src/index.css:486-504` (`.wrapped-surface`)

---

## 향후 확장 아이디어

아직 구현되지 않았거나 실험적 아이디어. 도입 전에 [UI-UX-PRINCIPLES.md](./UI-UX-PRINCIPLES.md) §9 의 "대시보드 vs Code Report 무드 분리" 원칙을 재확인한다.

- **Busiest Day 슬라이드** — 달력에서 가장 바빴던 날 하이라이트
- **Vocabulary 슬라이드** — 원형 확장 워드 클라우드
- **Marathon Session 슬라이드** — 가장 긴 세션 정보
- **Cost 슬라이드** — 모델별 누적 비용
- **다국어 내레이션** — 영어 버전 내러티브 톤 정비

원 `10장 슬라이드` 초안은 이 확장 아이디어들을 포함한 것이었다. 현재는 **8장 구성으로 정리된 상태**이며, 위 아이디어는 로드맵 [ROADMAP.md](./ROADMAP.md) §2.6 과 연동된다.
