// 브라우저 테스트. 테스트 서버는 개발용 파일 저장소(.e2e-data)만 쓴다: 운영 DB에 절대 붙지 않게 DATABASE_URL을 비운다.
// 장소 검색(외부 API)은 테스트마다 정해 둔 응답으로 바꿔 끼운다 (e2e/fixtures.ts).
// 로컬: npm run e2e (먼저 npm run build) · 실제 검색으로 일본 시간표 87줄: npm run e2e:japan
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 3300);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `rm -rf .e2e-data && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DATABASE_URL: '', SDT_DATA_DIR: '.e2e-data', SDT_NO_LIMIT: '1', NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}` },
  },
});
