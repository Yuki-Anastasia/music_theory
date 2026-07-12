"use client";

import { midiToPitchClass } from "../audio/pitch";
import type { NormalizedNoteEvent } from "../theory/normalizedEvents";
import type { ScoreAnalysis, MeterPoint } from "./musicXml";

// alphaTab's fixed midi tick resolution (MidiUtils.QuarterTime), used to
// convert the tick-based positions its MidiFileGenerator produces into
// seconds. Not exposed publicly by the package, so it's hardcoded here.
const TICKS_PER_QUARTER = 960;
const DEFAULT_TEMPO_BPM = 120;

export interface RawMidiNote {
  track: number;
  startTick: number;
  lengthTicks: number;
  midiNote: number;
  velocity: number; // 0-127
}

export interface TempoChange {
  tick: number;
  bpm: number;
}

export interface RawMasterBar {
  startTick: number;
  numerator: number;
  denominator: number;
}

/**
 * Minimal alphaTab IMidiFileHandler that just records note-on events and
 * tempo changes in midi-tick space. alphaTab's MidiFileGenerator already
 * resolves ties, grace notes, repeats, and ornaments into the correct
 * sequence of sounding notes internally, so everything else the interface
 * offers (bends, program changes, control changes, ...) is irrelevant to
 * pitch/rhythm analysis and dropped.
 */
export class NoteCollectorHandler {
  notes: RawMidiNote[] = [];
  tempoChanges: TempoChange[] = [];

  addTimeSignature(): void {}
  addRest(): void {}
  addNote(track: number, start: number, length: number, key: number, velocity: number): void {
    this.notes.push({ track, startTick: start, lengthTicks: length, midiNote: key, velocity });
  }
  addControlChange(): void {}
  addProgramChange(): void {}
  addTempo(tick: number, tempo: number): void {
    this.tempoChanges.push({ tick, bpm: tempo });
  }
  addNoteBend(): void {}
  addBend(): void {}
  finishTrack(): void {}
  addTickShift(): void {}
}

/**
 * Converts midi ticks to seconds given a (possibly unsorted, possibly
 * empty) list of tempo changes. Builds a piecewise-linear cumulative-time
 * lookup once, then answers each query by scanning to the last tempo
 * change at or before the requested tick.
 */
function buildTickToSeconds(tempoChanges: TempoChange[]): (tick: number) => number {
  const sorted = [...tempoChanges].sort((a, b) => a.tick - b.tick);
  if (sorted.length === 0 || sorted[0].tick > 0) {
    sorted.unshift({ tick: 0, bpm: DEFAULT_TEMPO_BPM });
  }

  const cumulativeSeconds: number[] = [0];
  for (let i = 1; i < sorted.length; i++) {
    const deltaTicks = sorted[i].tick - sorted[i - 1].tick;
    const secondsPerTick = 60 / (sorted[i - 1].bpm * TICKS_PER_QUARTER);
    cumulativeSeconds.push(cumulativeSeconds[i - 1] + deltaTicks * secondsPerTick);
  }

  return (tick: number): number => {
    let index = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].tick <= tick) index = i;
      else break;
    }
    const secondsPerTick = 60 / (sorted[index].bpm * TICKS_PER_QUARTER);
    return cumulativeSeconds[index] + (tick - sorted[index].tick) * secondsPerTick;
  };
}

/**
 * Pure core: turns already-collected midi-tick note/tempo data into the
 * same ScoreAnalysis shape the MusicXML path produces, so it feeds the
 * existing theory modules unchanged. Kept separate from file I/O and from
 * alphaTab's Score model so it's directly unit-testable without binary
 * Guitar Pro fixtures.
 *
 * Percussion tracks are dropped entirely: their midi note numbers are
 * General MIDI drum-kit codes, not pitches, and would corrupt
 * pitch-class-based analysis (key detection, Tonnetz, chord labeling).
 */
export function buildAnalysisFromMidiEvents(
  notes: RawMidiNote[],
  tempoChanges: TempoChange[],
  trackNames: string[],
  percussionTrackIndices: ReadonlySet<number>,
  masterBars: RawMasterBar[] = []
): ScoreAnalysis {
  const tickToSeconds = buildTickToSeconds(tempoChanges);

  const meterTimeline: MeterPoint[] = masterBars.map((bar) => ({
    time: tickToSeconds(bar.startTick),
    numerator: bar.numerator,
    denominator: bar.denominator,
  }));

  const events: NormalizedNoteEvent[] = notes
    .filter((n) => !percussionTrackIndices.has(n.track))
    .map((n) => {
      const time = tickToSeconds(n.startTick);
      const durationSeconds = tickToSeconds(n.startTick + n.lengthTicks) - time;
      const partLabel = trackNames[n.track];
      return {
        time,
        durationSeconds,
        midiNote: n.midiNote,
        pitchClass: midiToPitchClass(n.midiNote),
        confidence: Math.max(0, Math.min(1, n.velocity / 127)),
        ...(partLabel ? { partLabel } : {}),
      };
    })
    .sort((a, b) => a.time - b.time);

  return {
    events,
    // Guitar Pro's key/chord-symbol data isn't surfaced by the midi
    // generation path used here (MusicXML's <key>/<harmony> equivalents
    // aren't part of the IMidiFileHandler interface) — left empty rather
    // than guessed.
    notatedKeyTimeline: [],
    notatedChordTimeline: [],
    partNames: trackNames,
    meterTimeline,
  };
}

/**
 * Entry point: reads a Guitar Pro tab file (.gp3/.gp4/.gp5/.gpx/.gp) and
 * returns a ScoreAnalysis, the same shape parseScoreFile (MusicXML)
 * produces. Uses alphaTab purely as a headless importer + midi-timing
 * engine (no rendering) — its MidiFileGenerator already resolves ties,
 * grace notes, and repeats into the correct playback sequence, which this
 * module then converts into NormalizedNoteEvent[].
 */
export async function parseGuitarProFile(file: File): Promise<ScoreAnalysis> {
  const [{ importer, midi }, buffer] = await Promise.all([
    import("@coderline/alphatab"),
    file.arrayBuffer(),
  ]);

  let score: import("@coderline/alphatab").model.Score;
  try {
    score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer));
  } catch {
    throw new Error("タブ譜ファイルの解析に失敗しました(対応形式: .gp3/.gp4/.gp5/.gpx/.gp)");
  }

  const trackNames = score.tracks.map((t, i: number) => t.name || `Track ${i + 1}`);
  const percussionTrackIndices: Set<number> = new Set(
    score.tracks.filter((t) => t.isPercussion).map((t) => t.index)
  );
  // score.masterBars carries bar/time-signature data directly, independent
  // of the IMidiFileHandler note/tempo pipeline below.
  const masterBars: RawMasterBar[] = score.masterBars.map((bar) => ({
    startTick: bar.start,
    numerator: bar.timeSignatureNumerator,
    denominator: bar.timeSignatureDenominator,
  }));

  const handler = new NoteCollectorHandler();
  new midi.MidiFileGenerator(score, null, handler).generate();

  return buildAnalysisFromMidiEvents(
    handler.notes,
    handler.tempoChanges,
    trackNames,
    percussionTrackIndices,
    masterBars
  );
}
