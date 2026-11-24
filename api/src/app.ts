import cors from "cors";
import express, { type ErrorRequestHandler, type Express, type Response } from "express";
import { parseDay, toIsoUtc } from "./dates.js";
import { createJsonLogger, describeError, type Logger } from "./logger.js";
import { MemoryProfileStore, type ProfileStore } from "./profile-store.js";
import { requestIdOf, requestLog } from "./request-log.js";
import type { MealStore } from "./store.js";
import { validateNewMeal, validateProfile } from "./validation.js";

export interface AppOptions {
  store: MealStore;
  /** Defaults to in-memory. */
  profileStore?: ProfileStore;
  /** Short git SHA of the running build. /health reports it. */
  version?: string;
  /** Used by /summary/daily when no profile has been saved (see CONTRACT.md). */
  goalCalories?: number;
  /** Allowed browser origin for the web app. Defaults to any origin. */
  corsOrigin?: string;
  /** Injected so tests can pin "today". */
  now?: () => Date;
  /** Defaults to JSON lines on stdout/stderr. */
  logger?: Logger;
}

type ErrorCode = "VALIDATION_ERROR" | "NOT_FOUND" | "PAYLOAD_TOO_LARGE" | "INTERNAL_ERROR";

function sendError(res: Response, status: number, error: ErrorCode, message: string): void {
  res.status(status).json({ error, message, requestId: requestIdOf(res) });
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function createApp({
  store,
  profileStore = new MemoryProfileStore(),
  version = "dev",
  goalCalories = 2500,
  corsOrigin = "*",
  now = () => new Date(),
  logger = createJsonLogger(),
}: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  // Before express.json() so bad JSON still gets a request id.
  app.use(requestLog(logger));
  app.use(cors({ origin: corsOrigin, exposedHeaders: ["X-Request-Id"] }));
  app.use(express.json({ limit: "10kb" }));

  app.get("/health", async (_req, res) => {
    const uptimeSec = Math.floor(process.uptime());
    let dbOk = false;
    try {
      dbOk = await store.ping();
    } catch {
      dbOk = false;
    }
    // 503 when storage is down so uptime monitors count it as an outage.
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "ok" : "down",
      version,
      uptimeSec,
    });
  });

  app.get("/meals", async (req, res) => {
    const day = parseDay(req.query.date, now());
    if (!day) return sendError(res, 400, "VALIDATION_ERROR", "date must be a real date in YYYY-MM-DD format");
    res.json(await store.listBetween(day.start, day.end));
  });

  app.post("/meals", async (req, res) => {
    const result = validateNewMeal(req.body, now());
    if (!result.ok) return sendError(res, 400, "VALIDATION_ERROR", result.message);
    res.status(201).json(await store.create(result.value));
  });

  app.delete("/meals/:id", async (req, res) => {
    const { id } = req.params;
    const numericId = /^\d+$/.test(id) ? Number(id) : NaN;
    const deleted = Number.isSafeInteger(numericId) && (await store.delete(numericId));
    if (!deleted) return sendError(res, 404, "NOT_FOUND", `meal ${id} not found`);
    res.status(204).end();
  });

  app.get("/profile", async (_req, res) => {
    const profile = await profileStore.get();
    if (!profile) return sendError(res, 404, "NOT_FOUND", "no profile saved yet");
    res.json(profile);
  });

  app.put("/profile", async (req, res) => {
    const result = validateProfile(req.body);
    if (!result.ok) return sendError(res, 400, "VALIDATION_ERROR", result.message);
    res.json(await profileStore.save({ ...result.value, updatedAt: toIsoUtc(now()) }));
  });

  app.get("/summary/daily", async (req, res) => {
    const day = parseDay(req.query.date, now());
    if (!day) return sendError(res, 400, "VALIDATION_ERROR", "date must be a real date in YYYY-MM-DD format");

    const [meals, profile] = await Promise.all([store.listBetween(day.start, day.end), profileStore.get()]);
    const goal = profile?.dailyCalorieGoal ?? goalCalories;
    const totals = meals.reduce(
      (sum, meal) => ({
        calories: sum.calories + meal.calories,
        proteinG: sum.proteinG + meal.proteinG,
        carbsG: sum.carbsG + meal.carbsG,
        fatG: sum.fatG + meal.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    res.json({
      date: day.date,
      calories: totals.calories,
      proteinG: roundToTenth(totals.proteinG),
      carbsG: roundToTenth(totals.carbsG),
      fatG: roundToTenth(totals.fatG),
      goalCalories: goal,
      // Goes negative when the user is over their goal. The web app can show "over by X".
      remainingCalories: goal - totals.calories,
      mealCount: meals.length,
    });
  });

  app.use((req, res) => {
    sendError(res, 404, "NOT_FOUND", `no route for ${req.method} ${req.path}`);
  });

  const handleErrors: ErrorRequestHandler = (err, req, res, _next) => {
    const type = (err as { type?: string }).type;
    if (type === "entity.parse.failed") {
      return sendError(res, 400, "VALIDATION_ERROR", "request body is not valid JSON");
    }
    if (type === "entity.too.large") {
      return sendError(res, 413, "PAYLOAD_TOO_LARGE", "request body is too large");
    }
    logger({
      level: "error",
      msg: "unhandled error",
      requestId: requestIdOf(res),
      method: req.method,
      path: req.path,
      error: describeError(err),
    });
    sendError(res, 500, "INTERNAL_ERROR", "something went wrong");
  };
  app.use(handleErrors);

  return app;
}
