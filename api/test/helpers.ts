import { createApp, type AppOptions } from "../src/app.js";
import { loadFixtureMeals } from "../src/fixtures.js";
import { MemoryMealStore, type MealStore } from "../src/store.js";

/** "Today" for every test, so results don't depend on when CI runs. */
export const TODAY = new Date("2026-10-26T18:00:00Z");

export function buildApp(overrides: Partial<AppOptions> & { store?: MealStore } = {}) {
  const store = overrides.store ?? new MemoryMealStore(loadFixtureMeals());
  const app = createApp({ version: "test123", now: () => TODAY, ...overrides, store });
  return { app, store };
}
