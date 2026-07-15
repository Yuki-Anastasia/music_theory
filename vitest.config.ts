import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

// e2e/*.spec.ts are Playwright tests (see playwright.config.ts) — they use
// @playwright/test's own test()/expect() and must not be picked up by
// vitest's default *.spec.ts glob.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
