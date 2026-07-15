import { describe, it, expect } from "vitest";
import { buildPromptParseTool, parsePromptConceptsToolInput } from "./promptParserTool";
import { CATEGORY_NAMES, FEATURE_NAMES } from "./ontology";

describe("buildPromptParseTool", () => {
  it("enum-constrains category/feature to the closed ontology lists", () => {
    const tool = buildPromptParseTool();
    const conceptItem = tool.input_schema.properties!.concepts as { items: { properties: Record<string, unknown> } };
    const categoryEnum = (conceptItem.items.properties.category as { enum: string[] }).enum;
    expect(categoryEnum).toEqual([...CATEGORY_NAMES]);

    const expectedItem = conceptItem.items.properties.expected as { items: { properties: Record<string, unknown> } };
    const featureEnum = (expectedItem.items.properties.feature as { enum: string[] }).enum;
    expect(featureEnum).toEqual([...FEATURE_NAMES]);
  });
});

describe("parsePromptConceptsToolInput", () => {
  function validConceptInput(overrides: Record<string, unknown> = {}) {
    return {
      concept: "driving energy",
      category: "energy",
      priority: 0.8,
      expected: [{ feature: "arousal", kind: "direction", direction: "positive", weight: 0.9 }],
      ...overrides,
    };
  }

  it("accepts a well-formed concept", () => {
    const result = parsePromptConceptsToolInput({ concepts: [validConceptInput()] });
    expect(result).toHaveLength(1);
    expect(result[0].concept).toBe("driving energy");
    expect(result[0].category).toBe("energy");
    expect(result[0].timeScope).toBe("global");
    expect(result[0].expected).toHaveLength(1);
  });

  it("returns an empty array for non-object input", () => {
    expect(parsePromptConceptsToolInput("not an object")).toEqual([]);
    expect(parsePromptConceptsToolInput(null)).toEqual([]);
    expect(parsePromptConceptsToolInput(42)).toEqual([]);
  });

  it("returns an empty array when 'concepts' is missing or not an array", () => {
    expect(parsePromptConceptsToolInput({})).toEqual([]);
    expect(parsePromptConceptsToolInput({ concepts: "nope" })).toEqual([]);
  });

  it("drops a concept referencing an unknown feature name", () => {
    const result = parsePromptConceptsToolInput({
      concepts: [validConceptInput({ expected: [{ feature: "totallyMadeUpFeature", kind: "direction", direction: "positive", weight: 0.5 }] })],
    });
    expect(result).toEqual([]);
  });

  it("drops an expectation whose kind isn't supported by that specific feature, even though it's a valid ExpectationKind in general", () => {
    // tempoBpm only supports "range" (see ontology.ts), not "direction".
    const result = parsePromptConceptsToolInput({
      concepts: [validConceptInput({ expected: [{ feature: "tempoBpm", kind: "direction", direction: "positive", weight: 0.5 }] })],
    });
    expect(result).toEqual([]); // the only expectation was dropped, so the whole concept is dropped
  });

  it("drops an expectation with a non-numeric weight", () => {
    const result = parsePromptConceptsToolInput({
      concepts: [validConceptInput({ expected: [{ feature: "arousal", kind: "direction", direction: "positive", weight: "high" }] })],
    });
    expect(result).toEqual([]);
  });

  it("drops a concept with an empty expected list", () => {
    const result = parsePromptConceptsToolInput({ concepts: [validConceptInput({ expected: [] })] });
    expect(result).toEqual([]);
  });

  it("drops a concept with a category outside the closed CATEGORY_NAMES list", () => {
    const result = parsePromptConceptsToolInput({ concepts: [validConceptInput({ category: "vibes" })] });
    expect(result).toEqual([]);
  });

  it("drops a categorical expectation whose targetCategory isn't one of the feature's listed values", () => {
    const result = parsePromptConceptsToolInput({
      concepts: [validConceptInput({ expected: [{ feature: "modality", kind: "categorical", targetCategory: "phrygian", weight: 0.5 }] })],
    });
    expect(result).toEqual([]);
  });

  it("accepts a valid categorical expectation matching one of the feature's listed values", () => {
    const result = parsePromptConceptsToolInput({
      concepts: [validConceptInput({ expected: [{ feature: "modality", kind: "categorical", targetCategory: "minor", weight: 0.5 }] })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].expected[0]).toMatchObject({ feature: "modality", kind: "categorical", targetCategory: "minor" });
  });

  it("swaps an inverted targetRange rather than dropping it", () => {
    const result = parsePromptConceptsToolInput({
      concepts: [validConceptInput({ expected: [{ feature: "tempoBpm", kind: "range", targetRange: [160, 120], weight: 0.5 }] })],
    });
    expect(result[0].expected[0].targetRange).toEqual([120, 160]);
  });

  it("clamps out-of-range priority and weight to [0,1] instead of dropping", () => {
    const result = parsePromptConceptsToolInput({
      concepts: [validConceptInput({ priority: 5, expected: [{ feature: "arousal", kind: "direction", direction: "positive", weight: -2 }] })],
    });
    expect(result[0].priority).toBe(1);
    expect(result[0].expected[0].weight).toBe(0);
  });

  it("keeps a concept if at least one of several expectations is valid, dropping only the malformed ones", () => {
    const result = parsePromptConceptsToolInput({
      concepts: [
        validConceptInput({
          expected: [
            { feature: "arousal", kind: "direction", direction: "positive", weight: 0.6 },
            { feature: "totallyMadeUpFeature", kind: "direction", direction: "positive", weight: 0.4 },
          ],
        }),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].expected).toHaveLength(1);
    expect(result[0].expected[0].feature).toBe("arousal");
  });

  it("drops a malformed concept without throwing, alongside otherwise-valid concepts", () => {
    const result = parsePromptConceptsToolInput({
      concepts: [validConceptInput(), "not an object", 123, null, { concept: "no category" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].concept).toBe("driving energy");
  });
});
