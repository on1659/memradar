# Memradar 아이콘 시스템 재설계 — Codex 브리프

> 이 문서는 Codex(외부 디자인/코드 협업 에이전트)에 첨부해 **메라이더 전용 아이콘 시스템**을 새로 만들기 위한 작업 의뢰서입니다.
> 작성일: 2026-05-10. 의뢰 배경: docs/FEEDBACK-2026-05-10.md (동석 지/영태 김 피드백) §2.5.

---

## 1. 작업 방향 원칙 (Quality-first)

> ⚠ **이 원칙은 본 문서뿐 아니라 Memradar의 모든 코딩/디자인 결정에 동일하게 적용됩니다.**
> CLAUDE.md / `.claude/rules/harness.md` 와 동일.

- **결과물 품질 > 정확성 > 정석 > 속도** 순서로 의사결정.
- "빠르게 적용 가능"은 **추천 근거에서 제외**, 구현 방향 선택에서도 제외.
- 트리아지 상향, 정찰 깊이, 검수 회수, 리팩터 범위를 줄이는 이유가 "빠름"이라면 그 결정은 무효.
- 단, **리스크 분리·검수 가능성·롤백 가능성**을 위한 단계 분할은 여전히 유효 (이건 속도 노선이 아닌 품질 노선).
- "당장 적용 가능한 가벼운 해결책"이 떠올랐을 때 멈춰서 자문할 것: *"이 선택의 근거가 빠름이라면, 정석이 무엇인지를 먼저 찾아라."*

---

## 2. 의뢰 목적

Memradar의 시각 정체성을 **AI가 생성한 인상이 남지 않는 일관된 아이콘 시스템**으로 정리한다. 현재는 (a) lucide-react의 범용 아이콘과 (b) 이모지가 혼재되어 있어, 사용자(피드백 제공자)가 "AI 슬롭"이라 인지하는 시각 시그니처를 만든다.

> **2026-05-10 의뢰 범위 확장:** 사용자 결정에 따라 코어 23종 외 코드베이스의 **모든 이모지(Tools 10 + System 4)** 도 함께 의뢰. 총 **37종** + lucide 메타포 검토.

목표:

1. **37개의 브랜드/UI 아이콘**(8 성향 + 6 시간대 + 9 직업 + 10 도구 + 4 시스템)을 통일된 시각 언어의 **사용자 정의 SVG 시스템**으로 새로 그린다.
2. **lucide-react의 메타포 아이콘**(`Code2`, `Brain`, `Sparkles`, `Wrench` 등) 사용처를 검토해 **제거 또는 우리 아이콘으로 교체**한다.
3. lucide의 **순수 액션/네비 아이콘**(`ArrowLeft`, `Check`, `X`, `ChevronDown` 등 표준 의미만 갖는 것)은 유지하되, stroke width·시각 톤이 우리 시스템과 일치하는지만 검수.

비목표 (이번 의뢰 범위 아님):

- 로고/워드마크 새로 그리기 (단, 그룹 E의 `✦` 브랜드 마크는 의뢰 포함)
- 애플리케이션 전체 리브랜딩
- 컬러 시스템 개편 (별도 작업, 묶음 3에서 진행)

---

## 3. 인벤토리 — 무엇을 그리고, 무엇을 검토하는가

### 3.1 브랜드 아이콘 (신규 SVG 23개) — Codex 작업 대상 1순위

#### A. Personality (성향) — 8개

