/**
 * Closed vocabulary for "Beyond the Prompt": the fixed set of concept
 * categories and analysis features a generation prompt can be scored
 * against. This is the enforcement mechanism for the project's
 * anti-hallucination rule — the LLM-based prompt parser (promptParserTool.ts)
 * is tool-schema-constrained to FEATURE_NAMES/CATEGORY_NAMES, so it can only
 * ever reference a feature this app actually knows how to compute. Every
 * feature here maps to something already produced by an existing
 * src/lib/theory/* module (see featureExtraction.ts) — no new analysis math
 * is introduced by this file.
 */

export const CATEGORY_NAMES = [
  "tempo",
  "energy",
  "mood",
  "instrumentation",
  "texture",
  "harmony",
  "rhythm",
  "dynamics",
  "genre",
  "form",
] as const;
export type Category = (typeof CATEGORY_NAMES)[number];

/**
 * How a feature's numeric value is shaped, which determines which
 * ExpectationKinds are physically meaningful for it (see supportedKinds):
 * - "bpm" / "positiveUnbounded": non-negative, no natural zero-center, so a
 *   qualitative "direction" (more/less) has no principled origin to measure
 *   from — only a concrete target "range" makes sense.
 * - "unit": normalized 0-1, where 0.5 is a usable neutral center.
 * - "bipolar": normalized -1..1, already centered at 0.
 * - "categorical": a fixed label set (see FeatureDescriptor.categoricalValues).
 * - "keywordList": an open-ended, comma-joined list of detected names (e.g.
 *   score part names) — there's no fixed enum of possible values, so it's
 *   matched by substring/keyword containment (matchKeywordMatch in
 *   matching.ts) rather than exact equality.
 */
export type FeatureValueType = "bpm" | "unit" | "bipolar" | "positiveUnbounded" | "categorical" | "keywordList";

export type ExpectationKind = "range" | "direction" | "categorical" | "keywordMatch";

