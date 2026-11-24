import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Home from "../app/page";
import { meals, type Meal } from "../lib/fixtures";
import { PROFILE_STORAGE_KEY, type Profile } from "../lib/profile";
import { API_URL, installFakeApi } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
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

function saveProfileInBrowser(dailyCalorieGoal: number) {
  const profile: Profile = {
    goal: "cut",
    fitnessLevel: "beginner",
    dailyCalorieGoal,
    workoutDaysPerWeek: 3,
  };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
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
    expect(screen.getByText(`${meals.length} meals`)).toBeInTheDocument();
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

  it("flags remaining calories once over the goal", async () => {
    render(<Home />);
    expect(stat("remaining-calories")).toHaveAttribute("data-over-goal", "false");

    logMeal("Big feast", "2000");

    await waitFor(() => expect(stat("remaining-calories")).toHaveTextContent("-650"));
    expect(stat("remaining-calories")).toHaveAttribute("data-over-goal", "true");
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

describe("dashboard with a saved profile", () => {
  it("links to the profile page to set a goal", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: "Set your goal" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("uses the daily goal from the saved profile", () => {
    saveProfileInBrowser(2300);
    render(<Home />);

    expect(stat("daily-goal")).toHaveTextContent("2300");
    expect(stat("remaining-calories")).toHaveTextContent("1150");
    expect(stat("progress")).toHaveTextContent("50%");
    expect(screen.getByRole("link", { name: "Edit goal" })).toHaveAttribute("href", "/profile");
  });

  it("updates when the profile is changed in another tab", async () => {
    render(<Home />);
    expect(stat("daily-goal")).toHaveTextContent("2500");

    saveProfileInBrowser(2300);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: PROFILE_STORAGE_KEY }));
    });

    await waitFor(() => expect(stat("daily-goal")).toHaveTextContent("2300"));
  });

  it("uses the profile goal instead of the API's default goal", async () => {
    useLiveApi();
    installFakeApi([yogurt]);
    saveProfileInBrowser(2000);
    render(<Home />);
    await screen.findByText("Greek yogurt");

    expect(stat("daily-goal")).toHaveTextContent("2000");
    expect(stat("remaining-calories")).toHaveTextContent("1850");
  });
});

describe("dashboard connected to the API", () => {
  it("shows a loading message, then the meals from the API", async () => {
    useLiveApi();
    installFakeApi([yogurt]);
    render(<Home />);

    expect(screen.getByTestId("data-status")).toHaveTextContent("Loading");

    expect(await screen.findByText("Greek yogurt")).toBeInTheDocument();
    expect(screen.getByText("1 meal")).toBeInTheDocument();
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

  it("does not report a saved meal as failed when the refresh after saving fails", async () => {
    useLiveApi();
    const fetchMock = installFakeApi([yogurt]);
    render(<Home />);
    await screen.findByText("Greek yogurt");

    // From now on the save works, but reloading the list fails.
    const realFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if ((init?.method ?? "GET") === "GET") throw new TypeError("Failed to fetch");
      return realFetch(input, init);
    });

    logMeal("Apple", "95");

    expect(await screen.findByTestId("meal-list-error")).toHaveTextContent("Meal saved");
    expect(screen.queryByTestId("meal-form-error")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Meal name")).toHaveValue(""));
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
  });

  it("does not report a deleted meal as failed when the refresh after deleting fails", async () => {
    useLiveApi();
    const fetchMock = installFakeApi([yogurt]);
    render(<Home />);
    await screen.findByText("Greek yogurt");

    const realFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if ((init?.method ?? "GET") === "GET") throw new TypeError("Failed to fetch");
      return realFetch(input, init);
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete Greek yogurt" }));

    expect(await screen.findByTestId("meal-list-error")).toHaveTextContent("Meal deleted");
  });

  it("ignores an older refresh that finishes after a newer one", async () => {
    useLiveApi();
    const fetchMock = installFakeApi([yogurt]);
    render(<Home />);
    await screen.findByText("Greek yogurt");

    // Hold every reload. Each one remembers what the server had when it was
    // sent, and the test decides the order the answers arrive in.
    const held: (() => void)[] = [];
    const realFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => {
      const response = realFetch(input, init);
      if ((init?.method ?? "GET") !== "GET") return response;
      return new Promise((resolve) => held.push(() => resolve(response)));
    });

    // 1. Delete the yogurt. Its reload sees no meals.
    fireEvent.click(screen.getByRole("button", { name: "Delete Greek yogurt" }));
    await waitFor(() => expect(held).toHaveLength(2));

    // 2. Add an apple. Its reload sees the apple.
    logMeal("Apple", "95");
    await waitFor(() => expect(held).toHaveLength(4));

    // The newer reload answers first, then the older one arrives late.
    held.slice(2).forEach((release) => release());
    expect(await screen.findByText("Apple")).toBeInTheDocument();
    held.slice(0, 2).forEach((release) => release());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.queryByText("Greek yogurt")).not.toBeInTheDocument();
    expect(stat("calories-consumed")).toHaveTextContent("95");
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