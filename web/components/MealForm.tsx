"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { MEAL_TYPES, errorMessage, type NewMeal } from "@/lib/api";
import type { MealType } from "@/lib/fixtures";

export type MealFormValues = {
  name: string;
  mealType: MealType;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
};

const EMPTY_VALUES: MealFormValues = {
  name: "",
  mealType: "breakfast",
  calories: "",
  proteinG: "",
  carbsG: "",
  fatG: "",
};

// Checks the form the same way the API does (CONTRACT.md, POST /meals).
// Returns the meal to send, or an error message to show.
export function validateMeal(values: MealFormValues): NewMeal | string {
  const name = values.name.trim();
  if (!name) {
    return "Enter a meal name.";
  }

  const calories = Number(values.calories);
  if (values.calories.trim() === "" || !Number.isInteger(calories) || calories < 0) {
    return "Calories must be a whole number of 0 or more.";
  }

  const macros = [values.proteinG, values.carbsG, values.fatG].map((value) =>
    value.trim() === "" ? 0 : Number(value)
  );
  if (macros.some((value) => !Number.isFinite(value) || value < 0)) {
    return "Protein, carbs and fat must be 0 or more.";
  }

  const [proteinG, carbsG, fatG] = macros;
  return { name, mealType: values.mealType, calories, proteinG, carbsG, fatG };
}

type MealFormProps = {
  onSubmit: (meal: NewMeal) => Promise<void>;
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#2E2B57] bg-[#13122B] px-3.5 py-2.5 text-[#F1F0FA] placeholder:text-[#6F6C99] focus:border-[#8B7CFF] focus:outline-none focus:ring-4 focus:ring-[#8B7CFF]/20";

const labelClass = "text-sm font-medium text-[#B9B6DA]";

export default function MealForm({ onSubmit }: MealFormProps) {
  const [values, setValues] = useState<MealFormValues>(EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update =
    (field: keyof MealFormValues) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = validateMeal(values);
    if (typeof result === "string") {
      setError(result);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(result);
      setValues(EMPTY_VALUES);
    } catch (err) {
      setError(errorMessage(err, "Could not save the meal. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Log a meal"
      data-testid="meal-form"
      className="space-y-4"
    >
      <div>
        <label htmlFor="meal-name" className={labelClass}>
          Meal name
        </label>
        <input
          id="meal-name"
          data-testid="meal-name-input"
          className={inputClass}
          value={values.name}
          onChange={update("name")}
          placeholder="e.g. Greek yogurt"
          aria-required="true"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="meal-type" className={labelClass}>
            Meal type
          </label>
          <select
            id="meal-type"
            data-testid="meal-type-select"
            className={inputClass}
            value={values.mealType}
            onChange={update("mealType")}
          >
            {MEAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="meal-calories" className={labelClass}>
            Calories
          </label>
          <input
            id="meal-calories"
            data-testid="meal-calories-input"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            className={inputClass}
            value={values.calories}
            onChange={update("calories")}
            aria-required="true"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["proteinG", "Protein (g)", "meal-protein"],
            ["carbsG", "Carbs (g)", "meal-carbs"],
            ["fatG", "Fat (g)", "meal-fat"],
          ] as const
        ).map(([field, label, id]) => (
          <div key={field}>
            <label htmlFor={id} className={labelClass}>
              {label}
            </label>
            <input
              id={id}
              data-testid={`${id}-input`}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              className={inputClass}
              value={values[field]}
              onChange={update(field)}
              placeholder="0"
            />
          </div>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="meal-form-error"
          className="rounded-xl bg-[#3D1A26] px-4 py-3 text-sm text-[#FF9DB0]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        data-testid="meal-submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[#8B7CFF] px-5 py-3 font-semibold text-[#13122B] hover:bg-[#A397FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B7CFF] disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Saving…" : "Add meal"}
      </button>
    </form>
  );
}