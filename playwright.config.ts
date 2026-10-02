import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 拡張機能はテストごとにブラウザを起動するため、同時起動数を抑える。
  workers: process.env.CI ? 1 : 2,
  reporter: "html",
  use: {
    // リトライしないローカル実行でも失敗した操作を追跡できるようにする。
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
