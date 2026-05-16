# Codex 의뢰서 — Memradar 아이콘 시스템 신규 설계 (2026-05-10)

> **Codex, 이 문서를 읽고 작업을 시작하세요.**
> 본 문서는 단일 진입점입니다. §10의 첨부 파일을 모두 읽은 뒤 §3~§8 사양에 따라 §6의 산출물을 제출하세요.

---

## 1. 미션

Memradar 코드베이스의 **이모지 37종 + lucide-react 메타포 아이콘**을 통일된 시각 언어의 **사용자 정의 SVG 아이콘 시스템**으로 새로 설계해 제출하세요. 결과물은 React 컴포넌트(`src/icons/`) + 인덱스 매핑 + 시각 결정 노트 + lucide 검토 판정표 + 검수용 HTML 입니다.

배경: 사용자 피드백(2026-05-10 동석 지/영태 김)에서 "AI가 생성한 디자인 시그니처(이모지·다채색·뇌/마법 메타포)를 모두 빼야 한다"는 요구가 들어왔고, 영태 김 + 동석 지 합의로 본 의뢰가 결정됨.

---

## 2. 절대 원칙

### 2.1 Quality-first (의사결정 우선순위)

```text
결과물 품질  >  정확성  >  정석  >  속도
```

- "빠르게 적용 가능", "최소 변경", "변경 라인 수 적음" 은 **추천 근거에서 제외**, 구현 방향 선택에서도 제외.
- 검수 회수·정찰 깊이·리팩터 범위를 줄이는 이유가 "빠름" 이라면 그 결정은 **무효**.
- 단, 리스크 분리·검수 가능성·롤백 가능성을 위한 단계 분할은 유효 (속도가 아닌 품질 노선).
- "당장 떠오른 가벼운 해결책" 이 있을 때 멈춰서 자문: *"근거가 빠름이라면, 정석은 무엇인가?"*

### 2.2 AI 슬롭 시그니처 — 절대 금지

