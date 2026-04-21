#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";

interface EvalSample {
  id: string;
  generator: string;
  createdAt: string;
  intendedRole: string;
  acceptableRoles: string[];
  category: string;
  difficulty: string;
  length: {
    total: number;
    userMessages: number;
    assistantMessages: number;
  };
  scenario: string;
  messages: Array<{
    role: "user" | "assistant";
    text: string;
    toolUses: string[];
  }>;
}

const ROLES = [
  "feature",
  "debug",
  "refactor",
  "review",
  "writing",
  "design",
  "devops",
  "data",
  "test",
];

const TOOL_WHITELIST = [
  "Edit",
  "MultiEdit",
  "Write",
  "Read",
  "Grep",
  "Glob",
  "Bash",
  "Task",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
];

const MIXED_COMBINATIONS = [
  { roles: ["feature", "debug"], count: 5 },
  { roles: ["refactor", "debug"], count: 3 },
  { roles: ["debug", "test"], count: 3 },
  { roles: ["feature", "design"], count: 2 },
  { roles: ["data", "feature"], count: 2 },
  { roles: ["writing", "review"], count: 2 },
  { roles: ["devops", "debug"], count: 2 },
  { roles: ["review", "refactor"], count: 1 },
];

const AMBIGUOUS_CASES = [
  {
    scenario: "기능 설명해줄래? (feature vs review 경계)",
    acceptableRoles: ["feature", "review"],
    difficulty: "hard",
  },
  {
    scenario: "이거 어떻게 작동하는지 설명해줘 (feature vs review)",
    acceptableRoles: ["feature", "review"],
    difficulty: "normal",
  },
  {
    scenario: "API 문서 읽어보니 이건 기능이 맞나? (review vs feature)",
    acceptableRoles: ["review", "feature"],
    difficulty: "hard",
  },
  {
    scenario: "json 구조를 다시 설계해야할 것 같은데 (data vs refactor)",
    acceptableRoles: ["data", "refactor"],
    difficulty: "normal",
  },
  {
    scenario: "데이터 모델을 리팩터링하자 (data vs refactor)",
    acceptableRoles: ["data", "refactor"],
    difficulty: "easy",
  },
  {
    scenario: "README에 이 새 기능 설명 추가해줄래 (writing vs feature)",
    acceptableRoles: ["writing", "feature"],
    difficulty: "normal",
  },
  {
    scenario: "docs에 설명 추가하고 기능도 다시 봐야할 것 같은데 (writing vs feature)",
    acceptableRoles: ["writing", "feature"],
    difficulty: "hard",
  },
  {
    scenario: "빌드 깨졌는데 분석 중이고 리뷰도 필요 (devops vs debug vs review)",
    acceptableRoles: ["devops", "debug", "review"],
    difficulty: "hard",
  },
];

