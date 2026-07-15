# Beyond the Prompt — Spec

"Beyond the Prompt" scores how well a music-generation prompt (the text used
to prompt an AI music generator such as Suno or Udio) matches the actual,
measurable musical characteristics of a song analyzed by Notewave — with an
explicit confidence and evidence trail per concept, never asserting more
certainty than the underlying analysis supports.

This is a from-scratch design adapted from an earlier draft that assumed a
separate Python/FastAPI backend. **There is no Python anywhere in this app.**
Everything below is TypeScript, living inside the existing Next.js app
(`music-math-explorer`), built entirely on analysis this app already computes
in `src/lib/theory/*`. Beyond the Prompt adds no new signal-processing math —
only an ontology, a parser, a scoring engine, and a UI surface on top of
outputs that already exist.

## Module map

| Concern | File |
|---|---|
| Closed vocabulary (categories, features, expectation kinds) | `src/lib/prompt/ontology.ts` |
| Concept/expectation shapes | `src/lib/prompt/conceptTypes.ts` |
| Per-feature sample shape | `src/lib/prompt/featureSample.ts` |
| Packaging existing analysis into samples | `src/lib/prompt/featureExtraction.ts` |
| Match functions `m(c,f)` | `src/lib/prompt/matching.ts` |
| Scoring engine | `src/lib/prompt/scoring.ts` |
| LLM-based prompt → concepts parser | `src/lib/prompt/promptParserTool.ts` |
| API route (Claude tool-use) | `src/app/api/parse-prompt/route.ts` |
| UI tab | `src/components/analyze/PromptAlignmentTab.tsx` |

## 1. Ontology

Ten fixed concept categories (`CATEGORY_NAMES` in `ontology.ts`): `tempo`,
`energy`, `mood`, `instrumentation`, `texture`, `harmony`, `rhythm`,
`dynamics`, `genre`, `form`.

Twenty-one fixed features (`FEATURE_NAMES`), each with a `FeatureDescriptor`
(label, one-line description, value type, which categories it's evidence
for, and which `ExpectationKind`s are physically meaningful for it):

| Feature | Value type | Source (`src/lib/theory/*`) |
|---|---|---|
| `tempoBpm` | bpm | `rhythmAnalysis.ts` (`estimateTempo`) |
| `rhythmicComplexity` | unit | `rhythmAnalysis.ts` (`rhythmicEntropy`) |
| `syncopation` | unit | `meterAnalysis.ts` — **score-import only** |
| `dynamicRange` | unit | `dynamicsAnalysis.ts` |
| `averageLoudness` | unit | `dynamicsAnalysis.ts` |
| `dynamicsTrend` | categorical (`crescendo`/`diminuendo`/`stable`) | `dynamicsAnalysis.ts` |
| `arousal` | bipolar | `emotionEstimate.ts` |
| `valence` | bipolar | `emotionEstimate.ts` |
| `moodQuadrant` | categorical (`excited`/`tense`/`sad`/`calm`) | derived from valence+arousal |
| `consonance` | positiveUnbounded | `aestheticMetrics.ts` |
| `harmonicTension` | positiveUnbounded | `aestheticMetrics.ts` (voice-leading distance) |
| `diatonicity` | unit | `fourierAnalysis.ts` |
| `modality` | categorical (`major`/`minor`) | `keyProfile.ts` |
| `scaleCharacter` | categorical (9 named scales) | `pitchClassProfile.ts` |
| `selfSimilarity` | bipolar | `aestheticMetrics.ts` |
| `predictability` | unit | `aestheticMetrics.ts` |
| `formRepetitiveness` | unit | `songForm.ts` |
| `climaxPresence` | categorical (`present`/`absent`) | `songArc.ts` |
| `climaxTiming` | unit | `songArc.ts` |
| `instrumentTextureBuildUp` | categorical (`layered`/`constant`) | `instrumentDensity.ts` — **score-import only** |
| `instrumentPresence` | keywordList | notated part names — **score-import only** |

`describeFeatureNamesForPrompt()` renders this table as plain text for the
parser's system prompt, generated directly from `FEATURE_REGISTRY` — the
parser's documentation can never drift out of sync with the actual enum,
because there is only one source of truth.

**Anti-hallucination rule:** the prompt parser is a Claude tool-use call
whose JSON Schema `enum`-constrains `feature`/`category`/`kind` to these
closed lists (`buildPromptParseTool` in `promptParserTool.ts`), and every
field is independently re-validated server-side
(`parsePromptConceptsToolInput`) before use — the schema narrows what the
model is likely to emit, but the re-validation is the actual guarantee. A
concept can never reference a feature this app doesn't know how to compute.

## 2. Concept & expectation shapes

