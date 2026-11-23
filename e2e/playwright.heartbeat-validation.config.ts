import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./heartbeat-validation",
  outputDir: "./test-results/heartbeat-validation",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 15_000,
  expect: { timeout: 500 },
  reporter: "list",
  use: { ...devices["Desktop Chrome"] },
  // Tests intercept HTTPS requests in Chromium. No deployment or server needed.
});
