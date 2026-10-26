# api

Express + TypeScript backend.

- Owner: Arsenii Chan (backend)
- Endpoints: see [CONTRACT.md](../CONTRACT.md)
- Fake data: `src/fixtures/meals.json`

## Run it

Needs Node 20.10 or newer.

```bash
cd api
npm ci          # use ci, not install, so you get the exact locked versions
npm run dev     # http://localhost:3001, restarts on save
```

Then try:

```bash
curl localhost:3001/health
curl "localhost:3001/meals?date=2026-10-26"
curl "localhost:3001/summary/daily?date=2026-10-26"
curl -X POST localhost:3001/meals -H "Content-Type: application/json" \
  -d '{"name":"Greek yogurt","mealType":"snack","calories":150,"proteinG":15}'
```

The three fake meals are dated 2026-10-26, so pass `?date=2026-10-26` to see them on any other day.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs `src/server.ts` with reload on save |
| `npm test` | Type check, then all tests with a coverage report (fails under 80%) |
| `npm run build` | Compiles to `dist/` |
| `npm start` | Runs the compiled build (what the server should run) |

The coverage report prints in the terminal and in the CI log for every PR. An HTML version lands in `coverage/index.html`.

## Environment variables

| Name | Default | What |
|---|---|---|
| `PORT` | `3001` | Port to listen on. 3001 so it doesn't clash with Next.js on 3000. |
| `GIT_SHA` | `dev` | Commit being run. `/health` reports the first 7 characters so we can tell which deploy is live. |
| `CORS_ORIGIN` | `*` | The web app's URL once it's deployed. Lock this down before real users. |
| `SEED_FIXTURES` | `true` | Set to `false` to start with no meals. |

## Code layout

| File | What |
|---|---|
| `src/app.ts` | Routes. `createApp()` builds the app without starting a server, which is what the tests use. |
| `src/server.ts` | Reads env vars and starts listening. Nothing else. |
| `src/store.ts` | `MealStore` interface plus the in-memory version used for now. |
| `src/validation.ts` | Checks POST bodies and fills in defaults. |
| `src/dates.ts` | Turns `?date=YYYY-MM-DD` into a UTC day range. |
| `src/fixtures.ts` | Loads `meals.json` and validates it on startup. |

## Known limits (on purpose for Sprint 1)

- **Data lives in memory.** It resets on every restart. The routes only talk to the `MealStore` interface, so the Postgres version (table in CONTRACT.md) plugs in without touching them.
- **Days are UTC.** A meal at 9pm in New York lands on the next day's list. Fix when user profiles add a timezone.
- **One demo user, no auth.** Same as CONTRACT.md.
- **`goalCalories` is hardcoded to 2500** until profiles exist.
