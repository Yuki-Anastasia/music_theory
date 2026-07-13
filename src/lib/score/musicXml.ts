"use client";

import { unzipSync, strFromU8 } from "fflate";
import { midiToPitchClass } from "../audio/pitch";
import type { NormalizedNoteEvent } from "../theory/normalizedEvents";
import type { Mode } from "../theory/keyProfile";

const DEFAULT_TEMPO_BPM = 120;

const STEP_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

// <dynamics> mark element names (MusicXML spec) -> a 0-1 loudness value used
// as NormalizedNoteEvent.confidence. Momentary accents (sf/sfz/fp/...) are
// intentionally not modeled — they'd require reverting to the prior level
// after one note, which is out of scope for this pass.
const DYNAMICS_LEVELS: Record<string, number> = {
  pppp: 0.05, ppp: 0.1, pp: 0.2, p: 0.35, mp: 0.5, mf: 0.65, f: 0.8, ff: 0.9, fff: 0.95, ffff: 1,
};

const HARMONY_KIND_SUFFIX: Record<string, string> = {
  major: "",
  minor: "m",
  dominant: "7",
  augmented: "aug",
  diminished: "dim",
  "major-seventh": "maj7",
  "minor-seventh": "m7",
  "dominant-seventh": "7",
  "half-diminished": "m7b5",
  "diminished-seventh": "dim7",
  "suspended-second": "sus2",
  "suspended-fourth": "sus4",
  "major-sixth": "6",
  "minor-sixth": "m6",
  "major-ninth": "maj9",
  "minor-ninth": "m9",
  "dominant-ninth": "9",
};

export interface NotatedKeyPoint {
  time: number;
  tonic: number; // pitch class 0-11
  mode: Mode;
}

export interface NotatedChordPoint {
  time: number;
  label: string; // e.g. "C", "G7", "Am", "C/E"
}

export interface MeterPoint {
  time: number; // seconds, bar start
  numerator: number;
  denominator: number;
}

export interface ScoreAnalysis {
  events: NormalizedNoteEvent[];
  /** Key-signature changes as actually notated (<attributes><key>), not estimated from pitch content. Taken from the first part only — staves share one key signature at a given time. */
  notatedKeyTimeline: NotatedKeyPoint[];
  /** Chord symbols as notated (<harmony>), when the score includes them (common in lead sheets). */
  notatedChordTimeline: NotatedChordPoint[];
  /** Part/instrument names in document order, for a "part composition" display. */
  partNames: string[];
  /** One entry per bar (time signature carried forward from the last <attributes><time>), first part only — staves share one time signature. Empty when the score never specifies one explicitly and has no bars. */
  meterTimeline: MeterPoint[];
  /** The tempo as actually notated (<sound tempo="...">), or null when the score never specifies one — distinct from the internal default used to lay out the time axis, so callers can tell "no marking" from "genuinely 120bpm". */
  notatedTempoBpm: number | null;
  /** Onset times (seconds) of unpitched percussion notes (<unpitched>), across all parts. No pitch/duration — a drum hit is a beat indicator, not a pitch, so it's kept out of `events` entirely to avoid corrupting pitch-based analysis, but still carries real rhythmic information. */
  percussionOnsets: number[];
}

/**
 * Entry point: reads a .musicxml/.xml (plain-text) or .mxl (zip-compressed)
 * file exported from notation software and returns a ScoreAnalysis whose
 * `events` are the same NormalizedNoteEvent[] shape the audio pipeline
 * produces (see normalizedEvents.ts), so it feeds the existing theory
 * modules — keyTimeline, fourierTimeline, tonnetzTimeline, aestheticMetrics,
 * PianoRollViewer — unchanged. Ground-truth score data sidesteps Basic
 * Pitch's polyphonic pitch-estimation ambiguity entirely, and additionally
 * surfaces notated key/chord/dynamics information audio transcription has
 * no access to.
 */
export async function parseScoreFile(file: File): Promise<ScoreAnalysis> {
  const isCompressed = file.name.toLowerCase().endsWith(".mxl") || (await hasZipHeader(file));
  const xml = isCompressed ? parseMxlArchive(await file.arrayBuffer()) : await file.text();
  return parseMusicXmlString(xml);
}

