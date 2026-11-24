"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { errorMessage, getApiUrl } from "@/lib/api";
import { useSavedProfile } from "@/lib/profile";
import {
  CHECK_IN_RESULTS, EQUIPMENT, TRAINING_WEEK_MS, generateWorkout, reviewWorkout, trainingWeek,
  type CheckIn, type Equipment, type WorkoutPlan, type WorkoutReview,
} from "@/lib/workouts";

type SavedWorkout = {
  plan: WorkoutPlan;
  equipment: Equipment;
  startedWeek: string;
  checkIns: CheckIn[];
};
type Proposal = Exclude<WorkoutReview, { action: "keep_plan" }>;

const storageKey = "lockedin.workouts.v1";
const changeEvent = "lockedin:workouts-changed";
const card = "rounded-2xl bg-[#1B1A36] p-5 ring-1 ring-[#2E2B57] sm:p-6";
const button = "rounded-lg bg-[#8B7CFF] px-4 py-2 text-sm font-semibold text-[#13122B] disabled:opacity-50";
const select = "rounded-lg bg-[#13122B] px-3 py-2 text-sm text-[#F1F0FA] ring-1 ring-[#423D75]";
const actionLabels: Record<Proposal["action"], string> = {
  adjust_schedule: "Adjust training days",
  reduce_volume: "Reduce training volume",
  increase_volume: "Increase training volume",
};

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changeEvent, listener);
  };
}

function readWorkout(): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function parseWorkout(raw: string | null): SavedWorkout | null {
  try {
    const saved = raw ? JSON.parse(raw) as SavedWorkout : null;
    return saved && Array.isArray(saved.plan?.sessions) && Array.isArray(saved.checkIns) &&
      Object.hasOwn(EQUIPMENT, saved.equipment) && typeof saved.startedWeek === "string" ? saved : null;
  } catch {
    return null;
  }
}

function saveWorkout(workout: SavedWorkout) {
  window.localStorage.setItem(storageKey, JSON.stringify(workout));
  window.dispatchEvent(new Event(changeEvent));
}

