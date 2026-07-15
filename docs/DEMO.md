# Beyond the Prompt — Demo

How to try the feature, and what to expect. All examples below assume a
song has already been analyzed on `/analyze` (via audio upload/recording or
score import) — the "Prompt Alignment" tab appears alongside
Overview/Tonality/Harmony/Expression/AI Explanation once analysis finishes.

## How to try it

1. Go to `/analyze`, analyze a song (upload audio, record from a mic, or
   import a MusicXML/Guitar Pro file).
2. Open the **プロンプト整合性 / Prompt Alignment** tab.
3. Paste the text prompt you'd give (or gave) to an AI music generator like
   Suno or Udio.
4. Click **整合性を解析 / Analyze alignment**. This calls `/api/parse-prompt`
   (Claude, tool-use forced), which extracts structured concepts, then
   scores them client-side against the song's already-computed analysis.

Requires `ANTHROPIC_API_KEY` in `.env.local`, same as the existing AI
Explanation tab.

## Example 1 — score input, mixed result (verified live)

Song: a solo piano MusicXML score.
Prompt (Japanese): *"疾走感のあるエネルギッシュな曲、テンポは速く、サビでオーケストラが盛り上がる"*
("A driving, energetic track, fast tempo, with the orchestra swelling at
the chorus.")

Observed result:

- **"疾走感のあるエネルギッシュな曲" (driving, energetic)** — scored ~74%,
  supported by `moodQuadrant` (excited: positive valence, positive arousal)
  and `averageLoudness`.
- **"オーケストラ編成" (orchestral arrangement)** — scored **0% at 100%
  coverage**. This is not a failure — `instrumentPresence` was confidently
  checked against the score's actual notated parts (piano only) and
  confidently found absent. High coverage + low score means "we checked
  carefully and it genuinely doesn't match," which is exactly the kind of
  honest negative result this feature is meant to surface, as opposed to a
  vague "not enough evidence."

This example deliberately keeps one honestly negative concept in the demo,
rather than only showing flattering results.

## Example 2 — tempo + dynamics, a clean positive match

Prompt: *"a slow, quiet, sparse ballad"*

Expect: a `tempoBpm` expectation with a low target range, `averageLoudness`
and `dynamicRange` expectations leaning low, all with high `q` (tempo/
dynamics have strong native or note-count-based confidence for most songs
of reasonable length) — a high `ConceptScore` for an actually slow, quiet
song, and correctly low for a fast/loud one. Good category to demo because
`tempoBpm`, `averageLoudness`, and `dynamicRange` all have strong signal
regardless of input source (audio or score).

## Example 3 — an honest `insufficientEvidence` case on audio input

Song: a short audio recording (not a score import) — no notated parts, so
`instrumentPresence` and `instrumentTextureBuildUp` are never populated in
the feature-sample map at all (see `buildFeatureSamples` in
`featureExtraction.ts`).
Prompt: *"strings and brass build up gradually before a piano solo enters"*

Expect: this concept's `expected` list is dominated by
`instrumentTextureBuildUp`/`instrumentPresence`. Both features are simply
absent from the sample map for audio input, so `coverage` stays at 0 for
those expectations and the concept's `ConceptConfidence` falls below the
0.35 threshold — the UI shows a muted, explicitly-labeled
**insufficient evidence** card citing *"audio-transcribed input has no
per-instrument identity"* (from `explainUnavailableFeature`), rather than a
fabricated percentage. This is the deliberate, honest failure mode the
scoring design exists to produce — see docs/SPEC.md's "Known limitations."

## What "Overall Alignment" does and doesn't mean

The headline `OverallAlignment` percentage (when present) is a priority-
and-confidence-weighted average of only the concepts that cleared the
evidence bar — concepts reported as `insufficientEvidence` are excluded
from it entirely, and if *no* concept clears the bar it is shown as null
("nothing scoreable"), never a fabricated 0%. The caveat text
(`OVERALL_CONFIDENCE_CAVEAT`) is always rendered directly beneath it:
*"This is an MVP alignment estimate based on measurable musical features,
not a verified or scientific judgment of prompt fidelity."* This is not
boilerplate — it is load-bearing, since several of the underlying `q`
values are a note-count-based approximation rather than a calibrated
confidence (see docs/SPEC.md §3).
