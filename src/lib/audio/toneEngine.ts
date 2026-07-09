"use client";

import * as Tone from "tone";

const DEFAULT_VOLUME_DB = -12; // headroom so overlapping tones don't clip, per spec A-1

let started = false;

/**
 * AudioContext can only start after a user gesture (browser autoplay policy,
 * strict on iOS Safari). Every "音を有効化" button must call this from
 * inside its click/touch handler.
 */
export async function ensureAudioStarted(): Promise<void> {
  if (started) return;
  await Tone.start();
  started = true;
}

export function isAudioStarted(): boolean {
  return started;
}

export type Waveform = "sine" | "sawtooth" | "triangle" | "square";

export interface PlayToneOptions {
  waveform?: Waveform;
  durationSeconds?: number;
  volumeDb?: number;
  /** Explicit harmonic partial amplitudes (0-1), e.g. [1, 0.5, 0.33] for a rich tone. */
  partials?: number[];
}

/**
 * Plays a single frequency and disposes the oscillator afterward.
 * Oscillators are single-use in Tone.js/Web Audio (spec A-1 pitfall): once
 * stopped they cannot be restarted, so every call creates a fresh one.
 */
export function playFrequency(frequency: number, opts: PlayToneOptions = {}): void {
  const { waveform = "sine", durationSeconds = 1.5, volumeDb = DEFAULT_VOLUME_DB, partials } = opts;

  const osc = partials
    ? new Tone.Oscillator({ frequency, partials, volume: volumeDb }).toDestination()
    : new Tone.Oscillator({ frequency, type: waveform, volume: volumeDb }).toDestination();

  osc.start();
  osc.stop(`+${durationSeconds}`);
  // Dispose slightly after stop so the tail isn't cut off.
  setTimeout(() => osc.dispose(), (durationSeconds + 0.1) * 1000);
}

/**
 * Plays two frequencies simultaneously — the primitive behind every
 * just-vs-equal-temperament "beating" comparison in Module #1.
 */
export function playFrequencies(frequencies: number[], opts: PlayToneOptions = {}): void {
  frequencies.forEach((f) => playFrequency(f, opts));
}

/** Harmonic-rich partials so beating is audible in upper partials, not just the fundamental (spec A-1). */
export const RICH_PARTIALS = [1, 0.5, 0.33, 0.25, 0.2, 0.167, 0.14, 0.125];
