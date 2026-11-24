import type { Profile } from "./profile";
import { request } from "./api";

export type WorkoutPlan = {
  sessions: { title: string; exercises: { name: string; sets: number; target: string }[] }[];
};

export const EQUIPMENT = {
  bodyweight: "Bodyweight only",
  dumbbells: "Dumbbells",
  gym: "Gym equipment",
} as const;
export type Equipment = keyof typeof EQUIPMENT;

export const CHECK_IN_RESULTS = {
  completed: "Completed · about right",
  too_easy: "Completed · too easy",
  too_hard: "Completed · too hard",
  skipped: "Skipped",
  schedule_conflict: "Skipped · schedule conflict",
} as const;
export type CheckIn = {
  week: string;
  session: number;
  result: keyof typeof CHECK_IN_RESULTS;
};

export type WorkoutProfile = Pick<Profile, "goal" | "fitnessLevel" | "workoutDaysPerWeek"> & {
  equipment: Equipment;
};
export type WorkoutReview =
  | { action: "keep_plan"; plan: null }
  | { action: "adjust_schedule" | "reduce_volume" | "increase_volume"; plan: WorkoutPlan };

export const TRAINING_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function trainingWeek(now: Date): string {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
    now.getUTCDate() - (now.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export function generateWorkout(baseUrl: string, profile: WorkoutProfile): Promise<WorkoutPlan> {
  return request(baseUrl, "/workouts/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export function reviewWorkout(
  baseUrl: string, profile: WorkoutProfile, plan: WorkoutPlan, checkIns: CheckIn[]
): Promise<WorkoutReview> {
  return request(baseUrl, "/workouts/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...profile, plan, checkIns }),
  });
}
