import { createApp } from "./app.js";
import { loadFixtureMeals } from "./fixtures.js";
import { PgMealStore } from "./pg-store.js";
import { MemoryMealStore, type MealStore } from "./store.js";

// 3001 so it doesn't fight Next.js for 3000 when both run locally.
const port = Number(process.env.PORT ?? 3001);
const seed = process.env.SEED_FIXTURES === "false" ? [] : loadFixtureMeals();

// DATABASE_URL switches the API to Postgres. Without it, meals live in memory
// and reset on restart, which is fine for local dev and tests.
async function createStore(): Promise<MealStore> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("storage: in memory (set DATABASE_URL to use Postgres)");
    return new MemoryMealStore(seed);
  }
  const store = PgMealStore.fromUrl(url);
  const { statStatements } = await store.migrate();
  const seeded = await store.seedIfEmpty(seed.map(({ id: _id, ...meal }) => meal));
  console.log(
    `storage: postgres (seeded ${seeded} meals, pg_stat_statements ${statStatements ? "on" : "off"})`,
  );
  return store;
}

const app = createApp({
  store: await createStore(),
  // Render sets RENDER_GIT_COMMIT on every deploy; GIT_SHA wins if set by hand.
  version: (process.env.GIT_SHA ?? process.env.RENDER_GIT_COMMIT)?.slice(0, 7) ?? "dev",
  corsOrigin: process.env.CORS_ORIGIN,
});

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
