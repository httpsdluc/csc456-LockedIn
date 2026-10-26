import cors from "cors";
import express, { type ErrorRequestHandler, type Express, type Response } from "express";
import { parseDay } from "./dates.js";
import type { MealStore } from "./store.js";
import { validateNewMeal } from "./validation.js";

export interface AppOptions {
  store: MealStore;
  /** Short git SHA of the running build. /health reports it. */
  version?: string;
  /** Hardcoded until user profiles exist (see CONTRACT.md). */
  goalCalories?: number;
  /** Allowed browser origin for the web app. Defaults to any origin. */
  corsOrigin?: string;
  /** Injected so tests can pin "today". */
  now?: () => Date;
}

type ErrorCode = "VALIDATION_ERROR" | "NOT_FOUND" | "PAYLOAD_TOO_LARGE" | "INTERNAL_ERROR";

function sendError(res: Response, status: number, error: ErrorCode, message: string): void {
  res.status(status).json({ error, message });
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function createApp({
  store,
  version = "dev",
  goalCalories = 2500,
  corsOrigin = "*",
  now = () => new Date(),
}: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: corsOrigin }));
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

  app.get("/summary/daily", async (req, res) => {
    const day = parseDay(req.query.date, now());
    if (!day) return sendError(res, 400, "VALIDATION_ERROR", "date must be a real date in YYYY-MM-DD format");

    const meals = await store.listBetween(day.start, day.end);
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
      goalCalories,
      // Goes negative when the user is over their goal. The web app can show "over by X".
      remainingCalories: goalCalories - totals.calories,
      mealCount: meals.length,
    });
  });

  app.use((req, res) => {
    sendError(res, 404, "NOT_FOUND", `no route for ${req.method} ${req.path}`);
  });

  const handleErrors: ErrorRequestHandler = (err, _req, res, _next) => {
    const type = (err as { type?: string }).type;
    if (type === "entity.parse.failed") {
      return sendError(res, 400, "VALIDATION_ERROR", "request body is not valid JSON");
    }
    if (type === "entity.too.large") {
      return sendError(res, 413, "PAYLOAD_TOO_LARGE", "request body is too large");
    }
    console.error(err);
    sendError(res, 500, "INTERNAL_ERROR", "something went wrong");
  };
  app.use(handleErrors);

  return app;
}
