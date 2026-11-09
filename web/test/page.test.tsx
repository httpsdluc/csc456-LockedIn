
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../app/page";
import { dailySummary, meals } from "../lib/fixtures";

describe("LockedIn Homepage", () => {
  it("displays the application name", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "LockedIn" })
    ).toBeInTheDocument();
  });

  it("displays the daily calorie summary", () => {
    render(<Home />);

    expect(
      screen.getByText(String(dailySummary.calories))
    ).toBeInTheDocument();

    expect(
      screen.getByText(String(dailySummary.goalCalories))
    ).toBeInTheDocument();

    expect(
      screen.getByText(String(dailySummary.remainingCalories))
    ).toBeInTheDocument();
  });

  it("displays the daily progress percentage", () => {
    render(<Home />);

    const progress = Math.min(
      (dailySummary.calories / dailySummary.goalCalories) * 100,
      100
    );

    expect(
      screen.getByText(`${progress.toFixed(0)}%`)
    ).toBeInTheDocument();
  });

  it("displays macronutrient totals", () => {
    render(<Home />);

    expect(
      screen.getByText(`${dailySummary.proteinG} g`)
    ).toBeInTheDocument();

    expect(
      screen.getByText(`${dailySummary.carbsG} g`)
    ).toBeInTheDocument();

    expect(
      screen.getByText(`${dailySummary.fatG} g`)
    ).toBeInTheDocument();
  });

  it("displays the sample meals", () => {
    render(<Home />);

    meals.forEach((meal) => {
      expect(
        screen.getByText(meal.name)
      ).toBeInTheDocument();

      expect(
        screen.getByText(`${meal.calories} kcal`)
      ).toBeInTheDocument();
    });
  });
});
