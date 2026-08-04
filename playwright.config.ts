import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // e2e 는 *.spec.ts 만. tests/ 에는 node:assert 기반 단위 테스트(*.test.mts)가 함께 있는데,
  // Playwright 의 기본 testMatch(**/*.@(spec|test).?(c|m)[jt]s?(x))가 그것들까지 수집해
  // 수집 단계에서 실행해 버린다 — 그 파일들은 마지막에 process.exit() 를 호출하므로
  // 수집 프로세스가 조기 종료되고, 실제로 `playwright test --list` 는 0건을 반환했다.
  testMatch: '**/*.spec.ts',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 로컬도 1회 재시도: fullyParallel 로 다수 chromium 동시 기동 시 발생하는
  // GPU/teardown 경합 플래키(assertion 아님)를 흡수. CI 는 2회 유지.
  retries: process.env.CI ? 2 : 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'test-results/playwright-report' }],
  ],
  outputDir: 'test-results/playwright-artifacts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
