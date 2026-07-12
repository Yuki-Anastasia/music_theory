import type { NoteEventTime } from "@spotify/basic-pitch";
import { midiToPitchClass } from "../audio/pitch";

/**
 * Common normalized format (technical spec A-2-5): both the live-mic path
 * (YIN) and the file/recording path (Basic Pitch) converge here, so
 * downstream math modules (Tonnetz, Fourier, key detection) never need to
 * know which input path produced the data.
 */
export interface NormalizedNoteEvent {
  time: number; // seconds from the start of the audio
  durationSeconds: number;
  midiNote: number;
  pitchClass: number;
  confidence: number; // 0-1, from Basic Pitch's note amplitude (or a score's dynamics marking)
  /** Source part/instrument name, when known (score-import path only; audio path leaves this unset). Display-only — doesn't affect voice separation. */
  partLabel?: string;
}

export function notesToNormalizedEvents(notes: NoteEventTime[]): NormalizedNoteEvent[] {
  return notes.map((note) => ({
    time: note.startTimeSeconds,
    durationSeconds: note.durationSeconds,
    midiNote: note.pitchMidi,
    pitchClass: midiToPitchClass(note.pitchMidi),
    confidence: Math.min(1, Math.max(0, note.amplitude)),
  }));
}

/**
 * 12-element pitch-class histogram weighted by how long each note sounds
 * within [startSec, endSec) — the input Krumhansl-Schmuckler key detection
 * and the Fourier pitch-class analysis (Tier1 modules #3/#5) both consume.
 */
export function pitchClassHistogram(
  events: NormalizedNoteEvent[],
  startSec: number,
  endSec: number
): number[] {
  const histogram = new Array(12).fill(0);
  for (const event of events) {
    const eventEnd = event.time + event.durationSeconds;
    const overlapStart = Math.max(event.time, startSec);
    const overlapEnd = Math.min(eventEnd, endSec);
    const overlap = overlapEnd - overlapStart;
    if (overlap > 0) {
      histogram[event.pitchClass] += overlap * event.confidence;
    }
  }
  return histogram;
}

/** Pitch classes actively sounding at a given moment in time. */
export function activePitchClassesAt(events: NormalizedNoteEvent[], timeSeconds: number): Set<number> {
  const active = new Set<number>();
  for (const event of events) {
    if (event.time <= timeSeconds && timeSeconds < event.time + event.durationSeconds) {
      active.add(event.pitchClass);
    }
  }
  return active;
}

/**
 * The highest-pitched note actively sounding at a given moment among the
 * given events — e.g. one part's own notes, when that single part is
 * itself polyphonic (a piano LH voicing a chord), reduced to a single
 * line for per-part comparison (see counterpoint.ts). Same half-open
 * [time, time+duration) window as activePitchClassesAt. Returns null when
 * nothing is sounding (a rest).
 */
export function highestActiveNoteAt(events: NormalizedNoteEvent[], timeSeconds: number): NormalizedNoteEvent | null {
  let highest: NormalizedNoteEvent | null = null;
  for (const event of events) {
    if (event.time <= timeSeconds && timeSeconds < event.time + event.durationSeconds) {
      if (!highest || event.midiNote > highest.midiNote) highest = event;
    }
  }
  return highest;
}
