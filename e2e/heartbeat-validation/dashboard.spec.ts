import { test, expect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { checkDashboard } from "../heartbeat/check-dashboard";

const target = "https://heartbeat.test/";
const html = (banner = "", overrides: Record<string, string> = {}) => {
  const values = {
    "calories-consumed": "0", "daily-goal": "2500", "remaining-calories": "2500",
    protein: "0 g", carbs: "0 g", fat: "0 g", progress: "0%", ...overrides,
  };
  return `<h1>LockedIn</h1>${banner ? `<p data-testid="data-status">${banner}</p>` : ""}` +
    Object.entries(values).map(([name, value]) => `<p data-testid="stat-${name}">${value}</p>`).join("");
};

async function serve(page: Page, body: string, status = 200) {
  await page.route("**/*", async (route) => {
    expect(route.request().method(), "Heartbeat must not write to the server").toBe("GET");
    await route.fulfill({ status, contentType: "text/html", body });
  });
}

test("healthy demo dashboard passes without mutation", async ({ page }) => {
  await serve(page, html("Demo mode: showing sample meals. Changes are not saved."));
  let status: number | null = null;
  await checkDashboard(page, target, "demo", (value) => { status = value; });
  expect(status).toBe(200);
});

test("live dashboard with no meals passes", async ({ page }) => {
  await serve(page, html());
  await checkDashboard(page, target, "live");
});

test("live dashboard over its calorie goal passes", async ({ page }) => {
  await serve(page, html("", { "calories-consumed": "3000", "remaining-calories": "-500", progress: "100%" }));
  await checkDashboard(page, target, "live");
});

test("HTTP failure is rejected even if the body resembles the app", async ({ page }) => {
  await serve(page, html(), 503);
  let status: number | null = null;
  await expect(checkDashboard(page, target, "live", (value) => { status = value; })).rejects.toThrow("HTTP 503");
  expect(status).toBe(503);
});

test("missing dashboard is rejected", async ({ page }) => {
  await serve(page, "<h1>Service unavailable</h1>");
  await expect(checkDashboard(page, target, "live")).rejects.toThrow();
});

test("stuck loading is rejected", async ({ page }) => {
  await serve(page, '<h1>LockedIn</h1><p data-testid="data-status">Loading today&#39;s meals…</p>');
  await expect(checkDashboard(page, target, "live")).rejects.toThrow();
});

test("offline fallback cannot pass as live", async ({ page }) => {
  await serve(page, html("Could not reach the server, so you are seeing sample meals. Changes are not saved."));
  await expect(checkDashboard(page, target, "live")).rejects.toThrow();
});

test("unexpected demo mode cannot pass as live", async ({ page }) => {
  await serve(page, html("Demo mode: showing sample meals. Changes are not saved."));
  await expect(checkDashboard(page, target, "live")).rejects.toThrow();
});

test("invalid numeric totals are rejected", async ({ page }) => {
  await serve(page, html("", { "calories-consumed": "NaN" }));
  await expect(checkDashboard(page, target, "live")).rejects.toThrow();
});

test("navigation timeout is rejected", async ({ page }) => {
  page.setDefaultNavigationTimeout(150);
  await page.route("**/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, contentType: "text/html", body: html() }).catch(() => {});
  });
  await expect(checkDashboard(page, target, "live")).rejects.toThrow(/timeout/i);
});

for (const [name, overrides, message] of [
  ["missing URL", { PRODUCTION_URL: undefined }, "Set PRODUCTION_URL"],
  ["missing mode", { HEARTBEAT_EXPECTED_MODE: undefined }, "Set HEARTBEAT_EXPECTED_MODE"],
  ["invalid mode", { HEARTBEAT_EXPECTED_MODE: "offline" }, "Set HEARTBEAT_EXPECTED_MODE"],
  ["HTTP target", { PRODUCTION_URL: "http://heartbeat.test" }, "must be an HTTPS URL"],
  ["invalid timeout", { HEARTBEAT_TIMEOUT_MS: "0" }, "HEARTBEAT_TIMEOUT_MS must"],
] as const) {
  test(`configuration rejects ${name}`, () => {
    const env = { ...process.env, PRODUCTION_URL: target, HEARTBEAT_EXPECTED_MODE: "live", HEARTBEAT_TIMEOUT_MS: "30000" };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete env[key as keyof typeof env];
      else env[key as keyof typeof env] = value;
    }
    const result = spawnSync(process.execPath, [path.resolve("node_modules/playwright/cli.js"), "test", "--config=playwright.heartbeat.config.ts", "--list"], {
      encoding: "utf8", env, timeout: 10_000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(message);
  });
}
