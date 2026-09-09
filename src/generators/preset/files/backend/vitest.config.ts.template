import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          exclude: ["convex/**"],
          include: ["**/*.test.{ts,tsx,js,jsx}"],
          name: "node",
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        test: {
          environment: "edge-runtime",
          include: ["convex/**/*.test.{ts,js}"],
          name: "convex",
          passWithNoTests: true,
        },
      },
    ],
  },
});
