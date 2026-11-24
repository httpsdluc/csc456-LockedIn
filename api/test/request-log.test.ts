import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJsonLogger, describeError, type LogEntry } from "../src/logger.js";
import { requestLog } from "../src/request-log.js";
import { MemoryMealStore } from "../src/store.js";
import { buildApp } from "./helpers.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function appWithLogs(overrides: Parameters<typeof buildApp>[0] = {}) {
  const logs: LogEntry[] = [];
  const { app } = buildApp({ logger: (entry) => logs.push(entry), ...overrides });
  return { app, logs };
}

describe("request ids", () => {
  it("sends a fresh UUID in X-Request-Id on every response", async () => {
    const { app } = appWithLogs();
    const first = await request(app).get("/health");
    const second = await request(app).get("/health");
    expect(first.headers["x-request-id"]).toMatch(UUID_RE);
    expect(second.headers["x-request-id"]).toMatch(UUID_RE);
    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
  });

  it("keeps a well-formed id the client sent", async () => {
    const res = await request(appWithLogs().app).get("/health").set("X-Request-Id", "web-42_retry");
    expect(res.headers["x-request-id"]).toBe("web-42_retry");
  });

  it.each(["has spaces", "x".repeat(65), "<script>"])("replaces an unsafe client id %j", async (id) => {
    const res = await request(appWithLogs().app).get("/health").set("X-Request-Id", id);
    expect(res.headers["x-request-id"]).toMatch(UUID_RE);
  });

  it("puts the same id in the error body and the header", async () => {
    const res = await request(appWithLogs().app).delete("/meals/999");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "NOT_FOUND",
      message: "meal 999 not found",
      requestId: res.headers["x-request-id"],
    });
  });

  it("adds the id even when the body isn't valid JSON", async () => {
    const res = await request(appWithLogs().app)
      .post("/meals")
      .set("Content-Type", "application/json")
      .send("{oops");
    expect(res.status).toBe(400);
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("lets the browser read X-Request-Id (CORS)", async () => {
    const res = await request(appWithLogs({ corsOrigin: "http://localhost:3000" }).app)
      .get("/health")
      .set("Origin", "http://localhost:3000");
    expect(res.headers["access-control-expose-headers"]).toBe("X-Request-Id");
  });
});

describe("request log lines", () => {
  it("writes one info line per request with method, path, status and duration", async () => {
    const { app, logs } = appWithLogs();
    const res = await request(app).get("/meals?date=2026-10-26");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      level: "info",
      msg: "request",
      requestId: res.headers["x-request-id"],
      method: "GET",
      path: "/meals",
      status: 200,
      durationMs: expect.any(Number),
    });
    expect(logs[0]!.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it("never logs the query string or the body", async () => {
    const { app, logs } = appWithLogs();
    await request(app).post("/meals?token=abc").send({ name: "Secret snack", mealType: "snack", calories: 1 });
    const line = JSON.stringify(logs);
    expect(line).not.toContain("token");
    expect(line).not.toContain("Secret snack");
    expect(logs[0]).toMatchObject({ method: "POST", path: "/meals", status: 201 });
  });

  it("logs 4xx as warn", async () => {
    const { app, logs } = appWithLogs();
    await request(app).get("/meals?date=nope");
    expect(logs[0]).toMatchObject({ level: "warn", status: 400 });
  });

  it("logs a 500 twice: the error with its stack, then the request line", async () => {
    const store = new MemoryMealStore();
    store.listBetween = async () => {
      throw new Error("connection refused");
    };
    const { app, logs } = appWithLogs({ store });
    const res = await request(app).get("/meals");
    const requestId = res.headers["x-request-id"];

    expect(res.body).toEqual({ error: "INTERNAL_ERROR", message: "something went wrong", requestId });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      level: "error",
      msg: "unhandled error",
      requestId,
      method: "GET",
      path: "/meals",
      error: { name: "Error", message: "connection refused" },
    });
    expect((logs[0]!.error as { stack: string }).stack).toContain("connection refused");
    expect(logs[1]).toMatchObject({ level: "error", msg: "request", requestId, status: 500 });
  });
});

