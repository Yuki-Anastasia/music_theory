import { NormalizedNoteEvent } from "./normalizedEvents";
import { midiToPitchClass } from "../audio/pitch";

/**
 * The three note-level mutations an AI edit request can make, applied by
 * applyScoreEdits below. Untrusted input (originates from a tool call the
 * model made) — every field is validated at that boundary, never trusted
 * as-is.
 */
export type ScoreEdit =
  | { kind: "add"; time: number; durationSeconds: number; midiNote: number; confidence?: number; partLabel?: string }
  | { kind: "edit"; id: string; time?: number; durationSeconds?: number; midiNote?: number }
  | { kind: "remove"; id: string };

export interface AppliedEditSummary {
  edit: ScoreEdit;
  status: "applied" | "skipped";
  reason?: string;
}

export interface ApplyScoreEditsOptions {
  /** Score-import path only; omit for audio-transcribed input (no parts to restrict to). */
  allowedPartLabels?: string[];
  /** Defaults to crypto.randomUUID; injectable so tests can assert on exact generated ids. */
  generateId?: () => string;
}

const MIN_MIDI = 0;
const MAX_MIDI = 127;

function isValidMidiNote(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_MIDI && value <= MAX_MIDI;
}

function isValidTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/**
 * Applies a batch of AI-proposed edits to a note list, in order, against a
 * running working copy — so e.g. an "edit" referencing an id already
 * removed earlier in the same batch correctly reports "unknown id" rather
 * than silently reviving it. Every edit is independently validated; an
 * invalid or unresolvable edit is skipped (with a reason) rather than
 * aborting the whole batch.
 */
export function applyScoreEdits(
  events: NormalizedNoteEvent[],
  edits: ScoreEdit[],
  options: ApplyScoreEditsOptions = {}
): { events: NormalizedNoteEvent[]; applied: AppliedEditSummary[] } {
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  let working = [...events];
  const applied: AppliedEditSummary[] = [];

  for (const edit of edits) {
    if (edit.kind === "add") {
      if (!isValidTime(edit.time) || !isValidDuration(edit.durationSeconds) || !isValidMidiNote(edit.midiNote)) {
        applied.push({ edit, status: "skipped", reason: "invalid field(s)" });
        continue;
      }
      if (
        options.allowedPartLabels &&
        edit.partLabel !== undefined &&
        !options.allowedPartLabels.includes(edit.partLabel)
      ) {
        applied.push({ edit, status: "skipped", reason: "unknown part" });
        continue;
      }
      const newEvent: NormalizedNoteEvent = {
        id: generateId(),
        time: edit.time,
        durationSeconds: edit.durationSeconds,
        midiNote: edit.midiNote,
        pitchClass: midiToPitchClass(edit.midiNote),
        confidence: clampConfidence(edit.confidence),
        ...(edit.partLabel !== undefined ? { partLabel: edit.partLabel } : {}),
      };
      working = [...working, newEvent];
      applied.push({ edit, status: "applied" });
      continue;
    }

    if (edit.kind === "edit") {
      const index = working.findIndex((e) => e.id === edit.id);
      if (index === -1) {
        applied.push({ edit, status: "skipped", reason: "unknown id" });
        continue;
      }
      const hasAnyField = edit.time !== undefined || edit.durationSeconds !== undefined || edit.midiNote !== undefined;
      if (!hasAnyField) {
        applied.push({ edit, status: "skipped", reason: "no fields provided" });
        continue;
      }
      if (edit.time !== undefined && !isValidTime(edit.time)) {
        applied.push({ edit, status: "skipped", reason: "invalid time" });
        continue;
      }
      if (edit.durationSeconds !== undefined && !isValidDuration(edit.durationSeconds)) {
        applied.push({ edit, status: "skipped", reason: "invalid duration" });
        continue;
      }
      if (edit.midiNote !== undefined && !isValidMidiNote(edit.midiNote)) {
        applied.push({ edit, status: "skipped", reason: "invalid midiNote" });
        continue;
      }
      const existing = working[index];
      const updated: NormalizedNoteEvent = {
        ...existing,
        ...(edit.time !== undefined ? { time: edit.time } : {}),
        ...(edit.durationSeconds !== undefined ? { durationSeconds: edit.durationSeconds } : {}),
        ...(edit.midiNote !== undefined
          ? { midiNote: edit.midiNote, pitchClass: midiToPitchClass(edit.midiNote) }
          : {}),
      };
      working = [...working.slice(0, index), updated, ...working.slice(index + 1)];
      applied.push({ edit, status: "applied" });
      continue;
    }

    const index = working.findIndex((e) => e.id === edit.id);
    if (index === -1) {
      applied.push({ edit, status: "skipped", reason: "unknown id" });
      continue;
    }
    working = [...working.slice(0, index), ...working.slice(index + 1)];
    applied.push({ edit, status: "applied" });
  }

  return { events: working, applied };
}

export function summarizeAppliedEdits(applied: AppliedEditSummary[]): {
  added: number;
  edited: number;
  removed: number;
  skipped: number;
  skipReasons: string[];
} {
  let added = 0;
  let edited = 0;
  let removed = 0;
  let skipped = 0;
  const skipReasons: string[] = [];
  for (const entry of applied) {
    if (entry.status === "skipped") {
      skipped++;
      if (entry.reason) skipReasons.push(entry.reason);
      continue;
    }
    if (entry.edit.kind === "add") added++;
    else if (entry.edit.kind === "edit") edited++;
    else removed++;
  }
  return { added, edited, removed, skipped, skipReasons };
}
