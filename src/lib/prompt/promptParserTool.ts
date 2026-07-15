import { CATEGORY_NAMES, FEATURE_NAMES, FEATURE_REGISTRY, type Category, type ExpectationKind, type FeatureName } from "./ontology";
import type { FeatureExpectation, PromptConcept } from "./conceptTypes";

export const PARSE_PROMPT_TOOL_NAME = "extract_prompt_concepts";

/** Structurally compatible with Anthropic SDK's Tool type, without importing the SDK into src/lib/prompt (same rationale as editableNotesPrompt.ts's ScoreEditToolSchema). */
export interface PromptParseToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

const EXPECTATION_KINDS: ExpectationKind[] = ["range", "direction", "categorical", "keywordMatch"];

/**
 * Builds the tool schema the prompt parser is forced to call
 * (tool_choice, see the API route). `feature`/`category`/`kind` are all
 * JSON-Schema enum-constrained to the closed vocabularies in ontology.ts —
 * the model structurally cannot request a feature or category this app
 * doesn't actually know how to compute. `parsePromptConceptsToolInput`
 * re-validates every field regardless; this schema narrows what the model
 * is likely to produce, it isn't the only defense.
 */
export function buildPromptParseTool(): PromptParseToolSchema {
  return {
    name: PARSE_PROMPT_TOOL_NAME,
    description:
      "Extract the distinct musical concepts implied by a music-generation prompt (the text used to prompt an AI music generator like Suno/Udio), each tied to one or more specific, measurable analysis features this app can actually check.",
    input_schema: {
      type: "object",
      properties: {
        concepts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              concept: {
                type: "string",
                description: "The concept as phrased/echoed from the prompt, e.g. 'driving four-on-the-floor energy'.",
              },
              category: { type: "string", enum: [...CATEGORY_NAMES] },
              priority: {
                type: "number",
                description: "0-1 relative importance of this concept among all concepts extracted from this prompt.",
              },
              expected: {
                type: "array",
                description: "One or more analysis features expected to support this concept.",
                items: {
                  type: "object",
                  properties: {
                    feature: {
                      type: "string",
                      enum: [...FEATURE_NAMES],
                      description: "Must be one of the known features described above. Never invent a feature name.",
                    },
                    kind: {
                      type: "string",
                      enum: EXPECTATION_KINDS,
                      description:
                        "Must be one of the kinds that feature's description says it supports. 'range': a concrete target range (for bpm/positiveUnbounded features, translate qualitative language like 'fast' into a concrete numeric range yourself). 'direction': a qualitative more/less lean, only for bipolar/unit features. 'categorical': one of the feature's listed possible values, exactly. 'keywordMatch': a free-text keyword (e.g. an instrument name), only for instrumentPresence.",
                    },
                    targetRange: {
                      type: "array",
                      items: { type: "number" },
                      minItems: 2,
                      maxItems: 2,
                      description: "kind === 'range' only: [min, max].",
                    },
                    direction: {
                      type: "string",
                      enum: ["positive", "negative"],
                      description: "kind === 'direction' only.",
                    },
                    targetCategory: {
                      type: "string",
                      description: "kind === 'categorical' only: must exactly match one of the feature's listed possible values.",
                    },
                    targetKeyword: {
                      type: "string",
                      description: "kind === 'keywordMatch' only: a free-text keyword, e.g. an instrument name.",
                    },
                    weight: {
                      type: "number",
                      description: "0-1 relative importance of this feature within the concept.",
                    },
                  },
                  required: ["feature", "kind", "weight"],
                },
              },
            },
            required: ["concept", "category", "priority", "expected"],
          },
        },
      },
      required: ["concepts"],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORY_NAMES as readonly string[]).includes(value);
}

function isFeatureName(value: unknown): value is FeatureName {
  return typeof value === "string" && (FEATURE_NAMES as readonly string[]).includes(value);
}

/**
 * Validates one raw expectation object against the FeatureExpectation shape,
 * cross-checking `kind` against the referenced feature's own
 * FeatureDescriptor.supportedKinds (not just the generic ExpectationKind
 * enum) — a `kind` that's structurally valid JSON but wrong for that
 * specific feature (e.g. "direction" on a bpm feature) is dropped here.
 * Returns null for anything that doesn't fit, rather than throwing —
 * this is untrusted model output.
 */
function parseExpectation(raw: unknown): FeatureExpectation | null {
  if (!isRecord(raw)) return null;
  if (!isFeatureName(raw.feature)) return null;
  const feature = raw.feature;
  const descriptor = FEATURE_REGISTRY[feature];

  if (!isFiniteNumber(raw.weight)) return null;
  const weight = clamp01(raw.weight);

  if (typeof raw.kind !== "string" || !(EXPECTATION_KINDS as string[]).includes(raw.kind)) return null;
  const kind = raw.kind as ExpectationKind;
  if (!descriptor.supportedKinds.includes(kind)) return null;

  switch (kind) {
    case "range": {
      if (!Array.isArray(raw.targetRange) || raw.targetRange.length !== 2) return null;
      const [a, b] = raw.targetRange;
      if (!isFiniteNumber(a) || !isFiniteNumber(b)) return null;
      const targetRange: [number, number] = a <= b ? [a, b] : [b, a];
      return { feature, kind, targetRange, weight };
    }
    case "direction": {
      if (raw.direction !== "positive" && raw.direction !== "negative") return null;
      return { feature, kind, direction: raw.direction, weight };
    }
    case "categorical": {
      if (!isNonEmptyString(raw.targetCategory)) return null;
      if (descriptor.categoricalValues && !descriptor.categoricalValues.includes(raw.targetCategory)) return null;
      return { feature, kind, targetCategory: raw.targetCategory, weight };
    }
    case "keywordMatch": {
      if (!isNonEmptyString(raw.targetKeyword)) return null;
      return { feature, kind, targetKeyword: raw.targetKeyword, weight };
    }
    default:
      return null;
  }
}

function parseConcept(raw: unknown): PromptConcept | null {
  if (!isRecord(raw)) return null;
  if (!isNonEmptyString(raw.concept)) return null;
  if (!isCategory(raw.category)) return null;
  if (!isFiniteNumber(raw.priority)) return null;
  if (!Array.isArray(raw.expected)) return null;

  const expected = raw.expected.map(parseExpectation).filter((e): e is FeatureExpectation => e !== null);
  if (expected.length === 0) return null;

  return {
    concept: raw.concept,
    category: raw.category,
    priority: clamp01(raw.priority),
    timeScope: "global", // v1 only ever scores whole-song aggregates (see docs/SPEC.md non-goals)
    expected,
  };
}

/**
 * Converts the raw tool_use input (already-JSON-parsed by the Anthropic
 * SDK) into validated PromptConcept[], dropping anything malformed rather
 * than throwing — mirrors editableNotesPrompt.ts's parseToolEditBatches.
 */
export function parsePromptConceptsToolInput(input: unknown): PromptConcept[] {
  if (!isRecord(input) || !Array.isArray(input.concepts)) return [];
  return input.concepts.map(parseConcept).filter((c): c is PromptConcept => c !== null);
}
