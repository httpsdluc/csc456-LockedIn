#!/usr/bin/env node
// Metric xiv: the slowest queries by mean time, from pg_stat_statements.
//
// Usage (from api/):
//   DATABASE_URL=postgres://... npm run db:slowest [-- --limit 10] [-- --json] [-- --all]
//   DATABASE_URL=postgres://... npm run db:slowest -- --reset   # start a fresh measuring window
//
// By default it skips schema statements (CREATE, TRUNCATE, ...) and its own queries,
// so the list shows what the API actually runs.
import { appendFileSync } from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const limitIndex = args.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 10;
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("Set DATABASE_URL to the Postgres database to inspect.");
  process.exit(1);
}
if (!Number.isInteger(limit) || limit < 1) {
  console.error("--limit must be a whole number above 0.");
  process.exit(1);
}

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
await client.connect();

try {
  try {
    // The API creates the extension on startup, but make sure it's there (e.g. a fresh
    // database, or CI where the test schema that held it was dropped). Stats are kept
    // by the server, so nothing recorded before this is lost.
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
    await client.query("SELECT 1 FROM pg_stat_statements LIMIT 1");
  } catch {
    console.error(
      "pg_stat_statements isn't available. The server needs shared_preload_libraries=pg_stat_statements, " +
        "then run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;",
    );
    process.exitCode = 1;
    process.exit();
  }

  if (flag("reset")) {
    await client.query("SELECT pg_stat_statements_reset()");
    console.log("pg_stat_statements reset. New measurements start now.");
    process.exit();
  }

  const { rows } = await client.query(
    `SELECT s.query,
            s.calls::int AS calls,
            round(s.mean_exec_time::numeric, 3)::float AS mean_ms,
            round(s.max_exec_time::numeric, 3)::float AS max_ms,
            round(s.total_exec_time::numeric, 1)::float AS total_ms,
            s.rows::int AS rows
       FROM pg_stat_statements s
       JOIN pg_database d ON d.oid = s.dbid
      WHERE d.datname = current_database()
        AND s.query NOT ILIKE '%pg_stat_statements%'
        AND ($2 OR s.query !~* '^\\s*(create|alter|drop|truncate|set|begin|commit|rollback|show)\\M')
      ORDER BY s.mean_exec_time DESC
      LIMIT $1`,
    [limit, flag("all")],
  );

  if (flag("json")) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const oneLine = (q) => q.replace(/\s+/g, " ").trim().slice(0, 90);
    const lines = [
      `### Slowest queries by mean time (top ${limit})`,
      "",
      "| Mean (ms) | Max (ms) | Calls | Rows | Query |",
      "|---:|---:|---:|---:|---|",
      ...rows.map((r) => `| ${r.mean_ms} | ${r.max_ms} | ${r.calls} | ${r.rows} | \`${oneLine(r.query).replaceAll("|", "\\|")}\` |`),
      ...(rows.length ? [] : ["| - | - | - | - | No queries recorded yet |"]),
      "",
    ];
    console.log(lines.join("\n"));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }
} finally {
  await client.end();
}
