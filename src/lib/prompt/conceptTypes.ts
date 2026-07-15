import type { Category, ExpectationKind, FeatureName } from "./ontology";

/**
 * "global" is the only value produced/consumed in v1 — no per-section
 * ({start, end}) scoring yet (see docs/SPEC.md's non-goals). The union
 * exists now so later per-section support is a additive, not a breaking,
 * change to this type.
 */
export type TimeScope = "global" | { start: number; end: number };

/**
 * One feature this concept expects to see a particular value for, with an
 * importance weight a(c,f) used by the scoring engine. Exactly one of
 * targetRange/direction/targetCategory should be set, matching `kind` and
 * constrained by that feature's FeatureDescriptor.supportedKinds (see
 * ontology.ts) — enforced by the parser's defensive validation
 * (promptParserTool.ts), not by this type alone.
 */
export interface FeatureExpectation {
  feature: FeatureName;
  kind: ExpectationKind;
  /** kind === "range": inclusive [min, max] the feature's value should fall within. */
  targetRange?: [number, number];
  /** kind === "direction": which way the feature should lean relative to its neutral center. */
  direction?: "positive" | "negative";
  /** kind === "categorical": the expected categorical value (must be one of the feature's categoricalValues). */
  targetCategory?: string;
  /** kind === "keywordMatch": a free-text keyword (e.g. an instrument name) matched by substring against the feature's keywordList value. */
  targetKeyword?: string;
  /** a(c,f): relative importance of this feature within the concept, 0-1. */
  weight: number;
}

/** A single musical concept extracted from a generation prompt, with the analysis features expected to support it. */
export interface PromptConcept {
  /** The concept as phrased/echoed from the prompt, e.g. "driving four-on-the-floor energy". */
  concept: string;
  category: Category;
  /** w(c): relative importance of this concept among all concepts in the prompt, 0-1. */
  priority: number;
  timeScope: TimeScope;
  expected: FeatureExpectation[];
}

export interface ParsedPrompt {
  rawPrompt: string;
  concepts: PromptConcept[];
}
