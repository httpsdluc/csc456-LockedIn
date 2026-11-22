"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import {
  DEFAULT_PROFILE,
  FITNESS_LEVELS,
  GOALS,
  GOAL_LABELS,
  MAX_CALORIE_GOAL,
  MIN_CALORIE_GOAL,
  saveProfile,
  useSavedProfile,
  validateProfileForm,
  type Profile,
  type ProfileFormValues,
} from "@/lib/profile";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#2E2B57] bg-[#13122B] px-3.5 py-2.5 text-[#F1F0FA] placeholder:text-[#6F6C99] focus:border-[#8B7CFF] focus:outline-none focus:ring-4 focus:ring-[#8B7CFF]/20";

const labelClass = "text-sm font-medium text-[#B9B6DA]";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const toFormValues = (profile: Profile): ProfileFormValues => ({
  goal: profile.goal,
  fitnessLevel: profile.fitnessLevel,
  dailyCalorieGoal: String(profile.dailyCalorieGoal),
  workoutDaysPerWeek: String(profile.workoutDaysPerWeek),
});

// Loads the saved profile, then hands it to the fields as their starting values.
// The key starts the fields over once the saved profile has been read.
export default function ProfileForm() {
  const saved = useSavedProfile();
  return (
    <ProfileFields
      key={saved ? JSON.stringify(saved) : "new"}
      initial={saved ?? DEFAULT_PROFILE}
      isNew={!saved}
    />
  );
}

function ProfileFields({ initial, isNew }: { initial: Profile; isNew: boolean }) {
  const [values, setValues] = useState<ProfileFormValues>(() => toFormValues(initial));
  const [error, setError] = useState<string | null>(null);
  const [savedGoal, setSavedGoal] = useState<number | null>(null);
  const [neverSaved, setNeverSaved] = useState(isNew);

  const update =
    (field: keyof ProfileFormValues) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setSavedGoal(null);
      setValues((current) => ({ ...current, [field]: event.target.value }));
    };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = validateProfileForm(values);
    if (typeof result === "string") {
      setError(result);
      return;
    }

    if (!saveProfile(result)) {
      setError("Could not save your profile. Check that this browser allows site data, then try again.");
      return;
    }

    setError(null);
    setNeverSaved(false);
    setSavedGoal(result.dailyCalorieGoal);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Your profile"
      data-testid="profile-form"
      className="space-y-4"
    >
      {neverSaved  && (
        <p data-testid="profile-new" className="text-sm text-[#A9A7C9]">
          You haven&apos;t saved a profile yet, so these are the starting values.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-goal" className={labelClass}>
            Goal
          </label>
          <select
            id="profile-goal"
            data-testid="profile-goal-select"
            className={inputClass}
            value={values.goal}
            onChange={update("goal")}
          >
            {GOALS.map((goal) => (
              <option key={goal} value={goal}>
                {GOAL_LABELS[goal]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="profile-level" className={labelClass}>
            Fitness level
          </label>
          <select
            id="profile-level"
            data-testid="profile-level-select"
            className={inputClass}
            value={values.fitnessLevel}
            onChange={update("fitnessLevel")}
          >
            {FITNESS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {capitalize(level)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-calories" className={labelClass}>
            Daily calorie goal
          </label>
          <input
            id="profile-calories"
            data-testid="profile-calories-input"
            type="number"
            min={MIN_CALORIE_GOAL}
            max={MAX_CALORIE_GOAL}
            step={1}
            inputMode="numeric"
            className={inputClass}
            value={values.dailyCalorieGoal}
            onChange={update("dailyCalorieGoal")}
            aria-required="true"
          />
        </div>

        <div>
          <label htmlFor="profile-days" className={labelClass}>
            Workout days per week
          </label>
          <input
            id="profile-days"
            data-testid="profile-days-input"
            type="number"
            min={0}
            max={7}
            step={1}
            inputMode="numeric"
            className={inputClass}
            value={values.workoutDaysPerWeek}
            onChange={update("workoutDaysPerWeek")}
            aria-required="true"
          />
        </div>
      </div>

      <p className="text-xs text-[#A9A7C9]">
        Saved in this browser until accounts are added. LockedIn gives general
        fitness guidance, not medical advice.
      </p>

      {error && (
        <p
          role="alert"
          data-testid="profile-error"
          className="rounded-xl bg-[#3D1A26] px-4 py-3 text-sm text-[#FF9DB0]"
        >
          {error}
        </p>
      )}

      {savedGoal !== null && (
        <p
          role="status"
          data-testid="profile-saved"
          className="rounded-xl bg-[#123634] px-4 py-3 text-sm text-[#7FE3D8]"
        >
          Profile saved. Your daily goal is now {savedGoal} kcal.{" "}
          <Link href="/" className="font-semibold underline">
            Go to your dashboard
          </Link>
        </p>
      )}

      <button
        type="submit"
        data-testid="profile-submit"
        className="w-full rounded-xl bg-[#8B7CFF] px-5 py-3 font-semibold text-[#13122B] hover:bg-[#A397FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B7CFF] sm:w-auto"
      >
        Save profile
      </button>
    </form>
  );
}