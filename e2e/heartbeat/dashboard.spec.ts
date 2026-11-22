import { test, expect } from "@playwright/test";

test("production dashboard is available in the expected mode", async ({ page, baseURL }) => {
  // Read-only: do not submit the meal form, click Delete, or assume fixture totals.
  const response = await page.goto(baseURL!, { waitUntil: "domcontentloaded" });
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
});
