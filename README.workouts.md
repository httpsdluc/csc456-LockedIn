# Adaptive Workouts

The Workouts page adds weekly workout plans to LockedIn. It uses the saved
profile’s fitness goal, fitness level, and training days, plus the equipment
selected on the Workouts page. The dashboard, meal logging, and profile retain
their existing routes and behavior.

## What changed

- `POST /workouts/plan` uses DeepSeek V4.1 Flash 1017 through OpenRouter’s
  Mistral endpoint. The Express API validates the returned plan before
  displaying it.
- The Workouts page saves the active plan and weekly session check-ins in
  browser storage. Users can record completion, difficulty, skips, or
  scheduling conflicts.
- `POST /workouts/review` sends the current plan and up to four calendar weeks
  of check-ins to Jev. Jev chooses whether to keep the plan, change the
  schedule, or adjust training volume. The API checks the recommendation
  before asking DeepSeek to draft a replacement. Users review and accept the
  proposed plan before it takes effect.
- Accepting a replacement starts a fresh set of check-ins for its sessions.
  Plans and check-ins are scoped to the current browser.

The request and response shapes are in [CONTRACT.md](CONTRACT.md).

## Run locally

1. Run `npm ci` in both `api/` and `web/`.
2. In the API shell, set `OPENROUTER_API_KEY` in the environment and run
   `npm run dev` from `api/`. The default port is 3001.
3. To use your own Mistral credits, add your Mistral provider key in
   [OpenRouter’s workspace BYOK settings](https://openrouter.ai/settings/integrations).
   The API routes workout generation to Mistral. Jev is billed to the
   OpenRouter account. To require your own Mistral key, disable shared
   capacity fallback for the model in the BYOK settings.
4. In `web/`, set `NEXT_PUBLIC_API_URL=http://localhost:3001` in
   `.env.local`, then run `npm run dev`.
5. Open `/profile`, save a profile with at least one training day, and open
   `/workouts`. Select equipment and generate a plan. Record check-ins and
   select **Review my week** to request an adaptation.

Use a spend-limited OpenRouter key for a demo. Keep OpenRouter credentials in
the API environment. The frontend only needs the LockedIn API URL.

## Verify the flow

Run `npm test` in `api/` and `web/`. The workout tests mock provider
responses and cover generation, check-in persistence, invalid responses,
and adapting a four-day plan to three days after recurring schedule
conflicts. The UI test also verifies that the active plan changes only when
the user accepts the proposal. These tests run without provider credentials.