async function hasZipHeader(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return header[0] === 0x50 && header[1] === 0x4b; // "PK"
}

/**
 * Extracts the root MusicXML document out of a compressed .mxl archive.
 * Resolves the root file via META-INF/container.xml (the format's
 * spec-defined mechanism) when present; otherwise falls back to the first
 * .xml entry outside META-INF/, which covers the common single-file
 * export case.
 */
export function parseMxlArchive(buffer: ArrayBuffer): string {
  const entries = unzipSync(new Uint8Array(buffer));

  const container = entries["META-INF/container.xml"];
  if (container) {
    const rootPath = strFromU8(container).match(/full-path="([^"]+)"/)?.[1];
    if (rootPath && entries[rootPath]) {
      return strFromU8(entries[rootPath]);
    }
  }

  const fallbackPath = Object.keys(entries).find(
    (path) => !path.startsWith("META-INF/") && path.toLowerCase().endsWith(".xml")
  );
  if (!fallbackPath) {
    throw new Error("mxlアーカイブ内にMusicXMLファイルが見つかりませんでした");
  }
  return strFromU8(entries[fallbackPath]);
}

/**
 * Parses a score-partwise MusicXML document. score-timewise (the format's
 * legacy alternative root element) is not supported.
 *
 * Tempo is read once from the first <sound tempo="..."> in the document
 * and applied uniformly throughout (default 120bpm) — mid-piece tempo
 * changes are not modeled. This only stretches/compresses the time axis;
 * the pitch content and note ordering that the theory modules consume are
 * unaffected.
 */
export function parseMusicXmlString(xml: string): ScoreAnalysis {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    throw new Error("MusicXMLの解析に失敗しました(不正なXML)");
  }
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("MusicXMLの解析に失敗しました(不正なXML)");
  }
  if (doc.documentElement?.tagName !== "score-partwise") {
    throw new Error("score-partwise形式のMusicXMLのみ対応しています(score-timewiseは未対応です)");
  }

  const notatedTempoBpm = findNotatedTempoBpm(doc);
  const tempoBpm = notatedTempoBpm ?? DEFAULT_TEMPO_BPM;

  const partNameById = new Map<string, string>();
  for (const scorePart of Array.from(doc.getElementsByTagName("score-part"))) {
    const id = scorePart.getAttribute("id");
    const name = scorePart.getElementsByTagName("part-name")[0]?.textContent?.trim();
    if (id && name) partNameById.set(id, name);
  }

  const parts = Array.from(doc.documentElement.children).filter((el) => el.tagName === "part");

  const events: NormalizedNoteEvent[] = [];
  const notatedChordTimeline: NotatedChordPoint[] = [];
  const partNames: string[] = [];
  const percussionOnsets: number[] = [];
  let notatedKeyTimeline: NotatedKeyPoint[] = [];
  let meterTimeline: MeterPoint[] = [];

  parts.forEach((part, index) => {
    const partLabel = partNameById.get(part.getAttribute("id") ?? "");
    if (partLabel) partNames.push(partLabel);

    const result = parsePart(part, tempoBpm, partLabel);
    events.push(...result.events);
    notatedChordTimeline.push(...result.harmonyMarks);
    percussionOnsets.push(...result.percussionOnsets);
    if (index === 0) {
      notatedKeyTimeline = result.keyChanges; // staves share one key signature; avoid duplicating per part
      meterTimeline = result.meterChanges; // staves share one time signature; avoid duplicating per part
    }
  });

  events.sort((a, b) => a.time - b.time);
  notatedChordTimeline.sort((a, b) => a.time - b.time);
  percussionOnsets.sort((a, b) => a - b);

  return { events, notatedKeyTimeline, notatedChordTimeline, partNames, meterTimeline, notatedTempoBpm, percussionOnsets };
}

/** Returns the tempo actually notated in <sound tempo="...">, or null when the document never specifies one — no defaulting here, unlike the internal time-axis calculation. */
function findNotatedTempoBpm(doc: Document): number | null {
  const soundEl = Array.from(doc.getElementsByTagName("sound")).find((el) => el.hasAttribute("tempo"));
  const tempo = soundEl ? parseFloat(soundEl.getAttribute("tempo") ?? "") : NaN;
  return Number.isFinite(tempo) && tempo > 0 ? tempo : null;
}

