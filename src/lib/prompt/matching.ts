import type { FeatureExpectation } from "./conceptTypes";
import { FEATURE_REGISTRY, type FeatureValueType } from "./ontology";
import type { FeatureSample } from "./featureSample";

// How far (in target-range widths) beyond the range's edge a value has to be
// before it stops counting as any match at all. An MVP default, not a
// validated constant — see docs/SPEC.md.
const DEFAULT_RANGE_SOFTNESS = 1;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** 1 inside [min, max]; falls off linearly to 0 at `softness` range-widths beyond either edge. */
export function matchRange(value: number, targetRange: [number, number], softness = DEFAULT_RANGE_SOFTNESS): number {
  const [min, max] = targetRange;
  if (value >= min && value <= max) return 1;
  const width = Math.max(max - min, 1e-9);
  const falloff = width * softness;
  const distance = value < min ? min - value : value - max;
  return clamp01(1 - distance / falloff);
}

/**
 * Sign-based match against a feature's neutral center. Only meaningful for
 * "bipolar" (-1..1, already centered at 0) and "unit" (0..1, rescaled to
 * -1..1 here) value types — "bpm"/"positiveUnbounded" features have no
 * natural center and are restricted to "range" expectations only (see
 * FeatureDescriptor.supportedKinds in ontology.ts), so this is never called
 * for them.
 */
export function matchDirection(value: number, direction: "positive" | "negative", valueType: FeatureValueType): number {
  const bipolarValue = valueType === "unit" ? value * 2 - 1 : value;
  const sign = direction === "positive" ? 1 : -1;
  return clamp01(0.5 + (sign * bipolarValue) / 2);
}

/** Exact match only for v1 — no partial credit for "adjacent" categories (see docs/SPEC.md non-goals). */
export function matchCategorical(value: string, targetCategory: string): number {
  return value === targetCategory ? 1 : 0;
}

/**
 * Case-insensitive, two-way substring containment — a deliberately loose
 * heuristic for open-ended name matching (e.g. does a "saxophone" concept
 * match a part literally named "Alto Sax"), not a semantic instrument-family
 * classifier. `value` is expected to be a comma-joined list of names (see
 * FeatureValueType's "keywordList"); each entry is checked independently.
 */
export function matchKeywordMatch(value: string, targetKeyword: string): number {
  const target = targetKeyword.trim().toLowerCase();
  if (!target) return 0;
  const names = value
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n.length > 0);
  const matched = names.some((name) => name.includes(target) || target.includes(name));
  return matched ? 1 : 0;
}

/**
 * m(c,f): dispatches by expectation.kind. Returns 0 when there's no sample
 * to compare against (a missing feature is a non-match, not an unknown —
 * scoring.ts's coverage/confidence math is what distinguishes "we checked
 * and it didn't match" from "we couldn't check"), or when the sample's
 * value shape doesn't fit the expectation's kind (defensive — should not
 * happen if the parser only ever emits kinds a feature's supportedKinds
 * allows, but never trust that blindly here either).
 */
export function computeMatch(expectation: FeatureExpectation, sample: FeatureSample | undefined): number {
  if (!sample) return 0;

  switch (expectation.kind) {
    case "range": {
      if (typeof sample.value !== "number" || !expectation.targetRange) return 0;
      return matchRange(sample.value, expectation.targetRange);
    }
    case "direction": {
      if (typeof sample.value !== "number" || !expectation.direction) return 0;
      const valueType = FEATURE_REGISTRY[expectation.feature].valueType;
      return matchDirection(sample.value, expectation.direction, valueType);
    }
    case "categorical": {
      if (typeof sample.value !== "string" || !expectation.targetCategory) return 0;
      return matchCategorical(sample.value, expectation.targetCategory);
    }
    case "keywordMatch": {
      if (typeof sample.value !== "string" || !expectation.targetKeyword) return 0;
      return matchKeywordMatch(sample.value, expectation.targetKeyword);
    }
    default:
      return 0;
  }
}
