import type { Meal, NewMeal } from "./types.js";

/**
 * Everything the routes need from storage. The methods are async on purpose:
 * the Postgres version will be async, so swapping it in later should not
 * change a single route handler.
 */
export interface MealStore {
  /** Meals with start <= eatenAt < end, oldest first. */
  listBetween(start: Date, end: Date): Promise<Meal[]>;
  create(meal: NewMeal): Promise<Meal>;
  /** Returns false if no meal had that id. */
  delete(id: number): Promise<boolean>;
  /** Used by /health. Resolves true if storage is reachable. */
  ping(): Promise<boolean>;
}

/**
 * In-memory store for Sprint 1 while the database is being set up.
 * Data resets on every restart.
 */
export class MemoryMealStore implements MealStore {
  private meals: Meal[];
  private nextId: number;

  constructor(seed: Meal[] = []) {
    this.meals = seed.map((meal) => ({ ...meal }));
    this.nextId = this.meals.reduce((max, meal) => Math.max(max, meal.id), 0) + 1;
  }

  async listBetween(start: Date, end: Date): Promise<Meal[]> {
    const from = start.getTime();
    const to = end.getTime();
    return this.meals
      .filter((meal) => {
        const t = Date.parse(meal.eatenAt);
        return t >= from && t < to;
      })
      .sort((a, b) => Date.parse(a.eatenAt) - Date.parse(b.eatenAt) || a.id - b.id)
      .map((meal) => ({ ...meal }));
  }

  async create(meal: NewMeal): Promise<Meal> {
    const saved: Meal = { id: this.nextId++, ...meal };
    this.meals.push(saved);
    return { ...saved };
  }

  async delete(id: number): Promise<boolean> {
    const index = this.meals.findIndex((meal) => meal.id === id);
    if (index === -1) return false;
    this.meals.splice(index, 1);
    return true;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
