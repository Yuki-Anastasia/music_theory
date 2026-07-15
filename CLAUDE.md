@AGENTS.md

# Beyond the Prompt

A feature scoring how well an AI-music-generation prompt (Suno/Udio-style)
matches a song's actual analyzed musical characteristics. Full design in
`docs/SPEC.md`, `docs/TASKS.md`, `docs/DEMO.md`. Three rules that override
any tempting shortcut when touching this feature:

- **TypeScript only, inside this app.** No Python, no second backend, no
  DB. Every "math engine" this feature needs already exists in
  `src/lib/theory/*`; `src/lib/prompt/*` packages and scores that existing
  output — it does not add new signal-processing math.
- **Closed vocabulary, enforced twice.** A prompt concept may only
  reference a feature name from `FEATURE_NAMES` in
  `src/lib/prompt/ontology.ts`. This is enforced both via the parser's tool
  JSON-Schema `enum` and via independent server-side re-validation
  (`parsePromptConceptsToolInput`) — never trust the model's raw output as
  already valid. Adding a feature means adding it to `FEATURE_REGISTRY`
  first, wiring real `q`/`value`/`evidence` sourcing in
  `featureExtraction.ts`, then extending the enum — never the reverse.
- **Never present a score as verified fact.** Every `ConceptScore` carries
  an independent `coverage`/`ConceptConfidence`, and a concept below the
  confidence threshold is reported as `insufficientEvidence` rather than
  assigned a misleading number. `OverallAlignment` always renders with its
  hedge caveat attached — never as a bare percentage.
