"use client";

import type { NoteEventTime } from "@spotify/basic-pitch";
import { resampleTo } from "./resample";

const MODEL_URL = "/models/basic-pitch/model.json";
const BASIC_PITCH_SAMPLE_RATE = 22050;

// The model + tfjs are heavy (~1MB model, several hundred KB of tfjs) and
// browser-only (WebGL/AudioContext), so both the package and the model are
// loaded lazily on first use rather than bundled into every page.
let basicPitchPromise: Promise<import("@spotify/basic-pitch").BasicPitch> | null = null;

async function getBasicPitch() {
  if (!basicPitchPromise) {
    basicPitchPromise = import("@spotify/basic-pitch").then(
      ({ BasicPitch }) => new BasicPitch(MODEL_URL)
    );
  }
  return basicPitchPromise;
}

export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextCtor();
  try {
    return await audioContext.decodeAudioData(arrayBuffer);
  } finally {
    await audioContext.close();
  }
}

export interface AnalyzeSongProgress {
  /** 0-1, from Basic Pitch's own frame-by-frame progress callback. */
  fraction: number;
  elapsedMs: number;
}

/**
 * Full pipeline: audio input (uploaded file/blob, or an AudioBuffer already
 * captured from the mic as raw PCM) -> Basic Pitch polyphonic transcription
 * -> note events with real timestamps. Runs entirely client-side; no
 * backend involved.
 */
export async function analyzeSong(
  input: Blob | AudioBuffer,
  onProgress?: (progress: AnalyzeSongProgress) => void
): Promise<NoteEventTime[]> {
  const startTime = performance.now();
  const [{ outputToNotesPoly, addPitchBendsToNoteEvents, noteFramesToTime }, basicPitch, audioBuffer] =
    await Promise.all([
      import("@spotify/basic-pitch"),
      getBasicPitch(),
      input instanceof Blob ? decodeAudioBlob(input) : Promise.resolve(input),
    ]);

  const monoAudio = await resampleTo(audioBuffer, BASIC_PITCH_SAMPLE_RATE);

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  await basicPitch.evaluateModel(
    monoAudio,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (fraction) => {
      onProgress?.({ fraction, elapsedMs: performance.now() - startTime });
    }
  );

  // Spotify's own validated defaults (onsetThresh=0.5, frameThresh=0.3,
  // minNoteLen=5) — a previous, more sensitive override here was picking up
  // noise-floor energy as spurious notes and splitting single sustained
  // notes on natural amplitude ripple.
  const notes = outputToNotesPoly(frames, onsets);
  return noteFramesToTime(addPitchBendsToNoteEvents(contours, notes));
}
