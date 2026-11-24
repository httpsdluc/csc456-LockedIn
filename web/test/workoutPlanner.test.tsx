import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import WorkoutsPage from "../app/workouts/page";
import { PROFILE_STORAGE_KEY } from "../lib/profile";

const plan = {
  sessions: ["Full body", "Upper body", "Lower body", "Mobility"].map((title) => ({
    title, exercises: [{ name: "Squat", sets: 2, target: "8 reps" }],
  })),
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("uses the saved profile, remembers check-ins, and applies a revised plan only on acceptance", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
    goal: "cut", fitnessLevel: "beginner", workoutDaysPerWeek: 4, dailyCalorieGoal: 2400,
  }));

  const revised = { sessions: plan.sessions.slice(0, 3) };
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json(plan))
    .mockResolvedValueOnce(Response.json({ action: "adjust_schedule", plan: revised }));
  vi.stubGlobal("fetch", fetch);

  const initial = render(<WorkoutsPage />);
  fireEvent.change(screen.getByLabelText("Available equipment"), { target: { value: "dumbbells" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate workout plan" }));
  await screen.findByText("Workout plan saved.");
  expect(fetch).toHaveBeenNthCalledWith(1, "https://api.example.test/workouts/plan", expect.objectContaining({
    body: JSON.stringify({ goal: "cut", fitnessLevel: "beginner", workoutDaysPerWeek: 4, equipment: "dumbbells" }),
  }));
  fireEvent.change(screen.getByLabelText("Workout 4 check-in"), { target: { value: "schedule_conflict" } });
  initial.unmount();

  vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
  render(<WorkoutsPage />);
  fireEvent.change(screen.getByLabelText("Week starting"), { target: { value: "2026-11-16" } });
  expect(screen.getByLabelText("Workout 4 check-in")).toHaveValue("schedule_conflict");
  fireEvent.change(screen.getByLabelText("Week starting"), { target: { value: "2026-11-23" } });
  fireEvent.change(screen.getByLabelText("Workout 4 check-in"), { target: { value: "schedule_conflict" } });
  fireEvent.click(screen.getByRole("button", { name: "Review my week" }));

  const proposal = await screen.findByRole("region", { name: /proposed plan/i });
  const active = screen.getByRole("region", { name: "Current plan" });
  expect(within(proposal).queryByText(/Workout 4/)).not.toBeInTheDocument();
  expect(within(active).getByText(/Workout 4/)).toBeInTheDocument();
  expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body)).checkIns).toEqual([
    { week: "2026-11-16", session: 4, result: "schedule_conflict" },
    { week: "2026-11-23", session: 4, result: "schedule_conflict" },
  ]);
  fireEvent.click(within(proposal).getByRole("button", { name: "Accept updated plan" }));
  expect(within(active).queryByText(/Workout 4/)).not.toBeInTheDocument();
  expect(screen.getByText("Updated workout plan saved.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review my week" })).toBeDisabled();
});

it("points users without a saved profile to setup", () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  render(<WorkoutsPage />);
  expect(screen.getByRole("link", { name: "fitness profile" })).toHaveAttribute("href", "/profile");
  expect(screen.getByRole("button", { name: "Generate workout plan" })).toBeDisabled();
});
