"use client";

import { useEffect, useState } from "react";
import MealForm from "./MealForm";
import {
  dailySummary as sampleSummary,
  meals as sampleMeals,
  type DailySummary,
  type Meal,
} from "@/lib/fixtures";
import {
  createMeal,
  deleteMeal,
  errorMessage,
  fetchDailySummary,
  fetchMeals,
  getApiUrl,
  summarize,
  type NewMeal,
} from "@/lib/api";

// demo:    no API configured, sample meals, changes stay in the browser
// loading: waiting for the API
// live:    reading from and saving to the API
// offline: API configured but unreachable, falls back to demo behaviour
type Mode = "demo" | "loading" | "live" | "offline";

const nextId = (meals: Meal[]) =>
  meals.reduce((max, meal) => Math.max(max, meal.id), 0) + 1;

const cardClass = "mb-8 rounded-xl border border-gray-700 bg-gray-900 p-6";

export default function Dashboard() {
  const [apiUrl] = useState(getApiUrl);
  const [mode, setMode] = useState<Mode>(apiUrl ? "loading" : "demo");
  const [meals, setMeals] = useState<Meal[]>(apiUrl ? [] : sampleMeals);
  const [liveSummary, setLiveSummary] = useState<DailySummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiUrl) return;

    let cancelled = false;
    Promise.all([fetchMeals(apiUrl), fetchDailySummary(apiUrl)])
      .then(([loadedMeals, loadedSummary]) => {
        if (cancelled) return;
        setMeals(loadedMeals);
        setLiveSummary(loadedSummary);
        setMode("live");
      })
      .catch(() => {
        if (cancelled) return;
        setMeals(sampleMeals);
        setMode("offline");
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  async function refresh(url: string) {
    const [loadedMeals, loadedSummary] = await Promise.all([
      fetchMeals(url),
      fetchDailySummary(url),
    ]);
    setMeals(loadedMeals);
    setLiveSummary(loadedSummary);
  }

  // Errors are left to MealForm, which shows them under the form.
  async function handleAdd(meal: NewMeal) {
    setActionError(null);
    if (mode === "live") {
      await createMeal(apiUrl!, meal);
      await refresh(apiUrl!);
      return;
    }
    setMeals((current) => [
      ...current,
      { ...meal, id: nextId(current), eatenAt: new Date().toISOString() },
    ]);
  }

  async function handleDelete(id: number) {
    setActionError(null);
    if (mode !== "live") {
      setMeals((current) => current.filter((meal) => meal.id !== id));
      return;
    }
    try {
      await deleteMeal(apiUrl!, id);
      await refresh(apiUrl!);
    } catch (err) {
      setActionError(errorMessage(err, "Could not delete the meal. Try again."));
    }
  }

  if (mode === "loading") {
    return (
      <p role="status" data-testid="data-status" className="text-gray-300">
        Loading today&apos;s meals…
      </p>
    );
  }

  const summary = liveSummary ?? summarize(meals, sampleSummary.date);
  const progress =
    summary.goalCalories > 0
      ? Math.min((summary.calories / summary.goalCalories) * 100, 100)
      : 0;
  const overGoal = summary.remainingCalories < 0;

  return (
    <>
      {mode === "demo" && (
        <p
          role="status"
          data-testid="data-status"
          className="mb-6 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-300"
        >
          Demo mode: showing sample meals. Changes are not saved.
        </p>
      )}

      {mode === "offline" && (
        <p
          role="status"
          data-testid="data-status"
          className="mb-6 rounded-lg border border-yellow-700 bg-yellow-950 px-4 py-3 text-sm text-yellow-200"
        >
          Could not reach the server, so you are seeing sample meals. Changes
          are not saved.
        </p>
      )}

      {/* Daily Summary */}
      <section className={cardClass}>
        <h2 className="mb-6 text-2xl font-semibold">Daily Nutrition Summary</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-800 p-5">
            <p className="text-sm text-gray-400">Calories Consumed</p>
            <p
              data-testid="stat-calories-consumed"
              className="mt-2 text-3xl font-bold text-green-400"
            >
              {summary.calories}
            </p>
          </div>

          <div className="rounded-lg bg-gray-800 p-5">
            <p className="text-sm text-gray-400">Daily Goal</p>
            <p data-testid="stat-daily-goal" className="mt-2 text-3xl font-bold">
              {summary.goalCalories}
            </p>
          </div>

          <div className="rounded-lg bg-gray-800 p-5">
            <p className="text-sm text-gray-400">Remaining Calories</p>
            <p
              data-testid="stat-remaining-calories"
              className={`mt-2 text-3xl font-bold ${overGoal ? "text-red-400" : "text-green-400"}`}
            >
              {summary.remainingCalories}
            </p>
          </div>
        </div>

        {/* Calorie Progress */}
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-sm">
            <span>Daily Progress</span>
            <span data-testid="stat-progress">{progress.toFixed(0)}%</span>
          </div>

          <div className="h-3 rounded-full bg-gray-700">
            <div
              className="h-3 rounded-full bg-green-400"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Macronutrients */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-gray-400">Protein</p>
            <p data-testid="stat-protein" className="text-xl font-semibold">
              {summary.proteinG} g
            </p>
          </div>

          <div>
            <p className="text-gray-400">Carbs</p>
            <p data-testid="stat-carbs" className="text-xl font-semibold">
              {summary.carbsG} g
            </p>
          </div>

          <div>
            <p className="text-gray-400">Fat</p>
            <p data-testid="stat-fat" className="text-xl font-semibold">
              {summary.fatG} g
            </p>
          </div>
        </div>
      </section>

      {/* Log a Meal */}
      <section className={cardClass}>
        <h2 className="mb-5 text-2xl font-semibold">Log a Meal</h2>
        <MealForm onSubmit={handleAdd} />
      </section>

      {/* Today's Meals */}
      <section className="rounded-xl border border-gray-700 bg-gray-900 p-6">
        <h2 className="mb-5 text-2xl font-semibold">Today&apos;s Meals</h2>

        {actionError && (
          <p role="alert" data-testid="meal-list-error" className="mb-4 text-sm text-red-400">
            {actionError}
          </p>
        )}

        {meals.length === 0 ? (
          <p data-testid="meal-list-empty" className="text-gray-400">
            No meals logged yet today.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="meal-list">
            {meals.map((meal) => (
              <li
                key={meal.id}
                data-testid="meal-item"
                className="flex items-center justify-between gap-4 rounded-lg bg-gray-800 p-4"
              >
                <div>
                  <h3 className="font-semibold">{meal.name}</h3>
                  <p className="text-sm capitalize text-gray-400">{meal.mealType}</p>
                </div>

                <div className="flex items-center gap-4">
                  <p className="font-semibold text-green-400">{meal.calories} kcal</p>
                  <button
                    type="button"
                    aria-label={`Delete ${meal.name}`}
                    onClick={() => handleDelete(meal.id)}
                    className="rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-gray-700 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
