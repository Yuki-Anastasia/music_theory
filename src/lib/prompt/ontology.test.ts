import { describe, it, expect } from "vitest";
import { CATEGORY_NAMES, FEATURE_NAMES, FEATURE_REGISTRY, describeFeatureNamesForPrompt } from "./ontology";

describe("FEATURE_REGISTRY", () => {
  it("has exactly one entry per FeatureName, no more, no less", () => {
    const registryKeys = Object.keys(FEATURE_REGISTRY).sort();
    const featureNames = [...FEATURE_NAMES].sort();
    expect(registryKeys).toEqual(featureNames);
  });

  it("every descriptor's categories are drawn from CATEGORY_NAMES", () => {
    for (const name of FEATURE_NAMES) {
      for (const category of FEATURE_REGISTRY[name].categories) {
        expect(CATEGORY_NAMES).toContain(category);
      }
    }
  });

  it("every descriptor declares at least one supported expectation kind", () => {
    for (const name of FEATURE_NAMES) {
      expect(FEATURE_REGISTRY[name].supportedKinds.length).toBeGreaterThan(0);
    }
  });

  it("categorical features (and only categorical features) declare categoricalValues", () => {
    for (const name of FEATURE_NAMES) {
      const descriptor = FEATURE_REGISTRY[name];
      if (descriptor.valueType === "categorical") {
        expect(descriptor.categoricalValues, `${name} should declare categoricalValues`).toBeDefined();
        expect(descriptor.categoricalValues!.length).toBeGreaterThan(0);
        expect(descriptor.supportedKinds).toEqual(["categorical"]);
      } else {
        expect(descriptor.categoricalValues, `${name} should not declare categoricalValues`).toBeUndefined();
      }
    }
  });

  it("bpm and positiveUnbounded features only support 'range' (no natural zero-center for direction)", () => {
    for (const name of FEATURE_NAMES) {
      const descriptor = FEATURE_REGISTRY[name];
      if (descriptor.valueType === "bpm" || descriptor.valueType === "positiveUnbounded") {
        expect(descriptor.supportedKinds).toEqual(["range"]);
      }
    }
  });

  it("keywordList features only support 'keywordMatch' (open-ended values, no exact-match enum)", () => {
    for (const name of FEATURE_NAMES) {
      const descriptor = FEATURE_REGISTRY[name];
      if (descriptor.valueType === "keywordList") {
        expect(descriptor.supportedKinds).toEqual(["keywordMatch"]);
      }
    }
  });
});

describe("describeFeatureNamesForPrompt", () => {
  it("mentions every feature name (drift guard against FEATURE_REGISTRY changing without this generator being re-run)", () => {
    const text = describeFeatureNamesForPrompt();
    for (const name of FEATURE_NAMES) {
      expect(text).toContain(name);
    }
  });

  it("mentions every categorical feature's possible values", () => {
    const text = describeFeatureNamesForPrompt();
    for (const name of FEATURE_NAMES) {
      const descriptor = FEATURE_REGISTRY[name];
      for (const value of descriptor.categoricalValues ?? []) {
        expect(text).toContain(value);
      }
    }
  });
});
