import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { stripVTControlCharacters } from "node:util";

test("production dashboard is available in the expected mode", async ({ page, baseURL }, testInfo) => {
  const result = {
    timestamp: new Date().toISOString(),
    url: baseURL!,
    expectedMode: process.env.HEARTBEAT_EXPECTED_MODE!,
    result: "failed" as "passed" | "failed",
    httpStatus: null as number | null,
    readinessLatencyMs: null as number | null,
    elapsedMs: 0,
    error: null as string | null,
  };
  // Excludes browser setup: start immediately before navigation, and stop only
  // when every HTTP, dashboard, numeric-value, and expected-mode check passes.
  const started = performance.now();
  try {
    // Read-only: do not submit the meal form, click Delete, or assume fixture totals.
    const response = await page.goto(baseURL!, { waitUntil: "domcontentloaded" });
    result.httpStatus = response?.status() ?? null;
    expect(response, "Navigation should return an HTTP response").not.toBeNull();
    expect(response!.ok(), `Dashboard returned HTTP ${response!.status()}`).toBe(true);
    expect(new URL(page.url()).origin, "Unexpected redirect away from production").toBe(new URL(baseURL!).origin);

    await expect(page.getByRole("heading", { name: "LockedIn", level: 1, exact: true })).toBeVisible();

    // These cards only exist once loading has finished (or a fallback has rendered).
    for (const name of ["calories-consumed", "daily-goal", "remaining-calories"]) {
      const stat = page.getByTestId(`stat-${name}`);
      await expect(stat).toBeVisible();
      await expect(stat).toHaveText(name === "remaining-calories" ? /^-?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/);
      expect(Number.isFinite(Number(await stat.innerText())), `${name} must be finite`).toBe(true);
    }

    for (const name of ["protein", "carbs", "fat"]) {
      const stat = page.getByTestId(`stat-${name}`);
      await expect(stat).toBeVisible();
      await expect(stat).toHaveText(/^\d+(?:\.\d+)? g$/);
      expect(Number.isFinite(Number((await stat.innerText()).replace(/ g$/, ""))), `${name} must be finite`).toBe(true);
    }

    const progress = page.getByTestId("stat-progress");
    await expect(progress).toBeVisible();
    await expect(progress).toHaveText(/^\d+(?:\.\d+)?%$/);
    const percentage = Number((await progress.innerText()).replace(/%$/, ""));
    expect(percentage).toBeGreaterThanOrEqual(0);
    expect(percentage).toBeLessThanOrEqual(100);

    const status = page.getByTestId("data-status");
    if (process.env.HEARTBEAT_EXPECTED_MODE === "demo") {
      await expect(status).toHaveText(/^Demo mode:/);
    } else {
      // Live mode renders no banner. Loading, demo, and offline banners all fail.
      await expect(status).toHaveCount(0);
    }
    result.result = "passed";
    result.readinessLatencyMs = Math.round((performance.now() - started) * 100) / 100;
  } catch (error) {
    result.error = stripVTControlCharacters(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    result.elapsedMs = Math.round((performance.now() - started) * 100) / 100;
    const filename = testInfo.outputPath("heartbeat.json");
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, JSON.stringify(result, null, 2) + "\n");
    console.log("Heartbeat result:", JSON.stringify(result));
  }
});
