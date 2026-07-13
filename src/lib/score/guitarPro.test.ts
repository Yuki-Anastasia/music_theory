import { describe, it, expect } from "vitest";
import { buildAnalysisFromMidiEvents } from "./guitarPro";
import type { RawMidiNote, TempoChange, RawMasterBar } from "./guitarPro";

const TICKS_PER_QUARTER = 960;

describe("buildAnalysisFromMidiEvents", () => {
  it("converts ticks to seconds at a constant 120bpm (960 ticks = 1 quarter = 0.5s)", () => {
    const notes: RawMidiNote[] = [
      { track: 0, startTick: 0, lengthTicks: TICKS_PER_QUARTER, midiNote: 60, velocity: 127 },
      { track: 0, startTick: TICKS_PER_QUARTER, lengthTicks: TICKS_PER_QUARTER, midiNote: 62, velocity: 64 },
    ];
    const tempoChanges: TempoChange[] = [{ tick: 0, bpm: 120 }];

    const { events } = buildAnalysisFromMidiEvents(notes, tempoChanges, ["Guitar"], new Set());

    expect(events).toEqual([
      { time: 0, durationSeconds: 0.5, midiNote: 60, pitchClass: 0, confidence: 1, partLabel: "Guitar" },
      { time: 0.5, durationSeconds: 0.5, midiNote: 62, pitchClass: 2, confidence: 64 / 127, partLabel: "Guitar" },
    ]);
  });

  it("defaults to 120bpm when no tempo change is given", () => {
    const notes: RawMidiNote[] = [
      { track: 0, startTick: 0, lengthTicks: TICKS_PER_QUARTER, midiNote: 60, velocity: 127 },
    ];
    const { events } = buildAnalysisFromMidiEvents(notes, [], ["Guitar"], new Set());
    expect(events[0].durationSeconds).toBeCloseTo(0.5);
  });

  it("applies a tempo change only to notes starting after it", () => {
    // First quarter at 120bpm (0.5s), a tempo change to 60bpm at tick 960,
    // then a second quarter note there should take 1s (half the speed).
    const notes: RawMidiNote[] = [
      { track: 0, startTick: TICKS_PER_QUARTER, lengthTicks: TICKS_PER_QUARTER, midiNote: 60, velocity: 127 },
    ];
    const tempoChanges: TempoChange[] = [
      { tick: 0, bpm: 120 },
      { tick: TICKS_PER_QUARTER, bpm: 60 },
    ];

    const { events } = buildAnalysisFromMidiEvents(notes, tempoChanges, ["Guitar"], new Set());

    expect(events[0].time).toBeCloseTo(0.5); // reached via the 120bpm segment
    expect(events[0].durationSeconds).toBeCloseTo(1); // played out entirely at 60bpm
  });

  it("drops notes on percussion tracks from events, but keeps their onsets in percussionOnsets", () => {
    const notes: RawMidiNote[] = [
      { track: 0, startTick: 0, lengthTicks: TICKS_PER_QUARTER, midiNote: 60, velocity: 127 },
      { track: 1, startTick: 0, lengthTicks: TICKS_PER_QUARTER, midiNote: 38, velocity: 100 }, // snare
      { track: 1, startTick: TICKS_PER_QUARTER, lengthTicks: TICKS_PER_QUARTER, midiNote: 36, velocity: 100 }, // kick
    ];

    const { events, percussionOnsets } = buildAnalysisFromMidiEvents(
      notes,
      [{ tick: 0, bpm: 120 }],
      ["Guitar", "Drums"],
      new Set([1])
    );

    expect(events).toHaveLength(1);
    expect(events[0].midiNote).toBe(60);
    expect(percussionOnsets).toEqual([0, 0.5]);
  });

  it("sorts events by time even when notes arrive out of order across tracks", () => {
    const notes: RawMidiNote[] = [
      { track: 1, startTick: TICKS_PER_QUARTER, lengthTicks: TICKS_PER_QUARTER, midiNote: 67, velocity: 100 },
      { track: 0, startTick: 0, lengthTicks: TICKS_PER_QUARTER, midiNote: 60, velocity: 100 },
    ];

    const { events } = buildAnalysisFromMidiEvents(notes, [{ tick: 0, bpm: 120 }], ["Guitar", "Bass"], new Set());

    expect(events.map((e) => e.midiNote)).toEqual([60, 67]);
  });

  it("clamps velocity into the 0-1 confidence range", () => {
    const notes: RawMidiNote[] = [{ track: 0, startTick: 0, lengthTicks: TICKS_PER_QUARTER, midiNote: 60, velocity: 200 }];
    const { events } = buildAnalysisFromMidiEvents(notes, [{ tick: 0, bpm: 120 }], ["Guitar"], new Set());
    expect(events[0].confidence).toBe(1);
  });

  it("leaves notatedKeyTimeline/notatedChordTimeline empty and passes through partNames", () => {
    const analysis = buildAnalysisFromMidiEvents([], [], ["Guitar", "Bass"], new Set());
    expect(analysis.notatedKeyTimeline).toEqual([]);
    expect(analysis.notatedChordTimeline).toEqual([]);
    expect(analysis.partNames).toEqual(["Guitar", "Bass"]);
  });

  it("defaults meterTimeline to empty when no masterBars are given", () => {
    const analysis = buildAnalysisFromMidiEvents([], [], ["Guitar"], new Set());
    expect(analysis.meterTimeline).toEqual([]);
  });

  it("converts masterBar start ticks to seconds at a constant tempo", () => {
    const masterBars: RawMasterBar[] = [
      { startTick: 0, numerator: 4, denominator: 4 },
      { startTick: TICKS_PER_QUARTER * 4, numerator: 3, denominator: 4 },
    ];
    const { meterTimeline } = buildAnalysisFromMidiEvents([], [{ tick: 0, bpm: 120 }], [], new Set(), masterBars);

    expect(meterTimeline).toEqual([
      { time: 0, numerator: 4, denominator: 4 },
      { time: 2, numerator: 3, denominator: 4 }, // 4 quarters at 120bpm = 2s
    ]);
  });

  it("applies a tempo change to a later masterBar's converted time", () => {
    const masterBars: RawMasterBar[] = [
      { startTick: 0, numerator: 4, denominator: 4 },
      { startTick: TICKS_PER_QUARTER * 2, numerator: 4, denominator: 4 },
    ];
    const tempoChanges: TempoChange[] = [
      { tick: 0, bpm: 120 }, // first 2 quarters: 1s
      { tick: TICKS_PER_QUARTER * 2, bpm: 60 },
    ];

    const { meterTimeline } = buildAnalysisFromMidiEvents([], tempoChanges, [], new Set(), masterBars);

    expect(meterTimeline[1].time).toBeCloseTo(1); // reached entirely within the 120bpm segment
  });

  it("takes notatedTempoBpm from the first tempo change, since Guitar Pro always persists one", () => {
    const { notatedTempoBpm } = buildAnalysisFromMidiEvents([], [{ tick: 0, bpm: 140 }], [], new Set());
    expect(notatedTempoBpm).toBe(140);
  });

  it("leaves notatedTempoBpm null when no tempo change was ever emitted", () => {
    const { notatedTempoBpm } = buildAnalysisFromMidiEvents([], [], [], new Set());
    expect(notatedTempoBpm).toBeNull();
  });
});