function Sessions({ plan, checkIns, onCheckIn, disabled }: {
  plan: WorkoutPlan;
  checkIns?: CheckIn[];
  onCheckIn?: (session: number, result: CheckIn["result"] | "") => void;
  disabled?: boolean;
}) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2">
      {plan.sessions.map((session, index) => {
        const number = index + 1;
        return (
          <li key={number} className={card}>
            <h3 className="font-semibold">Workout {number} · {session.title}</h3>
            <ul className="my-3 space-y-2 text-sm text-[#D0CDEC]">
              {session.exercises.map((exercise, i) => (
                <li key={i}>{exercise.name} · {exercise.sets} {exercise.sets === 1 ? "set" : "sets"} × {exercise.target}</li>
              ))}
            </ul>
            {onCheckIn && (
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <span>Check-in</span>
                <select
                  aria-label={`Workout ${number} check-in`}
                  className={select}
                  disabled={disabled}
                  value={checkIns?.find((entry) => entry.session === number)?.result ?? ""}
                  onChange={(event) => onCheckIn(number, event.target.value as CheckIn["result"] | "")}
                >
                  <option value="">No check-in</option>
                  {Object.entries(CHECK_IN_RESULTS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function WorkoutPlanner() {
  const profile = useSavedProfile();
  const raw = useSyncExternalStore(subscribe, readWorkout, () => null);
  const saved = useMemo(() => parseWorkout(raw), [raw]);
  const [selectedEquipment, setEquipment] = useState<Equipment | null>(null);
  const [selectedWeek, setWeek] = useState<string | null>(null);
  const [working, setWorking] = useState<"generate" | "review" | null>(null);
  const [proposal, setProposal] = useState<{ review: Proposal; source: string | null } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const baseUrl = getApiUrl();
  const equipment = selectedEquipment ?? saved?.equipment ?? "bodyweight";
  const currentWeek = saved ? trainingWeek(new Date()) : "";
  const weeks = saved ? Array.from({ length: 4 }, (_, index) =>
    new Date(Date.parse(currentWeek) - index * TRAINING_WEEK_MS).toISOString().slice(0, 10)
  ).filter((week) => week >= saved.startedWeek) : [];
  const week = selectedWeek && weeks.includes(selectedWeek) ? selectedWeek : currentWeek;
  const recent = saved?.checkIns.filter((entry) => weeks.includes(entry.week)) ?? [];
  const pending = proposal?.source === raw ? proposal?.review : null;
  const canGenerate = Boolean(baseUrl && profile && profile.workoutDaysPerWeek > 0 && !working);

  function save(workout: SavedWorkout, message: string) {
    try {
      saveWorkout(workout);
      setError("");
      setStatus(message);
      return true;
    } catch {
      setStatus("");
      setError("Could not save your workout data in this browser.");
      return false;
    }
  }

  async function run(action: "generate" | "review") {
    if (!baseUrl || !profile || !canGenerate) return;
    if (action === "review" && (!saved || !recent.length)) return;
    setWorking(action);
    setError("");
    setStatus("");
    setProposal(null);

    const inputs = {
      goal: profile.goal,
      fitnessLevel: profile.fitnessLevel,
      workoutDaysPerWeek: profile.workoutDaysPerWeek,
      equipment,
    };
    try {
      if (action === "review" && saved) {
        const review = await reviewWorkout(baseUrl, { ...inputs, equipment: saved.equipment }, saved.plan, recent);
        if (review.action === "keep_plan") {
          setStatus("Keep your current plan. There is no recommended change based on your recent check-ins.");
        } else {
          setProposal({ review, source: raw });
        }
      } else {
        const plan = await generateWorkout(baseUrl, inputs);
        if (readWorkout() !== raw) {
          setError("Your workout data changed in another tab. Review it and try again.");
          return;
        }
        save({ plan, equipment, startedWeek: trainingWeek(new Date()), checkIns: [] }, "Workout plan saved.");
      }
    } catch (err) {
      setError(errorMessage(err, "Could not load a workout recommendation."));
    } finally {
      setWorking(null);
    }
  }

  function recordCheckIn(session: number, result: CheckIn["result"] | "") {
    if (!saved || working || readWorkout() !== raw) return;
    const checkIns = recent.filter((entry) => entry.week !== week || entry.session !== session);
    if (result) checkIns.push({ week, session, result });
    if (save({ ...saved, checkIns }, "Check-in saved.")) setProposal(null);
  }

  function accept() {
    if (!pending || !saved || readWorkout() !== raw) return;
    if (save({ ...saved, plan: pending.plan, startedWeek: currentWeek, checkIns: [] }, "Updated workout plan saved.")) {
      setProposal(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className={card} aria-labelledby="workout-heading">
        <h2 id="workout-heading" className="text-2xl font-bold">Weekly workout plan</h2>
        {!profile && <p className="my-3 text-sm">Save your <Link className="underline" href="/profile">fitness profile</Link> to get a plan.</p>}
        {profile?.workoutDaysPerWeek === 0 && (
          <p className="my-3 text-sm">Set at least one workout day in your <Link className="underline" href="/profile">profile</Link> to generate a plan.</p>
        )}
        {!baseUrl && <p className="my-3 text-sm">Connect the LockedIn API to generate or review plans.</p>}
        {!saved && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Available equipment
              <select className={select} value={equipment} disabled={Boolean(working)}
                onChange={(event) => setEquipment(event.target.value as Equipment)}>
                {Object.entries(EQUIPMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className={button} onClick={() => void run("generate")} disabled={!canGenerate}>
              {working === "generate" ? "Generating…" : "Generate workout plan"}
            </button>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-[#FFB3B3]" role="alert">{error}</p>}
        {status && <p className="mt-4 text-sm" role="status">{status}</p>}
      </section>

      {saved && (
        <section className="space-y-4" aria-labelledby="active-workout">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="active-workout" className="text-lg font-semibold">Current plan</h2>
            <label className="flex items-center gap-2 text-sm">
              Week starting
              <select className={select} value={week} onChange={(event) => setWeek(event.target.value)}>
                {weeks.map((date) => <option key={date} value={date}>{date}{date === currentWeek ? " (this week)" : ""}</option>)}
              </select>
            </label>
          </div>
          <Sessions plan={saved.plan} checkIns={recent.filter((entry) => entry.week === week)}
            onCheckIn={recordCheckIn} disabled={Boolean(working)} />
          <div className="flex flex-wrap items-center gap-3">
            <button className={button} onClick={() => void run("review")}
              disabled={!canGenerate || !recent.length}>
              {working === "review" ? "Reviewing…" : "Review my week"}
            </button>
            <span className="text-sm text-[#D0CDEC]">{recent.length} recent {recent.length === 1 ? "check-in" : "check-ins"}</span>
          </div>
        </section>
      )}

      {pending && (
        <section className="space-y-4" aria-labelledby="proposed-workout">
          <h2 id="proposed-workout" className="text-lg font-semibold">Proposed plan · {actionLabels[pending.action]}</h2>
          <Sessions plan={pending.plan} />
          <p className="text-sm text-[#D0CDEC]">Accepting starts a new check-in history for this plan.</p>
          <div className="flex flex-wrap gap-3">
            <button className={button} onClick={accept}>Accept updated plan</button>
            <button className={select} onClick={() => setProposal(null)}>Keep current plan</button>
          </div>
        </section>
      )}
    </div>
  );
}
