import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadFixtureMeals } from "../src/fixtures.js";
import { PgMealStore } from "../src/pg-store.js";
import { MemoryMealStore } from "../src/store.js";
import type { NewMeal } from "../src/types.js";
import { buildApp } from "./helpers.js";

// Runs against a real Postgres when TEST_DATABASE_URL is set (CI sets it).
// Each run uses its own schema, so it never touches real data.
const url = process.env.TEST_DATABASE_URL;
const schema = `lockedin_test_${process.pid}`;

const fixtureMeals: NewMeal[] = loadFixtureMeals().map(({ id: _id, ...meal }) => meal);

describe.skipIf(!url)("PgMealStore", () => {
  let admin: pg.Pool;
  let store: PgMealStore;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    store = new PgMealStore(new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` }));
    await store.migrate();
  });

  beforeEach(async () => {
    await admin.query(`TRUNCATE ${schema}.meals RESTART IDENTITY`);
  });

  afterAll(async () => {
    await store?.close();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("can migrate more than once", async () => {
    const result = await store.migrate();
    expect(typeof result.statStatements).toBe("boolean");
  });

  it("returns created meals in the CONTRACT.md shape", async () => {
    const saved = await store.create({
      name: "Greek yogurt",
      mealType: "snack",
      calories: 150,
      proteinG: 15.5,
      carbsG: 10,
      fatG: 4.2,
      eatenAt: "2026-10-26T16:00:00Z",
    });
    expect(saved).toEqual({
      id: 1,
      name: "Greek yogurt",
      mealType: "snack",
      calories: 150,
      proteinG: 15.5,
      carbsG: 10,
      fatG: 4.2,
      eatenAt: "2026-10-26T16:00:00Z",
    });
    const listed = await store.listBetween(new Date("2026-10-26T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    expect(listed).toEqual([saved]);
  });

  it("keeps millisecond timestamps", async () => {
    const saved = await store.create({ ...fixtureMeals[0]!, eatenAt: "2026-10-26T08:00:00.250Z" });
    expect(saved.eatenAt).toBe("2026-10-26T08:00:00.250Z");
  });

  it("lists only that range, oldest first, ties broken by id", async () => {
    const at = (eatenAt: string, name: string) => store.create({ ...fixtureMeals[0]!, name, eatenAt });
    await at("2026-10-26T19:00:00Z", "dinner");
    await at("2026-10-26T07:00:00Z", "breakfast");
    await at("2026-10-26T07:00:00Z", "same time, later id");
    await at("2026-10-27T00:00:00Z", "next day");
    await at("2026-10-25T23:59:59Z", "day before");

    const meals = await store.listBetween(new Date("2026-10-26T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    expect(meals.map((m) => m.name)).toEqual(["breakfast", "same time, later id", "dinner"]);
  });

  it("deletes by id and reports whether the meal existed", async () => {
    const saved = await store.create(fixtureMeals[0]!);
    expect(await store.delete(saved.id)).toBe(true);
    expect(await store.delete(saved.id)).toBe(false);
    expect(await store.delete(0)).toBe(false);
    // Bigger than a Postgres integer: a 404, not a database error.
    expect(await store.delete(9_999_999_999)).toBe(false);
  });

  it("seeds the sample meals only into an empty table", async () => {
    expect(await store.seedIfEmpty(fixtureMeals)).toBe(fixtureMeals.length);
    expect(await store.seedIfEmpty(fixtureMeals)).toBe(0);
    const meals = await store.listBetween(new Date(0), new Date("2100-01-01T00:00:00Z"));
    expect(meals).toHaveLength(fixtureMeals.length);
  });

  it("serves the same API responses as the memory store", async () => {
    await store.seedIfEmpty(fixtureMeals);
    const pgApp = buildApp({ store }).app;
    const memoryApp = buildApp({ store: new MemoryMealStore(loadFixtureMeals()) }).app;

    for (const path of ["/meals?date=2026-10-26", "/summary/daily?date=2026-10-26", "/health"]) {
      const [fromPg, fromMemory] = await Promise.all([request(pgApp).get(path), request(memoryApp).get(path)]);
      expect(fromPg.status, path).toBe(fromMemory.status);
      expect({ ...fromPg.body, uptimeSec: 0 }, path).toEqual({ ...fromMemory.body, uptimeSec: 0 });
    }

    const created = await request(pgApp)
      .post("/meals")
      .send({ name: "Apple", mealType: "snack", calories: 95, eatenAt: "2026-10-26T17:00:00Z" });
    expect(created.status).toBe(201);
    expect(created.body.id).toBe(fixtureMeals.length + 1);
    expect((await request(pgApp).delete(`/meals/${created.body.id}`)).status).toBe(204);
    expect((await request(pgApp).delete("/meals/9999999999")).status).toBe(404);
  });
});

describe("PgMealStore when the database is unreachable", () => {
  it("makes /health report 503 instead of hanging", async () => {
    // Nothing listens on port 1, so the connection is refused right away.
    const store = PgMealStore.fromUrl("postgres://nobody@127.0.0.1:1/none");
    try {
      const res = await request(buildApp({ store }).app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ status: "degraded", db: "down" });
    } finally {
      await store.close();
    }
  });
});
