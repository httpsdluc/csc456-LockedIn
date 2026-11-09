# web

Next.js frontend for LockedIn, deployed on Vercel.

**Try it live: https://lockedin-sage.vercel.app**

- **Status page:** https://stats.uptimerobot.com/jquU8yRRPp (UptimeRobot, checked every 5 minutes)
- **Owners:** Sri (lead), Diana (meals page)
- **Stack:** Next.js, TypeScript, Tailwind CSS, Vitest and React Testing Library

## Run it locally

For working on the code on your own computer:

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:3000.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server on port 3000 |
| `npm test` | Runs the unit tests with a coverage report |
| `npm run build` | Builds for production and type-checks |
| `npm run lint` | Runs ESLint |

## Connecting to the API

The web app reads the API's address from `NEXT_PUBLIC_API_URL`.

| Setting | What happens |
|---|---|
| Not set | **Demo mode.** Shows the sample meals from `lib/fixtures.ts`. Added or deleted meals stay in the browser and reset on refresh. |
| Set, API reachable | **Live mode.** Reads and saves meals through the API (`GET /meals`, `POST /meals`, `DELETE /meals/:id`, `GET /summary/daily`). |
| Set, API unreachable | Falls back to the sample meals and shows a message. |

The deployed API is https://csc456-lockedin.onrender.com. To use it, set `NEXT_PUBLIC_API_URL` in Vercel under **Project Settings → Environment Variables** and redeploy. The API's `CORS_ORIGIN` must allow the Vercel URL.

To test against an API running on your own computer, create `web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Where things are

| Path | What it is |
|---|---|
| `app/page.tsx` | Page layout and header |
| `components/Dashboard.tsx` | Daily summary, progress ring, macro breakdown, meal list |
| `components/MealForm.tsx` | Log a Meal form and its validation |
| `lib/api.ts` | API client, plus the daily totals used in demo mode |
| `lib/fixtures.ts` | Sample meals. Keep identical to `api/src/fixtures/meals.json` (see CONTRACT.md). |
| `test/` | Unit tests |

## Tests

Tests use Vitest and React Testing Library, with a fake API in `test/helpers.ts`, so they don't need the backend running. CI runs `npm test` on every PR and reports coverage.

Key elements have `data-testid`s (for example `stat-calories-consumed`, `meal-name-input` and `meal-submit`) so the Playwright tests in `e2e/` don't break when the layout changes.

## Deploy

```bash
cd web
npx vercel --prod
```

This deploys to the `lockedin` project on Vercel. The live URL stays the same, so the uptime monitor keeps tracking it. Deploys aren't automatic yet, so run this after changes merge to `main`.
