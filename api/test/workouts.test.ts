import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./helpers.js";

const profile = { goal: "maintain", fitnessLevel: "beginner", workoutDaysPerWeek: 4 };
const exercise = { name: "Squat", sets: 2, target: "8 reps" };
const makePlan = (days: number, sets = 2) => ({
  sessions: Array.from({ length: days }, (_, i) => ({
    title: `Strength ${i + 1}`,
    exercises: [{ ...exercise, sets }],
  })),
});
const plan = makePlan(4);
const checkIns = ["2026-10-19", "2026-10-26"].map((week) => ({
  week, session: 4, result: "schedule_conflict",
}));
const review = { ...profile, plan, checkIns };
const invalidPlan = { sessions: [null] };
const app = () => buildApp({ openRouterApiKey: "test-key" }).app;
const completion = (output: unknown) => Response.json({
  choices: [{ message: { content: JSON.stringify(output) } }],
});
const decision = (choice: string, confidence = 0.9) => Response.json({
  answers: { adaptation: { type: "choice", choice, confidence } },
});
const stubFetch = () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

afterEach(() => vi.unstubAllGlobals());

describe("workout plans", () => {
  it("drafts and validates a personalized plan through Mistral", async () => {
    const fetch = stubFetch().mockResolvedValueOnce(completion(plan));
    const res = await request(app()).post("/workouts/plan").send(profile);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(plan);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "deepseek/deepseek-v4.1-flash-1017",
      provider: { only: ["mistral"], allow_fallbacks: false },
      response_format: { type: "json_schema" },
    });
  });

  it.each([{}, { ...profile, workoutDaysPerWeek: 0 }, { ...profile, equipment: "pool" },
    { ...profile, fitnessLevel: "new" }, null])("rejects invalid profiles %#", async (body) => {
    expect((await request(app()).post("/workouts/plan").send(body ?? "null")).status).toBe(400);
  });

  it("reports unconfigured AI on both routes", async () => {
    const { app: unconfigured } = buildApp();
    expect((await request(unconfigured).post("/workouts/plan").send(profile)).status).toBe(503);
    expect((await request(unconfigured).post("/workouts/review").send(review)).status).toBe(503);
  });

  it.each([
    {},
    { sessions: [] },
    makePlan(3),
    { sessions: [null, ...plan.sessions.slice(1)] },
    { sessions: [{ title: "Strength", exercises: [] }, ...plan.sessions.slice(1)] },
    { sessions: [{ title: "", exercises: [exercise] }, ...plan.sessions.slice(1)] },
    { sessions: [{ title: "Strength", exercises: [null] }, ...plan.sessions.slice(1)] },
    { sessions: [{ title: "Strength", exercises: [{ ...exercise, name: "" }] }, ...plan.sessions.slice(1)] },
    makePlan(4, 12),
    { sessions: [{ title: "Strength", exercises: [{ ...exercise, target: "" }] }, ...plan.sessions.slice(1)] },
  ])("rejects malformed model output %#", async (output) => {
    stubFetch().mockResolvedValueOnce(completion(output));
    expect((await request(app()).post("/workouts/plan").send(profile)).status).toBe(502);
  });

  it.each([Response.json({}), new Response(null, { status: 429 })])(
    "handles upstream errors %#", async (response) => {
      stubFetch().mockResolvedValueOnce(response);
      expect((await request(app()).post("/workouts/plan").send(profile)).status).toBe(502);
    },
  );
});

describe("workout review", () => {
  it("uses Jev and drafts a three-day proposal after repeated conflicts", async () => {
    const revised = makePlan(3);
    const fetch = stubFetch()
      .mockResolvedValueOnce(decision("adjust_schedule"))
      .mockResolvedValueOnce(completion(revised));

    const res = await request(app()).post("/workouts/review").send({ ...review, checkIns: [...checkIns].reverse() });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ action: "adjust_schedule", plan: revised });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "typesafe/jev-1.14",
      state: { plan, checkIns },
    });
  });

  it.each([
    [decision("keep_plan"), checkIns],
    [decision("adjust_schedule", 0.25), checkIns],
    [decision("adjust_schedule"), checkIns.slice(0, 1)],
    [decision("increase_volume"), checkIns],
  ])("retains the plan without regenerating when evidence does not support a change %#",
    async (response, history) => {
      const fetch = stubFetch().mockResolvedValueOnce(response);
      const res = await request(app()).post("/workouts/review").send({ ...review, checkIns: history });
      expect(res.body).toEqual({ action: "keep_plan", plan: null });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

  it.each([
    ["reduce_volume", "too_hard", makePlan(4, 1), 200],
    ["reduce_volume", "too_hard", plan, 502],
    ["increase_volume", "too_easy", makePlan(4, 3), 502],
  ] as const)("validates a %s proposal against the current set count", async (action, result, revision, status) => {
    stubFetch().mockResolvedValueOnce(decision(action)).mockResolvedValueOnce(completion(revision));
    const history = checkIns.map((entry) => ({ ...entry, result }));
    const res = await request(app()).post("/workouts/review").send({ ...review, checkIns: history });
    expect(res.status).toBe(status);
  });

  it.each([
    { checkIns: null },
    { checkIns: [] },
    { plan: invalidPlan },
    { checkIns: [null] },
    { checkIns: [checkIns[0], checkIns[0]] },
    { checkIns: [{ ...checkIns[0], week: "2026-10-25" }] },
    { checkIns: [{ ...checkIns[0], week: "2026-09-28" }] },
    { checkIns: [{ ...checkIns[0], week: "2026-11-02" }] },
    { checkIns: [{ ...checkIns[0], session: 5 }] },
    { checkIns: [{ ...checkIns[0], result: "reroute" }] },
  ])("rejects invalid review data %#", async (override) => {
    const fetch = stubFetch();
    expect((await request(app()).post("/workouts/review").send({ ...review, ...override })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an unknown Jev action", async () => {
    stubFetch().mockResolvedValueOnce(decision("unexpected"));
    expect((await request(app()).post("/workouts/review").send(review)).status).toBe(502);
  });
});
