import { test, expect, type Page } from "@playwright/test";
import { dailySummary, meals } from "../../web/lib/fixtures";

// Demo mode gives each browser context isolated data. API integration lives in api/test.
const stat = (page: Page, name: string) => page.getByTestId(`stat-${name}`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("data-status")).toContainText("Demo mode");
});

test.describe("daily dashboard", () => {
  test("shows the LockedIn header", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "LockedIn" })).toBeVisible();
    await expect(page.getByText("Your AI-powered health and fitness tracker")).toBeVisible();
  });

  test("shows calories consumed, goal and remaining", async ({ page }) => {
    await expect(stat(page, "calories-consumed")).toHaveText(String(dailySummary.calories));
    await expect(stat(page, "daily-goal")).toHaveText(String(dailySummary.goalCalories));
    await expect(stat(page, "remaining-calories")).toHaveText(String(dailySummary.remainingCalories));
  });

  test("goal minus consumed equals remaining", async ({ page }) => {
    const consumed = Number(await stat(page, "calories-consumed").innerText());
    const goal = Number(await stat(page, "daily-goal").innerText());
    const remaining = Number(await stat(page, "remaining-calories").innerText());
    expect(goal - consumed).toBe(remaining);
  });

  test("shows the progress percentage", async ({ page }) => {
    const pct = Math.round((dailySummary.calories / dailySummary.goalCalories) * 100);
    await expect(stat(page, "progress")).toBeVisible();
    await expect(stat(page, "progress")).toHaveText(`${pct}%`);
  });

  test("shows macronutrient totals in grams", async ({ page }) => {
    await expect(stat(page, "protein")).toHaveText(`${dailySummary.proteinG} g`);
    await expect(stat(page, "carbs")).toHaveText(`${dailySummary.carbsG} g`);
    await expect(stat(page, "fat")).toHaveText(`${dailySummary.fatG} g`);
  });
});

test.describe("today's meals", () => {
  test("lists every meal with its calories", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 2, name: "Today's Meals" })).toBeVisible();
    for (const meal of meals) {
      const row = page.getByTestId("meal-item").filter({
        has: page.getByRole("heading", { level: 3, name: meal.name, exact: true }),
      });
      await expect(row).toContainText(`${meal.calories} kcal`);
      await expect(row).toContainText(meal.mealType);
    }
  });

  test("listed meal calories add up to the consumed total", async ({ page }) => {
    await expect(page.getByTestId("meal-item")).toHaveCount(dailySummary.mealCount);
    const kcal = await page.getByTestId("meal-item").getByText(/^\d+ kcal$/).allInnerTexts();
    const sum = kcal.reduce((total, text) => total + parseInt(text, 10), 0);
    await expect(stat(page, "calories-consumed")).toHaveText(String(sum));
  });
});

test.describe("meal logging", () => {
  test("logging a meal updates the calorie total", async ({ page }) => {
    await page.getByTestId("meal-name-input").fill("Playwright apple");
    await page.getByTestId("meal-calories-input").fill("95");
    await page.getByTestId("meal-submit").click();

    await expect(page.getByTestId("meal-item")).toHaveCount(meals.length + 1);
    await expect(page.getByRole("heading", { name: "Playwright apple", exact: true })).toBeVisible();
    await expect(stat(page, "calories-consumed")).toHaveText(String(dailySummary.calories + 95));
    await expect(stat(page, "remaining-calories")).toHaveText(String(dailySummary.remainingCalories - 95));
    await expect(page.getByTestId("meal-name-input")).toHaveValue("");
  });

  test("deleting a meal updates the calorie total", async ({ page }) => {
    const meal = meals[0];
    await page.getByRole("button", { name: `Delete ${meal.name}`, exact: true }).click();

    await expect(page.getByTestId("meal-item")).toHaveCount(meals.length - 1);
    await expect(page.getByRole("heading", { name: meal.name, exact: true })).toHaveCount(0);
    await expect(stat(page, "calories-consumed")).toHaveText(String(dailySummary.calories - meal.calories));
    await expect(stat(page, "remaining-calories")).toHaveText(String(dailySummary.remainingCalories + meal.calories));
  });

  test("shows an error when calories are invalid", async ({ page }) => {
    await page.getByTestId("meal-name-input").fill("Invalid meal");
    await page.getByTestId("meal-calories-input").fill("-5");
    await page.getByTestId("meal-submit").click();

    await expect(page.getByTestId("meal-form-error")).toHaveText("Calories must be a whole number of 0 or more.");
    await expect(page.getByTestId("meal-item")).toHaveCount(meals.length);
    await expect(stat(page, "calories-consumed")).toHaveText(String(dailySummary.calories));
    await expect(page.getByTestId("meal-calories-input")).toHaveValue("-5");
  });
});