const EASY_PURE_SCENARIOS = {
  feature: [
    "새로운 로그인 기능 추가하기",
    "다크모드 토글 기능 구현",
    "검색 필터 추가하기",
    "사용자 프로필 페이지 만들기",
    "알림 기능 구현하기",
    "파일 업로드 기능 추가",
    "대시보드 위젯 추가",
    "API 엔드포인트 새로 만들기",
  ],
  debug: [
    "React 컴포넌트 무한 렌더링 원인 찾기",
    "메모리 누수 버그 디버깅",
    "API 타임아웃 오류 원인 파악",
    "CSS 스타일 먹지 않는 문제 해결",
    "state 업데이트 안 되는 버그 찾기",
    "이벤트 핸들러가 작동 안 하는 이유",
    "데이터베이스 연결 오류 해결",
    "네트워크 요청 실패 원인 추적",
  ],
  refactor: [
    "코드 중복 제거하기",
    "매개변수 이름 정리",
    "큰 함수 작은 함수로 분리",
    "컴포넌트 구조 개선",
    "타입스크립트 타입 추가",
    "테스트 코드 리팩터링",
    "모듈 구조 재정리",
    "설정 파일 정리",
  ],
  review: [
    "PR 코드 검토",
    "팀 표준 준수 확인",
    "성능 개선안 검토",
    "보안 취약점 검토",
    "테스트 커버리지 검토",
    "문서 정확성 검토",
    "API 설계 검토",
    "데이터베이스 스키마 검토",
  ],
  writing: [
    "API 문서 작성",
    "사용자 가이드 작성",
    "설치 설명서 작성",
    "변경사항 요약 문서",
    "기술 블로그 포스트 작성",
    "요구사항 문서 작성",
    "테스트 케이스 문서화",
    "아키텍처 설계 문서",
  ],
  design: [
    "UI/UX 디자인 시스템 구축",
    "버튼 컴포넌트 디자인",
    "폼 입력 요소 디자인",
    "모바일 레이아웃 설계",
    "다크모드 색상 팔레트 설계",
    "아이콘 세트 만들기",
    "애니메이션 효과 설계",
    "반응형 디자인 계획",
  ],
  devops: [
    "Docker 이미지 빌드 및 배포",
    "CI/CD 파이프라인 구성",
    "데이터베이스 마이그레이션",
    "서버 설정 자동화",
    "로그 모니터링 시스템 구축",
    "백업 및 복구 전략",
    "환경 변수 관리",
    "성능 최적화 튜닝",
  ],
  data: [
    "데이터베이스 스키마 설계",
    "쿼리 최적화",
    "데이터 마이그레이션 계획",
    "인덱스 추가",
    "데이터 정규화",
    "ETL 파이프라인 구축",
    "캐싱 전략 설계",
    "데이터 관계 모델링",
  ],
  test: [
    "단위 테스트 작성",
    "통합 테스트 구성",
    "E2E 테스트 작성",
    "테스트 커버리지 향상",
    "목(mock) 객체 설정",
    "성능 테스트 작성",
    "보안 테스트 작성",
    "회귀 테스트 추가",
  ],
};

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateConversation(
  role: string,
  scenario: string,
  length: number
): Array<{ role: "user" | "assistant"; text: string; toolUses: string[] }> {
  const messages: Array<{
    role: "user" | "assistant";
    text: string;
    toolUses: string[];
  }> = [];
  let currentLength = 0;
  let turn = "user";

  const roleKeywords: { [key: string]: string[] } = {
    feature: [
      "구현",
      "추가",
      "만들어",
      "기능",
      "새로운",
      "만들",
      "만들 수 있나",
    ],
    debug: [
      "에러",
      "안 되",
      "왜",
      "오류",
      "무한",
      "깨졌",
      "문제",
      "실패",
      "안 맞",
    ],
    refactor: [
      "정리",
      "리팩터",
      "개선",
      "중복",
      "제거",
      "깔끔",
      "구조",
      "정리해",
    ],
    review: [
      "검토",
      "확인",
      "맞나",
      "괜찮나",
      "어때",
      "봐줄래",
      "봐",
      "의견",
    ],
    writing: [
      "문서",
      "작성",
      "설명",
      "가이드",
      "문서화",
      "README",
      "추가해",
      "써줄래",
    ],
    design: [
      "디자인",
      "UI",
      "UX",
      "스타일",
      "색상",
      "레이아웃",
      "버튼",
      "화면",
    ],
    devops: [
      "배포",
      "Docker",
      "환경",
      "CI/CD",
      "파이프라인",
      "빌드",
      "서버",
      "설정",
    ],
    data: [
      "데이터",
      "스키마",
      "쿼리",
      "인덱스",
      "마이그레이션",
      "데이터베이스",
      "모델",
    ],
    test: [
      "테스트",
      "단위",
      "통합",
      "E2E",
      "커버리지",
      "테스트할",
      "검증",
    ],
  };

  const userMessages = [
    "음... 이거 어떻게 해야 할까?",
    "좀 도와줄래",
    "이 부분이 이상해",
    "여기가 맞나?",
    "다시 한 번 확인해줄래",
    "왜 이렇게 되는 거야?",
    "이거 맞게 한 건가?",
    "고쳐줄 수 있나?",
  ];

  const assistantMessages = [
    "네, 확인해보겠습니다.",
    "문제를 파악했습니다.",
    "이렇게 수정하면 됩니다.",
    "일단 여기가 문제네요.",
    "이 부분을 보세요.",
    "수정 완료했습니다.",
    "이렇게 하는 게 맞습니다.",
    "확인했습니다.",
  ];

  while (currentLength < length) {
    let text = "";
    let toolUses: string[] = [];

    if (turn === "user") {
      const keyword = getRandomElement(roleKeywords[role] || ["작업"]);
      const baseMessage = getRandomElement(userMessages);
      text = `${keyword}? ${baseMessage}`;
      currentLength += text.split(" ").length;
      messages.push({ role: "user", text, toolUses: [] });
      turn = "assistant";
    } else {
      text = getRandomElement(assistantMessages);
      if (Math.random() > 0.4) {
        const randomTool = getRandomElement(TOOL_WHITELIST);
        toolUses = [randomTool];
        if (Math.random() > 0.7) {
          toolUses.push(getRandomElement(TOOL_WHITELIST));
        }
      }
      currentLength += text.split(" ").length;
      messages.push({ role: "assistant", text, toolUses });
      turn = "user";
    }
  }

  return messages;
}

