import { describe, expect, it } from "vitest";
import { loadFixtureMeals } from "../src/fixtures.js";
import { MemoryMealStore } from "../src/store.js";

describe("loadFixtureMeals", () => {
  it("loads the shared meals.json and every entry passes validation", () => {
    const meals = loadFixtureMeals();
    expect(meals.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(meals.every((m) => m.eatenAt.startsWith("2026-10-26"))).toBe(true);
  });

  it("fails loudly when the file isn't an array", () => {
    expect(() => loadFixtureMeals({})).toThrow("meals.json must be an array");
  });

  it.each([undefined, 0, "1", 1.5, null])("fails loudly for id %j", (id) => {
    expect(() => loadFixtureMeals([{ id, name: "x", mealType: "snack", calories: 1 }])).toThrow(
      "meals.json[0] needs a positive whole-number id",
    );
  });

  it("names the broken entry and field", () => {
    expect(() => loadFixtureMeals([{ id: 1, name: "x", mealType: "brunch", calories: 1 }])).toThrow(
      "meals.json[0]: mealType must be one of",
    );
  });
});

describe("MemoryMealStore", () => {
  it("continues ids after the highest seeded id", async () => {
    const store = new MemoryMealStore([
      { id: 7, name: "a", mealType: "snack", calories: 1, proteinG: 0, carbsG: 0, fatG: 0, eatenAt: "2026-10-26T08:00:00Z" },
    ]);
    const created = await store.create({
      name: "b",
      mealType: "snack",
      calories: 1,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      eatenAt: "2026-10-26T09:00:00Z",
    });
    expect(created.id).toBe(8);
  });

  it("returns copies so callers can't change stored meals by accident", async () => {
    const store = new MemoryMealStore(loadFixtureMeals());
    const [first] = await store.listBetween(new Date("2026-10-26T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    first!.calories = 99999;

    const [again] = await store.listBetween(new Date("2026-10-26T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    expect(again!.calories).toBe(350);
  });

  it("breaks ties on the same timestamp by id", async () => {
    const store = new MemoryMealStore();
    const base = { mealType: "snack" as const, calories: 1, proteinG: 0, carbsG: 0, fatG: 0, eatenAt: "2026-10-26T08:00:00Z" };
    await store.create({ ...base, name: "first" });
    await store.create({ ...base, name: "second" });

    const meals = await store.listBetween(new Date("2026-10-26T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    expect(meals.map((m) => m.name)).toEqual(["first", "second"]);
  });
});
