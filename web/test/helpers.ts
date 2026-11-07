import { vi } from "vitest";
import type { Meal } from "../lib/fixtures";
import { summarize } from "../lib/api";

export const API_URL = "http://api.test";

export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

export function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    json: async () => {
      throw new Error("no body");
    },
  } as unknown as Response;
}

type FakeApiOptions = {
  goalCalories?: number;
  postError?: { status: number; body: unknown };
  deleteError?: { status: number; body: unknown };
};

// A small in-memory version of the API in CONTRACT.md, installed as fetch.
export function installFakeApi(initialMeals: Meal[], options: FakeApiOptions = {}) {
  let serverMeals = [...initialMeals];
  let nextId = 100;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === `${API_URL}/meals` && method === "GET") {
      return jsonResponse(serverMeals);
    }

    if (url === `${API_URL}/summary/daily` && method === "GET") {
      return jsonResponse(summarize(serverMeals, "2026-11-07", options.goalCalories));
    }

    if (url === `${API_URL}/meals` && method === "POST") {
      if (options.postError) {
        return jsonResponse(options.postError.body, options.postError.status);
      }
      const meal: Meal = {
        ...JSON.parse(String(init?.body)),
        id: nextId++,
        eatenAt: "2026-11-07T12:00:00Z",
      };
      serverMeals = [...serverMeals, meal];
      return jsonResponse(meal, 201);
    }

    if (url.startsWith(`${API_URL}/meals/`) && method === "DELETE") {
      if (options.deleteError) {
        return jsonResponse(options.deleteError.body, options.deleteError.status);
      }
      const id = Number(url.split("/").pop());
      serverMeals = serverMeals.filter((meal) => meal.id !== id);
      return noContentResponse();
    }

    throw new Error(`Unexpected request: ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
