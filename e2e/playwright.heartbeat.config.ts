import { defineConfig, devices } from "@playwright/test";

const productionUrl = process.env.PRODUCTION_URL;
const expectedMode = process.env.HEARTBEAT_EXPECTED_MODE;
const timeoutMs = Number(process.env.HEARTBEAT_TIMEOUT_MS ?? "30000");

if (!productionUrl) {
  throw new Error("Set PRODUCTION_URL to the deployed dashboard URL. The heartbeat never starts a local server.");
}

const target = new URL(productionUrl);
if (target.protocol !== "https:" || target.username || target.password) {
  throw new Error("PRODUCTION_URL must be an HTTPS URL without embedded credentials.");
}
if (expectedMode !== "demo" && expectedMode !== "live") {
  throw new Error("Set HEARTBEAT_EXPECTED_MODE explicitly to demo or live.");
}
if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
  throw new Error("HEARTBEAT_TIMEOUT_MS must be a whole number between 1000 and 120000 milliseconds.");
}

export default defineConfig({
  testDir: "./heartbeat",
  outputDir: "./test-results/heartbeat",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: timeoutMs,
  expect: { timeout: timeoutMs },
  reporter: "list",
  use: {
    baseURL: productionUrl,
    navigationTimeout: timeoutMs,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "production-chromium", use: { ...devices["Desktop Chrome"] } }],
  // Deliberately no webServer: this suite checks only the configured deployment.
});
