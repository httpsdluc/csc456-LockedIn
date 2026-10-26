import { createApp } from "./app.js";
import { loadFixtureMeals } from "./fixtures.js";
import { MemoryMealStore } from "./store.js";

// 3001 so it doesn't fight Next.js for 3000 when both run locally.
const port = Number(process.env.PORT ?? 3001);
const seed = process.env.SEED_FIXTURES === "false" ? [] : loadFixtureMeals();

const app = createApp({
  store: new MemoryMealStore(seed),
  version: process.env.GIT_SHA?.slice(0, 7) ?? "dev",
  corsOrigin: process.env.CORS_ORIGIN,
});

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