describe("requestLog middleware", () => {
  // Fake req/res so the test controls when finish and close fire.
  function fakeExchange(headers: Record<string, string> = {}) {
    const res = Object.assign(new EventEmitter(), {
      locals: {} as Record<string, unknown>,
      statusCode: 200,
      writableFinished: false,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
    });
    const req = { method: "GET", path: "/meals", get: (name: string) => headers[name] };
    return { req: req as unknown as Request, res, asRes: res as unknown as Response };
  }

  // supertest won't send a raw newline in a header, so this one goes straight to the middleware.
  it("replaces an id with a newline in it", () => {
    const { req, res, asRes } = fakeExchange({ "X-Request-Id": "line\nbreak" });
    requestLog(() => {})(req, asRes, () => {});
    expect(res.headers["X-Request-Id"]).toMatch(UUID_RE);
  });

  it("measures duration with the clock and logs only once when close follows finish", () => {
    const logs: LogEntry[] = [];
    const times = [100, 112.345];
    const { req, res, asRes } = fakeExchange();
    requestLog((e) => logs.push(e), () => times.shift()!)(req, asRes, () => {});
    res.writableFinished = true;
    res.emit("finish");
    res.emit("close");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ msg: "request", durationMs: 12.3, status: 200 });
  });

  it("logs 'request aborted' when the client hangs up first", () => {
    const logs: LogEntry[] = [];
    const { req, res, asRes } = fakeExchange();
    requestLog((e) => logs.push(e))(req, asRes, () => {});
    res.emit("close");
    expect(logs).toEqual([expect.objectContaining({ level: "warn", msg: "request aborted", path: "/meals" })]);
  });
});

describe("createJsonLogger", () => {
  it("writes info to out and warn/error to err as timestamped JSON lines", () => {
    const out: string[] = [];
    const err: string[] = [];
    const log = createJsonLogger(
      (l) => out.push(l),
      (l) => err.push(l),
      () => new Date("2026-11-23T17:00:00Z"),
    );
    log({ level: "info", msg: "request", status: 200 });
    log({ level: "warn", msg: "request", status: 404 });
    log({ level: "error", msg: "unhandled error" });
    expect(out.map((l) => JSON.parse(l))).toEqual([
      { time: "2026-11-23T17:00:00.000Z", level: "info", msg: "request", status: 200 },
    ]);
    expect(err.map((l) => JSON.parse(l).level)).toEqual(["warn", "error"]);
  });

  it("defaults to stdout and stderr", () => {
    const writes: string[] = [];
    const outWrite = process.stdout.write;
    const errWrite = process.stderr.write;
    process.stdout.write = ((chunk: string) => writes.push(`out:${chunk}`) > 0) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => writes.push(`err:${chunk}`) > 0) as typeof process.stderr.write;
    try {
      const log = createJsonLogger();
      log({ level: "info", msg: "a" });
      log({ level: "error", msg: "b" });
    } finally {
      process.stdout.write = outWrite;
      process.stderr.write = errWrite;
    }
    expect(writes[0]).toMatch(/^out:\{"time":".+","level":"info","msg":"a"\}\n$/);
    expect(writes[1]).toMatch(/^err:\{.*"msg":"b"\}\n$/);
  });
});

describe("describeError", () => {
  it("keeps name, message and stack of an Error", () => {
    const fields = describeError(new TypeError("bad"));
    expect(fields).toMatchObject({ name: "TypeError", message: "bad" });
    expect(fields.stack).toContain("TypeError: bad");
  });

  it("stringifies anything else that was thrown", () => {
    expect(describeError("plain string")).toEqual({ message: "plain string" });
    expect(describeError(42)).toEqual({ message: "42" });
  });
});