> **⚠ CRITICAL — 2026-05-16 직전 산출물 전량 거부 사유**
>
> 이전 산출물(37개 SVG)이 다음 위반으로 **전량 거부**됨. 본 의뢰는 그 재작업이며, 같은 패턴 반복 시 즉시 폐기됩니다:
>
> - 모든 SVG에 `fill="#FF5F73"`, `stroke="#B93653"` 같은 **하드코딩 hex** (예: `Debug.tsx` 한 아이콘에 빨강/노랑/파랑/회색/분홍/초록/민트 7개 hue 박힘)
> - `stroke-width` 가 0.75, 0.85, 0.9, 1, 1.05, 1.15, 1.35, 1.45 섞임 (의뢰서 1.75 통일 위배)
> - `<rect>` 안에 `fill="#F9FBFF"` 같은 라이트 톤 + 다크 톤 stroke (이모지풍 다중 면 채움)
> - `data-literal="true"` 같은 임의 속성 추가
>
> **본 재의뢰의 절대 룰 (위반 시 즉시 거부):**
>
> 1. SVG 안 **모든** `fill` 속성은 `"none"` 또는 `"currentColor"` 둘 중 하나만. **hex (#xxx) 0건**.
> 2. SVG 안 **모든** `stroke` 속성은 `"currentColor"` 만. **hex 0건**.
> 3. SVG 안 **모든** `strokeWidth` 속성은 정확히 `1.75` 또는 컴포넌트 루트의 `strokeWidth={1.75}` 만 사용 (개별 path에서 다른 값 절대 금지).
> 4. SVG 안 `data-literal`, `data-*` 같은 임의 속성 금지.
> 5. 검수 통과 기준: `grep -rE 'fill="#\|stroke="#\|strokeWidth="[^1]' src/icons/` 결과 **0건**.

다음 인상은 **단 하나도** 결과물에 들어가서는 안 됩니다:

- ❌ **그라디언트 채움** (purple-to-pink, 무지개 등)
- ❌ **이모지풍 디테일** — 눈/표정/땀방울/속도선/별빛/하이라이트
- ❌ **3D / 네온 / 글로우 / 외곽 그림자**
- ❌ **다채색 분할** — 한 아이콘 안에 2가지 이상의 hue
- ❌ **하드코딩 hex 컬러** — `fill="#xxx"` / `stroke="#xxx"` 단 하나도 금지. `currentColor` 만 허용.
- ❌ **stroke-width 변동** — 모든 path/circle/rect의 stroke-width 가 정확히 1.75. 다른 값 절대 금지.
- ❌ **다중 면 채움** — `<rect fill="#fff">` 안에 `<path fill="#x" stroke="#y">` 같은 라이트/다크 톤 혼용
- ❌ **AI/뇌/마법봉/스파클 메타포** (Brain, Wand, Sparkles 패턴)
- ❌ **두께 변동 stroke** (단일 두께 유지)
- ❌ **불필요한 장식선** (예: 인물 그리려고 안경 반사광 추가)
- ❌ **Agent 아이콘에 인간 형상** — 추상 도식만
- ❌ **Rank1 표식에 왕관 메타포** — 트로피/메달/원형 표식으로

---

## 3. 시각 언어 사양 (필수 준수)

### 3.1 SVG 스펙

| 항목 | 값 |
| --- | --- |
| viewBox | `0 0 24 24` (37개 모두 통일) |
| stroke-width | `1.75` (lucide 기본 2 보다 정제됨) |
| stroke-linecap | `round` |
| stroke-linejoin | `round` |
| color | `currentColor` 만 사용 (하드코딩 hex/rgb 금지) |
| fill | `none` 또는 `currentColor` 만 |
| 좌표 정렬 | 24px 그리드, 좌표는 0.5 단위 |
| 권장 방식 | stroke-only |

### 3.2 미적 톤 — 지향

- ✅ 기하학·도식적 (Phosphor "Regular" / Tabler 톤)
- ✅ 개념의 압축 — 디테일 제거, 형태의 핵심만
- ✅ 명도 차이로 정보 표현 (hue 추가 절대 금지)
- ✅ 카테고리 안에서 시각 변조 일관

### 3.3 카테고리별 시각 룰 (제안 — 더 일관성 높은 룰을 발견하면 변경 OK, 단 카테고리 전체에 일관 적용)

- **그룹 A (Personality 8):** 동일 외곽 도형(원/육각형/둥근 사각형 중 1) + 내부 도식.
- **그룹 B (Time 6):** 시계 다이얼 + 시간대별 핸들 위치/태양·달 도식만 변화.
- **그룹 C (Role 9):** 다루는 대상의 추상 도식. **인물 도식 금지.**
- **그룹 D (Tools 10):** 도구 동작의 본질을 도식화. 그룹 C와 시각 톤은 일관, 형태는 구분.
- **그룹 E (System 4):** 시스템 의미의 추상 표식. `✦` 는 정체성을 살리되 currentColor SVG로 정착.

---

## 4. 인벤토리 — 무엇을 그리는가 (37개)

### 4.1 그룹 A — Personality (8개)

출처: `src/lib/personality.ts:62-133`

| 코드 | 한글 | 영문 | 현재 이모지 | 의미 (참고) |
| --- | --- | --- | --- | --- |
| RDM | 심해 잠수부 | Deep Diver | 🤿 | 코드 깊이 파고듦 |
| RDS | 코드 감별사 | Code Appraiser | 🔎 | 빠르게 읽고 핵심 짚음 |
| RWM | 도서관 사서 | Librarian | 📚 | 넓게 살피고 전체 파악 |
| RWS | 트렌드 헌터 | Trend Hunter | 🏄 | 새 기술 빠르게 훑고 적용 |
| EDM | 장인 대장장이 | Master Smith | ⚒️ | 한 프로젝트 몰두, 완성도 |
| EDS | 번개 해결사 | Lightning Fixer | ⚡ | 즉각 해치움, 생산성 |
| EWM | 만능 빌더 | All-round Builder | 🏗️ | 여러 프로젝트, 풀스택 |
| EWS | 카오스 크리에이터 | Chaos Creator | 🌪️ | 동시다발 실험 |

### 4.2 그룹 B — Coding Time (6개)

출처: `src/lib/personality.ts:264-269`

| 라벨 | 시간 | 현재 이모지 |
| --- | --- | --- |
| Night Owl | 02-06 | 🦉 |
| Early Bird | 06-10 | 🐦 |
| Morning Warrior | 10-14 | ☀️ |
| Afternoon Warrior | 14-18 | ⚔️ |
| Evening Coder | 18-22 | 🌆 |
| Moonlight Coder | 22-02 | 🌙 |

### 4.3 그룹 C — AI Role (9개)

출처: `src/lib/usageProfile.ts:31-167`

| ID | 한글 | 부제 | 현재 이모지 |
| --- | --- | --- | --- |
| feature | 풀스택 기획자 | 기능 뚝딱 제조기 | 🏭 |
| debug | 버그 헌터 | AI 119 신고 전문 | 🚨 |
| refactor | 리팩터링 전문가 | 못생긴 코드 못 참는 자 | 💅 |
| review | 코드 분석가 | "이거 왜 이렇게 짰어?" 전문가 | 🧐 |
| writing | AI 작가 | 글은 AI, 이름은 내가 | ✍️ |
| design | 아트 디렉터 | "여기 1px 옮겨" 장인 | 🎨 |
| devops | 배포 마스터 | npm publish 중독자 | 🚀 |
| data | 데이터 엔지니어 | JSON을 금으로 바꾸는 자 | 🧙 |
| test | QA 엔지니어 | 통과할 때까지 테스트하는 집착러 | 🧪 |

### 4.4 그룹 D — Tools (10개)

출처: `src/components/wrapped/slides/ToolsSlide.tsx:9-41`

| 키 | 의미 | 현재 이모지 |
| --- | --- | --- |
| Read | 파일 읽기 | 📖 |
| Edit | 파일 편집 | ✏️ |
| Write | 파일 작성 | 📝 |
| Bash | 셸 실행 | 💻 |
| Grep | 텍스트 검색 | 🔍 |
| Glob | 파일 패턴 검색 | 📂 |
| Agent | 에이전트 호출 | 🤖 (인간/뇌 형상 금지, 추상화 필수) |
| WebSearch / WebFetch | 웹 액세스 | 🌐 (두 키 동일 SVG) |
| (default) | 기타 도구 폴백 | 🔧 |
| (rank 1) | 1위 표식 | 👑 (왕관 회피, 트로피/메달 추상화) |

> 알림: `ToolsSlide.tsx`는 현재 import 금지(향후 확장 슬롯). 그러나 그룹 D는 **그려두되 즉시 통합되지 않음**. 향후 슬롯 활성화 시 바로 사용 가능하도록 그룹 A/B/C와 동일 시각 룰 적용.

### 4.5 그룹 E — System (4개)

| 키 | 의미 | 현재 글자/이모지 | 사용처 |
| --- | --- | --- | --- |
| `brand-mark` | Memradar 정체성 마크 | `✦` | `src/App.tsx:205`, `src/components/MemradarTopBar.tsx:29, 107`, `src/components/search/SearchView.tsx:64` |
| `empty-sessions` | 세션 없음 빈 상태 | `📭` | `src/components/wrapped/WrappedView.tsx:93` |
| `warning` | 경고/에러/중단 | `⚠️` | `src/lib/sessionExport.ts:260, 309, 734, 741, 1127` |
| `tool-glyph` | export 본문 도구 글리프 | `🔧` | `src/lib/sessionExport.ts:280, 287, 734`, `src/components/SessionView.tsx:471` |

> `tool-glyph`(그룹 E)와 `default Wrench`(그룹 D)는 **동일 SVG로 통일**해 재사용.

---

## 5. lucide-react 검토 대상

다음 lucide 아이콘 사용처에 대해 (a) 유지 / (b) 더 중성적인 lucide로 치환 / (c) 우리 SVG로 교체 중 하나로 판정하고 근거를 한 줄씩 적어 판정표 제출.

| 파일 | 아이콘 | 1차 분류 |
| --- | --- | --- |
| `src/components/Dashboard.tsx` | `ArrowLeftRight, Calendar, CircleHelp, MessageSquare, Timer, TrendingUp` | 액션(유지) |
| | `BarChart3` | **검토** — 메타포성 |
| | `Brain` | **교체/제거** — AI 슬롭 시그니처 |
| | `Code2` | **제거** — 사용자 직접 지적 ("내 AI의 직업" 카드) |
| | `Flame` | **검토** — Hot Streak 메타포 |
| | `Terminal` | **검토** — 메타포성 |
| | `Zap` | **교체/제거** — 슬롭 시그니처 |
| `src/components/wrapped/WrappedView.tsx` | `ArrowLeft, ArrowRight, SkipForward, X` | 액션(유지) |
| `src/components/replay/ReplayView.tsx` | `ArrowLeft, ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward` | 액션(유지) |
| | `Wrench` | **검토** — 도구 호출 표시 |
| `src/components/SessionView.tsx` | `ArrowLeft, Check, ChevronDown, ChevronUp, Clock, Copy, Download, Play` | 액션(유지) |
| | `Bot, User` | **검토** — 메시지 발신자. lucide의 `Bot`은 슬롭 시그니처 가능성 |
| `src/components/updates/ProductUpdates.tsx` | `Bell, Palette, Search, X` | 액션(유지) |
| | `Sparkles, Wrench` | **검토** |
| `src/components/tools/Truncate.tsx` | `ChevronDown, ChevronUp` | 액션(유지) |
| `src/components/search/SearchResults.tsx` | `Clock` | 액션(유지) |
| | `User, Bot` | **검토** |
| `src/components/search/SearchBar.tsx` | `Search, SlidersHorizontal, X` | 액션(유지) |
| | `User, Bot` | **검토** |
| `src/components/tools/ToolCallView.tsx` | `ChevronRight, AlertTriangle` | 액션(유지) |
| | `Wrench` | **검토** |
| `src/components/wrapped/slides/ShareSlide.tsx` | `Camera, Download, LayoutDashboard, MessageCircle, Send, Share2, X` | 액션(유지) |
| `src/components/PersonalityView.tsx` | `ArrowLeft, ArrowLeftRight, CircleHelp` | 액션(유지) |
| `src/components/DropZone.tsx` | `AlertTriangle, Check, Copy, FolderOpen, Shield, Wifi` | 액션(유지) |
| | `Terminal` | **검토** |
| `src/components/MemradarTopBar.tsx` | `Bell, RefreshCw` | 액션(유지) |
| `src/components/ThemeSwitcher.tsx` | `ArrowLeft, MoonStar, Palette, SunMedium` | 액션(유지) |
| | `Sparkles` | **검토** |
| `src/theme/themePresets.ts` | `MoonStar, Palette, SunMedium` | 액션(유지) |
| | `Sparkles` | **검토** |

---

## 6. 산출물 (5종)

### 6.1 React 컴포넌트 — `src/icons/` 하위 37개

```text
src/icons/
  ├─ index.ts
  ├─ personality/      (그룹 A · 8개)
  │   ├─ DeepDiver.tsx / CodeAppraiser.tsx / Librarian.tsx / TrendHunter.tsx
  │   └─ MasterSmith.tsx / LightningFixer.tsx / AllroundBuilder.tsx / ChaosCreator.tsx
  ├─ time/             (그룹 B · 6개)
  │   ├─ NightOwl.tsx / EarlyBird.tsx / MorningWarrior.tsx
  │   └─ AfternoonWarrior.tsx / EveningCoder.tsx / MoonlightCoder.tsx
  ├─ role/             (그룹 C · 9개)
  │   ├─ Feature.tsx / Debug.tsx / Refactor.tsx / Review.tsx / Writing.tsx
  │   └─ Design.tsx / Devops.tsx / Data.tsx / Test.tsx
  ├─ tools/            (그룹 D · 10개)
  │   ├─ Read.tsx / Edit.tsx / Write.tsx / Bash.tsx / Grep.tsx / Glob.tsx
  │   ├─ Agent.tsx / Web.tsx (WebSearch/WebFetch 공용)
  │   └─ Wrench.tsx (default + tool-glyph 공용) / Rank1.tsx
  └─ system/           (그룹 E · 4개)
      ├─ BrandMark.tsx / EmptySessions.tsx / Warning.tsx
      └─ (tool-glyph는 tools/Wrench.tsx 재사용)
```

### 6.2 컴포넌트 형식 (37개 모두 동일)

```tsx
// 예: src/icons/personality/DeepDiver.tsx
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
      {/* path들 */}
    </svg>
  )
}
```

### 6.3 인덱스 매핑 — `src/icons/index.ts`

```ts
import type { TypeCode } from '../lib/personality'
import type { ComponentType } from 'react'
// 37개 import...

export const PERSONALITY_ICONS: Record<TypeCode, ComponentType<{ size?: number }>> = {
  RDM: DeepDiverIcon, RDS: CodeAppraiserIcon, RWM: LibrarianIcon, RWS: TrendHunterIcon,
  EDM: MasterSmithIcon, EDS: LightningFixerIcon, EWM: AllroundBuilderIcon, EWS: ChaosCreatorIcon,
}

export const TIME_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  'Night Owl': NightOwlIcon, 'Early Bird': EarlyBirdIcon,
  'Morning Warrior': MorningWarriorIcon, 'Afternoon Warrior': AfternoonWarriorIcon,
  'Evening Coder': EveningCoderIcon, 'Moonlight Coder': MoonlightCoderIcon,
}

export const ROLE_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  feature: FeatureIcon, debug: DebugIcon, refactor: RefactorIcon, review: ReviewIcon,
  writing: WritingIcon, design: DesignIcon, devops: DevopsIcon, data: DataIcon, test: TestIcon,
}

export const TOOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  Read: ReadIcon, Edit: EditIcon, Write: WriteIcon, Bash: BashIcon,
  Grep: GrepIcon, Glob: GlobIcon, Agent: AgentIcon,
  WebSearch: WebIcon, WebFetch: WebIcon,
}

export const ToolDefaultIcon = WrenchIcon  // default 도구 + sessionExport tool-glyph 공용
export { Rank1Icon }

export const SYSTEM_ICONS = {
  brandMark: BrandMarkIcon,
  emptySessions: EmptySessionsIcon,
  warning: WarningIcon,
  toolGlyph: WrenchIcon,  // tool-glyph는 Wrench 재사용
}
```

키는 다음 출처와 **1:1 일치**해야 합니다 (TypeScript Record 타입으로 보장):

- `TypeCode` 8개 (`src/lib/personality.ts`)
- `getCodingTimeLabel().label` 6개 (`src/lib/personality.ts:264-269`)
- `CategoryData[*].id` 9개 (`src/lib/usageProfile.ts:CATEGORY_DATA`)
- `TOOL_ICONS` 키 9개 + default (`src/components/wrapped/slides/ToolsSlide.tsx:9-10`)

### 6.4 시각 결정 노트 — `docs/ICONS-DESIGN-NOTES.md`

다음 내용 포함 (1~2페이지):

- 5개 카테고리별로 어떤 시각 룰을 잡았는지 (외곽 도형, 모티프, 변조 방식)
- 37개 아이콘 각각이 어떤 도식 결정을 했는지 한 줄씩
- 그룹 D `Wrench`와 그룹 E `tool-glyph` 가 동일 SVG로 통일됐음을 명시
- §3.3의 제안 룰을 변경했다면 그 이유

### 6.5 lucide 판정표 — `docs/LUCIDE-VERDICTS.md`

§5의 "검토" 표시 항목별로 표 형태로 제출:

| 파일 | 아이콘 | 결정 (a 유지 / b 치환 / c 교체) | 근거 (1줄) | 치환/교체 시 대상 |
| --- | --- | --- | --- | --- |

### 6.6 검수용 단일 HTML — `docs/icon-preview.html`

- 37개 아이콘을 5개 카테고리 그리드로 배치
- 각 아이콘을 16/24/32/48px 4단으로 나열
- 다크 배경(`#0a0a14`) + 라이트 배경(`#ffffff`) 양쪽 표시
- self-contained (CDN OK, 외부 빌드 불필요)

---

## 7. 검수 기준 (PR 머지 전 13항목 체크)

- [ ] 37개 모두 24×24 viewBox, stroke 1.75, currentColor 통일
- [ ] 라이트/다크 양쪽 시인성 양호
- [ ] 16/24/32/48px 모두 의미 식별 가능 (16에서 형체 뭉개지지 않음)
- [ ] 카테고리별 시각 룰 일관 — Personality 8 / Time 6 / Role 9 / Tools 10 / System 4 각각 한 시리즈로 인식
- [ ] 5개 카테고리 사이의 시각 톤도 한 시스템으로 통일
- [ ] 37개 중 어느 것도 §2.2 금지 인상 없음
- [ ] lucide-react 의존성에 §5 "유지" 항목만 남음
- [ ] `getCodingTimeLabel().label` ↔ `TIME_ICONS` 키 1:1 일치
- [ ] `usageProfile.ts:CATEGORY_DATA[*].id` ↔ `ROLE_ICONS` 키 1:1 일치
- [ ] `TypeCode` 8개 ↔ `PERSONALITY_ICONS` 키 1:1 일치 (Record 타입)
- [ ] `ToolsSlide.tsx`의 `TOOL_ICONS` 키 9개 + default ↔ `TOOL_ICONS` + `ToolDefaultIcon` 1:1 일치
- [ ] 그룹 E `tool-glyph` ↔ 그룹 D `default Wrench` 동일 SVG 재사용
- [ ] Agent 아이콘에 인간 형상/뇌/마법봉 메타포 없음
- [ ] Rank1 아이콘이 왕관(👑)이 아닌 추상화된 트로피/메달/원형 표식

---

## 8. 비목표 (이번 의뢰 범위 아님)

- 로고/워드마크 새로 그리기 (단, `✦` 브랜드 마크는 그룹 E에 포함)
- 애플리케이션 전체 리브랜딩
- 컬러 시스템 개편 (별도 작업 — 묶음 3에서 진행 예정)
- 폰트 시스템 변경 (별도 작업 — 묶음 1B에서 진행 예정)
- 모션/애니메이션 시스템 (별도 작업 — 묶음 4B)

---

## 9. 작업 흐름

1. 본 문서를 끝까지 읽고 §10의 첨부 파일을 모두 읽으세요.
2. §3.3의 카테고리별 시각 룰을 확정 (제안을 그대로 쓰거나 더 좋은 룰로 교체).
3. 37개 SVG 컴포넌트 그리기 — 카테고리별로 시리즈 일관성 확보.
4. 인덱스(`src/icons/index.ts`) + 타입 매핑 작성.
5. 검수용 HTML 작성하여 다크/라이트 양쪽에서 16~48px 시인성 직접 확인.
6. §7 검수 기준 13항목 자체 점검.
7. §6의 5종 산출물 모두 제출. 부족 항목 있으면 보완 후 제출.

---

## 10. 첨부 파일 (Codex가 읽어야 할 컨텍스트)

### 10.1 데이터 출처 (필수 · 4개)

```text
src/lib/personality.ts                          # 그룹 A 8개 + 그룹 B 6개 정의
src/lib/usageProfile.ts                         # 그룹 C 9개 정의
src/components/wrapped/slides/ToolsSlide.tsx    # 그룹 D 10개 키 정의
src/lib/sessionExport.ts                        # 그룹 E ⚠️ 🔧 사용처
```

### 10.2 그룹 E 추가 사용처 (필수 · 4개)

```text
src/App.tsx                                     # ✦ 브랜드 마크 사용처
src/components/MemradarTopBar.tsx               # ✦
src/components/search/SearchView.tsx            # ✦
src/components/wrapped/WrappedView.tsx          # 📭 빈 상태
```

### 10.3 lucide 검토 대상 컴포넌트 (필수 · 15개)

```text
src/components/Dashboard.tsx
src/components/PersonalityView.tsx
src/components/SessionView.tsx
src/components/DropZone.tsx
src/components/MemradarTopBar.tsx
src/components/ThemeSwitcher.tsx
src/components/replay/ReplayView.tsx
src/components/updates/ProductUpdates.tsx
src/components/wrapped/slides/ShareSlide.tsx
src/components/wrapped/WrappedView.tsx
src/components/search/SearchBar.tsx
src/components/search/SearchResults.tsx
src/components/tools/Truncate.tsx
src/components/tools/ToolCallView.tsx
src/theme/themePresets.ts
```

### 10.4 컨텍스트 강화 (선택 · 3개)

```text
docs/ICON-REDESIGN-CODEX-BRIEF.md   # 본 의뢰의 상세 분석 문서 (배경 + 통합 방법)
docs/FEEDBACK-2026-05-10.md         # 피드백 원문 + 결정 기록
CLAUDE.md                           # 프로젝트 작업 원칙
```

---

**이 의뢰의 모든 결정은 §2.1 Quality-first 원칙에 따라 평가됩니다. "더 빠른 길"이 보여도 정석을 우회하지 마세요.**
