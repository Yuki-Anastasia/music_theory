import { describe, it, expect } from "vitest";
import { pearsonCorrelation, estimateKey, correlateAllKeys, keyLabel } from "./keyProfile";

describe("pearsonCorrelation", () => {
  it("is 1 for identical vectors", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 6);
  });

  it("is -1 for perfectly inverted vectors", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });

  it("is 0 when one vector is constant (no variance)", () => {
    expect(pearsonCorrelation([1, 1, 1, 1], [1, 2, 3, 4])).toBe(0);
  });
});

describe("estimateKey", () => {
  it("D-1 spec check: a histogram evenly covering the C major scale resolves to C major", () => {
    // C D E F G A B -> pitch classes 0,2,4,5,7,9,11, all weighted equally
    const histogram = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
    const estimate = estimateKey(histogram);
    expect(estimate.tonic).toBe(0);
    expect(estimate.mode).toBe("major");
  });

  it("resolves a rotated (transposed) major scale to the correct tonic", () => {
    // G major scale: G A B C D E F# -> pitch classes 7,9,11,0,2,4,6
    const histogram = new Array(12).fill(0);
    [7, 9, 11, 0, 2, 4, 6].forEach((pc) => (histogram[pc] = 1));
    const estimate = estimateKey(histogram);
    expect(estimate.tonic).toBe(7);
    expect(estimate.mode).toBe("major");
  });

  it("flags low confidence when the top two candidates are nearly tied", () => {
    // A perfectly flat histogram correlates ~equally (near 0) with every
    // rotation, so first and second place should be a near-tie.
    const flatHistogram = new Array(12).fill(1);
    const estimate = estimateKey(flatHistogram);
    expect(estimate.confidence).toBe("low");
    expect(estimate.runnerUp).toBeDefined();
  });

  it("correlateAllKeys returns all 24 candidates sorted descending", () => {
    const histogram = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
    const candidates = correlateAllKeys(histogram);
    expect(candidates).toHaveLength(24);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].correlation).toBeGreaterThanOrEqual(candidates[i].correlation);
    }
  });
});

describe("keyLabel", () => {
  it("formats major keys without suffix and minor keys with 'm'", () => {
    expect(keyLabel({ tonic: 0, mode: "major" })).toBe("C");
    expect(keyLabel({ tonic: 9, mode: "minor" })).toBe("Am");
  });
});
