import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The browser tests exercise the real API, so they run against the FastAPI
// backend serving the exported frontend. Point PLAYWRIGHT_BASE_URL at a running
// stack (for example the Docker container on http://localhost:8000) to reuse it.
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const localBaseUrl = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run e2e:server",
        url: `${localBaseUrl}/api/health`,
        reuseExistingServer: true,
        timeout: 180_000,
        env: {
          STATIC_DIR: path.resolve(__dirname, "out"),
          DATA_DIR: path.resolve(__dirname, ".playwright-data"),
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