function childNumber(el: Element, tagName: string): number {
  return parseFloat(el.getElementsByTagName(tagName)[0]?.textContent ?? "");
}

function accidentalName(step: string, alter: number): string {
  if (alter > 0) return `${step}${"#".repeat(alter)}`;
  if (alter < 0) return `${step}${"b".repeat(-alter)}`;
  return step;
}

/** Formats a <harmony> element (chord symbol, e.g. lead-sheet notation) as e.g. "G7", "Cm", "C/E". */
function formatHarmony(harmonyEl: Element): string | null {
  const rootEl = harmonyEl.getElementsByTagName("root")[0];
  if (!rootEl) return null;
  const rootStep = rootEl.getElementsByTagName("root-step")[0]?.textContent ?? "C";
  const rootAlter = parseFloat(rootEl.getElementsByTagName("root-alter")[0]?.textContent ?? "0") || 0;
  const rootName = accidentalName(rootStep, rootAlter);

  const kindEl = harmonyEl.getElementsByTagName("kind")[0];
  const kindText = kindEl?.getAttribute("text")?.trim();
  const kindValue = kindEl?.textContent?.trim() ?? "";
  const suffix = kindText || HARMONY_KIND_SUFFIX[kindValue] || (kindValue && kindValue !== "major" ? kindValue : "");

  const bassEl = harmonyEl.getElementsByTagName("bass")[0];
  let bassSuffix = "";
  if (bassEl) {
    const bassStep = bassEl.getElementsByTagName("bass-step")[0]?.textContent ?? "C";
    const bassAlter = parseFloat(bassEl.getElementsByTagName("bass-alter")[0]?.textContent ?? "0") || 0;
    bassSuffix = `/${accidentalName(bassStep, bassAlter)}`;
  }

  return `${rootName}${suffix}${bassSuffix}`;
}

interface PartParseResult {
  events: NormalizedNoteEvent[];
  keyChanges: NotatedKeyPoint[];
  harmonyMarks: NotatedChordPoint[];
  meterChanges: MeterPoint[];
  percussionOnsets: number[];
}

/**
 * Walks one <part> in document order, tracking a running time cursor in
 * seconds. <backup>/<forward> rewind/advance the cursor between voices
 * sharing a measure (e.g. the two voices of a single keyboard staff);
 * <chord/> notes attach to the onset of the immediately preceding note
 * instead of advancing the cursor. Key-signature changes and chord symbols
 * are collected on the same pass since they key off the same cursor.
 */
