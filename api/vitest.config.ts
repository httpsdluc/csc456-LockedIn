import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // server.ts only reads env vars and calls listen(). Everything it wires
      // together is tested through createApp().
      // pg-store.ts is tested against a real database only when TEST_DATABASE_URL
      // is set (CI always sets it), so leave it out of local runs without one.
      exclude: process.env.TEST_DATABASE_URL ? ["src/server.ts"] : ["src/server.ts", "src/pg-store.ts"],
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
