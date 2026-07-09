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

const DEFAULT_BUFFER_SIZE = 2048;
const DEFAULT_RMS_THRESHOLD = 0.01; // frames quieter than this are treated as silence
const MEDIAN_FILTER_SIZE = 5;

/**
 * Wraps Pitchfinder's YIN detector with an RMS silence gate and a median
 * filter over the last few frames, per the technical spec (A-2-1): raw YIN
 * output jumps around from octave errors and momentary misfires.
 */
export class PitchDetector {
  private detectYin: (buffer: Float32Array) => number | null;
  private recentFrequencies: number[] = [];
  private rmsThreshold: number;

  constructor(
    private sampleRate: number,
    opts: { bufferSize?: number; rmsThreshold?: number; yinThreshold?: number } = {}
  ) {
    this.rmsThreshold = opts.rmsThreshold ?? DEFAULT_RMS_THRESHOLD;
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

  private static median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  /** Feed one PCM buffer (Float32Array, time-domain). Returns null on silence/no pitch. */
  process(buffer: Float32Array): PitchReading | null {
    const start = performance.now();
    const rms = PitchDetector.rms(buffer);

    if (rms < this.rmsThreshold) {
      this.recentFrequencies = [];
      return null;
    }

    const frequency = this.detectYin(buffer);
    if (frequency == null) {
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
      confidence: Math.min(1, rms / 0.1),
      processingMs,
    };
  }

  get bufferSize(): number {
    return DEFAULT_BUFFER_SIZE;
  }
}

export { DEFAULT_BUFFER_SIZE };