```ts
interface FeatureExpectation {
  feature: FeatureName;
  kind: "range" | "direction" | "categorical" | "keywordMatch";
  targetRange?: [number, number];      // kind === "range"
  direction?: "positive" | "negative"; // kind === "direction"
  targetCategory?: string;             // kind === "categorical"
  targetKeyword?: string;              // kind === "keywordMatch"
  weight: number;                      // a(c,f): 0-1 importance within the concept
}

interface PromptConcept {
  concept: string;        // as phrased/echoed from the prompt
  category: Category;
  priority: number;       // w(c): 0-1 importance among all concepts
  timeScope: "global";    // v1 only ever "global" — see Non-goals
  expected: FeatureExpectation[];
}
```

A feature's `supportedKinds` restricts which `kind`s are physically
meaningful for it: `bpm`/`positiveUnbounded` features have no natural
zero-center, so they only support `range`; `keywordList` only supports
`keywordMatch`; everything else supports `range`/`direction` or
`categorical` per its value type. This is enforced twice — once in the tool
schema (so the model rarely gets it wrong) and once in
`parseExpectation` (so it's never trusted blindly).

## 3. Feature extraction

`buildFeatureSamples(input: PromptAlignmentInput): FeatureSampleMap` packages
already-computed analysis into `FeatureSample { feature, value, q, evidence }`
— no new analysis math. `q` is a 0–1 detection-confidence, sourced from
whatever continuous signal already exists rather than invented:

| Signal quality | q(f) source |
|---|---|
| Notated tempo | `1` |
| Estimated tempo | tempo autocorrelation peak (`TempoEstimate.rawCorrelation`, added to `rhythmAnalysis.ts` for this feature) |
| Modality | `KeyEstimate.correlation` |
| Scale character | `ScaleFitEstimate.coverage` |
| Harmonic tension | average Tonnetz chord-detection `.coverage` across the trajectory |
| Syncopation | scaled by detected onset-pair count |
| Form repetitiveness | scaled by number of detected form windows |
| Climax presence/timing | scaled by number of arc sections considered |
| Instrument build-up / presence | `1` (ground truth from notated part names) when present |
| Everything else (rhythmic complexity, dynamics, valence/arousal, consonance, predictability, self-similarity, diatonicity) | note-count-based "data sufficiency" fallback, `noteCount / 50` clamped to `[0,1]` — an explicit MVP approximation, not a validated confidence signal |

A feature absent from the input (e.g. `instrumentTextureBuildUp` on an
audio-only upload) is **omitted from the map entirely**, never defaulted to
a guess. This is also how the "no real audio timbre/instrument classifier"
gap resolves itself for free: instrumentation concepts scored against
audio-only input naturally get `q = 0` for those features → low coverage →
reported as insufficient evidence, with zero special-case code.
`explainUnavailableFeature(feature)` gives a source-aware, honest reason
(e.g. "audio-transcribed input has no per-instrument identity") surfaced in
the report's "missing" list.

## 4. Matching functions — m(c,f)

`src/lib/prompt/matching.ts`:

- **`matchRange(value, [min,max])`** — `1` inside the range; falls off
  linearly to `0` at one range-width beyond either edge
  (`DEFAULT_RANGE_SOFTNESS = 1`, tunable).
- **`matchDirection(value, direction, valueType)`** — sign-based against a
  neutral center (`unit` values are rescaled to bipolar first); only called
  for `bipolar`/`unit` features, since `bpm`/`positiveUnbounded` have no
  natural center.
- **`matchCategorical(value, targetCategory)`** — exact match only; no
  partial credit for "adjacent" categories in v1.
- **`matchKeywordMatch(value, targetKeyword)`** — case-insensitive two-way
  substring containment against a comma-joined list of names (e.g. does an
  "orchestra" concept's keyword match a part literally named "Violin I"?
  no; does "sax" match "Alto Saxophone"? yes). A deliberately loose
  heuristic, not a semantic instrument-family classifier.
- **`computeMatch(expectation, sample)`** — dispatches by `kind`; returns
  `0` when the sample is missing or its value's type doesn't fit the
  expectation's kind (defensive; should not happen if the parser only ever
  emits kinds a feature's `supportedKinds` allows, but never trusted
  blindly here either).

## 5. Scoring engine

Constants (`src/lib/prompt/scoring.ts`, all named/exported/tunable, **MVP
defaults, not validated science**):

- `MIN_FEATURE_CONFIDENCE = 0.5` (τ) — a feature counts as confidently
  detected at or above this `q`.
- `MIN_CONCEPT_CONFIDENCE_FOR_OVERALL = 0.35` — a concept below this
  `ConceptConfidence` is reported as insufficient evidence and excluded
  from `OverallAlignment`.
- `SUPPORT_MATCH_THRESHOLD = 0.6` — a confidently-detected feature is cited
  as "support" in the report at or above this match score.

Formulas:

