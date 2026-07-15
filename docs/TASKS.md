# Beyond the Prompt — Tasks

Status snapshot of the "Beyond the Prompt" feature. All milestones below are
**complete**; this file records what was built and in what order, for
future reference — not a live sprint board.

## Milestone 0 — verify the existing analyzer works

Confirmed before any new code was written: `npm install`, `npm test`,
`npm run build` all clean on a fresh checkout, and a manual pass in a real
browser (upload → Overview/Tonality/Harmony/Expression tabs populate → AI
Explanation tab successfully calls `/api/summarize`). This was a hard
prerequisite — the feature is only worth adding on top of a verified
baseline, not an assumed one.

## Milestone 1 — ontology & concept types

- `src/lib/prompt/ontology.ts` — `CATEGORY_NAMES`, `FEATURE_NAMES`,
  `FEATURE_REGISTRY`, `describeFeatureNamesForPrompt()`.
- `src/lib/prompt/conceptTypes.ts` — `PromptConcept`, `FeatureExpectation`,
  `ParsedPrompt`, `TimeScope`.
- `src/lib/prompt/featureSample.ts` — `FeatureSample`, `FeatureSampleMap`.
- Tests: `ontology.test.ts` — registry keys match `FEATURE_NAMES` exactly,
  categories drawn from `CATEGORY_NAMES`, every descriptor has ≥1
  `supportedKinds`, value-type/kind constraints hold (bpm/positiveUnbounded
  → range only, keywordList → keywordMatch only), and
  `describeFeatureNamesForPrompt()` mentions every feature name and
  categorical value (a drift guard).

## Milestone 2 — matching functions

- `src/lib/prompt/matching.ts` — `matchRange`, `matchDirection`,
  `matchCategorical`, `matchKeywordMatch`, `computeMatch`.
- Tests: `matching.test.ts` — range in/out-of-bounds + linear falloff,
  direction sign handling (including `unit`→bipolar rescaling), categorical
  exact/mismatch, keyword two-way substring containment, and
  `computeMatch`'s dispatch/defensive-mismatch behavior.

## Milestone 3 — feature extraction

- `src/lib/prompt/featureExtraction.ts` — `buildFeatureSamples`,
  `explainUnavailableFeature`.
- `src/lib/theory/rhythmAnalysis.ts` — additive `rawCorrelation?: number`
  field on `TempoEstimate`, populated from the autocorrelation peak
  `estimateTempo` already computed internally but previously discarded;
  gives estimated tempo a real continuous confidence instead of only
  "high"/"low".
- Tests: `featureExtraction.test.ts` — per-feature `q` sourcing (notated vs.
  estimated tempo, native q for modality/scaleCharacter/harmonicTension,
  data-sufficiency fallback elsewhere), omission (not defaulting) of
  score-only features for audio-like input, inclusion for score-like input,
  `explainUnavailableFeature` coverage for every `FeatureName`.
  `rhythmAnalysis.test.ts` — `rawCorrelation` present/high for periodic
  input, `undefined` for too few events.

## Milestone 4 — scoring engine

- `src/lib/prompt/scoring.ts` — `scoreConceptCore`, `scorePrompt`,
  `detectContradictions`, named threshold constants.
- Tests: `scoring.test.ts` — a hand-computed two-feature fixture
  (`ConceptScore≈0.9461538`, `coverage=1`, `ConceptConfidence=0.78`)
  verified against the formulas above; a zero-sample concept correctly
  excluded from `OverallAlignment`; combined scored+excluded
  `OverallAlignment`; support/missing/neither bucketing; contradiction
  detection and per-concept surfacing.

## Milestone 5 — prompt parser (Claude tool-use)

- `src/lib/prompt/promptParserTool.ts` — `buildPromptParseTool`,
  `parsePromptConceptsToolInput`.
- `src/app/api/parse-prompt/route.ts` — mirrors `/api/summarize`'s
  validation/error/locale pattern; forces tool use.
- Tests: `promptParserTool.test.ts` (15 cases) — valid parsing, malformed
  input (non-object, non-array), unknown feature, wrong kind for a given
  feature, non-numeric weight, empty `expected`, invalid category/
  categorical value, inverted-range swap, priority/weight clamping,
  partial-validity (keep a concept if ≥1 expectation is valid), mixed
  valid/invalid concepts in one array.

## Milestone 6 — UI wiring

- `src/components/analyze/PromptAlignmentTab.tsx` — textarea, analyze
  button, overall alignment headline + caveat, per-concept cards.
- `src/lib/i18n/dict/promptAlignmentTab.ts` — ja/en dict.
- `src/lib/i18n/dict/analyzeShell.ts` — `"promptAlignment"` added to
  `TabId` + tab labels.
- `src/app/analyze/page.tsx` — new tab wired into `TAB_ORDER`, state for
  the prompt text/parse status/parsed result (reset on every new
  upload), `featureSamples`/`promptAlignmentReport` derived alongside the
  page's other per-song values.
- Verified live in a real browser (Playwright): sample MusicXML upload →
  entered a Japanese prompt → real Claude API call → scored concepts
  rendered correctly, including a confidently-refuted `insufficientEvidence`
  case (an "orchestra" concept scoring 0% at 100% coverage against a
  solo-piano score).
- Two bugs found and fixed during that live pass:
  1. **Stale-closure 400 error** — `onAnalyze`'s signature changed from
     `() => void` to `(prompt: string) => void` so the just-typed text is
     passed directly, instead of depending on a parent state update
     landing before the analyze call read it.
  2. **Redundant evidence text** — ~10 evidence strings in
     `featureExtraction.ts` restated the feature label that `scoring.ts`
     already prepends (e.g. "Mood quadrant: mood quadrant: excited...");
     trimmed to avoid the double phrasing.

## Milestone 7 — docs

- `docs/SPEC.md`, `docs/TASKS.md` (this file), `docs/DEMO.md`.
- `CLAUDE.md` — "Beyond the Prompt" addendum (scope boundary, closed-enum
  rule, no-overclaiming-confidence rule), `@AGENTS.md` include left intact.

## Not in v1 (explicit, see docs/SPEC.md's "Known limitations")

- Real audio-based instrument/timbre classification (stem separation was
  researched and deliberately deferred, not forgotten).
- Euclidean/Toussaint canonical-rhythm-pattern matching.
- Per-section (`{start, end}`) scoring — v1 is whole-song only.
- Partial credit for "adjacent" categorical matches.
