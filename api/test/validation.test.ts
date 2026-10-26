import { describe, expect, it } from "vitest";
import { validateNewMeal } from "../src/validation.js";

const NOW = new Date("2026-10-26T18:00:00Z");
const valid = { name: "Rice", mealType: "lunch", calories: 200 };

function messageFor(body: unknown): string | undefined {
  const result = validateNewMeal(body, NOW);
  return result.ok ? undefined : result.message;
}

describe("validateNewMeal", () => {
  it("fills in defaults for optional fields", () => {
    expect(validateNewMeal(valid, NOW)).toEqual({
      ok: true,
      value: { ...valid, proteinG: 0, carbsG: 0, fatG: 0, eatenAt: "2026-10-26T18:00:00Z" },
    });
  });

  it("trims the name", () => {
    const result = validateNewMeal({ ...valid, name: "  Rice  " }, NOW);
    expect(result.ok && result.value.name).toBe("Rice");
  });

  it("ignores a client-sent id and unknown fields", () => {
    const result = validateNewMeal({ ...valid, id: 999, hacked: true }, NOW);
    expect(result.ok && result.value).not.toHaveProperty("id");
    expect(result.ok && result.value).not.toHaveProperty("hacked");
  });

  it.each([null, [], "meal", 42])("rejects a non-object body: %j", (body) => {
    expect(messageFor(body)).toBe("request body must be a JSON object");
  });

  it.each([undefined, "", "   ", 5])("rejects name %j", (name) => {
    expect(messageFor({ ...valid, name })).toBe("name is required");
  });

  it("rejects a name over 200 characters", () => {
    expect(messageFor({ ...valid, name: "a".repeat(201) })).toBe("name must be 200 characters or fewer");
  });

  it.each(["brunch", "Breakfast", undefined, 1])("rejects mealType %j", (mealType) => {
    expect(messageFor({ ...valid, mealType })).toBe("mealType must be one of breakfast, lunch, dinner, snack");
  });

  it.each([-1, "200", undefined, null, Number.NaN, Number.POSITIVE_INFINITY])("rejects calories %j", (calories) => {
    expect(messageFor({ ...valid, calories })).toBe("calories must be a number >= 0");
  });

  it("rejects fractional calories", () => {
    expect(messageFor({ ...valid, calories: 200.5 })).toBe("calories must be a whole number");
  });

  it("accepts 0 calories (water, black coffee)", () => {
    expect(validateNewMeal({ ...valid, calories: 0 }, NOW).ok).toBe(true);
  });

  it.each(["proteinG", "carbsG", "fatG"])("rejects bad %s values", (field) => {
    for (const bad of [-1, "10", 100000, Number.NaN]) {
      expect(messageFor({ ...valid, [field]: bad })).toBe(`${field} must be a number between 0 and 99999.9`);
    }
  });

  it("rounds macros to one decimal like the database column", () => {
    const result = validateNewMeal({ ...valid, proteinG: 12.345, carbsG: 0.05, fatG: 99999.9 }, NOW);
    expect(result.ok && result.value).toMatchObject({ proteinG: 12.3, carbsG: 0.1, fatG: 99999.9 });
  });

  it("normalizes eatenAt with an offset to UTC", () => {
    const result = validateNewMeal({ ...valid, eatenAt: "2026-10-26T08:00:00-04:00" }, NOW);
    expect(result.ok && result.value.eatenAt).toBe("2026-10-26T12:00:00Z");
  });

  it("keeps milliseconds when they are there", () => {
    const result = validateNewMeal({ ...valid, eatenAt: "2026-10-26T08:00:00.250Z" }, NOW);
    expect(result.ok && result.value.eatenAt).toBe("2026-10-26T08:00:00.250Z");
  });

  it.each(["2026-10-26", "2026-10-26T08:00:00", "October 26", "2026-13-45T99:00:00Z", 1761465600000])(
    "rejects eatenAt %j",
    (eatenAt) => {
      expect(messageFor({ ...valid, eatenAt })).toBe(
        "eatenAt must be an ISO 8601 timestamp with a timezone, e.g. 2026-10-26T08:00:00Z",
      );
    },
  );

  it("uses the real clock when no time is passed in", () => {
    const result = validateNewMeal(valid);
    expect(result.ok && Date.parse(result.value.eatenAt)).toBeGreaterThan(0);
  });
});
