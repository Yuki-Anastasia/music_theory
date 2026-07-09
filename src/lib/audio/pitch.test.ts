import { describe, it, expect } from "vitest";
import {
  midiToFrequency,
  frequencyToMidi,
  frequencyToNearestMidi,
  centsBetween,
  equalTemperamentRatio,
  JUST_RATIOS,
} from "./pitch";

describe("pitch math (spec D-1 numeric checks)", () => {
  it("A4 (MIDI 69) is 440Hz", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
  });

  it("frequencyToMidi is the inverse of midiToFrequency", () => {
    for (const midi of [40, 60, 69, 81, 100]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 6);
    }
  });

  it("equal-tempered fifth vs just fifth differs by ~1.955 cents", () => {
    const equalFifth = equalTemperamentRatio(7); // 2^(7/12)
    const justFifth = JUST_RATIOS.perfectFifth; // 3/2
    const diffCents = Math.abs(centsBetween(justFifth, equalFifth));
    expect(diffCents).toBeCloseTo(1.955, 2);
  });

  it("equal-tempered major third vs just major third differs by ~13.7 cents", () => {
    const equalThird = equalTemperamentRatio(4); // 2^(4/12)
    const justThird = JUST_RATIOS.majorThird; // 5/4
    const diffCents = Math.abs(centsBetween(justThird, equalThird));
    // spec: just 386.3c vs equal 400c => ~13.7c, much larger than the fifth's ~2c
    expect(diffCents).toBeCloseTo(13.7, 1);
  });

  it("just major third is ~386.3 cents above the root", () => {
    expect(centsBetween(1, JUST_RATIOS.majorThird)).toBeCloseTo(386.3, 1);
  });

  it("Pythagorean comma: stacking 12 just fifths overshoots 7 octaves by ~1.0136x", () => {
    const twelveFifths = Math.pow(3 / 2, 12);
    const sevenOctaves = Math.pow(2, 7);
    const comma = twelveFifths / sevenOctaves;
    expect(comma).toBeCloseTo(531441 / 524288, 6);
    expect(comma).toBeCloseTo(1.01364, 4);
  });

  it("frequencyToNearestMidi rounds correctly and reports cents-off", () => {
    // 442Hz is slightly sharp of A4 (440Hz / MIDI 69)
    const { midi, centsOff } = frequencyToNearestMidi(442);
    expect(midi).toBe(69);
    expect(centsOff).toBeGreaterThan(0);
    expect(centsOff).toBeCloseTo(centsBetween(440, 442), 6);
  });
});
