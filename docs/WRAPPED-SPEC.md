# Promptale Wrapped — 상세 기획

> Spotify Wrapped 스타일의 AI 코딩 연말결산

## 컨셉

사용자의 AI 코딩 대화 데이터를 분석해서 10개의 풀스크린 슬라이드로 보여주는 인터랙티브 경험.
마지막에 공유 가능한 카드 이미지를 생성해서 SNS에 올릴 수 있음.

---

## 슬라이드 구성

### Slide 1: "Your story begins..."
- 첫 번째 세션 날짜
- 총 세션 수
- 배경: 은은한 파티클 애니메이션
- 분위기: 따뜻하고 회고적

### Slide 2: "You wrote N prompts"
- 총 프롬프트(유저 메시지) 수
- 숫자가 카운트업 애니메이션으로 올라감
- 비유: "그건 소설 N권 분량이에요" (1 프롬프트 ≈ 50자 가정)
- 배경: 타이핑 효과

### Slide 3: "Your favorite model"
- 가장 많이 사용한 모델
- 성격 설명:
  - claude-opus → "당신은 깊이를 추구하는 사색가"
  - claude-sonnet → "당신은 효율과 균형의 달인"
  - claude-haiku → "당신은 속도를 사랑하는 스프린터"
- 모델 사용 비율 도넛 차트

### Slide 4: "Your coding hours"
- 24시간 원형 차트 (시계 모양)
- 피크 시간대 강조
- 레이블:
  - 새벽 2-5시 피크 → "Night Owl 🦉"
  - 아침 6-9시 피크 → "Early Bird 🐦"
  - 오후 14-17시 피크 → "Afternoon Warrior ⚔️"
  - 밤 20-1시 피크 → "Moonlight Coder 🌙"

### Slide 5: "Your busiest day"
- 달력에서 가장 바빴던 날 하이라이트
- 그 날의 메시지 수, 세션 수
- "그 날 무슨 일이 있었을까요?"

### Slide 6: "Your top tools"
- 도구 사용 랭킹 (1~5위)
- 애니메이션으로 순위 공개 (5위부터 1위까지)
- 각 도구에 아이콘 + 사용 횟수
- 1위 도구에 왕관 효과

### Slide 7: "Your vocabulary"
- 원형으로 확장되는 워드 클라우드
- 중앙에서 바깥으로 단어가 날아감
- 가장 큰 단어 = 가장 많이 쓴 단어

### Slide 8: "Marathon coder"
- 가장 긴 세션 정보
- 시작 시간 → 종료 시간
- 메시지 수
- "N시간 동안 멈추지 않았어요"
- 배경: 마라톤 러너 실루엣

### Slide 9: "Your coding personality"
- 패턴 기반 성격 유형 (4가지 중 1개):

  **The Architect** (설계자)
  - Read/Grep 사용 비율이 높음
  - 세션당 메시지 수가 많음 (신중하게 접근)
  - "코드를 읽고 이해한 후에 움직이는 타입"

  **The Speed Runner** (스피드 러너)
  - 짧은 세션, 많은 세션 수
  - Bash/Write 사용 비율 높음
  - "빠르게 시도하고, 빠르게 반복하는 타입"

  **The Explorer** (탐험가)
  - 다양한 도구 사용
  - 여러 프로젝트(cwd)에서 활동
  - "새로운 것을 시도하고 배우는 것을 즐기는 타입"

  **The Night Sage** (밤의 현자)
  - 야간 코딩 비율 높음
  - 긴 세션 선호
  - 토큰 사용량 높음
  - "고요한 밤에 깊이 있는 작업을 하는 타입"

### Slide 10: "Share your Promptale"
- 전체 요약 카드 (1장 이미지로 생성)
- 포함 정보: 성격 유형, 총 세션, 즐겨 쓴 모델, 코딩 시간대
- 버튼: "이미지 저장", "트위터에 공유", "링크 복사"
- 이미지 사이즈: 1080x1920 (인스타 스토리) + 1200x630 (트위터/OG)

---

## 성격 유형 판별 알고리즘

```
점수 계산:
  architect_score = (read_ratio * 0.4) + (grep_ratio * 0.3) + (avg_messages_per_session / max_avg * 0.3)
  speedrunner_score = (session_count / max_sessions * 0.4) + (bash_ratio * 0.3) + (1 - avg_duration / max_duration) * 0.3
  explorer_score = (unique_tools / max_tools * 0.4) + (unique_projects / max_projects * 0.3) + (model_variety * 0.3)
  nightsage_score = (night_ratio * 0.4) + (avg_duration / max_duration * 0.3) + (total_tokens / max_tokens * 0.3)

성격 = max(architect, speedrunner, explorer, nightsage)
```

## UX 흐름

1. 대시보드에서 "✦ Wrapped 보기" 버튼 클릭
2. 로딩 애니메이션 (데이터 분석 중...)
3. 슬라이드 1부터 순서대로 표시
4. 각 슬라이드: 엔터 애니메이션 → 대기 → 클릭/스와이프로 다음
5. 마지막 슬라이드에서 공유 옵션 제공
6. 하단에 "다시 보기" / "대시보드로" 버튼

## 기술 요구사항

- **Framer Motion**: 슬라이드 전환, 카운트업, 파티클
- **html-to-image**: 공유 카드 PNG 생성
- **CSS**: 그라디언트 배경, 글래스모피즘 효과
- **반응형**: 모바일 (세로) + 데스크톱 (가로) 대응
