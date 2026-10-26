import { test, expect, type Page } from "@playwright/test";
import { dailySummary, meals } from "../../web/lib/fixtures";

// The dashboard currently renders web/lib/fixtures.ts, so we assert against the
// same file. Once the web app reads from the API these become seeded-data checks.

const valueBelow = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator("xpath=following-sibling::p");

test.describe("daily dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows the LockedIn header", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "LockedIn" })).toBeVisible();
    await expect(page.getByText("Your AI-powered health and fitness tracker")).toBeVisible();
  });

  test("shows calories consumed, goal and remaining", async ({ page }) => {
    await expect(valueBelow(page, "Calories Consumed")).toHaveText(String(dailySummary.calories));
    await expect(valueBelow(page, "Daily Goal")).toHaveText(String(dailySummary.goalCalories));
    await expect(valueBelow(page, "Remaining Calories")).toHaveText(
      String(dailySummary.remainingCalories),
    );
  });

  test("goal minus consumed equals remaining", async ({ page }) => {
    const consumed = Number(await valueBelow(page, "Calories Consumed").innerText());
    const goal = Number(await valueBelow(page, "Daily Goal").innerText());
    const remaining = Number(await valueBelow(page, "Remaining Calories").innerText());
    expect(goal - consumed).toBe(remaining);
  });

  test("shows the progress percentage", async ({ page }) => {
    const pct = Math.round((dailySummary.calories / dailySummary.goalCalories) * 100);
    await expect(page.getByText("Daily Progress")).toBeVisible();
    await expect(page.getByText(`${pct}%`, { exact: true })).toBeVisible();
  });

  test("shows macronutrient totals in grams", async ({ page }) => {
    await expect(valueBelow(page, "Protein")).toHaveText(`${dailySummary.proteinG} g`);
    await expect(valueBelow(page, "Carbs")).toHaveText(`${dailySummary.carbsG} g`);
    await expect(valueBelow(page, "Fat")).toHaveText(`${dailySummary.fatG} g`);
  });
});

test.describe("today's meals", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("lists every meal with its calories", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 2, name: "Today's Meals" })).toBeVisible();
    for (const meal of meals) {
      const row = page
        .getByRole("heading", { level: 3, name: meal.name })
        .locator("xpath=ancestor::div[2]");
      await expect(row).toContainText(`${meal.calories} kcal`);
      await expect(row).toContainText(meal.mealType);
    }
  });

  test("listed meal calories add up to the consumed total", async ({ page }) => {
    const kcal = await page.getByText(/^\d+ kcal$/).allInnerTexts();
    expect(kcal).toHaveLength(dailySummary.mealCount);
    const sum = kcal.reduce((total, text) => total + parseInt(text, 10), 0);
    await expect(valueBelow(page, "Calories Consumed")).toHaveText(String(sum));
  });
});

// Blocked until the web app has a meal form and talks to the API.
// Contract: POST /meals, DELETE /meals/:id, 400 VALIDATION_ERROR (see CONTRACT.md).
test.describe("meal logging", () => {
  test.fixme("logging a meal updates the calorie total", async () => {});
  test.fixme("deleting a meal updates the calorie total", async () => {});
  test.fixme("shows an error when calories are invalid", async () => {});
});
