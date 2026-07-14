import { midiToNoteName } from "../audio/pitch";
import { ScoreEdit } from "./scoreEdits";

/**
 * summaryPrompt.ts's whole design principle is rounded prose facts and
 * "no room for the LLM to invent numbers" — deliberately never a raw note
 * array. This module is the one scoped exception to that rule: AI-driven
 * score editing needs exact per-note ground truth (a real id, an exact
 * time/pitch) to target a specific note precisely, which prose facts
 * can't provide. Keep this exception here, not in summaryPrompt.ts.
 */
export interface EditableNoteDTO {
  id: string;
  time: number;
  durationSeconds: number;
  midiNote: number;
  partLabel?: string;
}

/** Structurally compatible with Anthropic SDK's Tool type, without importing the SDK into src/lib/theory. */
export interface ScoreEditToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export const MAX_EDITABLE_NOTES = 500;

const ADD_NOTES_TOOL_NAME = "add_notes";
const EDIT_NOTES_TOOL_NAME = "edit_notes";
const REMOVE_NOTES_TOOL_NAME = "remove_notes";

/**
 * Three tools, each batched (array-taking) rather than one call per note —
 * "remove every F#" should be one remove_notes call with an id array, not
 * N separate tool calls. `includedParts` constrains add_notes' partLabel
 * to an enum of currently-known parts (or omits the field entirely for the
 * audio path, which has none) — the model structurally can't request a new
 * part name; applyScoreEdits re-validates this independently regardless.
 */
export function buildScoreEditTools(includedParts: string[]): ScoreEditToolSchema[] {
  const noteProperties: Record<string, unknown> = {
    time: { type: "number", description: "Onset time in seconds from the start of the piece." },
    durationSeconds: { type: "number", description: "Note duration in seconds." },
    midiNote: { type: "integer", description: "MIDI note number, 0-127 (60 = middle C)." },
  };
  if (includedParts.length > 0) {
    noteProperties.partLabel = {
      type: "string",
      enum: includedParts,
      description: "Which existing instrument part this note belongs to.",
    };
  }

  return [
    {
      name: ADD_NOTES_TOOL_NAME,
      description: "Add one or more new notes to the score.",
      input_schema: {
        type: "object",
        properties: {
          notes: {
            type: "array",
            items: {
              type: "object",
              properties: noteProperties,
              required: ["time", "durationSeconds", "midiNote"],
            },
          },
        },
        required: ["notes"],
      },
    },
    {
      name: EDIT_NOTES_TOOL_NAME,
      description:
        "Change the time, duration, and/or pitch of one or more existing notes, each identified by its exact id from the note listing provided.",
      input_schema: {
        type: "object",
        properties: {
          notes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Exact id from the note listing." },
                time: { type: "number" },
                durationSeconds: { type: "number" },
                midiNote: { type: "integer" },
              },
              required: ["id"],
            },
          },
        },
        required: ["notes"],
      },
    },
    {
      name: REMOVE_NOTES_TOOL_NAME,
      description: "Remove one or more existing notes, each identified by its exact id from the note listing provided.",
      input_schema: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" } },
        },
        required: ["ids"],
      },
    },
  ];
}

/** Plain-text, one line per note, sorted by time — capped with a truncation notice so a huge score can't blow out the prompt. Null when there's nothing editable. */
export function buildEditableNotesListing(notes: EditableNoteDTO[]): string | null {
  if (notes.length === 0) return null;
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const shown = sorted.slice(0, MAX_EDITABLE_NOTES);
  const lines = shown.map((n) => {
    const parts = [
      `id=${n.id}`,
      `time=${n.time.toFixed(2)}s`,
      `dur=${n.durationSeconds.toFixed(2)}s`,
      `note=${midiToNoteName(n.midiNote)}(${n.midiNote})`,
    ];
    if (n.partLabel) parts.push(`part=${n.partLabel}`);
    return parts.join(" ");
  });
  if (sorted.length > MAX_EDITABLE_NOTES) {
    lines.push(`... (${sorted.length - MAX_EDITABLE_NOTES} more notes omitted)`);
  }
  return lines.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Converts raw tool_use blocks (tool name + already-JSON-parsed input, from
 * the Anthropic response) into the flat ScoreEdit[] applyScoreEdits
 * expects, flattening each tool's batch. Purely defensive against
 * malformed/unexpected shapes — drops anything that doesn't fit rather
 * than throwing, since this is untrusted model output.
 */
export function parseToolEditBatches(edits: { tool: string; input: unknown }[]): ScoreEdit[] {
  const result: ScoreEdit[] = [];

  for (const { tool, input } of edits) {
    if (!isRecord(input)) continue;

    if (tool === ADD_NOTES_TOOL_NAME) {
      const notes = input.notes;
      if (!Array.isArray(notes)) continue;
      for (const item of notes) {
        if (!isRecord(item)) continue;
        if (!isFiniteNumber(item.time) || !isFiniteNumber(item.durationSeconds) || !isFiniteNumber(item.midiNote)) {
          continue;
        }
        result.push({
          kind: "add",
          time: item.time,
          durationSeconds: item.durationSeconds,
          midiNote: item.midiNote,
          ...(isFiniteNumber(item.confidence) ? { confidence: item.confidence } : {}),
          ...(typeof item.partLabel === "string" ? { partLabel: item.partLabel } : {}),
        });
      }
      continue;
    }

    if (tool === EDIT_NOTES_TOOL_NAME) {
      const notes = input.notes;
      if (!Array.isArray(notes)) continue;
      for (const item of notes) {
        if (!isRecord(item) || typeof item.id !== "string") continue;
        result.push({
          kind: "edit",
          id: item.id,
          ...(isFiniteNumber(item.time) ? { time: item.time } : {}),
          ...(isFiniteNumber(item.durationSeconds) ? { durationSeconds: item.durationSeconds } : {}),
          ...(isFiniteNumber(item.midiNote) ? { midiNote: item.midiNote } : {}),
        });
      }
      continue;
    }

    if (tool === REMOVE_NOTES_TOOL_NAME) {
      const ids = input.ids;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id === "string") result.push({ kind: "remove", id });
      }
      continue;
    }
    // Unknown tool name — dropped silently.
  }

  return result;
}