export const FEATURE_NAMES = [
  "tempoBpm",
  "rhythmicComplexity",
  "syncopation",
  "dynamicRange",
  "averageLoudness",
  "dynamicsTrend",
  "arousal",
  "valence",
  "moodQuadrant",
  "consonance",
  "harmonicTension",
  "diatonicity",
  "modality",
  "scaleCharacter",
  "selfSimilarity",
  "predictability",
  "formRepetitiveness",
  "climaxPresence",
  "climaxTiming",
  "instrumentTextureBuildUp",
  "instrumentPresence",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

export interface FeatureDescriptor {
  /** Short human-readable name, e.g. for UI labels and prompt text. */
  label: string;
  /** One line describing what the feature measures, fed verbatim into the parser's system prompt. */
  description: string;
  valueType: FeatureValueType;
  /** Which prompt-concept categories this feature is plausible evidence for. */
  categories: Category[];
  /** Which ExpectationKinds are physically meaningful for this feature's valueType. */
  supportedKinds: ExpectationKind[];
  /** Only present when valueType === "categorical". */
  categoricalValues?: string[];
}

export const FEATURE_REGISTRY: Record<FeatureName, FeatureDescriptor> = {
  tempoBpm: {
    label: "Tempo (BPM)",
    description: "The song's tempo in beats per minute.",
    valueType: "bpm",
    categories: ["tempo"],
    supportedKinds: ["range"],
  },
  rhythmicComplexity: {
    label: "Rhythmic complexity",
    description:
      "Shannon entropy of note-duration buckets, normalized 0-1. Higher means a wider, less predictable mix of rhythmic values.",
    valueType: "unit",
    categories: ["rhythm"],
    supportedKinds: ["range", "direction"],
  },
  syncopation: {
    label: "Syncopation",
    description:
      "0-1 score of how often notes land on weak beats/offbeats rather than strong beats. Only available for score-derived input with a detected meter. " +
      "The 0-1 range is a theoretical ceiling (every single onset maximally displacing the strongest possible beat), which essentially never happens in real " +
      "music — even a rhythm most listeners would call 'heavily syncopated' typically lands around 0.1-0.3, not near 1. When picking a target range for a " +
      "syncopation-related concept, prefer values within roughly 0-0.35 rather than the upper end of the nominal scale.",
    valueType: "unit",
    categories: ["rhythm"],
    supportedKinds: ["range", "direction"],
  },
  dynamicRange: {
    label: "Dynamic range",
    description: "0-1 spread between the loudest and quietest sections of the song.",
    valueType: "unit",
    categories: ["dynamics"],
    supportedKinds: ["range", "direction"],
  },
  averageLoudness: {
    label: "Average loudness",
    description: "0-1 average note loudness/amplitude across the whole song.",
    valueType: "unit",
    categories: ["dynamics", "energy"],
    supportedKinds: ["range", "direction"],
  },
  dynamicsTrend: {
    label: "Dynamics trend",
    description: "Whether the song's loudness trends upward, downward, or stays flat overall.",
    valueType: "categorical",
    categories: ["dynamics"],
    supportedKinds: ["categorical"],
    categoricalValues: ["crescendo", "diminuendo", "stable"],
  },
  arousal: {
    label: "Arousal",
    description:
      "-1..1 estimate of energetic/activated (positive) vs. calm/subdued (negative), from Russell's circumplex model of affect.",
    valueType: "bipolar",
    categories: ["energy", "mood"],
    supportedKinds: ["range", "direction"],
  },
  valence: {
    label: "Valence",
    description:
      "-1..1 estimate of pleasant/positive (positive) vs. unpleasant/negative (negative) mood, from Russell's circumplex model of affect.",
    valueType: "bipolar",
    categories: ["mood"],
    supportedKinds: ["range", "direction"],
  },
  moodQuadrant: {
    label: "Mood quadrant",
    description: "Which quadrant of the valence/arousal plane the song falls into.",
    valueType: "categorical",
    categories: ["mood"],
    supportedKinds: ["categorical"],
    categoricalValues: ["excited", "tense", "sad", "calm"],
  },
  consonance: {
    label: "Consonance",
    description:
      "Euler's Gradus Suavitatis-based consonance score (unbounded, larger = smoother/more consonant). Typical real-music values run roughly 0.1-0.25.",
    valueType: "positiveUnbounded",
    categories: ["harmony"],
    supportedKinds: ["range"],
  },
  harmonicTension: {
    label: "Harmonic tension",
    description:
      "Average parsimonious voice-leading distance (in semitones) between consecutive chords. Larger means more abrupt/distant harmonic motion. " +
      "Typical adjacent-chord movement in real music runs roughly 1-4 semitones; even a deliberately abrupt or harmonically distant change rarely " +
      "averages above ~8. A single-line melody with no simultaneous harmony will measure near 0, which is not evidence of consonance by itself.",
    valueType: "positiveUnbounded",
    categories: ["harmony"],
    supportedKinds: ["range"],
  },
  diatonicity: {
    label: "Diatonicity",
    description:
      "0-1 pitch-class Fourier coefficient magnitude (|X5|). Higher means the pitch content fits a major/minor scale more cleanly.",
    valueType: "unit",
    categories: ["harmony"],
    supportedKinds: ["range", "direction"],
  },
  modality: {
    label: "Modality",
    description: "The detected key's mode.",
    valueType: "categorical",
    categories: ["harmony", "mood"],
    supportedKinds: ["categorical"],
    categoricalValues: ["major", "minor"],
  },
  scaleCharacter: {
    label: "Scale character",
    description: "The best-fitting named scale for the song's pitch-class content.",
    valueType: "categorical",
    categories: ["harmony", "genre"],
    supportedKinds: ["categorical"],
    categoricalValues: [
      "major",
      "naturalMinor",
      "harmonicMinor",
      "dorian",
      "mixolydian",
      "majorPentatonic",
      "minorPentatonic",
      "blues",
      "wholeTone",
    ],
  },
  selfSimilarity: {
    label: "Melodic self-similarity",
    description:
      "-1..1 autocorrelation of the melodic contour. Higher means the melody repeats itself more (motif-driven); lower/negative means it varies more.",
    valueType: "bipolar",
    categories: ["form", "texture"],
    supportedKinds: ["range", "direction"],
  },
  predictability: {
    label: "Predictability",
    description:
      "0-1 measure of how easy the next note is to guess from the current one (1 minus normalized Shannon conditional entropy). Higher means catchier/more predictable.",
    valueType: "unit",
    categories: ["form"],
    supportedKinds: ["range", "direction"],
  },
  formRepetitiveness: {
    label: "Form repetitiveness",
    description:
      "0-1 average similarity between recurring sections detected in the song's structure. Higher means the song leans on repeated material (e.g. verse/chorus) rather than continuously new material (through-composed).",
    valueType: "unit",
    categories: ["form"],
    supportedKinds: ["range", "direction"],
  },
  climaxPresence: {
    label: "Climax presence",
    description: "Whether a clear single climax/peak section was detected in the song's arc.",
    valueType: "categorical",
    categories: ["form", "dynamics"],
    supportedKinds: ["categorical"],
    categoricalValues: ["present", "absent"],
  },
  climaxTiming: {
    label: "Climax timing",
    description:
      "0-1 position of the detected climax within the song's duration (0 = very start, 1 = very end). Only meaningful when a climax was detected.",
    valueType: "unit",
    categories: ["form", "dynamics"],
    supportedKinds: ["range", "direction"],
  },
  instrumentTextureBuildUp: {
    label: "Instrument/texture build-up",
    description:
      "Whether instrument parts enter gradually over the course of the song (layered) or are all present from the start (constant). Only available for score-derived input with identifiable parts.",
    valueType: "categorical",
    categories: ["texture", "instrumentation"],
    supportedKinds: ["categorical"],
    categoricalValues: ["layered", "constant"],
  },
  instrumentPresence: {
    label: "Instrument presence",
    description:
      "Whether a named instrument/part (e.g. 'saxophone', 'strings', 'piano') is present among the song's parts, matched by keyword/substring against the actual part names — not an exact category. Only available for score-derived input with identifiable parts; audio-transcribed input has no per-instrument identity at all.",
    valueType: "keywordList",
    categories: ["instrumentation"],
    supportedKinds: ["keywordMatch"],
  },
};

/**
 * Renders the full feature registry as a plain-text block for the prompt
 * parser's system prompt, so the LLM's enum documentation is always
 * generated from — and therefore can never drift out of sync with —
 * FEATURE_REGISTRY itself.
 */
export function describeFeatureNamesForPrompt(): string {
  return FEATURE_NAMES.map((name) => {
    const f = FEATURE_REGISTRY[name];
    const valuesNote = f.categoricalValues ? ` Possible values: ${f.categoricalValues.join(", ")}.` : "";
    return `- ${name} (${f.label}): ${f.description} Value type: ${f.valueType}. Supported expectation kinds: ${f.supportedKinds.join(", ")}.${valuesNote}`;
  }).join("\n");
}
