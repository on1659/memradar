export interface ProductUpdate {
  id: string
  version: string
  date: string
  title: string
  summary: string
  highlights: string[]
  category: 'dashboard' | 'theme' | 'insight' | 'workflow'
}

export const productUpdates: ProductUpdate[] = [
  {
    id: '2026-04-18-personality-redesign',
    version: 'v0.2.12',
    date: '2026-04-18',
    title: '코딩 성격 유형 시스템 재설계',
    summary: 'AI 도구 사용량이 아닌 사용자의 실제 행동 패턴(메시지 스타일, 프로젝트 집중도, 세션 리듬)으로 성격 유형을 판별해요.',
    highlights: ['설계자/탐험가, 한우물/유목민, 마라토너/스프린터 3축', 'AI 직업 카테고리 통합 및 "내 AI의 직업" 리브랜딩', '세션 종류(Quick/Standard/Deep) 기반 리듬 분석'],
    category: 'insight',
  },
  {
    id: '2026-04-17-server-mode',
    version: 'v0.2.2',
    date: '2026-04-17',
    title: '로컬 서버 모드 전환',
    summary: 'npx memradar가 이제 로컬 서버를 띄워 앱을 즉시 로드해요. 18 MB HTML 대신 0.6 MB 앱이 바로 열리고, 세션은 백그라운드로 스트리밍돼요.',
    highlights: ['localhost:3939 서버 자동 기동', '세션 10개씩 점진 로딩', '기존 HTML 모드는 --static 플래그로 유지'],
    category: 'workflow',
  },
  {
    id: '2026-04-17-codex-support',
    version: 'v0.2.0',
    date: '2026-04-17',
    title: 'Codex 세션 지원',
    summary: 'Claude 세션과 함께 Codex 세션 로그도 자동으로 스캔하고 분석해요. 토큰 가격 계산과 테마 정책도 추가됐어요.',
    highlights: ['~/.codex/sessions/ 자동 스캔', '토큰 비용 계산 라이브러리', '테마 정책 모듈 추가'],
    category: 'insight',
  },
  {
    id: '2026-04-15-dashboard-polish',
    version: 'v0.1.4',
    date: '2026-04-15',
    title: '대시보드 폴리시',
    summary: '히트맵 비율, 카드 정렬, 툴팁 레이어를 다듬어 메인 화면이 더 안정적으로 보이게 정리했어요.',
    highlights: ['활동 히트맵 레이아웃 재정렬', '툴팁과 팝오버 레이어 정리', '세션 지표 카드 정렬 보정'],
    category: 'dashboard',
  },
  {
    id: '2026-04-15-theme-refresh',
    version: 'v0.1.3',
    date: '2026-04-15',
    title: '테마 선택 개선',
    summary: '시스템 다크/라이트 기본값을 따르도록 정리하고, 모드와 포인트 색을 다시 고르기 쉽게 바꿨어요.',
    highlights: ['시스템 테마 기본 연동', '포인트 색 선택 흐름 정리', '뒤로 가기 가능한 테마 패널'],
    category: 'theme',
  },
  {
    id: '2026-04-14-insight-updates',
    version: 'v0.1.2',
    date: '2026-04-14',
    title: '인사이트 상호작용 강화',
    summary: '시간대 그래프, 워드클라우드, 모델 그래프에서 hover 정보가 더 자연스럽게 보이도록 손봤어요.',
    highlights: ['시간대 툴팁 개선', '워드클라우드 hover 정보 추가', '모델 도넛 차트 오버레이 정리'],
    category: 'insight',
  },
  {
    id: '2026-04-13-workflow-release',
    version: 'v0.1.1',
    date: '2026-04-13',
    title: '탐색 플로우 확장',
    summary: '세션 검색, Code Report, 로컬 로그 자동 불러오기까지 연결해 첫 사용 흐름을 매끄럽게 만들었어요.',
    highlights: ['세션 검색 뷰 추가', 'Code Report 경험 확장', '로컬 로그 자동 로드'],
    category: 'workflow',
  },
]

export const latestProductUpdate = productUpdates[0]
