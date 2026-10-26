import rawMeals from "./fixtures/meals.json" with { type: "json" };
import type { Meal } from "./types.js";
import { validateNewMeal } from "./validation.js";

/**
 * Loads the shared fake meals and runs each one through the same validation
 * as POST /meals, so a bad edit to meals.json fails at startup instead of
 * showing up as weird data in the web app.
 */
export function loadFixtureMeals(raw: unknown = rawMeals): Meal[] {
  if (!Array.isArray(raw)) throw new Error("meals.json must be an array");

  return raw.map((entry: unknown, index) => {
    const id = (entry as { id?: unknown })?.id;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
      throw new Error(`meals.json[${index}] needs a positive whole-number id`);
    }
    const result = validateNewMeal(entry);
    if (!result.ok) throw new Error(`meals.json[${index}]: ${result.message}`);
    return { id, ...result.value };
  });
}