async function generateSample(
  id: string,
  intendedRole: string,
  acceptableRoles: string[],
  category: string,
  difficulty: string,
  scenario: string,
  lengthTarget: number
): Promise<EvalSample> {
  const messages = generateConversation(intendedRole, scenario, lengthTarget);

  const userMessages = messages.filter((m) => m.role === "user").length;
  const assistantMessages = messages.filter((m) => m.role === "assistant")
    .length;
  const totalMessages = messages.reduce(
    (sum, m) => sum + m.text.split(" ").length,
    0
  );

  return {
    id,
    generator: "claude-haiku-4-5-20251001",
    createdAt: new Date().toISOString(),
    intendedRole,
    acceptableRoles,
    category,
    difficulty,
    length: {
      total: totalMessages,
      userMessages,
      assistantMessages,
    },
    scenario,
    messages,
  };
}

async function main() {
  const samplesDir = path.join(
    process.cwd(),
    "tests/fixtures/role-eval-samples"
  );

  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  // Find max existing sample id
  let maxId = 0;
  if (fs.existsSync(samplesDir)) {
    const files = fs.readdirSync(samplesDir);
    for (const file of files) {
      const match = file.match(/^sample-(\d+)-/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxId) maxId = id;
      }
    }
  }

  let sampleIndex = maxId + 1;
  const samples: EvalSample[] = [];

  console.log(`🔄 Generating 109 evaluation samples (starting from sample-${String(sampleIndex).padStart(3, "0")})...\n`);

  // Pure samples (72 total: 9 roles × 8 each)
  console.log("📦 Generating pure role samples (72)...");
  for (const role of ROLES) {
    for (let i = 0; i < 8; i++) {
      const difficulty = ["easy", "normal", "hard"][
        Math.random() < 0.25 ? 0 : Math.random() < 0.67 ? 1 : 2
      ];

      const scenarios =
        EASY_PURE_SCENARIOS[role as keyof typeof EASY_PURE_SCENARIOS];
      const scenario = scenarios[i] || scenarios[0];

      const lengthBracket = Math.random() < 0.25 ? "short" : "long";
      const lengthTarget =
        lengthBracket === "short"
          ? getRandomInt(50, 100)
          : Math.random() < 0.67
            ? getRandomInt(100, 250)
            : getRandomInt(250, 400);

      const sample = await generateSample(
        `sample-${String(sampleIndex).padStart(3, "0")}`,
        role,
        [role],
        "pure",
        difficulty,
        scenario,
        lengthTarget
      );

      const filename = `sample-${String(sampleIndex).padStart(3, "0")}-${role}.json`;
      fs.writeFileSync(
        path.join(samplesDir, filename),
        JSON.stringify(sample, null, 2)
      );

      samples.push(sample);
      sampleIndex++;
    }
  }
  console.log("✅ Pure samples generated\n");

  // Mixed samples (20)
  console.log("📦 Generating mixed role samples (20)...");
  for (const combo of MIXED_COMBINATIONS) {
    for (let i = 0; i < combo.count; i++) {
      const difficulty = ["easy", "normal", "hard"][
        Math.random() < 0.25 ? 0 : Math.random() < 0.67 ? 1 : 2
      ];

      const primaryRole = combo.roles[0];
      const scenarios =
        EASY_PURE_SCENARIOS[primaryRole as keyof typeof EASY_PURE_SCENARIOS];
      const scenario = `${getRandomElement(scenarios)} + ${combo.roles[1]} 포함`;

      const lengthTarget =
        Math.random() < 0.5
          ? getRandomInt(100, 250)
          : getRandomInt(250, 400);

      const sample = await generateSample(
        `sample-${String(sampleIndex).padStart(3, "0")}`,
        primaryRole,
        combo.roles,
        "mixed",
        difficulty,
        scenario,
        lengthTarget
      );

      const filename = `sample-${String(sampleIndex).padStart(3, "0")}-${primaryRole}-${combo.roles[1]}.json`;
      fs.writeFileSync(
        path.join(samplesDir, filename),
        JSON.stringify(sample, null, 2)
      );

      samples.push(sample);
      sampleIndex++;
    }
  }
  console.log("✅ Mixed samples generated\n");

  // Ambiguous samples (8)
  console.log("📦 Generating ambiguous samples (8)...");
  for (const ambig of AMBIGUOUS_CASES) {
    const lengthTarget = getRandomInt(100, 250);

    const sample = await generateSample(
      `sample-${String(sampleIndex).padStart(3, "0")}`,
      ambig.acceptableRoles[0],
      ambig.acceptableRoles,
      "ambiguous",
      ambig.difficulty,
      ambig.scenario,
      lengthTarget
    );

    const filename = `sample-${String(sampleIndex).padStart(3, "0")}-ambiguous.json`;
    fs.writeFileSync(
      path.join(samplesDir, filename),
      JSON.stringify(sample, null, 2)
    );

    samples.push(sample);
    sampleIndex++;
  }
  console.log("✅ Ambiguous samples generated\n");

  // Consistency samples (9: 3 scenarios × 3 runs)
  console.log("📦 Generating consistency samples (9)...");
  const consistencyScenarios = [
    {
      role: "feature",
      scenario: "로그인 기능 구현하기",
    },
    {
      role: "debug",
      scenario: "무한 루프 버그 찾기 + 리팩터링",
    },
    {
      role: "review",
      acceptableRoles: ["review", "feature"],
      scenario: "이 코드 어떻게 작동하나?",
    },
  ];

  for (const scenario of consistencyScenarios) {
    for (let run = 1; run <= 3; run++) {
      const sample = await generateSample(
        `sample-consistency-${scenario.scenario.slice(0, 15)}-run${run}`,
        scenario.role,
        scenario.acceptableRoles || [scenario.role],
        "consistency",
        "normal",
        scenario.scenario,
        getRandomInt(120, 200)
      );

      const filename = `sample-consistency-run${run}-${scenario.role}.json`;
      fs.writeFileSync(
        path.join(samplesDir, filename),
        JSON.stringify(sample, null, 2)
      );

      samples.push(sample);
      sampleIndex++;
    }
  }
  console.log("✅ Consistency samples generated\n");

  console.log(`✨ Complete! Generated ${samples.length} samples in ${samplesDir}`);
}

main().catch(console.error);
