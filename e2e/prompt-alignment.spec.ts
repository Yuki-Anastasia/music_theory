import { test, expect } from "@playwright/test";
import path from "node:path";

/**
 * /api/parse-prompt is mocked in every test here: the point of this suite is
 * to verify the client-side scoring/rendering pipeline (buildFeatureSamples
 * -> scorePrompt -> PromptAlignmentTab), not Claude's own parsing quality —
 * that would make the suite slow, flaky, and dependent on a paid API. Each
 * mocked concept is crafted against known ground truth in the fixtures so
 * the expected score is exact, not just "roughly right".
 */

const SCORE_FIXTURE_CONCEPTS = {
  concepts: [
    {
      // sample.musicxml has a notated tempo of 120 BPM -> tempoBpm q=1,
      // value=120, which falls inside this range -> a clean, confident match.
      concept: "速めのテンポ",
      category: "tempo",
      priority: 0.7,
      timeScope: "global",
      expected: [{ feature: "tempoBpm", kind: "range", targetRange: [100, 140], weight: 1 }],
    },
    {
      // sample.musicxml's only part is named "Piano" -> instrumentPresence is
      // ground truth (q=1) and confidently does NOT contain "orchestra" ->
      // a confident refutation (0% score, 100% coverage), not "no evidence".
      concept: "オーケストラ編成",
      category: "instrumentation",
      priority: 0.8,
      timeScope: "global",
      expected: [{ feature: "instrumentPresence", kind: "keywordMatch", targetKeyword: "orchestra", weight: 1 }],
    },
  ],
};

const AUDIO_FIXTURE_CONCEPTS = {
  concepts: [
    {
      // Audio-transcribed input never populates instrumentPresence (no
      // per-instrument identity from Basic Pitch) -> q=0 regardless of the
      // audio's actual content -> deterministically insufficientEvidence.
      concept: "オーケストラ編成",
      category: "instrumentation",
      priority: 0.8,
      timeScope: "global",
      expected: [{ feature: "instrumentPresence", kind: "keywordMatch", targetKeyword: "orchestra", weight: 1 }],
    },
    {
      // Same reasoning for instrumentTextureBuildUp.
      concept: "楽器が徐々に増える",
      category: "texture",
      priority: 0.6,
      timeScope: "global",
      expected: [{ feature: "instrumentTextureBuildUp", kind: "categorical", targetCategory: "layered", weight: 1 }],
    },
  ],
};

test("prompt alignment on score input: confident support and confident refutation", async ({ page }) => {
  await page.route("**/api/parse-prompt", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SCORE_FIXTURE_CONCEPTS) })
  );

  await page.goto("/analyze");
  await page.setInputFiles('input[type="file"][accept*="musicxml"]', path.join(__dirname, "fixtures/sample.musicxml"));

  const promptTab = page.getByRole("button", { name: "プロンプト整合性" });
  await promptTab.waitFor({ state: "visible", timeout: 20_000 });
  await promptTab.click();

  await page.locator("textarea").first().fill("速めのテンポでオーケストラが盛り上がる曲");
  await page.getByRole("button", { name: "整合性を解析" }).click();

  await expect(page.getByText("速めのテンポ", { exact: true })).toBeVisible();
  await expect(page.getByText("オーケストラ編成", { exact: true })).toBeVisible();

  // Both concepts clear the confidence bar, so both get a real score/coverage
  // rather than an "insufficient evidence" badge.
  await expect(page.getByText("一致度 100%", { exact: true })).toBeVisible();
  await expect(page.getByText("一致度 0%", { exact: true })).toBeVisible();
  await expect(page.getByText("根拠の網羅率 100%", { exact: true }).first()).toBeVisible();

  await expect(page.getByText(/Tempo \(BPM\).*120 BPM \(notated\)/)).toBeVisible();

  // The orchestra concept was confidently checked (q=1) but didn't match
  // (m=0) -- a real mismatch, not just "no evidence", so it should surface
  // an actionable "improvement hint" citing what was actually detected. Note:
  // a single-part score is labeled by its filename, not the notated part
  // name (scoreMerge.ts's "one instrument per file" convention), so the
  // detected part is "sample" (from sample.musicxml), not "Piano".
  await expect(page.getByText(/looking for "orchestra".*parts: sample/)).toBeVisible();

  // Weighted overall: (0.7*1*1 + 0.8*1*0) / (0.7*1 + 0.8*1) = 0.4667 -> 47%.
  await expect(page.getByText("全体一致度 47%")).toBeVisible();
});

test("prompt alignment on audio input: honest insufficient-evidence for instrumentation", async ({ page }) => {
  test.setTimeout(90_000);

  await page.route("**/api/parse-prompt", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUDIO_FIXTURE_CONCEPTS) })
  );

  await page.goto("/analyze");
  await page.setInputFiles('input[type="file"][accept*="audio"]', path.join(__dirname, "fixtures/sample.wav"));

  const promptTab = page.getByRole("button", { name: "プロンプト整合性" });
  await promptTab.waitFor({ state: "visible", timeout: 60_000 });
  await promptTab.click();

  await page.locator("textarea").first().fill("ストリングスとブラスが徐々に加わるオーケストラの曲");
  await page.getByRole("button", { name: "整合性を解析" }).click();

  await expect(page.getByText("オーケストラ編成", { exact: true })).toBeVisible();
  await expect(page.getByText("楽器が徐々に増える", { exact: true })).toBeVisible();

  // No score/coverage badge should ever be fabricated for these — both
  // concepts should be flagged as insufficient evidence, at 0% coverage.
  // (exact: true excludes the caveat paragraph, which also contains the
  // substring "証拠不十分" as part of a longer sentence.)
  const insufficientBadges = page.getByText("証拠不十分", { exact: true });
  await expect(insufficientBadges).toHaveCount(2);
  await expect(page.getByText("根拠の網羅率 0%", { exact: true })).toHaveCount(2);

  // Both concepts' "missing" reasons cite this — either occurrence proves the
  // point, so just check that it shows up at all.
  await expect(page.getByText(/audio-transcribed input has no per-instrument identity/).first()).toBeVisible();

  // Nothing cleared the confidence bar, so there's no overall figure at all.
  await expect(page.getByText("十分な根拠がある概念がなく、全体スコアは算出できませんでした。")).toBeVisible();
});
