import request from "supertest";
import { describe, expect, it } from "vitest";
import { MemoryProfileStore, type ProfileStore } from "../src/profile-store.js";
import type { Profile } from "../src/types.js";
import { buildApp } from "./helpers.js";

const cut = { goal: "cut", fitnessLevel: "intermediate", dailyCalorieGoal: 2200, workoutDaysPerWeek: 4 } as const;

describe("GET /profile", () => {
  it("is 404 until a profile is saved", async () => {
    const res = await request(buildApp().app).get("/profile");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND", message: "no profile saved yet" });
  });

  it("returns the saved profile", async () => {
    const saved: Profile = { ...cut, updatedAt: "2026-11-01T12:00:00Z" };
    const { app } = buildApp({ profileStore: new MemoryProfileStore(saved) });
    const res = await request(app).get("/profile");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(saved);
  });
});

describe("PUT /profile", () => {
  it("saves the profile and stamps updatedAt with the server time", async () => {
    const { app } = buildApp();
    const res = await request(app).put("/profile").send(cut);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...cut, updatedAt: "2026-10-26T18:00:00Z" });
    expect((await request(app).get("/profile")).body).toEqual(res.body);
  });

  it("replaces the whole profile on a second save", async () => {
    const { app } = buildApp();
    await request(app).put("/profile").send(cut);
    const bulk = { goal: "bulk", fitnessLevel: "advanced", dailyCalorieGoal: 3200, workoutDaysPerWeek: 6 };
    const res = await request(app).put("/profile").send(bulk);
    expect(res.body).toMatchObject(bulk);
    expect((await request(app).get("/profile")).body).toMatchObject(bulk);
  });

  it("ignores unknown fields and a client-sent updatedAt", async () => {
    const res = await request(buildApp().app)
      .put("/profile")
      .send({ ...cut, updatedAt: "1999-01-01T00:00:00Z", isAdmin: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...cut, updatedAt: "2026-10-26T18:00:00Z" });
  });

  it("rejects a bad body with 400 and keeps the old profile", async () => {
    const { app } = buildApp();
    await request(app).put("/profile").send(cut);
    const res = await request(app).put("/profile").send({ ...cut, dailyCalorieGoal: 99999 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "VALIDATION_ERROR",
      message: "dailyCalorieGoal must be a whole number from 1000 to 6000",
    });
    expect((await request(app).get("/profile")).body.dailyCalorieGoal).toBe(2200);
  });

  it("rejects a missing body", async () => {
    const res = await request(buildApp().app).put("/profile");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("request body must be a JSON object");
  });

  it("rejects body that isn't JSON", async () => {
    const res = await request(buildApp().app)
      .put("/profile")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 500 without details when storage fails", async () => {
    const broken: ProfileStore = {
      get: async () => null,
      save: async () => {
        throw new Error("disk full");
      },
    };
    const original = console.error;
    console.error = () => {};
    try {
      const res = await request(buildApp({ profileStore: broken }).app).put("/profile").send(cut);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "INTERNAL_ERROR", message: "something went wrong" });
    } finally {
      console.error = original;
    }
  });
});

describe("GET /summary/daily with a profile", () => {
  it("uses the profile's dailyCalorieGoal instead of 2500", async () => {
    const { app } = buildApp();
    await request(app).put("/profile").send(cut);
    const res = await request(app).get("/summary/daily?date=2026-10-26");
    // Fixture day is 1150 calories (CONTRACT.md).
    expect(res.body).toMatchObject({ calories: 1150, goalCalories: 2200, remainingCalories: 1050 });
  });

  it("goes negative when the day is over the profile goal", async () => {
    const { app } = buildApp();
    await request(app).put("/profile").send({ ...cut, dailyCalorieGoal: 1000 });
    const res = await request(app).get("/summary/daily?date=2026-10-26");
    expect(res.body).toMatchObject({ goalCalories: 1000, remainingCalories: -150 });
  });

  it("still uses the configured default when no profile is saved", async () => {
    const res = await request(buildApp({ goalCalories: 2000 }).app).get("/summary/daily?date=2026-10-26");
    expect(res.body).toMatchObject({ goalCalories: 2000, remainingCalories: 850 });
  });
});

describe("MemoryProfileStore", () => {
  it("hands out copies so callers can't change stored data", async () => {
    const store = new MemoryProfileStore();
    const input: Profile = { ...cut, updatedAt: "2026-11-01T12:00:00Z" };
    const saved = await store.save(input);
    input.dailyCalorieGoal = 1;
    saved.dailyCalorieGoal = 2;
    const read = await store.get();
    read!.dailyCalorieGoal = 3;
    expect((await store.get())?.dailyCalorieGoal).toBe(2200);
  });
});
