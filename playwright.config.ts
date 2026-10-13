import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3456);
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5433/jaa_e2e";

export default defineConfig({
  testDir: "test/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["./test/e2e/results-reporter.ts"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Use a locally installed Chromium when the bundled one isn't available.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: DB,
      E2E_HOOKS: "1",
      APP_URL: `http://localhost:${PORT}`,
      CRON_SECRET: "e2e-cron-secret-1234567890",
      GEMINI_API_KEY: "",
    },
  },
});
