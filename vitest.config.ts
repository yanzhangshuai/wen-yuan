import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(projectRoot, "src")
    }
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage/unit",
      exclude: [
        "src/generated/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/node_modules/**",
        "**/.next/**",
        "**/prisma/**",
        "**/*.test.*",
        "**/*.spec.*",
        "vitest.setup.ts"
      ],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
        statements: 80
      }
    }
  }
});
