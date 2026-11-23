import { expect, type Page } from "@playwright/test";

// Shared with controlled browser tests; never submits forms or mutates meals.
export async function checkDashboard(
  page: Page,
  targetUrl: string,
  expectedMode: "demo" | "live",
  recordStatus: (status: number | null) => void = () => {},
) {
  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  recordStatus(response?.status() ?? null);
  expect(response, "Navigation should return an HTTP response").not.toBeNull();
  expect(response!.ok(), `Dashboard returned HTTP ${response!.status()}`).toBe(true);
  expect(new URL(page.url()).origin, "Unexpected redirect away from production").toBe(new URL(targetUrl).origin);
  await expect(page.getByRole("heading", { name: "LockedIn", level: 1, exact: true })).toBeVisible();

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
  if (expectedMode === "demo") await expect(status).toHaveText(/^Demo mode:/);
  else await expect(status).toHaveCount(0);
}
