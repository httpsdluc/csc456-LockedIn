import pg from "pg";
import { toIsoUtc } from "./dates.js";
import type { MealStore } from "./store.js";
import type { Meal, MealType, NewMeal } from "./types.js";

/**
 * The table from CONTRACT.md ("Database"), created if it isn't there yet, so it's
 * safe to run on every start. Change CONTRACT.md first if this needs to change.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meals (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  calories INTEGER NOT NULL CHECK (calories >= 0),
  protein_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  fat_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  eaten_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meals_eaten_at_idx ON meals (eaten_at);
`;

const MAX_INT = 2_147_483_647;
const COLUMNS ="id, name, meal_type, calories, protein_g, carbs_g, fat_g, eaten_at";

interface MealRow {
  id: number;
  name: string;
  meal_type: MealType;
  calories: number;
  // node-postgres returns NUMERIC as a string so it never loses precision.
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  eaten_at: Date;
}

function toMeal(row: MealRow): Meal {
  return {
    id: row.id,
    name: row.name,
    mealType: row.meal_type,
    calories: row.calories,
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    eatenAt: toIsoUtc(row.eaten_at),
  };
}

/** Postgres-backed store. Same behavior as MemoryMealStore, but data survives restarts. */
export class PgMealStore implements MealStore {
  constructor(private readonly pool: pg.Pool) {}

  /** Builds a pool from a connection string, e.g. DATABASE_URL. */
  static fromUrl(connectionString: string): PgMealStore {
    // Hosted Postgres (Render, Neon) requires TLS; local and CI databases don't.
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
    return new PgMealStore(
      new pg.Pool({
        connectionString,
        ssl: local ? undefined : { rejectUnauthorized: false },
        max: 5,
        // Fail fast so /health reports 503 instead of hanging when the database is down.
        connectionTimeoutMillis: 5_000,
      }),
    );
  }

  /** Creates the table and index. Returns whether pg_stat_statements is on (metric xiv). */
  async migrate(): Promise<{ statStatements: boolean }> {
    await this.pool.query(SCHEMA);
    try {
      // Needs shared_preload_libraries=pg_stat_statements on the server. Hosted
      // Postgres usually has it; if not, the app still works without the metric.
      await this.pool.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
      await this.pool.query("SELECT 1 FROM pg_stat_statements LIMIT 1");
      return { statStatements: true };
    } catch {
      return { statStatements: false };
    }
  }

  /** Inserts the sample meals only when the table is empty, so restarts don't duplicate them. */
  async seedIfEmpty(meals: NewMeal[]): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>("SELECT count(*) FROM meals");
    if (Number(rows[0]?.count) > 0) return 0;
    for (const meal of meals) await this.create(meal);
    return meals.length;
  }

  async listBetween(start: Date, end: Date): Promise<Meal[]> {
    const { rows } = await this.pool.query<MealRow>(
      `SELECT ${COLUMNS} FROM meals WHERE eaten_at >= $1 AND eaten_at < $2 ORDER BY eaten_at, id`,
      [start, end],
    );
    return rows.map(toMeal);
  }

  async create(meal: NewMeal): Promise<Meal> {
    const { rows } = await this.pool.query<MealRow>(
      `INSERT INTO meals (name, meal_type, calories, protein_g, carbs_g, fat_g, eaten_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
      [meal.name, meal.mealType, meal.calories, meal.proteinG, meal.carbsG, meal.fatG, meal.eatenAt],
    );
    return toMeal(rows[0]!);
  }

  async delete(id: number): Promise<boolean> {
    // Ids are Postgres integers. A bigger id can't exist, and passing it would be a 500, not a 404.
    if (!Number.isInteger(id) || id < 1 || id > MAX_INT) return false;
    const { rowCount } = await this.pool.query("DELETE FROM meals WHERE id = $1", [id]);
    return rowCount === 1;
  }

  async ping(): Promise<boolean> {
    await this.pool.query("SELECT 1");
    return true;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
