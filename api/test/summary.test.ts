import request from "supertest";
import { describe, expect, it } from "vitest";
import { MemoryMealStore } from "../src/store.js";
import { buildApp } from "./helpers.js";

describe("GET /summary/daily", () => {
  it("matches the CONTRACT.md example exactly for the fixture day", async () => {
    const res = await request(buildApp().app).get("/summary/daily?date=2026-10-26");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: "2026-10-26",
      calories: 1150,
      proteinG: 87,
      carbsG: 136,
      fatG: 25,
      goalCalories: 2500,
      remainingCalories: 1350,
      mealCount: 3,
    });
  });

  it("defaults to today", async () => {
    const res = await request(buildApp().app).get("/summary/daily");
    expect(res.body.date).toBe("2026-10-26");
    expect(res.body.mealCount).toBe(3);
  });

  it("returns zeros for an empty day", async () => {
    const res = await request(buildApp().app).get("/summary/daily?date=2026-01-01");
    expect(res.body).toMatchObject({ calories: 0, proteinG: 0, mealCount: 0, remainingCalories: 2500 });
  });

  it("updates after adding and deleting a meal", async () => {
    const { app } = buildApp();
    await request(app).post("/meals").send({ name: "Pizza", mealType: "dinner", calories: 800 });
    let res = await request(app).get("/summary/daily");
    expect(res.body).toMatchObject({ calories: 1950, remainingCalories: 550, mealCount: 4 });

    await request(app).delete("/meals/4");
    res = await request(app).get("/summary/daily");
    expect(res.body).toMatchObject({ calories: 1150, mealCount: 3 });
  });

  it("goes negative when over the goal", async () => {
    const { app } = buildApp({ goalCalories: 1000 });
    const res = await request(app).get("/summary/daily");
    expect(res.body.remainingCalories).toBe(-150);
  });

  it("doesn't show floating point noise in macro totals", async () => {
    const { app } = buildApp({ store: new MemoryMealStore() });
    for (let i = 0; i < 3; i++) {
      await request(app).post("/meals").send({ name: `Snack ${i}`, mealType: "snack", calories: 10, proteinG: 0.1 });
    }
    const res = await request(app).get("/summary/daily");
    expect(res.body.proteinG).toBe(0.3);
  });

  it("rejects a bad date", async () => {
    const res = await request(buildApp().app).get("/summary/daily?date=2026-13-01");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });
});
