import request from "supertest";
import { describe, expect, it } from "vitest";
import { MemoryMealStore } from "../src/store.js";
import { buildApp } from "./helpers.js";

describe("GET /meals", () => {
  it("returns the CONTRACT.md example meal first for 2026-10-26", async () => {
    const res = await request(buildApp().app).get("/meals?date=2026-10-26");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toEqual({
      id: 1,
      name: "Oatmeal with banana",
      mealType: "breakfast",
      calories: 350,
      proteinG: 12,
      carbsG: 60,
      fatG: 7,
      eatenAt: "2026-10-26T08:00:00Z",
    });
  });

  it("defaults to today", async () => {
    const res = await request(buildApp().app).get("/meals");
    expect(res.body.map((m: { id: number }) => m.id)).toEqual([1, 2, 3]);
  });

  it("returns oldest first even when meals were added out of order", async () => {
    const { app } = buildApp({ store: new MemoryMealStore() });
    await request(app).post("/meals").send({ name: "Dinner", mealType: "dinner", calories: 700, eatenAt: "2026-10-26T19:00:00Z" });
    await request(app).post("/meals").send({ name: "Breakfast", mealType: "breakfast", calories: 300, eatenAt: "2026-10-26T07:00:00Z" });

    const res = await request(app).get("/meals?date=2026-10-26");
    expect(res.body.map((m: { name: string }) => m.name)).toEqual(["Breakfast", "Dinner"]);
  });

  it("only includes meals inside that UTC day", async () => {
    const { app } = buildApp({ store: new MemoryMealStore() });
    await request(app).post("/meals").send({ name: "Late snack", mealType: "snack", calories: 100, eatenAt: "2026-10-26T23:59:59Z" });
    await request(app).post("/meals").send({ name: "Next day", mealType: "snack", calories: 100, eatenAt: "2026-10-27T00:00:00Z" });

    const res = await request(app).get("/meals?date=2026-10-26");
    expect(res.body.map((m: { name: string }) => m.name)).toEqual(["Late snack"]);
  });

  it("returns an empty list for a day with no meals", async () => {
    const res = await request(buildApp().app).get("/meals?date=2026-01-01");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each(["26-10-2026", "2026-02-30", "today", ""])("rejects date=%s", async (date) => {
    const res = await request(buildApp().app).get(`/meals?date=${date}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("rejects the date param sent twice", async () => {
    const res = await request(buildApp().app).get("/meals?date=2026-10-26&date=2026-10-27");
    expect(res.status).toBe(400);
  });
});

describe("POST /meals", () => {
  it("creates the CONTRACT.md example and gives it the next id", async () => {
    const res = await request(buildApp().app)
      .post("/meals")
      .send({ name: "Greek yogurt", mealType: "snack", calories: 150, proteinG: 15, carbsG: 10, fatG: 4 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 4,
      name: "Greek yogurt",
      mealType: "snack",
      calories: 150,
      proteinG: 15,
      carbsG: 10,
      fatG: 4,
      eatenAt: "2026-10-26T18:00:00Z",
    });
  });

  it("shows up in GET /meals afterwards", async () => {
    const { app } = buildApp();
    await request(app).post("/meals").send({ name: "Apple", mealType: "snack", calories: 95 });

    const res = await request(app).get("/meals");
    expect(res.body.map((m: { name: string }) => m.name)).toContain("Apple");
  });

  it("returns 400 with the CONTRACT.md message for negative calories", async () => {
    const res = await request(buildApp().app).post("/meals").send({ name: "Bad", mealType: "lunch", calories: -5 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "VALIDATION_ERROR", message: "calories must be a number >= 0" });
  });

  it("returns 400 for a body that isn't valid JSON", async () => {
    const res = await request(buildApp().app)
      .post("/meals")
      .set("Content-Type", "application/json")
      .send('{"name": "oops"');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "VALIDATION_ERROR", message: "request body is not valid JSON" });
  });

  it("returns 400 when no JSON body is sent", async () => {
    const res = await request(buildApp().app).post("/meals");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("request body must be a JSON object");
  });

  it("returns 413 for a huge body", async () => {
    const res = await request(buildApp().app)
      .post("/meals")
      .send({ name: "x".repeat(20_000), mealType: "snack", calories: 1 });

    expect(res.status).toBe(413);
    expect(res.body.error).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("DELETE /meals/:id", () => {
  it("deletes a meal and returns 204", async () => {
    const { app } = buildApp();
    const res = await request(app).delete("/meals/2");

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    const after = await request(app).get("/meals");
    expect(after.body.map((m: { id: number }) => m.id)).toEqual([1, 3]);
  });

  it("returns the CONTRACT.md 404 for a missing id", async () => {
    const res = await request(buildApp().app).delete("/meals/4");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND", message: "meal 4 not found" });
  });

  it("returns 404 when deleting the same meal twice", async () => {
    const { app } = buildApp();
    await request(app).delete("/meals/1");
    const res = await request(app).delete("/meals/1");
    expect(res.status).toBe(404);
  });

  it.each(["abc", "1.5", "-1", "99999999999999999999"])("returns 404 for id %s", async (id) => {
    const res = await request(buildApp().app).delete(`/meals/${id}`);
    expect(res.status).toBe(404);
  });
});

describe("unknown routes and server errors", () => {
  it("returns JSON 404 for a route that doesn't exist", async () => {
    const res = await request(buildApp().app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND", message: "no route for GET /nope" });
  });

  it("returns 500 without leaking the error when storage throws", async () => {
    const store = new MemoryMealStore();
    store.listBetween = async () => {
      throw new Error("secret connection string in here");
    };
    const original = console.error;
    console.error = () => {};
    try {
      const res = await request(buildApp({ store }).app).get("/meals");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "INTERNAL_ERROR", message: "something went wrong" });
    } finally {
      console.error = original;
    }
  });

  it("allows the web app to call it from the browser (CORS)", async () => {
    const res = await request(buildApp({ corsOrigin: "http://localhost:3000" }).app)
      .get("/health")
      .set("Origin", "http://localhost:3000");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("doesn't advertise Express in headers", async () => {
    const res = await request(buildApp().app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
