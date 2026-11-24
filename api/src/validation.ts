import { toIsoUtc } from "./dates.js";
import {
  FITNESS_LEVELS,
  GOALS,
  MAX_CALORIE_GOAL,
  MAX_WORKOUT_DAYS,
  MEAL_TYPES,
  MIN_CALORIE_GOAL,
  type FitnessLevel,
  type Goal,
  type MealType,
  type NewMeal,
  type ProfileInput,
} from "./types.js";

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };
export type ValidationResult = Result<NewMeal>;

const NAME_MAX = 200;
// Matches NUMERIC(6,1) in the meals table.
const MACRO_MAX = 99999.9;
// Requires a timezone so "8am" never depends on where the server runs.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isMealType(value: unknown): value is MealType {
  return typeof value === "string" && (MEAL_TYPES as readonly string[]).includes(value);
}

function readMacro(body: Record<string, unknown>, field: string): number | string {
  const value = body[field];
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MACRO_MAX) {
    return `${field} must be a number between 0 and ${MACRO_MAX}`;
  }
  // The database keeps one decimal place, so store it the same way now.
  return Math.round(value * 10) / 10;
}

/**
 * Checks a POST /meals body against CONTRACT.md and fills in defaults.
 * Unknown fields (including a client-sent id) are ignored.
 */
export function validateNewMeal(body: unknown, now: Date = new Date()): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail("request body must be a JSON object");
  }
  const input = body as Record<string, unknown>;

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "") return fail("name is required");
  if (name.length > NAME_MAX) return fail(`name must be ${NAME_MAX} characters or fewer`);

  if (!isMealType(input.mealType)) {
    return fail(`mealType must be one of ${MEAL_TYPES.join(", ")}`);
  }

  const { calories } = input;
  if (typeof calories !== "number" || !Number.isFinite(calories) || calories < 0) {
    return fail("calories must be a number >= 0");
  }
  if (!Number.isInteger(calories)) return fail("calories must be a whole number");

  const proteinG = readMacro(input, "proteinG");
  if (typeof proteinG === "string") return fail(proteinG);
  const carbsG = readMacro(input, "carbsG");
  if (typeof carbsG === "string") return fail(carbsG);
  const fatG = readMacro(input, "fatG");
  if (typeof fatG === "string") return fail(fatG);

  let eatenAt: string;
  if (input.eatenAt === undefined) {
    eatenAt = toIsoUtc(now);
  } else {
    const raw = input.eatenAt;
    const parsed = typeof raw === "string" && ISO_TIMESTAMP_RE.test(raw) ? new Date(raw) : null;
    if (parsed === null || Number.isNaN(parsed.getTime())) {
      return fail("eatenAt must be an ISO 8601 timestamp with a timezone, e.g. 2026-10-26T08:00:00Z");
    }
    eatenAt = toIsoUtc(parsed);
  }

  return {
    ok: true,
    value: { name, mealType: input.mealType, calories, proteinG, carbsG, fatG, eatenAt },
  };
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

function isWholeNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** PUT replaces the whole profile, so all four fields are required. Unknown fields are dropped. */
export function validateProfile(body: unknown): Result<ProfileInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail("request body must be a JSON object");
  }
  const input = body as Record<string, unknown>;

  if (!isOneOf<Goal>(GOALS, input.goal)) {
    return fail(`goal must be one of ${GOALS.join(", ")}`);
  }
  if (!isOneOf<FitnessLevel>(FITNESS_LEVELS, input.fitnessLevel)) {
    return fail(`fitnessLevel must be one of ${FITNESS_LEVELS.join(", ")}`);
  }
  if (!isWholeNumberInRange(input.dailyCalorieGoal, MIN_CALORIE_GOAL, MAX_CALORIE_GOAL)) {
    return fail(`dailyCalorieGoal must be a whole number from ${MIN_CALORIE_GOAL} to ${MAX_CALORIE_GOAL}`);
  }
  if (!isWholeNumberInRange(input.workoutDaysPerWeek, 0, MAX_WORKOUT_DAYS)) {
    return fail(`workoutDaysPerWeek must be a whole number from 0 to ${MAX_WORKOUT_DAYS}`);
  }

  return {
    ok: true,
    value: {
      goal: input.goal,
      fitnessLevel: input.fitnessLevel,
      dailyCalorieGoal: input.dailyCalorieGoal,
      workoutDaysPerWeek: input.workoutDaysPerWeek,
    },
  };
}
