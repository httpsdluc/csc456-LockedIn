import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProfilePage from "../app/profile/page";
import ProfileForm from "../components/ProfileForm";
import { PROFILE_STORAGE_KEY, type Profile } from "../lib/profile";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const saved: Profile = {
  goal: "bulk",
  fitnessLevel: "advanced",
  dailyCalorieGoal: 3200,
  workoutDaysPerWeek: 5,
};

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

describe("profile page", () => {
  it("shows the header, the navigation and the form", () => {
    render(<ProfilePage />);

    expect(screen.getByRole("heading", { name: "LockedIn" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Profile" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("profile-form")).toBeInTheDocument();
  });
});

describe("ProfileForm", () => {
  it("starts with default values when nothing is saved", () => {
    render(<ProfileForm />);

    expect(screen.getByTestId("profile-new")).toBeInTheDocument();
    expect(screen.getByLabelText("Goal")).toHaveValue("maintain");
    expect(screen.getByLabelText("Fitness level")).toHaveValue("beginner");
    expect(screen.getByLabelText("Daily calorie goal")).toHaveValue(2500);
    expect(screen.getByLabelText("Workout days per week")).toHaveValue(3);
  });

  it("loads the saved profile", () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(saved));
    render(<ProfileForm />);

    expect(screen.queryByTestId("profile-new")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Goal")).toHaveValue("bulk");
    expect(screen.getByLabelText("Fitness level")).toHaveValue("advanced");
    expect(screen.getByLabelText("Daily calorie goal")).toHaveValue(3200);
    expect(screen.getByLabelText("Workout days per week")).toHaveValue(5);
  });

  it("saves the profile and confirms the new daily goal", () => {
    render(<ProfileForm />);

    change("Goal", "cut");
    change("Fitness level", "intermediate");
    change("Daily calorie goal", "2000");
    change("Workout days per week", "4");
    save();

    expect(screen.getByTestId("profile-saved")).toHaveTextContent(
      "Profile saved. Your daily goal is now 2000 kcal."
    );
    expect(screen.queryByTestId("profile-new")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your dashboard" })).toHaveAttribute("href", "/");
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)!)).toEqual({
      goal: "cut",
      fitnessLevel: "intermediate",
      dailyCalorieGoal: 2000,
      workoutDaysPerWeek: 4,
    });
  });

  it("hides the saved message once a field changes again", () => {
    render(<ProfileForm />);
    save();
    expect(screen.getByTestId("profile-saved")).toBeInTheDocument();

    change("Daily calorie goal", "2100");
    expect(screen.queryByTestId("profile-saved")).not.toBeInTheDocument();
  });

  it("shows a validation error and does not save", () => {
    render(<ProfileForm />);

    change("Daily calorie goal", "50");
    save();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Daily calorie goal must be a whole number from 1000 to 6000."
    );
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
  });

  it("clears the error after a successful save", () => {
    render(<ProfileForm />);

    change("Workout days per week", "9");
    save();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    change("Workout days per week", "2");
    save();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("profile-saved")).toBeInTheDocument();
  });

  it("explains when the browser can't save the profile", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    render(<ProfileForm />);

    save();

    expect(screen.getByRole("alert")).toHaveTextContent("Could not save your profile.");
    expect(screen.queryByTestId("profile-saved")).not.toBeInTheDocument();
  });
});