import { FEATURE_REGISTRY } from "./ontology";
import type { FeatureExpectation } from "./conceptTypes";
import type { FeatureSample } from "./featureSample";

/**
 * Human-readable description of a confidently-measured feature that did NOT
 * match its expectation (q >= MIN_FEATURE_CONFIDENCE, m < SUPPORT_MATCH_THRESHOLD
 * — see scoring.ts). Unlike a missing feature, we have real data here, so we
 * can say exactly what's off, not just "no evidence". Always states the
 * measured fact plainly rather than prescribing a fix — this app can say
 * what doesn't match, not whether the prompt or the song is "wrong".
 */
export function describeMismatch(expectation: FeatureExpectation, sample: FeatureSample): string {
  const label = FEATURE_REGISTRY[expectation.feature].label;

  switch (expectation.kind) {
    case "range": {
      if (typeof sample.value !== "number" || !expectation.targetRange) break;
      const [min, max] = expectation.targetRange;
      const direction = sample.value < min ? "below the expected range" : "above the expected range";
      return `${label}: expected ${min}–${max}, measured ${sample.evidence} (${direction}).`;
    }
    case "direction": {
      if (typeof sample.value !== "number" || !expectation.direction) break;
      const valueType = FEATURE_REGISTRY[expectation.feature].valueType;
      const bipolarValue = valueType === "unit" ? sample.value * 2 - 1 : sample.value;
      const actualLeaning = bipolarValue >= 0 ? "positive/higher" : "negative/lower";
      const expectedLeaning = expectation.direction === "positive" ? "positive/higher" : "negative/lower";
      return `${label}: expected to lean ${expectedLeaning}, measured ${sample.evidence} (leans ${actualLeaning}).`;
    }
    case "categorical": {
      if (typeof sample.value !== "string" || !expectation.targetCategory) break;
      return `${label}: expected "${expectation.targetCategory}", detected "${sample.value}" (${sample.evidence}).`;
    }
    case "keywordMatch": {
      if (typeof sample.value !== "string" || !expectation.targetKeyword) break;
      return `${label}: looking for "${expectation.targetKeyword}", detected: ${sample.evidence}.`;
    }
  }

  return `${label}: expected value did not match (${sample.evidence}).`;
}
