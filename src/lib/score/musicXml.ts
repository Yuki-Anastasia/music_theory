"use client";

import { unzipSync, strFromU8 } from "fflate";
import { midiToPitchClass } from "../audio/pitch";
import type { NormalizedNoteEvent } from "../theory/normalizedEvents";

const DEFAULT_TEMPO_BPM = 120;

const STEP_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/**
 * Entry point: reads a .musicxml/.xml (plain-text) or .mxl (zip-compressed)
 * file exported from notation software and returns the same
 * NormalizedNoteEvent[] shape the audio pipeline produces (see
 * normalizedEvents.ts), so it feeds the existing theory modules —
 * keyTimeline, fourierTimeline, tonnetzTimeline, aestheticMetrics,
 * PianoRollViewer — unchanged. Ground-truth score data sidesteps Basic
 * Pitch's polyphonic pitch-estimation ambiguity entirely.
 */
export async function parseScoreFile(file: File): Promise<NormalizedNoteEvent[]> {
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
 * Parses a score-partwise MusicXML document into NormalizedNoteEvent[].
 * score-timewise (the format's legacy alternative root element) is not
 * supported.
 *
 * Tempo is read once from the first <sound tempo="..."> in the document
 * and applied uniformly throughout (default 120bpm) — mid-piece tempo
 * changes are not modeled. This only stretches/compresses the time axis;
 * the pitch content and note ordering that the theory modules consume are
 * unaffected.
 *
 * Ties are not merged: a tied note becomes two adjacent NormalizedNoteEvents
 * rather than one. Pitch-class-histogram totals (duration-weighted) are
 * unaffected, but note-to-note transition metrics may see a spurious
 * repeated-pitch step at the tie point.
 */
export function parseMusicXmlString(xml: string): NormalizedNoteEvent[] {
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

  const tempoBpm = findTempoBpm(doc);
  const parts = Array.from(doc.documentElement.children).filter((el) => el.tagName === "part");

  const events: NormalizedNoteEvent[] = [];
  for (const part of parts) {
    events.push(...parsePart(part, tempoBpm));
  }
  events.sort((a, b) => a.time - b.time);
  return events;
}

function findTempoBpm(doc: Document): number {
  const soundEl = Array.from(doc.getElementsByTagName("sound")).find((el) => el.hasAttribute("tempo"));
  const tempo = soundEl ? parseFloat(soundEl.getAttribute("tempo") ?? "") : NaN;
  return Number.isFinite(tempo) && tempo > 0 ? tempo : DEFAULT_TEMPO_BPM;
}

function childNumber(el: Element, tagName: string): number {
  return parseFloat(el.getElementsByTagName(tagName)[0]?.textContent ?? "");
}

/**
 * Walks one <part> in document order, tracking a running time cursor in
 * seconds. <backup>/<forward> rewind/advance the cursor between voices
 * sharing a measure (e.g. the two voices of a single keyboard staff);
 * <chord/> notes attach to the onset of the immediately preceding note
 * instead of advancing the cursor.
 */
function parsePart(part: Element, tempoBpm: number): NormalizedNoteEvent[] {
  const events: NormalizedNoteEvent[] = [];
  const measures = Array.from(part.children).filter((el) => el.tagName === "measure");

  let divisions = 1; // ticks per quarter note; redefined by <attributes><divisions>
  let cursorSeconds = 0;
  let previousOnsetSeconds = 0; // onset a <chord/> note attaches to

  const secondsPerTick = () => 60 / tempoBpm / divisions;

  for (const measure of measures) {
    for (const child of Array.from(measure.children)) {
      if (child.tagName === "attributes") {
        const value = childNumber(child, "divisions");
        if (Number.isFinite(value) && value > 0) divisions = value;
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

      const pitchEl = child.getElementsByTagName("pitch")[0];
      if (pitchEl) {
        const step = pitchEl.getElementsByTagName("step")[0]?.textContent ?? "C";
        const alter = childNumber(pitchEl, "alter");
        const octave = childNumber(pitchEl, "octave");
        const midiNote = (octave + 1) * 12 + (STEP_SEMITONES[step] ?? 0) + (Number.isFinite(alter) ? alter : 0);
        events.push({
          time: onsetSeconds,
          durationSeconds,
          midiNote,
          pitchClass: midiToPitchClass(midiNote),
          confidence: 1,
        });
      }

      previousOnsetSeconds = onsetSeconds;
      if (!isChord) cursorSeconds += durationSeconds;
    }
  }

  return events;
}
