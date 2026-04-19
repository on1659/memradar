# Achievement / Badge System

> **상태: 미구현 (Phase 2 계획 문서)** — _최종 확인 2026-04-19, memradar v0.2.12_
>
> 현재 Memradar 에는 업적·뱃지 시스템이 **전혀 구현돼 있지 않다**.
> `src/lib/achievements.ts`, 관련 UI 컴포넌트, IndexedDB 퍼시스턴스 모두 존재하지 않는다.
> 이 문서는 구현 시 따를 **기획·데이터 구조·UI 규칙 스펙**이며, 어떤 부분도 현재 동작 중인 기능을 설명하지 않는다.
> 전체 로드맵은 [ROADMAP.md §2.5](./ROADMAP.md) 참고.

## 현재 코드베이스 상태 (참고)

구현 시 언락 신호 소스로 활용할 수 있는 **이미 존재하는** 데이터 구조 (v0.2.12 기준):

- `Session` (`src/types.ts`) — `messages`, `startTime`, `endTime`, `totalTokens`, `messageCount`, `model`, `source`
- `Stats` (`src/types.ts`) — `totalSessions`, `totalMessages`, `totalTokens`, `modelsUsed`, `toolsUsed`, `hourlyActivity`, `dailyActivity`, `dailyTokens`, `longestSession`, `topSkills`

세션 지속 시간은 `endTime - startTime` 으로 파생해야 한다 (세션 객체에 duration 필드 없음).
연속일(streak)은 `dailyActivity` 키를 정렬해 파생해야 한다.

---

## 업적 목록 (계획 스펙, 미구현)

### Tier 1: 입문 (쉬움)

| 뱃지 | 이름 | 조건 | 아이콘 |
|------|------|------|--------|
| 🎯 | First Steps | 첫 번째 세션 완료 | 발자국 |
| 💬 | Conversation Starter | 10개 세션 달성 | 말풍선 |
| ⌨️ | Keyboard Warrior | 100개 프롬프트 작성 | 키보드 |
| 🔧 | Tool User | 5가지 이상 도구 사용 | 렌치 |

### Tier 2: 중급

| 뱃지 | 이름 | 조건 | 아이콘 |
|------|------|------|--------|
| 🦉 | Night Owl | 자정~새벽 5시 사이에 5일 이상 코딩 | 올빼미 |
| 🐦 | Early Bird | 오전 6시 이전에 5일 이상 코딩 | 새 |
| 🏃 | Marathon Runner | 단일 세션 2시간 이상 | 러너 |
| 🔥 | On Fire | 7일 연속 AI 코딩 | 불꽃 |
| 📚 | Bookworm | Read 도구 500회 이상 사용 | 책 |
| ✏️ | Prolific Writer | Write/Edit 도구 300회 이상 사용 | 펜 |

### Tier 3: 고급

| 뱃지 | 이름 | 조건 | 아이콘 |
|------|------|------|--------|
| 🐋 | Token Whale | 총 1,000,000+ 토큰 사용 | 고래 |
| 🌍 | Polyglot | 3개 이상 다른 AI 모델 사용 | 지구본 |
| 🏗️ | The Architect | 50개 이상 세션에서 Read > Write 비율 | 건물 |
| ⚡ | Speed Demon | 5분 이내 세션 20개 이상 | 번개 |
| 🎯 | Sharpshooter | 메시지 3개 이하 세션에서 문제 해결 50회 | 타겟 |

### Tier 4: 전설

| 뱃지 | 이름 | 조건 | 아이콘 |
|------|------|------|--------|
| 👑 | Centurion | 100개 세션 달성 | 왕관 |
| 🏔️ | Summit | 30일 연속 AI 코딩 | 산 |
| 🌊 | Token Ocean | 총 10,000,000+ 토큰 사용 | 파도 |
| 🎭 | All-Rounder | 모든 Tier 2 뱃지 획득 | 마스크 |

합계: **4티어 × 총 19개 뱃지** (Tier 1: 4, Tier 2: 6, Tier 3: 5, Tier 4: 4).

---

## 뱃지 UI 디자인 (계획안)

### 잠김 상태
- 흑백 아이콘
- "???" 이름
- 진행률 바 (예: "3/5일 완료")

### 잠금해제 상태
- 컬러 아이콘 + 글로우 효과
- 획득 날짜 표시
- 호버 시 조건 상세 설명

### 신규 획득 알림
- 세션 로딩 후 새로 획득한 뱃지가 있으면 팝업
- 축하 파티클 효과
- "공유하기" 버튼

---

## 데이터 구조 (계획안)

```typescript
// 구현 시 src/lib/achievements.ts 에 배치 예정
import type { Session, Stats } from '../types'

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  tier: 1 | 2 | 3 | 4
  check: (sessions: Session[], stats: Stats) => {
    unlocked: boolean
    progress: number  // 0-1
    detail?: string   // "3/5일"
  }
}

export interface AchievementRecord {
  id: string
  unlockedAt: string // ISO timestamp, 최초 달성 시점
  progress: number
  detail?: string
}
```

## 진행률 추적 (계획안)

- 뱃지별 진행 상황은 **IndexedDB** 에 저장 (현재 IndexedDB 사용처 없음 — 구현 시 신규 스토어 추가 필요).
- 새 세션 로딩 시 전체 업적을 다시 체크하고, 새로 달성한 업적이 있으면 알림 표시.
- 제안 스토어 이름: `memradar-achievements`, 키: `id`, 값: `AchievementRecord`.
