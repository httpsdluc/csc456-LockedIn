import request from "supertest";
import { describe, expect, it } from "vitest";
import { MemoryMealStore } from "../src/store.js";
import { buildApp } from "./helpers.js";

describe("GET /health", () => {
  it("returns the shape in CONTRACT.md when storage is up", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      db: "ok",
      version: "test123",
      uptimeSec: expect.any(Number),
    });
    expect(Number.isInteger(res.body.uptimeSec)).toBe(true);
  });

  it("returns 503 when storage says it is down", async () => {
    const store = new MemoryMealStore();
    store.ping = async () => false;
    const res = await request(buildApp({ store }).app).get("/health");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", db: "down" });
  });

  it("returns 503 instead of crashing when the storage check throws", async () => {
    const store = new MemoryMealStore();
    store.ping = async () => {
      throw new Error("connection refused");
    };
    const res = await request(buildApp({ store }).app).get("/health");

    expect(res.status).toBe(503);
    expect(res.body.db).toBe("down");
  });

  it("defaults version to dev", async () => {
    const res = await request(buildApp({ version: undefined }).app).get("/health");
    expect(res.body.version).toBe("dev");
  });
});
