"use client";

import { useEffect, useState } from "react";
import MealForm from "./MealForm";
import {
  dailySummary as sampleSummary,
  meals as sampleMeals,
  type DailySummary,
  type Meal,
  type MealType,
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

// Each macro keeps its colour everywhere it appears (bar, legend).
const MACROS = [
  { key: "proteinG", label: "Protein", kcalPerGram: 4, color: "#FF7A8A", testId: "stat-protein" },
  { key: "carbsG", label: "Carbs", kcalPerGram: 4, color: "#FFC15E", testId: "stat-carbs" },
  { key: "fatG", label: "Fat", kcalPerGram: 9, color: "#4FD1C5", testId: "stat-fat" },
] as const;

const MEAL_TYPE_STYLE: Record<MealType, string> = {
  breakfast: "bg-[#3A2F12] text-[#FFD889]",
  lunch: "bg-[#123634] text-[#7FE3D8]",
  dinner: "bg-[#2D2766] text-[#C7BEFF]",
  snack: "bg-[#3D1A26] text-[#FF9DB0]",
};

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ progress, overGoal }: { progress: number; overGoal: boolean }) {
  return (
    <div className="relative mx-auto h-48 w-48 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="#3A3670" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          stroke={overGoal ? "#FF7A7A" : "#8B7CFF"}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - progress / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          data-testid="stat-progress"
          className="text-5xl font-extrabold tabular-nums [font-family:var(--font-display)]"
        >
          {progress.toFixed(0)}%
        </span>
        <span className="mt-1 text-sm text-[#B9B6DA]">of daily goal</span>
      </div>
    </div>
  );
}

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
      <p role="status" data-testid="data-status" className="text-[#A9A7C9]">
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

  const macroCalories = MACROS.map((macro) => summary[macro.key] * macro.kcalPerGram);
  const macroTotal = macroCalories.reduce((sum, value) => sum + value, 0);

  return (
    <>
      {mode === "demo" && (
        <p
          role="status"
          data-testid="data-status"
          className="mb-6 text-sm text-[#A9A7C9]"
        >
          Demo mode: showing sample meals. Changes are not saved.
        </p>
      )}

      {mode === "offline" && (
        <p
          role="status"
          data-testid="data-status"
          className="mb-6 rounded-xl bg-[#3A2F12] px-4 py-3 text-sm text-[#FFD889]"
        >
          Could not reach the server, so you are seeing sample meals. Changes
          are not saved.
        </p>
      )}

      {/* Daily Summary */}
      <section
        aria-labelledby="summary-heading"
        className="mb-6 rounded-[28px] bg-[#23204A] p-6 ring-1 ring-[#3A3670] sm:p-8"
      >
        <h2
          id="summary-heading"
          className="mb-6 text-xl font-semibold [font-family:var(--font-display)]"
        >
          Daily Nutrition Summary
        </h2>

        <div className="grid items-center gap-8 md:grid-cols-[auto_1fr] md:gap-12">
          <ProgressRing progress={progress} overGoal={overGoal} />

          <div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-[#B9B6DA]">Calories Consumed</p>
                <p
                  data-testid="stat-calories-consumed"
                  className="mt-1 text-3xl font-extrabold tabular-nums [font-family:var(--font-display)]"
                >
                  {summary.calories}
                </p>
              </div>

              <div>
                <p className="text-sm text-[#B9B6DA]">Daily Goal</p>
                <p
                  data-testid="stat-daily-goal"
                  className="mt-1 text-3xl font-extrabold tabular-nums text-[#B9B6DA] [font-family:var(--font-display)]"
                >
                  {summary.goalCalories}
                </p>
              </div>

              <div>
                <p className="text-sm text-[#B9B6DA]">Remaining Calories</p>
                <p
                  data-testid="stat-remaining-calories"
                  data-over-goal={overGoal}
                  className={`mt-1 text-3xl font-extrabold tabular-nums [font-family:var(--font-display)] ${
                    overGoal ? "text-[#FF7A7A]" : "text-[#8B7CFF]"
                  }`}
                >
                  {summary.remainingCalories}
                </p>
              </div>
            </div>

            {/* Macronutrients: where today's calories came from */}
            <div className="mt-8">
              <div
                className="flex h-3 overflow-hidden rounded-full bg-[#3A3670]"
                aria-hidden="true"
              >
                {macroTotal > 0 &&
                  MACROS.map((macro, index) => (
                    <div
                      key={macro.key}
                      style={{
                        width: `${(macroCalories[index] / macroTotal) * 100}%`,
                        backgroundColor: macro.color,
                      }}
                    />
                  ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-4">
                {MACROS.map((macro) => (
                  <div key={macro.key}>
                    <p className="flex items-center gap-2 text-sm text-[#B9B6DA]">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: macro.color }}
                      />
                      {macro.label}
                    </p>
                    <p data-testid={macro.testId} className="mt-1 text-lg font-semibold tabular-nums">
                      {summary[macro.key]} g
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        {/* Log a Meal */}
        <section
          aria-labelledby="log-heading"
          className="rounded-[28px] bg-[#1B1A36] p-6 ring-1 ring-[#2E2B57] sm:p-8"
        >
          <h2
            id="log-heading"
            className="mb-5 text-xl font-semibold [font-family:var(--font-display)]"
          >
            Log a Meal
          </h2>
          <MealForm onSubmit={handleAdd} />
        </section>

        {/* Today's Meals */}
        <section
          aria-labelledby="meals-heading"
          className="rounded-[28px] bg-[#1B1A36] p-6 ring-1 ring-[#2E2B57] sm:p-8"
        >
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2
              id="meals-heading"
              className="text-xl font-semibold [font-family:var(--font-display)]"
            >
              Today&apos;s Meals
            </h2>
            <span className="text-sm text-[#A9A7C9]">
              {meals.length} {meals.length === 1 ? "meal" : "meals"}
            </span>
          </div>

          {actionError && (
            <p
              role="alert"
              data-testid="meal-list-error"
              className="mb-3 rounded-xl bg-[#3D1A26] px-4 py-3 text-sm text-[#FF9DB0]"
            >
              {actionError}
            </p>
          )}

          {meals.length === 0 ? (
            <p data-testid="meal-list-empty" className="py-8 text-center text-[#A9A7C9]">
              No meals logged yet today. Add one with the form to start your day&apos;s total.
            </p>
          ) : (
            <ul className="divide-y divide-[#2E2B57]" data-testid="meal-list">
              {meals.map((meal) => (
                <li
                  key={meal.id}
                  data-testid="meal-item"
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{meal.name}</h3>
                    <p
                      className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${MEAL_TYPE_STYLE[meal.mealType]}`}
                    >
                      {meal.mealType}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-semibold tabular-nums">{meal.calories} kcal</p>
                    <button
                      type="button"
                      aria-label={`Delete ${meal.name}`}
                      onClick={() => handleDelete(meal.id)}
                      className="rounded-lg px-2 py-1 text-sm text-[#A9A7C9] hover:bg-[#3D1A26] hover:text-[#FF9DB0] focus-visible:outline-2 focus-visible:outline-[#8B7CFF]"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}