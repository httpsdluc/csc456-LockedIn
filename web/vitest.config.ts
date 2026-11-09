import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    // Unit tests start in demo mode, independent of deployment environment vars.
    // Live-mode tests explicitly override this with vi.stubEnv().
    env: { NEXT_PUBLIC_API_URL: "" },

    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["app/page.tsx", "components/**/*.{ts,tsx}", "lib/**/*.ts"],
      // Fixtures contain static sample data, not application logic.
      exclude: ["lib/fixtures.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
