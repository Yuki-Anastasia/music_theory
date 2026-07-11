import { describe, it, expect } from "vitest";
import { estimateKeyTimeline } from "./keyTimeline";
import { NormalizedNoteEvent } from "./normalizedEvents";

function makeScaleEvents(pitchClasses: number[], startTime: number, endTime: number): NormalizedNoteEvent[] {
  const span = endTime - startTime;
  const noteLen = span / pitchClasses.length;
  return pitchClasses.map((pc, i) => ({
    time: startTime + i * noteLen,
    durationSeconds: noteLen,
    midiNote: 60 + pc,
    pitchClass: pc,
    confidence: 1,
  }));
}

describe("estimateKeyTimeline", () => {
  it("returns an empty timeline for no events", () => {
    expect(estimateKeyTimeline([])).toEqual([]);
  });

  it("detects a modulation from C major to G major across the song", () => {
    const cMajor = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
    const gMajor = [7, 9, 11, 0, 2, 4, 6]; // G A B C D E F#

    // Repeat each scale many times over its half so an 8s window has plenty
    // of signal (short single passes leave overlapping windows ambiguous).
    const firstHalf: NormalizedNoteEvent[] = [];
    for (let rep = 0; rep < 8; rep++) {
      firstHalf.push(...makeScaleEvents(cMajor, rep * 2, rep * 2 + 2));
    }
    const secondHalf: NormalizedNoteEvent[] = [];
    for (let rep = 0; rep < 8; rep++) {
      secondHalf.push(...makeScaleEvents(gMajor, 16 + rep * 2, 16 + rep * 2 + 2));
    }

    const timeline = estimateKeyTimeline([...firstHalf, ...secondHalf], 8, 4);
    expect(timeline.length).toBeGreaterThan(0);

    const early = timeline[0];
    const late = timeline[timeline.length - 1];
    expect(early.key.tonic).toBe(0);
    expect(early.key.mode).toBe("major");
    expect(late.key.tonic).toBe(7);
    expect(late.key.mode).toBe("major");
  });

  it("skips windows with no sounding notes", () => {
    const events = makeScaleEvents([0, 2, 4, 5, 7, 9, 11], 0, 2);
    const timeline = estimateKeyTimeline(events, 8, 4);
    // song is only 2s long; every returned point must have real signal
    for (const point of timeline) {
      expect(point.key.correlation).not.toBeNaN();
    }
  });
});
