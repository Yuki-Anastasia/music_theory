import { describe, it, expect } from "vitest";
import { applyScoreEdits, summarizeAppliedEdits, ScoreEdit } from "./scoreEdits";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(id: string, time: number, midiNote = 60): NormalizedNoteEvent {
  return { id, time, durationSeconds: 0.5, midiNote, pitchClass: midiNote % 12, confidence: 1 };
}

function ids(prefix = "new"): () => string {
  let n = 0;
  return () => `${prefix}${n++}`;
}

describe("applyScoreEdits", () => {
  it("adds a valid note with a generated id and derived pitchClass", () => {
    const edit: ScoreEdit = { kind: "add", time: 1, durationSeconds: 0.5, midiNote: 61 };
    const result = applyScoreEdits([], [edit], { generateId: ids() });
    expect(result.events).toEqual([
      { id: "new0", time: 1, durationSeconds: 0.5, midiNote: 61, pitchClass: 1, confidence: 1 },
    ]);
    expect(result.applied).toEqual([{ edit, status: "applied" }]);
  });

  it("skips add with an out-of-range midiNote", () => {
    const edit: ScoreEdit = { kind: "add", time: 1, durationSeconds: 0.5, midiNote: 128 };
    const result = applyScoreEdits([], [edit], { generateId: ids() });
    expect(result.events).toEqual([]);
    expect(result.applied).toEqual([{ edit, status: "skipped", reason: "invalid field(s)" }]);
  });

  it("skips add with a negative time or non-positive duration", () => {
    const badTime: ScoreEdit = { kind: "add", time: -1, durationSeconds: 0.5, midiNote: 60 };
    const badDuration: ScoreEdit = { kind: "add", time: 0, durationSeconds: 0, midiNote: 60 };
    const result = applyScoreEdits([], [badTime, badDuration], { generateId: ids() });
    expect(result.events).toEqual([]);
    expect(result.applied.every((a) => a.status === "skipped")).toBe(true);
  });

  it("clamps an out-of-range confidence and defaults a missing one to 1", () => {
    const result = applyScoreEdits(
      [],
      [
        { kind: "add", time: 0, durationSeconds: 1, midiNote: 60, confidence: 5 },
        { kind: "add", time: 1, durationSeconds: 1, midiNote: 60 },
      ],
      { generateId: ids() }
    );
    expect(result.events[0].confidence).toBe(1);
    expect(result.events[1].confidence).toBe(1);
  });

  it("rejects an add whose partLabel isn't in allowedPartLabels", () => {
    const edit: ScoreEdit = { kind: "add", time: 0, durationSeconds: 1, midiNote: 60, partLabel: "Drums" };
    const result = applyScoreEdits([], [edit], { generateId: ids(), allowedPartLabels: ["Guitar", "Bass"] });
    expect(result.events).toEqual([]);
    expect(result.applied).toEqual([{ edit, status: "skipped", reason: "unknown part" }]);
  });

  it("edits an existing note's pitch, recomputing pitchClass", () => {
    const events = [note("a", 0, 60)];
    const edit: ScoreEdit = { kind: "edit", id: "a", midiNote: 62 };
    const result = applyScoreEdits(events, [edit]);
    expect(result.events).toEqual([{ ...events[0], midiNote: 62, pitchClass: 2 }]);
    expect(result.applied).toEqual([{ edit, status: "applied" }]);
  });

  it("skips edit with an unknown id", () => {
    const edit: ScoreEdit = { kind: "edit", id: "missing", midiNote: 62 };
    const result = applyScoreEdits([note("a", 0)], [edit]);
    expect(result.events).toEqual([note("a", 0)]);
    expect(result.applied).toEqual([{ edit, status: "skipped", reason: "unknown id" }]);
  });

  it("skips edit with no fields provided", () => {
    const edit: ScoreEdit = { kind: "edit", id: "a" };
    const result = applyScoreEdits([note("a", 0)], [edit]);
    expect(result.applied).toEqual([{ edit, status: "skipped", reason: "no fields provided" }]);
  });

  it("skips edit with an invalid provided field, applying none of it", () => {
    const events = [note("a", 0, 60)];
    const edit: ScoreEdit = { kind: "edit", id: "a", time: 1, midiNote: -1 };
    const result = applyScoreEdits(events, [edit]);
    expect(result.events).toEqual(events);
    expect(result.applied).toEqual([{ edit, status: "skipped", reason: "invalid midiNote" }]);
  });

  it("removes an existing note", () => {
    const result = applyScoreEdits([note("a", 0), note("b", 1)], [{ kind: "remove", id: "a" }]);
    expect(result.events).toEqual([note("b", 1)]);
  });

  it("skips remove with an unknown id", () => {
    const edit: ScoreEdit = { kind: "remove", id: "missing" };
    const result = applyScoreEdits([note("a", 0)], [edit]);
    expect(result.events).toEqual([note("a", 0)]);
    expect(result.applied).toEqual([{ edit, status: "skipped", reason: "unknown id" }]);
  });

  it("an edit referencing an id removed earlier in the same batch reports unknown id, not a revival", () => {
    const result = applyScoreEdits(
      [note("a", 0, 60)],
      [
        { kind: "remove", id: "a" },
        { kind: "edit", id: "a", midiNote: 62 },
      ]
    );
    expect(result.events).toEqual([]);
    expect(result.applied[1]).toEqual({
      edit: { kind: "edit", id: "a", midiNote: 62 },
      status: "skipped",
      reason: "unknown id",
    });
  });
});

describe("summarizeAppliedEdits", () => {
  it("tallies applied kinds and skip reasons", () => {
    const summary = summarizeAppliedEdits([
      { edit: { kind: "add", time: 0, durationSeconds: 1, midiNote: 60 }, status: "applied" },
      { edit: { kind: "edit", id: "a", midiNote: 61 }, status: "applied" },
      { edit: { kind: "remove", id: "b" }, status: "applied" },
      { edit: { kind: "remove", id: "missing" }, status: "skipped", reason: "unknown id" },
    ]);
    expect(summary).toEqual({ added: 1, edited: 1, removed: 1, skipped: 1, skipReasons: ["unknown id"] });
  });
});
