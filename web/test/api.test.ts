import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createMeal,
  deleteMeal,
  errorMessage,
  fetchDailySummary,
  fetchMeals,
  getApiUrl,
  summarize,
} from "../lib/api";
import { dailySummary, meals } from "../lib/fixtures";
import { API_URL, jsonResponse, noContentResponse } from "./helpers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getApiUrl", () => {
  it("returns null when NEXT_PUBLIC_API_URL is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    expect(getApiUrl()).toBeNull();
  });

  it("returns the URL without trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com//");
    expect(getApiUrl()).toBe("https://api.example.com");
  });
});

describe("summarize", () => {
  it("matches the sample daily summary for the sample meals", () => {
    expect(summarize(meals, dailySummary.date)).toEqual(dailySummary);
  });

  it("returns zeros for a day with no meals", () => {
    const summary = summarize([], "2026-11-07");
    expect(summary.calories).toBe(0);
    expect(summary.remainingCalories).toBe(2500);
    expect(summary.mealCount).toBe(0);
  });

  it("rounds macros to one decimal place and uses a custom goal", () => {
    const halfGrams = [
      { ...meals[0], proteinG: 0.1 },
      { ...meals[1], proteinG: 0.2 },
    ];
    const summary = summarize(halfGrams, "2026-11-07", 1000);
    expect(summary.proteinG).toBe(0.3);
    expect(summary.goalCalories).toBe(1000);
    expect(summary.remainingCalories).toBe(1000 - 970);
  });
});

describe("errorMessage", () => {
  it("uses the error's message", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("falls back for non-Error values and empty messages", () => {
    expect(errorMessage("oops", "fallback")).toBe("fallback");
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
  });
});

describe("API requests", () => {
  it("fetches meals and the daily summary", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/meals") ? jsonResponse(meals) : jsonResponse(dailySummary)
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMeals(API_URL)).resolves.toEqual(meals);
    await expect(fetchDailySummary(API_URL)).resolves.toEqual(dailySummary);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/meals`, undefined);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/summary/daily`, undefined);
  });

  it("posts a new meal as JSON", async () => {
    const created = { ...meals[0], id: 4 };
    const fetchMock = vi.fn(async () => jsonResponse(created, 201));
    vi.stubGlobal("fetch", fetchMock);

    const { id: _id, eatenAt: _eatenAt, ...newMeal } = meals[0];
    await expect(createMeal(API_URL, newMeal)).resolves.toEqual(created);

    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/meals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMeal),
    });
  });

  it("deletes a meal and handles the empty 204 response", async () => {
    const fetchMock = vi.fn(async () => noContentResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteMeal(API_URL, 4)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/meals/4`, { method: "DELETE" });
  });

  it("throws the API's error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "VALIDATION_ERROR", message: "calories must be a number >= 0" }, 400)
      )
    );

    const error = await createMeal(API_URL, {
      name: "Bad",
      mealType: "snack",
      calories: -1,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("calories must be a number >= 0");
    expect((error as ApiError).status).toBe(400);
  });

  it("uses a default message when the error has no message field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "NOT_FOUND" }, 404)));
    await expect(deleteMeal(API_URL, 99)).rejects.toThrow("Request failed (404)");
  });

  it("uses a default message when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }))
    );
    await expect(fetchMeals(API_URL)).rejects.toThrow("Request failed (500)");
  });
});
