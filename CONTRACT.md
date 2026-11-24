# API contract

The single source of truth for how `web`, `api`, and `e2e` talk to each other.
Change this file in its own PR before changing the code on either side.

Sprint 1 covers meal and calorie logging for a single demo user (no login yet).
Sprint 3 adds the user profile (goal, fitness level, daily calorie goal, workout days)
for that same demo user. AI workout plans come in a later sprint.

## Errors

Every error response has the same shape, whatever the route:

```json
{"error":"VALIDATION_ERROR","message":"calories must be a number >= 0","requestId":"5f0c2a8e-3b1d-4c7e-9a52-1d2e3f4a5b6c"}
```

| `error` | Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bad query string, bad body, or body that isn't JSON |
| `NOT_FOUND` | 404 | No such meal, no saved profile, or no such route |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 10 kB |
| `INTERNAL_ERROR` | 500 | Anything else. The message is always `something went wrong`; details go to the server log only |

`requestId` is also sent back in the `X-Request-Id` header on every response, errors or not.
A client may send its own `X-Request-Id` (letters, digits, `-` and `_`, up to 64 characters);
otherwise the server makes one. Quote it when reporting a bug so the matching server log line can be found.

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
→ 400 {"error":"VALIDATION_ERROR","message":"calories must be a number >= 0","requestId":"..."}
```

## DELETE /meals/:id

```http
DELETE /meals/4
→ 204
→ 404 {"error":"NOT_FOUND","message":"meal 4 not found","requestId":"..."}
```

## Profile shape

| Field | Type | Notes |
|---|---|---|
| `goal` | string | `cut`, `maintain`, or `bulk` |
| `fitnessLevel` | string | `beginner`, `intermediate`, or `advanced` |
| `dailyCalorieGoal` | number | Whole number from 1000 to 6000 |
| `workoutDaysPerWeek` | number | Whole number from 0 to 7 |
| `updatedAt` | string | ISO 8601 timestamp, set by the server |

These are the same fields and limits as `web/lib/profile.ts`.

## GET /profile

The demo user's profile. 404 until one has been saved, so the web app can show
"set your goal" instead of made-up values.

```http
GET /profile
→ 200 {"goal":"cut","fitnessLevel":"intermediate","dailyCalorieGoal":2200,"workoutDaysPerWeek":4,"updatedAt":"2026-11-23T17:00:00Z"}
→ 404 {"error":"NOT_FOUND","message":"no profile saved yet","requestId":"..."}
```

## PUT /profile

Creates or replaces the whole profile. All four fields are required; unknown fields are ignored.

```http
PUT /profile
{"goal":"cut","fitnessLevel":"intermediate","dailyCalorieGoal":2200,"workoutDaysPerWeek":4}
→ 200 {"goal":"cut","fitnessLevel":"intermediate","dailyCalorieGoal":2200,"workoutDaysPerWeek":4,"updatedAt":"2026-11-23T17:00:00Z"}
→ 400 {"error":"VALIDATION_ERROR","message":"dailyCalorieGoal must be a whole number from 1000 to 6000","requestId":"..."}
```

## GET /summary/daily

Totals for one day. `goalCalories` is the profile's `dailyCalorieGoal`, or 2500 when no profile is saved.

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

-- One row for the demo user until login exists. Then id becomes user_id.
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  goal TEXT NOT NULL CHECK (goal IN ('cut', 'maintain', 'bulk')),
  fitness_level TEXT NOT NULL CHECK (fitness_level IN ('beginner', 'intermediate', 'advanced')),
  daily_calorie_goal INTEGER NOT NULL CHECK (daily_calorie_goal BETWEEN 1000 AND 6000),
  workout_days_per_week INTEGER NOT NULL CHECK (workout_days_per_week BETWEEN 0 AND 7),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The API returns camelCase (`proteinG`); the database uses snake_case (`protein_g`).

## Fake data

Keep these two files identical. The daily summary example above is the total of these three meals.

- `api/src/fixtures/meals.json`
- `web/lib/fixtures.ts`
