import type { Category, FeatureName } from "./ontology";
import { FEATURE_REGISTRY } from "./ontology";
import type { ParsedPrompt, PromptConcept } from "./conceptTypes";
import type { FeatureSampleMap } from "./featureSample";
import { computeMatch } from "./matching";
import { explainUnavailableFeature } from "./featureExtraction";

// MVP thresholds/constants (SPEC §6.2-6.3) — named and exported so they can
// be tuned later without hunting through the scoring math; not validated
// against real prompts/songs.

/** τ: a feature counts as "confidently detected" (F_ok) at or above this q(f). */
export const MIN_FEATURE_CONFIDENCE = 0.5;
/** A concept below this ConceptConfidence is reported as insufficient evidence and excluded from OverallAlignment. */
export const MIN_CONCEPT_CONFIDENCE_FOR_OVERALL = 0.35;
/** m(c,f) at or above this, for a confidently-detected feature, is cited as "support" in the report. */
export const SUPPORT_MATCH_THRESHOLD = 0.6;

export const OVERALL_CONFIDENCE_CAVEAT =
  "This is an MVP alignment estimate based on measurable musical features, not a verified or scientific judgment of prompt fidelity. Concepts with insufficient evidence are excluded from this figure.";

export interface Contradiction {
  feature: FeatureName;
  conceptA: string;
  conceptB: string;
  directionA: "positive" | "negative";
  directionB: "positive" | "negative";
}

export interface ConceptResult {
  concept: string;
  category: Category;
  priority: number;
  /** ConceptScore(c) — always computed, even when status is "insufficientEvidence" (score and confidence are independent axes). */
  score: number;
  /** ConceptConfidence(c). */
  confidence: number;
  /** coverage(c): fraction of this concept's expected features that were confidently detected. */
  coverage: number;
  status: "scored" | "insufficientEvidence";
  support: string[];
  contradictions: string[];
  missing: string[];
}

export interface PromptAlignmentReport {
  concepts: ConceptResult[];
  /** null only when every concept was excluded as insufficient evidence. */
  overallAlignment: number | null;
  overallConfidenceCaveat: string;
  contradictions: Contradiction[];
}

/**
 * Flags concept pairs whose "direction" expectations target the same
 * feature with opposite signs (e.g. "minimal" vs. "wall of sound" both
 * constraining loudness). Per the source spec, contradictory concepts are
 * scored independently and flagged here — never averaged into one number.
 */
export function detectContradictions(concepts: PromptConcept[]): Contradiction[] {
  const contradictions: Contradiction[] = [];

  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const a = concepts[i];
      const b = concepts[j];
      for (const expA of a.expected) {
        if (expA.kind !== "direction" || !expA.direction) continue;
        for (const expB of b.expected) {
          if (expB.kind !== "direction" || !expB.direction) continue;
          if (expA.feature !== expB.feature || expA.direction === expB.direction) continue;
          contradictions.push({
            feature: expA.feature,
            conceptA: a.concept,
            conceptB: b.concept,
            directionA: expA.direction,
            directionB: expB.direction,
          });
        }
      }
    }
  }

  return contradictions;
}

interface ScoredConceptCore {
  score: number;
  confidence: number;
  coverage: number;
  status: "scored" | "insufficientEvidence";
  support: string[];
  missing: string[];
}

/**
 * ConceptScore(c) = Σ[a·q·m] / Σ[a·q]
 * coverage(c)     = |{f: q(f) >= τ}| / |F(c)|
 * ConceptConfidence(c) = coverage(c) · Σ[a·q] / Σ[a]
 *
 * An expectation whose feature has no sample at all contributes q=0 (via
 * computeMatch/samples lookup below), which is automatically inert in
 * ConceptScore's weighted average — it only affects coverage (still counted
 * in F(c)'s denominator). No special-casing needed for "feature wasn't
 * computed for this input" vs. "feature was computed but didn't match".
 */
function scoreConceptCore(concept: PromptConcept, samples: FeatureSampleMap): ScoredConceptCore {
  let weightedMatchSum = 0; // Σ[a·q·m]
  let weightedConfidenceSum = 0; // Σ[a·q]
  let totalWeight = 0; // Σ[a]
  let coveredCount = 0; // |F_ok(c)|
  const support: string[] = [];
  const missing: string[] = [];

  for (const expectation of concept.expected) {
    const sample = samples[expectation.feature];
    const q = sample?.q ?? 0;
    const m = computeMatch(expectation, sample);
    const weight = expectation.weight;
    const label = FEATURE_REGISTRY[expectation.feature].label;

    weightedMatchSum += weight * q * m;
    weightedConfidenceSum += weight * q;
    totalWeight += weight;

    if (q >= MIN_FEATURE_CONFIDENCE) {
      coveredCount++;
      if (sample && m >= SUPPORT_MATCH_THRESHOLD) {
        support.push(`${label}: ${sample.evidence}`);
      }
    } else {
      missing.push(sample ? `${label}: ${sample.evidence} (confidence too low)` : `${label}: ${explainUnavailableFeature(expectation.feature)}`);
    }
  }

  const totalFeatures = concept.expected.length;
  const score = weightedConfidenceSum > 0 ? weightedMatchSum / weightedConfidenceSum : 0;
  const coverage = totalFeatures > 0 ? coveredCount / totalFeatures : 0;
  const confidence = totalWeight > 0 ? coverage * (weightedConfidenceSum / totalWeight) : 0;
  const status: "scored" | "insufficientEvidence" = confidence >= MIN_CONCEPT_CONFIDENCE_FOR_OVERALL ? "scored" : "insufficientEvidence";

  return { score, confidence, coverage, status, support, missing };
}

/** ConceptScore/coverage/ConceptConfidence/OverallAlignment (SPEC §6.1-6.3), plus contradiction detection (§6.5). */
export function scorePrompt(parsed: ParsedPrompt, samples: FeatureSampleMap): PromptAlignmentReport {
  const contradictions = detectContradictions(parsed.concepts);

  const concepts: ConceptResult[] = parsed.concepts.map((concept) => {
    const core = scoreConceptCore(concept, samples);
    const conceptContradictions = contradictions
      .filter((c) => c.conceptA === concept.concept || c.conceptB === concept.concept)
      .map((c) => {
        const other = c.conceptA === concept.concept ? c.conceptB : c.conceptA;
        return `Conflicts with "${other}" on ${FEATURE_REGISTRY[c.feature].label}: the two concepts expect opposite directions for the same feature.`;
      });

    return {
      concept: concept.concept,
      category: concept.category,
      priority: concept.priority,
      ...core,
      contradictions: conceptContradictions,
    };
  });

  const scoredConcepts = concepts.filter((c) => c.status === "scored");
  const weightedScoreSum = scoredConcepts.reduce((s, c) => s + c.priority * c.confidence * c.score, 0);
  const weightedConfidenceSum = scoredConcepts.reduce((s, c) => s + c.priority * c.confidence, 0);
  const overallAlignment = weightedConfidenceSum > 0 ? weightedScoreSum / weightedConfidenceSum : null;

  return {
    concepts,
    overallAlignment,
    overallConfidenceCaveat: OVERALL_CONFIDENCE_CAVEAT,
    contradictions,
  };
}
