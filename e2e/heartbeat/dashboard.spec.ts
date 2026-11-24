import { test } from "@playwright/test";
import { checkDashboard } from "./check-dashboard";
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
    await checkDashboard(
      page, baseURL!, process.env.HEARTBEAT_EXPECTED_MODE as "demo" | "live",
      (status) => { result.httpStatus = status; },
    );
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
