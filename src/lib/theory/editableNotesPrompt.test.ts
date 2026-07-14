import { describe, it, expect } from "vitest";
import {
  buildScoreEditTools,
  buildEditableNotesListing,
  parseToolEditBatches,
  MAX_EDITABLE_NOTES,
  EditableNoteDTO,
} from "./editableNotesPrompt";

describe("buildScoreEditTools", () => {
  it("returns add_notes, edit_notes, and remove_notes", () => {
    const tools = buildScoreEditTools([]);
    expect(tools.map((t) => t.name).sort()).toEqual(["add_notes", "edit_notes", "remove_notes"]);
  });

  it("constrains add_notes' partLabel to an enum of includedParts when non-empty", () => {
    const tools = buildScoreEditTools(["Guitar", "Bass"]);
    const addNotes = tools.find((t) => t.name === "add_notes")!;
    const properties = (addNotes.input_schema.properties as Record<string, unknown>).notes as Record<string, unknown>;
    const itemProperties = (properties.items as Record<string, unknown>).properties as Record<string, unknown>;
    expect(itemProperties.partLabel).toMatchObject({ enum: ["Guitar", "Bass"] });
  });

  it("omits partLabel entirely from add_notes when there are no parts", () => {
    const tools = buildScoreEditTools([]);
    const addNotes = tools.find((t) => t.name === "add_notes")!;
    const properties = (addNotes.input_schema.properties as Record<string, unknown>).notes as Record<string, unknown>;
    const itemProperties = (properties.items as Record<string, unknown>).properties as Record<string, unknown>;
    expect(itemProperties.partLabel).toBeUndefined();
  });
});

describe("buildEditableNotesListing", () => {
  it("returns null for an empty list", () => {
    expect(buildEditableNotesListing([])).toBeNull();
  });

  it("sorts by time and formats id/time/duration/note/part", () => {
    const notes: EditableNoteDTO[] = [
      { id: "b", time: 1, durationSeconds: 0.5, midiNote: 62, partLabel: "Guitar" },
      { id: "a", time: 0, durationSeconds: 0.25, midiNote: 60 },
    ];
    const listing = buildEditableNotesListing(notes);
    const lines = listing!.split("\n");
    expect(lines[0]).toBe("id=a time=0.00s dur=0.25s note=C4(60)");
    expect(lines[1]).toBe("id=b time=1.00s dur=0.50s note=D4(62) part=Guitar");
  });

  it("truncates beyond MAX_EDITABLE_NOTES with a notice", () => {
    const notes: EditableNoteDTO[] = Array.from({ length: MAX_EDITABLE_NOTES + 5 }, (_, i) => ({
      id: `n${i}`,
      time: i,
      durationSeconds: 0.5,
      midiNote: 60,
    }));
    const listing = buildEditableNotesListing(notes);
    const lines = listing!.split("\n");
    expect(lines).toHaveLength(MAX_EDITABLE_NOTES + 1);
    expect(lines[lines.length - 1]).toBe("... (5 more notes omitted)");
  });
});

describe("parseToolEditBatches", () => {
  it("flattens an add_notes batch into individual add edits", () => {
    const edits = parseToolEditBatches([
      {
        tool: "add_notes",
        input: { notes: [{ time: 0, durationSeconds: 0.5, midiNote: 60 }, { time: 1, durationSeconds: 0.5, midiNote: 62, partLabel: "Bass" }] },
      },
    ]);
    expect(edits).toEqual([
      { kind: "add", time: 0, durationSeconds: 0.5, midiNote: 60 },
      { kind: "add", time: 1, durationSeconds: 0.5, midiNote: 62, partLabel: "Bass" },
    ]);
  });

  it("flattens an edit_notes batch, omitting unset optional fields", () => {
    const edits = parseToolEditBatches([
      { tool: "edit_notes", input: { notes: [{ id: "a", midiNote: 61 }] } },
    ]);
    expect(edits).toEqual([{ kind: "edit", id: "a", midiNote: 61 }]);
  });

  it("flattens a remove_notes batch", () => {
    const edits = parseToolEditBatches([{ tool: "remove_notes", input: { ids: ["a", "b"] } }]);
    expect(edits).toEqual([{ kind: "remove", id: "a" }, { kind: "remove", id: "b" }]);
  });

  it("drops malformed items instead of throwing", () => {
    expect(() =>
      parseToolEditBatches([
        { tool: "add_notes", input: { notes: ["not-an-object", { time: "nope", durationSeconds: 1, midiNote: 60 }] } },
        { tool: "edit_notes", input: { notes: [{ midiNote: 61 }] } }, // missing id
        { tool: "remove_notes", input: { ids: [42, "ok"] } },
        { tool: "unknown_tool", input: { anything: true } },
        { tool: "add_notes", input: "not-a-record" },
        { tool: "add_notes", input: { notes: "not-an-array" } },
      ])
    ).not.toThrow();

    const edits = parseToolEditBatches([
      { tool: "add_notes", input: { notes: ["not-an-object", { time: "nope", durationSeconds: 1, midiNote: 60 }] } },
      { tool: "edit_notes", input: { notes: [{ midiNote: 61 }] } },
      { tool: "remove_notes", input: { ids: [42, "ok"] } },
      { tool: "unknown_tool", input: { anything: true } },
    ]);
    expect(edits).toEqual([{ kind: "remove", id: "ok" }]);
  });
});
