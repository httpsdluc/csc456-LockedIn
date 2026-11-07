import type { DailySummary, Meal, MealType } from "./fixtures";

// Hardcoded until user profiles exist (see CONTRACT.md, GET /summary/daily).
export const GOAL_CALORIES = 2500;

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

// What the web app sends to POST /meals. The server sets id and eatenAt.
export type NewMeal = Omit<Meal, "id" | "eatenAt">;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Base URL of the API, from NEXT_PUBLIC_API_URL. Returns null when it isn't
// set, which puts the dashboard in demo mode (sample meals, nothing saved).
export function getApiUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

// Same totals as GET /summary/daily, worked out in the browser.
// Used in demo and offline mode, when there is no API to ask.
export function summarize(
  meals: Meal[],
  date: string,
  goalCalories: number = GOAL_CALORIES
): DailySummary {
  const total = (key: "calories" | "proteinG" | "carbsG" | "fatG") =>
    roundToTenth(meals.reduce((sum, meal) => sum + meal[key], 0));

  const calories = total("calories");

  return {
    date,
    calories,
    proteinG: total("proteinG"),
    carbsG: total("carbsG"),
    fatG: total("fatG"),
    goalCalories,
    remainingCalories: goalCalories - calories,
    mealCount: meals.length,
  };
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, init);

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.message === "string") {
        message = body.message;
      }
    } catch {
      // The error response had no JSON body; keep the default message.
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export function fetchMeals(baseUrl: string): Promise<Meal[]> {
  return request<Meal[]>(baseUrl, "/meals");
}

export function fetchDailySummary(baseUrl: string): Promise<DailySummary> {
  return request<DailySummary>(baseUrl, "/summary/daily");
}

export function createMeal(baseUrl: string, meal: NewMeal): Promise<Meal> {
  return request<Meal>(baseUrl, "/meals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meal),
  });
}

export function deleteMeal(baseUrl: string, id: number): Promise<void> {
  return request<void>(baseUrl, `/meals/${id}`, { method: "DELETE" });
}
