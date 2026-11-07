import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Home from "../app/page";
import { meals, type Meal } from "../lib/fixtures";
import { API_URL, installFakeApi } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const stat = (id: string) => screen.getByTestId(`stat-${id}`);

function logMeal(name: string, calories: string) {
  fireEvent.change(screen.getByLabelText("Meal name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Calories"), { target: { value: calories } });
  fireEvent.click(screen.getByRole("button", { name: "Add meal" }));
}

function useLiveApi() {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API_URL);
}

const yogurt: Meal = {
  id: 7,
  name: "Greek yogurt",
  mealType: "snack",
  calories: 150,
  proteinG: 15,
  carbsG: 10,
  fatG: 4,
  eatenAt: "2026-11-07T10:00:00Z",
};

describe("dashboard in demo mode (no API configured)", () => {
  it("says it is showing sample meals", () => {
    render(<Home />);
    expect(screen.getByTestId("data-status")).toHaveTextContent("Demo mode");
    expect(screen.getAllByTestId("meal-item")).toHaveLength(meals.length);
  });

  it("adds a logged meal and updates the totals", async () => {
    render(<Home />);
    logMeal("Apple", "200");

    expect(await screen.findByText("Apple")).toBeInTheDocument();
    expect(screen.getAllByTestId("meal-item")).toHaveLength(meals.length + 1);
    expect(stat("calories-consumed")).toHaveTextContent("1350");
    expect(stat("remaining-calories")).toHaveTextContent("1150");
    expect(stat("progress")).toHaveTextContent("54%");
  });

  it("shows remaining calories in red once over the goal", async () => {
    render(<Home />);
    logMeal("Big feast", "2000");

    await waitFor(() => expect(stat("remaining-calories")).toHaveTextContent("-650"));
    expect(stat("remaining-calories")).toHaveClass("text-red-400");
    expect(stat("progress")).toHaveTextContent("100%");
  });

  it("deletes meals and shows the empty state", async () => {
    render(<Home />);

    for (const meal of meals) {
      fireEvent.click(screen.getByRole("button", { name: `Delete ${meal.name}` }));
    }

    expect(await screen.findByTestId("meal-list-empty")).toHaveTextContent(
      "No meals logged yet today."
    );
    expect(stat("calories-consumed")).toHaveTextContent("0");
    expect(stat("progress")).toHaveTextContent("0%");
  });
});

describe("dashboard connected to the API", () => {
  it("shows a loading message, then the meals from the API", async () => {
    useLiveApi();
    installFakeApi([yogurt]);
    render(<Home />);

    expect(screen.getByTestId("data-status")).toHaveTextContent("Loading");

    expect(await screen.findByText("Greek yogurt")).toBeInTheDocument();
    expect(screen.queryByTestId("data-status")).not.toBeInTheDocument();
    expect(stat("calories-consumed")).toHaveTextContent("150");
    expect(stat("daily-goal")).toHaveTextContent("2500");
  });

  it("saves a new meal to the API and refreshes the totals", async () => {
    useLiveApi();
    const fetchMock = installFakeApi([yogurt]);
    render(<Home />);
    await screen.findByText("Greek yogurt");

    logMeal("Apple", "95");

    expect(await screen.findByText("Apple")).toBeInTheDocument();
    await waitFor(() => expect(stat("calories-consumed")).toHaveTextContent("245"));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/meals`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows the API's validation error when saving fails", async () => {
    useLiveApi();
    installFakeApi([yogurt], {
      postError: {
        status: 400,
        body: { error: "VALIDATION_ERROR", message: "calories must be a number >= 0" },
      },
    });
    render(<Home />);
    await screen.findByText("Greek yogurt");

    logMeal("Apple", "95");

    expect(await screen.findByTestId("meal-form-error")).toHaveTextContent(
      "calories must be a number >= 0"
    );
    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
  });

  it("deletes a meal through the API", async () => {
    useLiveApi();
    const fetchMock = installFakeApi([yogurt]);
    render(<Home />);
    await screen.findByText("Greek yogurt");

    fireEvent.click(screen.getByRole("button", { name: "Delete Greek yogurt" }));

    expect(await screen.findByTestId("meal-list-empty")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/meals/7`, { method: "DELETE" });
  });

  it("shows an error when deleting fails", async () => {
    useLiveApi();
    installFakeApi([yogurt], {
      deleteError: { status: 404, body: { error: "NOT_FOUND", message: "meal 7 not found" } },
    });
    render(<Home />);
    await screen.findByText("Greek yogurt");

    fireEvent.click(screen.getByRole("button", { name: "Delete Greek yogurt" }));

    expect(await screen.findByTestId("meal-list-error")).toHaveTextContent("meal 7 not found");
    expect(within(screen.getByTestId("meal-list")).getByText("Greek yogurt")).toBeInTheDocument();
  });

  it("shows 0% progress when the goal is 0", async () => {
    useLiveApi();
    installFakeApi([yogurt], { goalCalories: 0 });
    render(<Home />);
    await screen.findByText("Greek yogurt");

    expect(stat("progress")).toHaveTextContent("0%");
    expect(stat("remaining-calories")).toHaveTextContent("-150");
  });

  it("falls back to sample meals when the API is unreachable", async () => {
    useLiveApi();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    render(<Home />);

    expect(await screen.findByText("Could not reach the server", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByTestId("meal-item")).toHaveLength(meals.length);

    // Offline changes stay in the browser instead of calling the API.
    logMeal("Apple", "95");
    expect(await screen.findByText("Apple")).toBeInTheDocument();
  });

  it("ignores a response that arrives after the page is closed", async () => {
    useLiveApi();
    const pending: (() => void)[] = [];
    const fetchMock = installFakeApi([yogurt]);
    const realFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(
      (input, init) =>
        new Promise((resolve) => {
          pending.push(() => resolve(realFetch(input, init)));
        })
    );

    const { unmount } = render(<Home />);
    unmount();
    pending.forEach((respond) => respond());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a failure that arrives after the page is closed", async () => {
    useLiveApi();
    const pending: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            pending.push(() => reject(new TypeError("Failed to fetch")));
          })
      )
    );

    const { unmount } = render(<Home />);
    unmount();
    pending.forEach((fail) => fail());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Could not reach the server", { exact: false })).not.toBeInTheDocument();
  });
});
