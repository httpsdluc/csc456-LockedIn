import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // server.ts only reads env vars and calls listen(). Everything it wires
      // together is tested through createApp().
      exclude: ["src/server.ts"],
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
