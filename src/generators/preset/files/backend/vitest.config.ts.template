import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          exclude: ["convex/**", "test/**"],
          include: ["**/*.test.{ts,tsx,js,jsx}"],
          name: "node",
        },
      },
      {
        extends: true,
        test: {
          environment: "edge-runtime",
          include: ["test/**/*.test.{ts,js}"],
          name: "integration",
        },
      },
    ],
  },
});
