import { test, expect } from "@playwright/test";
import path from "node:path";

/**
 * Baseline regression net for the existing analyzer: a score import should
 * populate every analysis tab with real content, not just avoid throwing.
 * This is what "Beyond the Prompt" is built on top of, so it's worth
 * protecting on its own.
 */
test("score import populates every analysis tab", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto("/analyze");

  await page.setInputFiles('input[type="file"][accept*="musicxml"]', path.join(__dirname, "fixtures/sample.musicxml"));

  // Tabs only render once status === "done" (see analyze/page.tsx) — this is
  // the natural "analysis finished" wait condition for both import paths.
  // The "Analysis" group is active by default, so its first subtab ("調性")
  // is the natural readiness signal.
  await page.getByRole("button", { name: "調性" }).waitFor({ state: "visible", timeout: 20_000 });

  await expect(page.getByText("ピアノロール", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "調性" }).click();
  await expect(page.getByText("キーの推移", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "和声" }).click();
  await expect(page.getByText("Tonnetz軌跡", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "リズム・表現" }).click();
  // Notated tempo in sample.musicxml is 120 BPM — should pass through as-is.
  await expect(page.getByText("約 120 BPM", { exact: true })).toBeVisible();

  // Switch to the "AI" group to reach its subtabs (not visible under "Analysis").
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await expect(page.getByRole("button", { name: "プロンプト整合性" })).toBeVisible();

  expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});