function parsePart(part: Element, tempoBpm: number, partLabel: string | undefined): PartParseResult {
  const events: NormalizedNoteEvent[] = [];
  const keyChanges: NotatedKeyPoint[] = [];
  const harmonyMarks: NotatedChordPoint[] = [];
  const meterChanges: MeterPoint[] = [];
  const percussionOnsets: number[] = [];
  const measures = Array.from(part.children).filter((el) => el.tagName === "measure");

  let divisions = 1; // ticks per quarter note; redefined by <attributes><divisions>
  let cursorSeconds = 0;
  let previousOnsetSeconds = 0; // onset a <chord/> note attaches to
  let currentLoudness = 1; // updated by <direction><dynamics>, applied to subsequent notes
  let timeSigNumerator = 4; // redefined by <attributes><time>; MusicXML default when unspecified
  let timeSigDenominator = 4;
  const openTies = new Map<number, NormalizedNoteEvent>(); // midiNote -> event awaiting <tie type="stop">

  const secondsPerTick = () => 60 / tempoBpm / divisions;

  for (const measure of measures) {
    const measureStartSeconds = cursorSeconds; // captured before this measure's <backup>/<forward> can move the cursor

    for (const child of Array.from(measure.children)) {
      if (child.tagName === "attributes") {
        const divisionsValue = childNumber(child, "divisions");
        if (Number.isFinite(divisionsValue) && divisionsValue > 0) divisions = divisionsValue;

        const keyEl = child.getElementsByTagName("key")[0];
        const fifths = keyEl ? childNumber(keyEl, "fifths") : NaN;
        if (keyEl && Number.isFinite(fifths)) {
          const modeText = keyEl.getElementsByTagName("mode")[0]?.textContent?.trim().toLowerCase();
          const mode: Mode = modeText === "minor" ? "minor" : "major";
          const majorTonic = (((7 * fifths) % 12) + 12) % 12;
          const tonic = mode === "minor" ? (majorTonic - 3 + 12) % 12 : majorTonic;
          keyChanges.push({ time: cursorSeconds, tonic, mode });
        }

        const timeEl = child.getElementsByTagName("time")[0];
        const beats = timeEl ? childNumber(timeEl, "beats") : NaN;
        const beatType = timeEl ? childNumber(timeEl, "beat-type") : NaN;
        if (Number.isFinite(beats) && beats > 0 && Number.isFinite(beatType) && beatType > 0) {
          timeSigNumerator = beats;
          timeSigDenominator = beatType;
        }
        continue;
      }

      if (child.tagName === "harmony") {
        const label = formatHarmony(child);
        if (label) harmonyMarks.push({ time: cursorSeconds, label });
        continue;
      }

      if (child.tagName === "direction") {
        const dynamicsEl = child.getElementsByTagName("dynamics")[0];
        const markName = dynamicsEl ? Array.from(dynamicsEl.children)[0]?.tagName : undefined;
        const level = markName ? DYNAMICS_LEVELS[markName] : undefined;
        if (level !== undefined) currentLoudness = level;
        continue;
      }

      if (child.tagName === "backup") {
        cursorSeconds -= childNumber(child, "duration") * secondsPerTick();
        continue;
      }

      if (child.tagName === "forward") {
        cursorSeconds += childNumber(child, "duration") * secondsPerTick();
        continue;
      }

      if (child.tagName !== "note") continue;

      const isGrace = child.getElementsByTagName("grace").length > 0;
      if (isGrace) continue; // no <duration> on the part timeline; skipped for MVP

      const isChord = child.getElementsByTagName("chord").length > 0;
      const durationTicks = childNumber(child, "duration");
      const durationSeconds = Number.isFinite(durationTicks) ? durationTicks * secondsPerTick() : 0;
      const onsetSeconds = isChord ? previousOnsetSeconds : cursorSeconds;

      const tieTypes = Array.from(child.getElementsByTagName("tie")).map((t) => t.getAttribute("type"));
      const tieStart = tieTypes.includes("start");
      const tieStop = tieTypes.includes("stop");

      const pitchEl = child.getElementsByTagName("pitch")[0];
      if (pitchEl) {
        const step = pitchEl.getElementsByTagName("step")[0]?.textContent ?? "C";
        const alter = childNumber(pitchEl, "alter");
        const octave = childNumber(pitchEl, "octave");
        const midiNote = (octave + 1) * 12 + (STEP_SEMITONES[step] ?? 0) + (Number.isFinite(alter) ? alter : 0);

        // A tied continuation extends the still-open event's duration
        // instead of creating a new one, so a note held across a barline
        // becomes a single NormalizedNoteEvent rather than two adjacent ones.
        const openTie = tieStop ? openTies.get(midiNote) : undefined;
        if (openTie) {
          openTie.durationSeconds += durationSeconds;
          if (tieStart) {
            openTies.set(midiNote, openTie);
          } else {
            openTies.delete(midiNote);
          }
        } else {
          const event: NormalizedNoteEvent = {
            time: onsetSeconds,
            durationSeconds,
            midiNote,
            pitchClass: midiToPitchClass(midiNote),
            confidence: currentLoudness,
            ...(partLabel ? { partLabel } : {}),
          };
          events.push(event);
          if (tieStart) openTies.set(midiNote, event);
        }
      } else if (child.getElementsByTagName("unpitched")[0]) {
        // Unpitched percussion (MusicXML's spec-correct way to notate drum
        // parts) has no meaningful pitch, only rhythm — kept as a bare
        // onset time rather than a NormalizedNoteEvent, so it can inform
        // beat/syncopation analysis without ever entering pitch-based
        // analysis (key, chords, counterpoint).
        percussionOnsets.push(onsetSeconds);
      }

      previousOnsetSeconds = onsetSeconds;
      if (!isChord) cursorSeconds += durationSeconds;
    }

    meterChanges.push({ time: measureStartSeconds, numerator: timeSigNumerator, denominator: timeSigDenominator });
  }

  return { events, keyChanges, harmonyMarks, meterChanges, percussionOnsets };
}
