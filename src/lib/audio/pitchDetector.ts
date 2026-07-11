import Pitchfinder from "pitchfinder";
import { frequencyToNearestMidi, midiToPitchClass } from "./pitch";

export interface PitchReading {
  time: number; // performance.now() at capture
  frequency: number;
  midiNote: number;
  pitchClass: number;
  centsOff: number;
  confidence: number; // 0-1, RMS-based (Pitchfinder's plain YIN doesn't expose its own)
  processingMs: number; // time spent in YIN + filtering for this frame
}

const MEDIAN_FILTER_SIZE = 5;
const DEFAULT_MIN_FREQUENCY = 0;
const DEFAULT_MAX_FREQUENCY = 4200;
// Reference floor (dBFS) purely for scaling the 0-1 confidence display —
// not a gate. Silence/noise is filtered by the frequency range check below
// instead, since a dB gate was rejecting normal speaking volume.
const CONFIDENCE_FLOOR_DB = -60;

/**
 * Lowest frequency Pitchfinder's YIN can reliably find in a buffer of this
 * size: internally it halves the buffer twice before scanning lags, so the
 * max lag examined is ~bufferSize/4 - 1 samples. Used to decide when a
 * small/fast buffer's result should be trusted vs. falling back to a
 * larger/slower buffer (see useMicPitch's dual-resolution detection).
 */
export function minReliableFrequency(sampleRate: number, bufferSize: number): number {
  return sampleRate / (bufferSize / 4 - 1);
}

/**
 * Wraps Pitchfinder's YIN detector with a plausible-frequency-range filter
 * and a median filter over the last few frames, per the technical spec
 * (A-2-1): raw YIN output jumps around from octave errors, and locks onto
 * near-Nyquist "frequencies" from mic self-noise when there's no real
 * pitched signal.
 */
export class PitchDetector {
  private detectYin: (buffer: Float32Array) => number | null;
  private recentFrequencies: number[] = [];
  private minFrequency: number;
  private maxFrequency: number;

  constructor(
    private sampleRate: number,
    opts: {
      yinThreshold?: number;
      minFrequency?: number;
      maxFrequency?: number;
    } = {}
  ) {
    this.minFrequency = opts.minFrequency ?? DEFAULT_MIN_FREQUENCY;
    this.maxFrequency = opts.maxFrequency ?? DEFAULT_MAX_FREQUENCY;
    this.detectYin = Pitchfinder.YIN({
      sampleRate,
      threshold: opts.yinThreshold ?? 0.1,
    });
  }

  private static rms(buffer: Float32Array): number {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i] * buffer[i];
    return Math.sqrt(sumSquares / buffer.length);
  }

  /** dBFS from linear RMS (0..1). -Infinity at true silence, clamped for display use. */
  private static rmsToDb(rms: number): number {
    return 20 * Math.log10(Math.max(rms, 1e-10));
  }

  private static median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  /** Feed one PCM buffer (Float32Array, time-domain). Returns null on silence/no pitch. */
  process(buffer: Float32Array): PitchReading | null {
    const start = performance.now();
    const rms = PitchDetector.rms(buffer);
    const db = PitchDetector.rmsToDb(rms);

    const frequency = this.detectYin(buffer);
    if (frequency == null || frequency < this.minFrequency || frequency > this.maxFrequency) {
      this.recentFrequencies = [];
      return null;
    }

    this.recentFrequencies.push(frequency);
    if (this.recentFrequencies.length > MEDIAN_FILTER_SIZE) {
      this.recentFrequencies.shift();
    }
    const filteredFrequency = PitchDetector.median(this.recentFrequencies);

    const { midi, centsOff } = frequencyToNearestMidi(filteredFrequency);
    const processingMs = performance.now() - start;

    return {
      time: start,
      frequency: filteredFrequency,
      midiNote: midi,
      pitchClass: midiToPitchClass(midi),
      centsOff,
      confidence: Math.min(1, Math.max(0, (db - CONFIDENCE_FLOOR_DB) / -CONFIDENCE_FLOOR_DB)),
      processingMs,
    };
  }
}
