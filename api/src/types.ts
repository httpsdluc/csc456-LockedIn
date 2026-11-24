export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export interface Meal {
  id: number;
  name: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  eatenAt: string;
}

export type NewMeal = Omit<Meal, "id">;

// Must match web/lib/profile.ts.
export const GOALS = ["cut", "maintain", "bulk"] as const;
export type Goal = (typeof GOALS)[number];

export const FITNESS_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];

export const MIN_CALORIE_GOAL = 1000;
export const MAX_CALORIE_GOAL = 6000;
export const MAX_WORKOUT_DAYS = 7;

export interface Profile {
  goal: Goal;
  fitnessLevel: FitnessLevel;
  dailyCalorieGoal: number;
  workoutDaysPerWeek: number;
  updatedAt: string;
}

export type ProfileInput = Omit<Profile, "updatedAt">;
