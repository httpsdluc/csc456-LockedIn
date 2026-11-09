import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MealForm, { validateMeal, type MealFormValues } from "../components/MealForm";

afterEach(() => {
  cleanup();
});

const valid: MealFormValues = {
  name: "Greek yogurt",
  mealType: "snack",
  calories: "150",
  proteinG: "15",
  carbsG: "10",
  fatG: "4",
};

function fillForm(values: Partial<MealFormValues>) {
  const fields: [keyof MealFormValues, string][] = [
    ["name", "Meal name"],
    ["mealType", "Meal type"],
    ["calories", "Calories"],
    ["proteinG", "Protein (g)"],
    ["carbsG", "Carbs (g)"],
    ["fatG", "Fat (g)"],
  ];
  for (const [field, label] of fields) {
    const value = values[field];
    if (value !== undefined) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
  }
}

describe("validateMeal", () => {
  it("returns the meal with numbers parsed", () => {
    expect(validateMeal(valid)).toEqual({
      name: "Greek yogurt",
      mealType: "snack",
      calories: 150,
      proteinG: 15,
      carbsG: 10,
      fatG: 4,
    });
  });

  it("trims the name and defaults empty macros to 0", () => {
    expect(
      validateMeal({ ...valid, name: "  Apple  ", proteinG: "", carbsG: " ", fatG: "" })
    ).toEqual({ name: "Apple", mealType: "snack", calories: 150, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it("rejects a missing name", () => {
    expect(validateMeal({ ...valid, name: "   " })).toBe("Enter a meal name.");
  });

  it.each(["", "-5", "12.5", "abc"])("rejects calories of %j", (calories) => {
    expect(validateMeal({ ...valid, calories })).toBe(
      "Calories must be a whole number of 0 or more."
    );
  });

  it.each([
    { proteinG: "-1" },
    { carbsG: "abc" },
    { fatG: "-0.5" },
  ])("rejects bad macros %j", (macro) => {
    expect(validateMeal({ ...valid, ...macro })).toBe(
      "Protein, carbs and fat must be 0 or more."
    );
  });

  it("accepts 0 calories", () => {
    expect(validateMeal({ ...valid, calories: "0" })).toMatchObject({ calories: 0 });
  });
});

describe("MealForm", () => {
  it("shows a validation error and does not submit", () => {
    const onSubmit = vi.fn(async () => {});
    render(<MealForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Add meal" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a meal name.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the meal and clears the form", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<MealForm onSubmit={onSubmit} />);

    fillForm(valid);
    fireEvent.click(screen.getByRole("button", { name: "Add meal" }));

    await waitFor(() => expect(screen.getByLabelText("Meal name")).toHaveValue(""));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Greek yogurt",
      mealType: "snack",
      calories: 150,
      proteinG: 15,
      carbsG: 10,
      fatG: 4,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows 'Saving…' and disables the button while saving", async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    render(<MealForm onSubmit={onSubmit} />);

    fillForm({ name: "Apple", calories: "95" });
    fireEvent.click(screen.getByRole("button", { name: "Add meal" }));

    const button = await screen.findByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();

    finish();
    expect(await screen.findByRole("button", { name: "Add meal" })).toBeEnabled();
  });

  it("keeps the values and shows the error when saving fails", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("calories must be a number >= 0");
    });
    render(<MealForm onSubmit={onSubmit} />);

    fillForm({ name: "Apple", calories: "95" });
    fireEvent.click(screen.getByRole("button", { name: "Add meal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("calories must be a number >= 0");
    expect(screen.getByLabelText("Meal name")).toHaveValue("Apple");
  });

  it("shows a general message when saving fails without a message", async () => {
    const onSubmit = vi.fn(async () => {
      throw "network down";
    });
    render(<MealForm onSubmit={onSubmit} />);

    fillForm({ name: "Apple", calories: "95" });
    fireEvent.click(screen.getByRole("button", { name: "Add meal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save the meal. Try again."
    );
  });
});
