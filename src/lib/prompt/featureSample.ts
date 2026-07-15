import type { FeatureName } from "./ontology";

/** One already-computed analysis value, packaged for prompt-concept matching. */
export interface FeatureSample {
  feature: FeatureName;
  value: number | string;
  /** q(f): 0-1 confidence that this value is a trustworthy detection, not just that it was computed. */
  q: number;
  /** Short human-readable citation for the report's "support" list, e.g. "128 BPM (autocorrelation r=0.71)". */
  evidence: string;
}

/** A feature simply absent from this map means "not applicable to this input" (e.g. score-only feature on audio-transcribed input) — never defaulted to a guess. */
export type FeatureSampleMap = Partial<Record<FeatureName, FeatureSample>>;
