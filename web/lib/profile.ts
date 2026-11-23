import { useMemo, useSyncExternalStore } from "react";

// The user's profile: what the dashboard and, later, the AI workout plans use.
// The API has no profile endpoint yet (CONTRACT.md: "User profiles ... come in a
// later sprint"), so it is saved in this browser until one exists.

export const GOALS = ["cut", "maintain", "bulk"] as const;
export type Goal = (typeof GOALS)[number];

export const GOAL_LABELS: Record<Goal, string> = {
  cut: "Lose fat (cut)",
  maintain: "Maintain",
  bulk: "Build muscle (bulk)",
};

export const FITNESS_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];

export type Profile = {
  goal: Goal;
  fitnessLevel: FitnessLevel;
  dailyCalorieGoal: number;
  workoutDaysPerWeek: number;
};

export const DEFAULT_PROFILE: Profile = {
  goal: "maintain",
  fitnessLevel: "beginner",
  dailyCalorieGoal: 2500,
  workoutDaysPerWeek: 3,
};

// Guards against typos (an extra or missing zero), not a recommendation.
export const MIN_CALORIE_GOAL = 1000;
export const MAX_CALORIE_GOAL = 6000;

export const PROFILE_STORAGE_KEY = "lockedin.profile";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type ProfileFormValues = {
  goal: Goal;
  fitnessLevel: FitnessLevel;
  dailyCalorieGoal: string;
  workoutDaysPerWeek: string;
};

const isWholeNumberInRange = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

// Checks the profile form. Returns the profile to save, or an error to show.
export function validateProfileForm(values: ProfileFormValues): Profile | string {
  const calories = values.dailyCalorieGoal.trim() === "" ? NaN : Number(values.dailyCalorieGoal);
  if (!isWholeNumberInRange(calories, MIN_CALORIE_GOAL, MAX_CALORIE_GOAL)) {
    return `Daily calorie goal must be a whole number from ${MIN_CALORIE_GOAL} to ${MAX_CALORIE_GOAL}.`;
  }

  const days = values.workoutDaysPerWeek.trim() === "" ? NaN : Number(values.workoutDaysPerWeek);
  if (!isWholeNumberInRange(days, 0, 7)) {
    return "Workout days per week must be a whole number from 0 to 7.";
  }

  return {
    goal: values.goal,
    fitnessLevel: values.fitnessLevel,
    dailyCalorieGoal: calories,
    workoutDaysPerWeek: days,
  };
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    GOALS.includes(profile.goal as Goal) &&
    FITNESS_LEVELS.includes(profile.fitnessLevel as FitnessLevel) &&
    isWholeNumberInRange(profile.dailyCalorieGoal, MIN_CALORIE_GOAL, MAX_CALORIE_GOAL) &&
    isWholeNumberInRange(profile.workoutDaysPerWeek, 0, 7)
  );
}

const browserStorage = () =>
  (globalThis as { localStorage?: StorageLike }).localStorage;

// Reading storage can throw (for example when the browser blocks site data),
// so every access is wrapped and treated as "no saved profile".
export function readSavedProfile(storage?: StorageLike): string | null {
  try {
    return (storage ?? browserStorage())?.getItem(PROFILE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function parseProfile(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Returns false when the profile could not be saved.
export function saveProfile(profile: Profile, storage?: StorageLike): boolean {
  try {
    const store = storage ?? browserStorage();
    if (!store) return false;
    store.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  // "storage" fires when another tab changes the profile.
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const readNothingOnServer = () => null;

// The saved profile, or null if there isn't one. Reads nothing during
// server rendering, so the page never shows a mismatch while loading.
export function useSavedProfile(): Profile | null {
  const raw = useSyncExternalStore(subscribe, readSavedProfile, readNothingOnServer);
  return useMemo(() => parseProfile(raw), [raw]);
}