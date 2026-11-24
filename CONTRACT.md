# API contract

The single source of truth for how `web`, `api`, and `e2e` talk to each other.
Change this file in its own PR before changing the code on either side.

Sprint 1 covers meal and calorie logging for a single demo user (no login yet).
User profiles and AI workout plans come in a later sprint.

## Meal shape

| Field | Type | Notes |
|---|---|---|
| `id` | number | Set by the server |
| `name` | string | Required, e.g. `"Oatmeal with banana"` |
| `mealType` | string | `breakfast`, `lunch`, `dinner`, or `snack` |
| `calories` | number | Required, whole number ≥ 0 |
| `proteinG` | number | Grams, optional (default 0) |
| `carbsG` | number | Grams, optional (default 0) |
| `fatG` | number | Grams, optional (default 0) |
| `eatenAt` | string | ISO 8601 timestamp, defaults to now |

## GET /health

```http
GET /health
→ 200 {"status":"ok","db":"ok","version":"a1b2c3d","uptimeSec":3600}
```

## GET /meals

Meals for one day, oldest first. `date` defaults to today.

```http
GET /meals?date=2026-10-26
→ 200 [{"id":1,"name":"Oatmeal with banana","mealType":"breakfast","calories":350,"proteinG":12,"carbsG":60,"fatG":7,"eatenAt":"2026-10-26T08:00:00Z"}]
```

## POST /meals

```http
POST /meals
{"name":"Greek yogurt","mealType":"snack","calories":150,"proteinG":15,"carbsG":10,"fatG":4}
→ 201 {"id":4,"name":"Greek yogurt","mealType":"snack","calories":150,"proteinG":15,"carbsG":10,"fatG":4,"eatenAt":"2026-10-26T16:00:00Z"}
→ 400 {"error":"VALIDATION_ERROR","message":"calories must be a number >= 0"}
```

## DELETE /meals/:id

```http
DELETE /meals/4
→ 204
→ 404 {"error":"NOT_FOUND","message":"meal 4 not found"}
```

## GET /summary/daily

Totals for one day. `goalCalories` is hardcoded to 2500 until user profiles exist.

```http
GET /summary/daily?date=2026-10-26
→ 200 {"date":"2026-10-26","calories":1150,"proteinG":87,"carbsG":136,"fatG":25,"goalCalories":2500,"remainingCalories":1350,"mealCount":3}
```

## Database

```sql
CREATE TABLE meals (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  calories INTEGER NOT NULL CHECK (calories >= 0),
  protein_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  fat_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  eaten_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX meals_eaten_at_idx ON meals (eaten_at);
```

The API returns camelCase (`proteinG`); the database uses snake_case (`protein_g`).

## Fake data

Keep these two files identical. The daily summary example above is the total of these three meals.

- `api/src/fixtures/meals.json`
- `web/lib/fixtures.ts`

## Adaptive workout plans (SCRUM-6)

The browser supplies the saved fitness profile and keeps its active plan and
check-ins in local storage, scoped to that browser. The API does not persist
this data. These endpoints use server-side OpenRouter credentials. DeepSeek
V4.1 Flash 1017 drafts plans through Mistral. Jev selects a review action from
a fixed list using the current plan and recent check-ins.

### POST /workouts/plan

Request a plan with `goal` (`cut`, `maintain`, or `bulk`), `fitnessLevel`
(`beginner`, `intermediate`, or `advanced`), `workoutDaysPerWeek` (integer
from 1 to 7), and optional `equipment` (`bodyweight`, `dumbbells`, or
`gym`, default `bodyweight`). A saved profile with zero workout days does
not generate a plan.

Returns 200 with a plan. `sessions` has exactly one entry per requested
workout day, in training order. Each session has a title and one to five
exercises. Each exercise has a name, 1 to 4 sets, and a short target such
as "8–12 reps" or "30 seconds".

```json
{"sessions":[{"title":"Full body","exercises":[{"name":"Bodyweight squat","sets":2,"target":"8–12 reps"}]}]}
```

### POST /workouts/review

Send the same top-level profile fields, the accepted `plan` in the shape
above, and up to 28 `checkIns` from the last four weeks. Each check-in
contains a UTC Monday `week` (YYYY-MM-DD), a one-based `session` index in the
accepted plan, and a `result` of `completed`, `too_easy`, `too_hard`,
`skipped`, or `schedule_conflict`. Each week/session pair must be unique.

Returns 200 with `action` and `plan`. The action is `keep_plan`,
`adjust_schedule`, `reduce_volume`, or `increase_volume`. For
`keep_plan`, `plan` is null. Otherwise it is a proposed replacement that
the user can accept. The saved profile determines the maximum number of
training days. Repeated schedule conflicts on the same session can remove
one day, down to a minimum of one. A lower-confidence recommendation
keeps the current plan.

Both endpoints return a 400 for invalid input, 503 when workout AI is
unconfigured, and 502 when an upstream request or response fails. Errors use
the API's standard `{error, message}` shape.
