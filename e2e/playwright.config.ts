import { defineConfig, devices } from "@playwright/test";

// BASE_URL points the suite at an already-running site (e.g. production for the
// heartbeat test). When it is unset we start the Next.js app from ../web ourselves.
const externalUrl = process.env.BASE_URL;
const localPort = 3100;
const baseURL = externalUrl ?? `http://localhost:${localPort}`;
const webDir = process.env.WEB_DIR ?? "../web";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "results/results.json" }],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: externalUrl
    ? undefined
    : {
        // CI builds first (see .github/workflows/ci.yml), so `start` is enough there.
        command: process.env.CI
          ? `npm --prefix ${webDir} run start -- --port ${localPort}`
          : `npm --prefix ${webDir} run dev -- --port ${localPort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
