export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type Meal = {
  id: number;
  name: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  eatenAt: string;
};

export type DailySummary = {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  goalCalories: number;
  remainingCalories: number;
  mealCount: number;
};

export const meals: Meal[] = [
  { id: 1, name: "Oatmeal with banana", mealType: "breakfast", calories: 350, proteinG: 12, carbsG: 60, fatG: 7, eatenAt: "2026-10-26T08:00:00Z" },
  { id: 2, name: "Chicken rice bowl", mealType: "lunch", calories: 620, proteinG: 45, carbsG: 70, fatG: 15, eatenAt: "2026-10-26T12:30:00Z" },
  { id: 3, name: "Protein shake", mealType: "snack", calories: 180, proteinG: 30, carbsG: 6, fatG: 3, eatenAt: "2026-10-26T15:00:00Z" },
];

export const dailySummary: DailySummary = {
  date: "2026-10-26",
  calories: 1150,
  proteinG: 87,
  carbsG: 136,
  fatG: 25,
  goalCalories: 2500,
  remainingCalories: 1350,
  mealCount: 3,
};
