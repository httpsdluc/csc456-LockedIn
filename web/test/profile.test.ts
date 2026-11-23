import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PROFILE,
  PROFILE_STORAGE_KEY,
  parseProfile,
  readSavedProfile,
  saveProfile,
  validateProfileForm,
  type ProfileFormValues,
} from "../lib/profile";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const valid: ProfileFormValues = {
  goal: "cut",
  fitnessLevel: "intermediate",
  dailyCalorieGoal: "2000",
  workoutDaysPerWeek: "4",
};

function memoryStorage() {
  const data: Record<string, string> = {};
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe("validateProfileForm", () => {
  it("returns the profile with numbers parsed", () => {
    expect(validateProfileForm(valid)).toEqual({
      goal: "cut",
      fitnessLevel: "intermediate",
      dailyCalorieGoal: 2000,
      workoutDaysPerWeek: 4,
    });
  });

  it.each(["", "999", "6001", "2000.5", "abc"])("rejects a calorie goal of %j", (dailyCalorieGoal) => {
    expect(validateProfileForm({ ...valid, dailyCalorieGoal })).toBe(
      "Daily calorie goal must be a whole number from 1000 to 6000."
    );
  });

  it.each(["", "-1", "8", "2.5"])("rejects %j workout days", (workoutDaysPerWeek) => {
    expect(validateProfileForm({ ...valid, workoutDaysPerWeek })).toBe(
      "Workout days per week must be a whole number from 0 to 7."
    );
  });

  it("accepts the edges of each range", () => {
    expect(
      validateProfileForm({ ...valid, dailyCalorieGoal: "1000", workoutDaysPerWeek: "0" })
    ).toMatchObject({ dailyCalorieGoal: 1000, workoutDaysPerWeek: 0 });
    expect(
      validateProfileForm({ ...valid, dailyCalorieGoal: "6000", workoutDaysPerWeek: "7" })
    ).toMatchObject({ dailyCalorieGoal: 6000, workoutDaysPerWeek: 7 });
  });
});

describe("saving and reading the profile", () => {
  it("saves a profile and reads it back", () => {
    const storage = memoryStorage();
    expect(saveProfile(DEFAULT_PROFILE, storage)).toBe(true);
    expect(parseProfile(readSavedProfile(storage))).toEqual(DEFAULT_PROFILE);
  });

  it("uses the browser's storage by default", () => {
    expect(saveProfile(DEFAULT_PROFILE)).toBe(true);
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBe(JSON.stringify(DEFAULT_PROFILE));
    expect(parseProfile(readSavedProfile())).toEqual(DEFAULT_PROFILE);
  });

  it("treats a missing profile as none", () => {
    expect(readSavedProfile(memoryStorage())).toBeNull();
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile("")).toBeNull();
  });

  it("ignores saved data that isn't a valid profile", () => {
    expect(parseProfile("{not json")).toBeNull();
    expect(parseProfile("null")).toBeNull();
    expect(parseProfile("5")).toBeNull();
    expect(parseProfile(JSON.stringify({ ...DEFAULT_PROFILE, goal: "shred" }))).toBeNull();
    expect(parseProfile(JSON.stringify({ ...DEFAULT_PROFILE, fitnessLevel: "pro" }))).toBeNull();
    expect(parseProfile(JSON.stringify({ ...DEFAULT_PROFILE, dailyCalorieGoal: 50 }))).toBeNull();
    expect(parseProfile(JSON.stringify({ ...DEFAULT_PROFILE, workoutDaysPerWeek: "3" }))).toBeNull();
  });

  it("copes with a browser that has no storage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readSavedProfile()).toBeNull();
    expect(saveProfile(DEFAULT_PROFILE)).toBe(false);
  });

  it("copes with storage that throws (site data blocked or full)", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readSavedProfile(broken)).toBeNull();
    expect(saveProfile(DEFAULT_PROFILE, broken)).toBe(false);
  });
});