[`src/lib/personality.ts:62-133`](../src/lib/personality.ts#L62-L133)

| 코드 | 한글 타이틀 | 영문 | 현재 이모지 | 의미 (Codex 참고) |
| --- | --- | --- | --- | --- |
| RDM | 심해 잠수부 | Deep Diver | 🤿 | 코드 깊이 파고듦, 근본 원인 추적 |
| RDS | 코드 감별사 | Code Appraiser | 🔎 | 빠르게 읽고 핵심 짚음, 리뷰 |
| RWM | 도서관 사서 | Librarian | 📚 | 넓게 살피고 전체 그림 그림 |
| RWS | 트렌드 헌터 | Trend Hunter | 🏄 | 새 기술 빠르게 훑고 적용 |
| EDM | 장인 대장장이 | Master Smith | ⚒️ | 한 프로젝트 몰두, 완성도 |
| EDS | 번개 해결사 | Lightning Fixer | ⚡ | 즉각 해치움, 생산성 |
| EWM | 만능 빌더 | All-round Builder | 🏗️ | 여러 프로젝트, 풀스택 |
| EWS | 카오스 크리에이터 | Chaos Creator | 🌪️ | 동시다발 실험, 해커톤 |

#### B. Coding Time (코딩 시간대) — 6개

[`src/lib/personality.ts:260-269`](../src/lib/personality.ts#L260-L269)

| 라벨 | 시간 범위 | 현재 이모지 | 의미 |
| --- | --- | --- | --- |
| Night Owl | 02-06시 | 🦉 | 새벽형 |
| Early Bird | 06-10시 | 🐦 | 아침형 |
| Morning Warrior | 10-14시 | ☀️ | 오전 집중 |
| Afternoon Warrior | 14-18시 | ⚔️ | 오후 집중 |
| Evening Coder | 18-22시 | 🌆 | 저녁 |
| Moonlight Coder | 22-02시 | 🌙 | 야간 |

#### C. AI Role / Usage (직업 카테고리) — 9개

[`src/lib/usageProfile.ts:31-167`](../src/lib/usageProfile.ts#L31-L167)

| ID | 한글 타이틀 | 부제 | 현재 이모지 | 의미 |
| --- | --- | --- | --- | --- |
| feature | 풀스택 기획자 | 기능 뚝딱 제조기 | 🏭 | 새 기능 구현 |
| debug | 버그 헌터 | AI 119 신고 전문 | 🚨 | 버그 추적 |
| refactor | 리팩터링 전문가 | 못생긴 코드 못 참는 자 | 💅 | 코드 정리 |
| review | 코드 분석가 | "이거 왜 이렇게 짰어?" 전문가 | 🧐 | 코드 리뷰/분석 |
| writing | AI 작가 | 글은 AI, 이름은 내가 | ✍️ | 문서/번역 |
| design | 아트 디렉터 | "여기 1px 옮겨" 장인 | 🎨 | UI/디자인 |
| devops | 배포 마스터 | npm publish 중독자 | 🚀 | 배포/CI |
| data | 데이터 엔지니어 | JSON을 금으로 바꾸는 자 | 🧙 | 데이터/쿼리 |
| test | QA 엔지니어 | 통과할 때까지 테스트하는 집착러 | 🧪 | 테스트 |

#### D. Tools (도구 라벨) — 10개

[`src/components/wrapped/slides/ToolsSlide.tsx:9-41`](../src/components/wrapped/slides/ToolsSlide.tsx#L9-L41)

| 키 | 의미 | 현재 이모지 | 비고 |
| --- | --- | --- | --- |
| Read | 파일 읽기 | 📖 | |
| Edit | 파일 편집 | ✏️ | |
| Write | 파일 작성 | 📝 | |
| Bash | 셸 실행 | 💻 | |
| Grep | 텍스트 검색 | 🔍 | `system.search` 와 도형 구분 가능해야 |
| Glob | 파일 패턴 검색 | 📂 | 그룹 E의 폴더와 구분 가능해야 |
| Agent | 에이전트 호출 | 🤖 | **AI 메타포 후보** — 인간 형상 금지, 추상화 필요 |
| WebSearch / WebFetch | 웹 액세스 | 🌐 | 두 키 동일 아이콘 사용 OK |
| (default) | 기타 도구 | 🔧 | 폴백 — 일반 도구 의미 |
| (rank 1) | 1위 도구 표식 | 👑 | 트로피/메달 형태로 추상화 (왕관 메타포 회피 권장) |

> **CLAUDE.md 제약 알림:** `ToolsSlide.tsx`는 현재 import 금지(향후 확장 슬롯). 본 그룹은 **그려두되 즉시 통합되지 않음**. 향후 슬롯 활성화 시 바로 사용 가능하도록 그룹 A/B/C와 동일 시각 룰 적용.

#### E. System (브랜드/상태) — 4개

| 키 | 의미 | 현재 이모지/문자 | 사용처 |
| --- | --- | --- | --- |
| `brand-mark` | Memradar 브랜드 액센트 마크 | `✦` | [`App.tsx:205`](../src/App.tsx#L205), [`MemradarTopBar.tsx:29, 107`](../src/components/MemradarTopBar.tsx#L29), [`SearchView.tsx:64`](../src/components/search/SearchView.tsx#L64) |
| `empty-sessions` | 세션 없음 빈 상태 | `📭` | [`WrappedView.tsx:93`](../src/components/wrapped/WrappedView.tsx#L93) |
| `warning` | 경고/에러/중단 | `⚠️` | [`sessionExport.ts:260, 309, 734, 741, 1127`](../src/lib/sessionExport.ts#L260) (HTML/Markdown export 양쪽) |
| `tool-glyph` | export 본문의 도구 호출 글리프 | `🔧` | [`sessionExport.ts:280, 287, 734`](../src/lib/sessionExport.ts#L280), [`SessionView.tsx:471`](../src/components/SessionView.tsx#L471) — 그룹 D의 default와 형상 동일하게 통일 |

> `✦` 브랜드 마크는 형태 자체가 단순하나 **Memradar 정체성의 핵심 시각 요소** — `currentColor` SVG로 별도 정착시켜 일관 사용. `tool-glyph`(🔧)와 그룹 D의 default(🔧)는 **동일 SVG로 통일**.

### 3.2 lucide-react 사용처 — Codex 검토/판정 대상

| 파일 | 아이콘 | 분류 (작업 대상 여부) |
| --- | --- | --- |
| [`Dashboard.tsx`](../src/components/Dashboard.tsx) | `ArrowLeftRight` | 액션 (유지) |
| | `BarChart3` | **검토** — 차트 카드 헤더, 메타포성 |
| | `Brain` | **교체/제거** — AI 슬롭 시그니처 |
| | `Calendar` | 액션 (유지) |
| | `CircleHelp` | 액션 (유지) |
| | `Code2` | **제거** — 동석 지님 직접 지적 ("내 AI의 직업" 카드) |
| | `Flame` | **검토** — "Hot Streak" 류 메타포 |
| | `MessageSquare` | 액션 (유지) |
| | `Terminal` | **검토** — 메타포성 |
| | `Timer` | 액션 (유지) |
| | `TrendingUp` | 액션 (유지) |
| | `Zap` | **교체/제거** — 슬롭 시그니처 |
| [`WrappedView.tsx`](../src/components/wrapped/WrappedView.tsx) | `ArrowLeft, ArrowRight, SkipForward, X` | 액션 (유지) |
| [`ReplayView.tsx`](../src/components/replay/ReplayView.tsx) | `Pause, Play, SkipBack, SkipForward, Wrench, ChevronUp/Down, ArrowLeft` | 액션 — `Wrench`만 검토 |
| [`SessionView.tsx`](../src/components/SessionView.tsx) | `Bot, User, Check, Chevron*, Clock, Copy, Download, Play, ArrowLeft` | `Bot`/`User` **검토** — 메시지 발신자 표시. lucide의 `Bot`은 슬롭 시그니처일 수 있음. |
| [`ProductUpdates.tsx`](../src/components/updates/ProductUpdates.tsx) | `Bell, Palette, Search, Sparkles, Wrench, X` | `Sparkles, Wrench` **검토** |
| [`SearchBar.tsx`](../src/components/search/SearchBar.tsx) | `Search, SlidersHorizontal, X, User, Bot` | `User, Bot` 검토 |
| [`SearchResults.tsx`](../src/components/search/SearchResults.tsx) | `User, Bot, Clock` | `User, Bot` 검토 |
| [`ToolCallView.tsx`](../src/components/tools/ToolCallView.tsx) | `ChevronRight, Wrench, AlertTriangle` | `Wrench` 검토 (도구 호출 표시) |
| [`ShareSlide.tsx`](../src/components/wrapped/slides/ShareSlide.tsx) | `Camera, Download, LayoutDashboard, MessageCircle, Send, Share2, X` | 액션 (유지) |
| [`PersonalityView.tsx`](../src/components/PersonalityView.tsx) | `ArrowLeft, ArrowLeftRight, CircleHelp` | 액션 (유지) |
| [`DropZone.tsx`](../src/components/DropZone.tsx) | `AlertTriangle, Check, Copy, FolderOpen, Shield, Terminal, Wifi` | `Terminal` 검토 |
| [`MemradarTopBar.tsx`](../src/components/MemradarTopBar.tsx) | `Bell, RefreshCw` | 액션 (유지) |
| [`ThemeSwitcher.tsx`](../src/components/ThemeSwitcher.tsx) | `MoonStar, Palette, Sparkles, SunMedium, ArrowLeft` | `Sparkles` **검토** |
| [`themePresets.ts`](../src/theme/themePresets.ts) | `MoonStar, Palette, Sparkles, SunMedium` | `Sparkles` 검토 |

**Codex가 결정해야 할 것:**
- **검토** 표시된 항목별로: (a) 그대로 유지 / (b) 더 중성적인 lucide 아이콘으로 치환 / (c) 우리 사용자 정의 SVG로 교체. 각 결정의 근거를 한 줄로.
- **교체/제거** 표시된 항목: 사용 맥락을 보고 텍스트만 남길지, 새 SVG를 그려줄지 판단 후 그려줌.

---

## 4. 새 아이콘 시스템 — 시각 언어 사양

### 4.1 형식

- **포맷:** SVG, 인라인 React 컴포넌트로 export.
- **viewBox:** `0 0 24 24` 통일.
- **크기:** 컴포넌트는 `width`/`height` props로 가변. 기본값 24.
- **컬러:** `stroke="currentColor"` / `fill="currentColor"` 또는 `fill="none"` 만 사용. **하드코딩된 컬러 금지.**
- **stroke-width:** **1.75** 통일 (lucide 기본 2보다 살짝 얇아 정제된 인상).
- **stroke-linecap / stroke-linejoin:** `round` 통일.
- **stroke vs fill 통일:** 23개 브랜드 아이콘은 **stroke-only** 권장 (lucide와 톤 호환). 단, 형태상 fill이 필수면 fill도 허용하되 동일 규칙(`currentColor`).

### 4.2 미적 톤 — 절대로 피해야 할 것

다음 인상은 **AI 슬롭 시그니처**로 분류되며 새 아이콘에 절대 들어가서는 안 된다:

- ❌ **그라디언트 채움** (purple-to-pink 등)
- ❌ **이모지 풍의 디테일** (눈/표정/땀방울/삼각형 강조선/속도선/별빛 등)
- ❌ **3D/네온/글로우/그림자 효과**
- ❌ **다채색 분할** (한 아이콘 안에 2가지 이상의 hue)
- ❌ **AI/뇌/마법봉/스파클** 메타포 (Brain, Wand2, Sparkles 패턴)
- ❌ **두께 변동 stroke** (단일 두께 유지)
- ❌ **불필요한 장식선** (예: "프로그래머" 그리려고 안경에 반사광 넣기)

### 4.3 미적 톤 — 지향

- ✅ **기하학적·도식적 (geometric/diagrammatic)** — Phosphor Icons의 "Regular" weight, Tabler Icons, Material Symbols Outlined의 차분한 라인.
- ✅ **개념의 압축** — 디테일 제거, 형태의 핵심만. 예: "심해 잠수부"는 잠수부 인물 그리지 말고 **물 표면 라인 + 깊이 화살표** 같은 기하학 도식.
- ✅ **24px 그리드 정렬** — stroke가 픽셀 그리드에 맞도록 좌표는 0.5 단위.
- ✅ **명도 차이로 정보 표현** (필요 시 fill 농도만, hue 추가 금지).
- ✅ **카테고리 안에서 시각 변조 일관** — 8개 성향 아이콘은 같은 시각 룰(예: 모두 "둥근 컨테이너 + 내부 도식")을 공유.

### 4.4 카테고리별 시각 룰 (제안 — Codex가 검토 후 확정)

- **A. Personality (8개):** 모두 동일한 **외곽 도형 안의 도식** 형태. 외곽은 원/육각형/둥근 사각형 중 하나로 통일. 내부에 의미 도식.
- **B. Coding Time (6개):** **시계 다이얼**을 공통 모티프로 두고 시간대별 핸들 위치/태양·달 도식만 변화.
- **C. AI Role (9개):** 각 직업이 **다루는 대상**을 도식화 — 인물 아이콘 금지. (예: 버그 헌터는 사람 + 망원경이 아니라, **벌레 도식 안의 십자 마크** 같은 추상화.)

> Codex는 위 제안을 그대로 따르거나, 더 일관성 높은 룰을 제안할 수 있음. 단, 룰을 바꿀 경우 **23개 전체에 일관 적용**.

---

## 5. 델리버러블 (Codex가 돌려줄 결과물)

### 5.1 파일 구조

```
src/icons/
  ├─ index.ts                          # 재export
  ├─ personality/                      # 그룹 A (8개)
  │   ├─ DeepDiver.tsx
  │   ├─ CodeAppraiser.tsx
  │   ├─ Librarian.tsx
  │   ├─ TrendHunter.tsx
  │   ├─ MasterSmith.tsx
  │   ├─ LightningFixer.tsx
  │   ├─ AllroundBuilder.tsx
  │   └─ ChaosCreator.tsx
  ├─ time/                             # 그룹 B (6개)
  │   ├─ NightOwl.tsx
  │   ├─ EarlyBird.tsx
  │   ├─ MorningWarrior.tsx
  │   ├─ AfternoonWarrior.tsx
  │   ├─ EveningCoder.tsx
  │   └─ MoonlightCoder.tsx
  ├─ role/                             # 그룹 C (9개)
  │   ├─ Feature.tsx
  │   ├─ Debug.tsx
  │   ├─ Refactor.tsx
  │   ├─ Review.tsx
  │   ├─ Writing.tsx
  │   ├─ Design.tsx
  │   ├─ Devops.tsx
  │   ├─ Data.tsx
  │   └─ Test.tsx
  ├─ tools/                            # 그룹 D (10개)
  │   ├─ Read.tsx
  │   ├─ Edit.tsx
  │   ├─ Write.tsx
  │   ├─ Bash.tsx
  │   ├─ Grep.tsx
  │   ├─ Glob.tsx
  │   ├─ Agent.tsx
  │   ├─ Web.tsx                       # WebSearch/WebFetch 공용
  │   ├─ Wrench.tsx                    # default 도구 + sessionExport tool-glyph 공용
  │   └─ Rank1.tsx                     # 1위 표식
  └─ system/                           # 그룹 E (4개)
      ├─ BrandMark.tsx                 # ✦
      ├─ EmptySessions.tsx             # 📭
      └─ Warning.tsx                   # ⚠️
      # tool-glyph는 tools/Wrench.tsx 재사용
```

### 5.2 각 파일 형식

```tsx
// src/icons/personality/DeepDiver.tsx
import type { SVGProps } from 'react'

export function DeepDiverIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* 도형 path들 */}
    </svg>
  )
}
```

### 5.3 인덱스 매핑

```ts
// src/icons/index.ts
import type { TypeCode } from '../lib/personality'
import { DeepDiverIcon } from './personality/DeepDiver'
// ...

export const PERSONALITY_ICONS: Record<TypeCode, ComponentType<{ size?: number }>> = {
  RDM: DeepDiverIcon,
  RDS: CodeAppraiserIcon,
  // ...
}

export const ROLE_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  feature: FeatureIcon,
  debug: DebugIcon,
  // ... (id는 usageProfile.ts의 CategoryData.id와 1:1 일치)
}

export const TIME_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  'Night Owl': NightOwlIcon,
  // ... (key는 personality.ts의 getCodingTimeLabel().label과 1:1 일치)
}

export const TOOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  Read: ReadIcon,
  Edit: EditIcon,
  Write: WriteIcon,
  Bash: BashIcon,
  Grep: GrepIcon,
  Glob: GlobIcon,
  Agent: AgentIcon,
  WebSearch: WebIcon,
  WebFetch: WebIcon,
  // ... (key는 ToolsSlide.tsx의 TOOL_ICONS 키와 1:1 일치)
}

/** 폴백 + 도구 호출 글리프 */
export const ToolDefaultIcon = WrenchIcon
/** 1위 표식 (트로피/메달 — '왕관'은 회피) */
export const Rank1Icon = Rank1Icon

export const SYSTEM_ICONS = {
  brandMark: BrandMarkIcon,
  emptySessions: EmptySessionsIcon,
  warning: WarningIcon,
  toolGlyph: WrenchIcon,        // sessionExport.ts의 🔧 와 동일
}
```

### 5.4 함께 제출할 산출물

1. **37개 SVG 컴포넌트 (.tsx)** — 위 구조대로 (그룹 A 8 + B 6 + C 9 + D 10 + E 4 = 37).
2. **인덱스 (`src/icons/index.ts`)** — `PERSONALITY_ICONS` / `TIME_ICONS` / `ROLE_ICONS` / `TOOL_ICONS` / `SYSTEM_ICONS` 모두 키 일치 확인.
3. **시각 결정 노트 (.md)** — 5개 카테고리별 시각 룰을 어떻게 잡았는지, 각 아이콘이 어떤 도식 결정을 했는지 한 줄씩. 그룹 D의 `Wrench` 와 그룹 E의 `tool-glyph` 가 동일 SVG로 통일됐음을 명시.
4. **lucide 검토 표** — §3.2의 "검토" 항목별로 (a/b/c 결정 + 근거).
5. **검수용 단일 HTML** — 37개 아이콘을 한 페이지에 5개 카테고리 그리드 + 16/24/32/48px 4단으로 나열한 정적 HTML (다크/라이트 두 배경에서 모두 표시).

---

## 6. 통합 방법 (Codex 결과물을 받은 후 우리가 할 일 — 참고용)

> Codex 작업 후 별도 PR로 처리. 본 문서 범위 아님.

1. `src/icons/` 디렉토리 추가.
2. `personality.ts` / `usageProfile.ts` 의 `emoji` 필드 처리 결정:
   - 옵션 A: 필드 그대로 두고 UI 단에서 아이콘 매핑 사용 (가장 안전).
   - 옵션 B: 필드 deprecate, ID/타입 코드만 노출.
3. UI 단에서 이모지 렌더링 부분을 SVG 컴포넌트 렌더로 교체.
4. lucide 메타포 아이콘 교체/제거를 §3.2 표대로 적용.
5. Wrapped 슬라이드의 spring rotate 애니메이션 (`PersonalitySlide.tsx:107-114`, `UsageSlide.tsx:23-30`)은 새 SVG로 교체 시 삭제 또는 잔잔한 fade로 변경.

---

## 7. 검수 기준 (PR 머지 전 체크)

- [ ] 37개 모두 24×24 viewBox, stroke 1.75, currentColor 통일
- [ ] 라이트/다크 테마 양쪽에서 시인성 양호
- [ ] 16/24/32/48px 모두 의미 식별 가능 (16에서 형체가 뭉개지지 않음)
- [ ] 카테고리별 시각 룰 일관 — Personality 8개 / Time 6개 / Role 9개 / Tools 10개 / System 4개 각각 한 시리즈로 인식
- [ ] 5개 카테고리 사이의 시각 톤도 한 시스템으로 통일 (그룹 간 톤 충돌 없음)
- [ ] 37개 중 어느 것도 §4.2 금지 인상 없음
- [ ] lucide-react 의존성은 §3.2의 "유지" 항목만 남음
- [ ] `getCodingTimeLabel().label` ↔ `TIME_ICONS` 키 1:1 일치 (TS 타입으로 보장)
- [ ] `usageProfile.ts:CATEGORY_DATA[*].id` ↔ `ROLE_ICONS` 키 1:1 일치
- [ ] `TypeCode` 8개 ↔ `PERSONALITY_ICONS` 키 1:1 일치 (Record 타입)
- [ ] `ToolsSlide.tsx`의 `TOOL_ICONS` 키 9개 + default ↔ `TOOL_ICONS` + `ToolDefaultIcon` 1:1 일치
- [ ] 그룹 E의 `tool-glyph`와 그룹 D의 default가 동일 SVG (`WrenchIcon`) 재사용
- [ ] `Agent` 아이콘에 인간 형상/뇌/마법봉 메타포 없음 (AI 슬롭 회피)
- [ ] `Rank1` 아이콘이 왕관(👑)이 아닌 추상화된 트로피/메달/원형 표식

---

## 8. Codex 호출 프롬프트 (사용자가 그대로 복사해 쓸 수 있는 형태)

> 아래 본문을 그대로 Codex에 보내고, 현재 파일(`docs/ICON-REDESIGN-CODEX-BRIEF.md`)을 컨텍스트로 첨부.
> 추가로 다음 파일들을 컨텍스트에 포함:
>
> - [`src/lib/personality.ts`](../src/lib/personality.ts)
> - [`src/lib/usageProfile.ts`](../src/lib/usageProfile.ts)
> - [`src/components/wrapped/slides/ToolsSlide.tsx`](../src/components/wrapped/slides/ToolsSlide.tsx) (그룹 D 키 정의)
> - [`src/lib/sessionExport.ts`](../src/lib/sessionExport.ts) (그룹 E 사용처)
> - 위 §3.2의 lucide 사용 컴포넌트 파일들

```
첨부된 ICON-REDESIGN-CODEX-BRIEF.md 의 §1(작업 방향 원칙)과 §4(시각 언어 사양)을
엄격히 준수하여 Memradar 아이콘 시스템을 새로 설계해주세요.

의뢰 범위: 코드베이스의 이모지 전체 + lucide 메타포 검토.
즉 5개 카테고리 총 37개 SVG (Personality 8 + Time 6 + Role 9 + Tools 10 + System 4).

산출물(§5):
1. src/icons/ 하위 37개 .tsx 컴포넌트 (5개 카테고리 폴더 구조)
2. src/icons/index.ts (PERSONALITY_ICONS, TIME_ICONS, ROLE_ICONS, TOOL_ICONS, SYSTEM_ICONS 매핑)
3. 시각 결정 노트 .md (5개 카테고리별 시각 룰, 아이콘별 도식 결정 한 줄씩)
4. §3.2의 lucide-react "검토" 항목별 판정표 (.md, 결정 + 근거)
5. 검수용 단일 HTML (37개 아이콘을 5개 카테고리 그리드 + 다크/라이트 양쪽, 16/24/32/48px 4단으로 나열)

원칙:
- 결과물 품질 > 정확성 > 정석 > 속도. "빠르게 적용 가능"은 추천 근거가 아님.
- AI 슬롭 시그니처(§4.2 금지 인상) 절대 금지.
- 37개 전체가 한 시각 시스템으로 인식되도록 카테고리별 시각 룰을 통일할 것.
- Agent 아이콘에 인간/뇌/마법봉 메타포 절대 금지. Rank1 아이콘에 왕관 메타포 회피.
- 그룹 D의 default Wrench와 그룹 E의 tool-glyph는 동일 SVG로 통일.

§7의 검수 기준을 모두 충족하는 상태로 제출해주세요. 부족하면 보완 후 제출.
```

---

## 9. 다음 단계 (2026-05-10 기준)

**결정 완료** (`docs/FEEDBACK-2026-05-10.md` §4.1 확정):

- [x] 사용자가 본 문서 검토 + 의뢰 범위 컨펌 (코어 23 → 전체 37로 확장 결정)
- [x] §4.4 카테고리별 시각 룰을 Codex에게 자유도 부여 (룰 통일성만 검수)

**진행 예정:**

- [ ] §3.2 lucide 분류 1차 컨펌 (의뢰 송부 전 또는 송부 시 함께)
- [ ] §8 호출 프롬프트로 Codex 의뢰 송부 (묶음 1 작업 시작과 동시 진행)
- [ ] 결과물 도착 후 §7 체크리스트(13항목)로 검수 → 부족 시 재의뢰
- [ ] 통과 시 묶음 2 진입 — 별도 PR로 통합 (§6 통합 방법)
- [ ] 묶음 1 + 2 통과 후 동석 지님 1차 검수 (`FEEDBACK-2026-05-10.md` §4 Q8)
