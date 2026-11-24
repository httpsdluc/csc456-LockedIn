import { describe, expect, it } from "vitest";
import { validateProfile } from "../src/validation.js";

const valid = { goal: "maintain", fitnessLevel: "beginner", dailyCalorieGoal: 2500, workoutDaysPerWeek: 3 };

function messageFor(body: unknown): string | undefined {
  const result = validateProfile(body);
  return result.ok ? undefined : result.message;
}

describe("validateProfile", () => {
  it("accepts a full profile and returns only the four fields", () => {
    expect(validateProfile({ ...valid, extra: "x" })).toEqual({ ok: true, value: valid });
  });

  it.each([null, [], "profile", 42])("rejects a body that isn't an object: %j", (body) => {
    expect(messageFor(body)).toBe("request body must be a JSON object");
  });

  it.each([undefined, "lose", "CUT", 1])("rejects goal %j", (goal) => {
    expect(messageFor({ ...valid, goal })).toBe("goal must be one of cut, maintain, bulk");
  });

  it.each([undefined, "pro", "Beginner"])("rejects fitnessLevel %j", (fitnessLevel) => {
    expect(messageFor({ ...valid, fitnessLevel })).toBe(
      "fitnessLevel must be one of beginner, intermediate, advanced",
    );
  });

  it.each([undefined, 999, 6001, 2500.5, "2500", Number.NaN, Infinity])(
    "rejects dailyCalorieGoal %j",
    (dailyCalorieGoal) => {
      expect(messageFor({ ...valid, dailyCalorieGoal })).toBe(
        "dailyCalorieGoal must be a whole number from 1000 to 6000",
      );
    },
  );

  it.each([1000, 6000])("accepts the dailyCalorieGoal limit %d", (dailyCalorieGoal) => {
    expect(messageFor({ ...valid, dailyCalorieGoal })).toBeUndefined();
  });

  it.each([undefined, -1, 8, 2.5, "3"])("rejects workoutDaysPerWeek %j", (workoutDaysPerWeek) => {
    expect(messageFor({ ...valid, workoutDaysPerWeek })).toBe(
      "workoutDaysPerWeek must be a whole number from 0 to 7",
    );
  });

  it.each([0, 7])("accepts the workoutDaysPerWeek limit %d", (workoutDaysPerWeek) => {
    expect(messageFor({ ...valid, workoutDaysPerWeek })).toBeUndefined();
  });
});