```
ConceptScore(c)      = Σ[a(c,f)·q(f)·m(c,f)] / Σ[a(c,f)·q(f)]
coverage(c)          = |{f ∈ F(c): q(f) ≥ τ}| / |F(c)|
ConceptConfidence(c) = coverage(c) · Σ[a(c,f)·q(f)] / Σ[a(c,f)]
status               = "insufficientEvidence" if ConceptConfidence(c) < 0.35, else "scored"
OverallAlignment     = Σ_scored[w(c)·ConceptConfidence(c)·ConceptScore(c)]
                        / Σ_scored[w(c)·ConceptConfidence(c)]     (null if nothing qualifies)
```

An expectation whose feature has no sample at all contributes `q = 0`,
which is automatically inert in `ConceptScore`'s weighted average — it only
affects `coverage`'s denominator. No special-casing is needed for "feature
wasn't computed for this input" vs. "feature was computed but didn't
match."

`OVERALL_CONFIDENCE_CAVEAT` is a fixed hedge string attached to every
report and always rendered in the UI alongside `OverallAlignment` — never a
bare percentage, per this project's broader convention (see the root
`CLAUDE.md`) of never presenting a score as scientifically verified.

**Contradiction detection:** `detectContradictions(concepts)` flags pairs
of concepts whose `"direction"` expectations target the *same* feature with
opposite signs (e.g. "minimal" vs. "wall of sound" both constraining
`averageLoudness`). Contradictory concepts are scored independently and
both flagged — never averaged into one muddy number.

Each `ConceptResult` carries `support[]` / `missing[]` / `contradictions[]`
human-readable string lists for the report, alongside the numeric
`score`/`confidence`/`coverage`/`status`.

## 6. Prompt parser (Claude tool-use)

`src/lib/prompt/promptParserTool.ts` + `src/app/api/parse-prompt/route.ts`.
Follows the exact pattern already used by
`src/lib/theory/editableNotesPrompt.ts` and `src/app/api/summarize/route.ts`:

- `buildPromptParseTool()` builds a locally-typed (SDK-independent) tool
  schema, enum-constraining `category`/`feature`/`kind`.
- The route forces tool use
  (`tool_choice: { type: "tool", name: PARSE_PROMPT_TOOL_NAME }`) — unlike
  `/api/summarize`, this route's only job is structured extraction, so
  there's no prose fallback branch.
- `parsePromptConceptsToolInput(input)` defensively re-validates every
  field and never throws: an unknown feature name drops the expectation; a
  `kind` not in that specific feature's `supportedKinds` drops it; a
  non-numeric weight drops it; an invalid categorical value drops it; an
  inverted range is swapped, not dropped; out-of-range priority/weight is
  clamped, not dropped; a concept left with zero valid expectations is
  dropped entirely. Untrusted model output is never assumed well-formed.
- Locale-keyed error strings (ja/en) and `ANTHROPIC_API_KEY`/
  `RateLimitError`/`AuthenticationError` handling mirror `/api/summarize`
  exactly.

## 7. UI

`src/components/analyze/PromptAlignmentTab.tsx`, wired into
`src/app/analyze/page.tsx` as an additional tab (`"promptAlignment"`)
alongside Overview/Tonality/Harmony/Expression/AI Explanation — an optional
add-on to the existing single analyze page, not a separate route. A
textarea + "analyze alignment" button; once a report exists, an
`OverallAlignment` headline (or an explicit "nothing scoreable" message if
every concept was excluded) with its caveat always shown beneath it, then
one card per concept with score/coverage/support/missing/contradiction
lists, visually muted for `insufficientEvidence` concepts.

## Known limitations (explicit, not oversights)

- **No real audio-based instrument/timbre classification.** Basic Pitch
  (the audio transcription path) estimates pitch only, not which
  instrument played it. Instrumentation concepts scored against audio-only
  input correctly come back low-evidence via the coverage math, not a
  special case. Full stem separation (e.g. Demucs via ONNX Runtime Web)
  was investigated and explicitly deferred: heavy models (100+ MB),
  unofficial community ports, and even a 6-stem model still buckets many
  real instruments (synths, strings, horns) into an undifferentiated
  "other" category — not a good cost/benefit fit for this feature yet.
- **No Euclidean/Toussaint rhythm-pattern-vs-canonical-pattern matching.**
  Reserved as a future `ExpectationKind`, not implemented.
- **No per-section (`{start, end}`) `timeScope`.** v1 scores whole-song
  aggregates only; the `TimeScope` union already includes the shape for
  this so it can be added additively later.
- **No partial credit for "adjacent" categorical matches** (e.g. a
  "dorian" expectation doesn't partially credit a detected "mixolydian").
- **The note-count-based confidence fallback is an approximation.** For
  features with no native continuous confidence signal (rhythmic
  complexity, dynamics, valence/arousal, consonance, predictability,
  self-similarity, diatonicity), `q` is derived from how much material was
  analyzed, not from how *reliable* the specific estimate is. This is
  flagged here rather than silently presented as calibrated.
