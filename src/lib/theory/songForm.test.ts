import { describe, it, expect } from "vitest";
import { analyzeSongForm } from "./songForm";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number, pitchClass: number): NormalizedNoteEvent {
  return { time, durationSeconds: 0.5, midiNote: 60 + pitchClass, pitchClass, confidence: 1 };
}

// Fills [start, start+6) with a repeating C-E-G arpeggio -- a distinctive,
// consistent pitch-class distribution to match against.
function fillRepeatingPattern(events: NormalizedNoteEvent[], start: number): void {
  for (let i = 0; i < 12; i++) events.push(note(start + i * 0.5, [0, 4, 7][i % 3]));
}

// Fills [start, start+6) with different, unrelated material each call.
function fillDistinctMaterial(events: NormalizedNoteEvent[], start: number, pitchClasses: number[]): void {
  for (let i = 0; i < 12; i++) events.push(note(start + i * 0.5, pitchClasses[i % pitchClasses.length]));
}

describe("analyzeSongForm", () => {
  it("returns null for no events", () => {
    expect(analyzeSongForm([], 18)).toBeNull();
  });

  it("gives every window its own group and no recurrences when nothing repeats", () => {
    const events: NormalizedNoteEvent[] = [];
    fillDistinctMaterial(events, 0, [0, 2, 4]);
    fillDistinctMaterial(events, 6, [1, 6, 9]);
    fillDistinctMaterial(events, 12, [3, 8, 10]);
    const result = analyzeSongForm(events, 18);

    expect(result).not.toBeNull();
    expect(result!.recurrences).toEqual([]);
    const groups = result!.sections.map((s) => s.group);
    expect(new Set(groups).size).toBe(groups.length); // all distinct
  });

  it("finds a far-apart window pair with matching pitch-class content as a recurrence", () => {
    const events: NormalizedNoteEvent[] = [];
    fillRepeatingPattern(events, 0); // [0,6)
    fillDistinctMaterial(events, 6, [1, 6, 9]);
    fillDistinctMaterial(events, 12, [3, 8, 10]);
    fillDistinctMaterial(events, 18, [5, 11, 2]);
    fillRepeatingPattern(events, 24); // [24,30) -- recurs

    const result = analyzeSongForm(events, 30);
    expect(result!.recurrences).toHaveLength(1);
    expect(result!.recurrences[0]).toMatchObject({ a: { startSec: 0, endSec: 6 }, b: { startSec: 24, endSec: 30 } });
    expect(result!.recurrences[0].similarity).toBeGreaterThan(0.9);

    const first = result!.sections.find((s) => s.startSec === 0)!;
    const last = result!.sections.find((s) => s.startSec === 24)!;
    expect(first.group).toBe(last.group);
  });

  it("groups adjacent windows sharing the same content under one letter, without needing the recurrence gap", () => {
    const events: NormalizedNoteEvent[] = [];
    fillRepeatingPattern(events, 0); // [0,6)
    fillRepeatingPattern(events, 6); // [6,12) -- same content, immediately adjacent
    fillDistinctMaterial(events, 12, [1, 6, 9]); // [12,18) -- a genuinely new section

    const result = analyzeSongForm(events, 18);
    const groupOf = (start: number) => result!.sections.find((s) => s.startSec === start)!.group;
    expect(groupOf(0)).toBe(groupOf(6));
    expect(groupOf(12)).not.toBe(groupOf(0));
    // Adjacent-only matches don't clear MIN_GAP_WINDOWS, so they shouldn't
    // appear as a "callback" recurrence -- that's for far-apart repeats.
    expect(result!.recurrences).toEqual([]);
  });
});
