import { NormalizedNoteEvent } from "./normalizedEvents";

const FRAME_SEC = 0.1;

export interface VoiceSeparation {
  melody: NormalizedNoteEvent[];
  bass: NormalizedNoteEvent[];
  accompaniment: NormalizedNoteEvent[];
}

/**
 * Classifies each note by the role it plays in the texture, using the
 * "skyline" heuristic standard in symbolic melody extraction (Uitdenbogerd
 * & Zobel, 1998): at each short time frame, the highest-sounding note reads
 * as melody, the lowest as the bass line, and the rest as accompaniment. A
 * note is a single unit of one role — whichever it played in the plurality
 * of the frames it was active in — not fragmented per-frame. When only one
 * note sounds in a frame, it counts as melody (a solo line is heard as the
 * tune, not the bass).
 */
export function separateVoices(events: NormalizedNoteEvent[]): VoiceSeparation {
  if (events.length === 0) return { melody: [], bass: [], accompaniment: [] };

  const maxTime = Math.max(...events.map((e) => e.time + e.durationSeconds));
  const numFrames = Math.max(1, Math.ceil(maxTime / FRAME_SEC));

  const melodyVotes = new Array(events.length).fill(0);
  const bassVotes = new Array(events.length).fill(0);
  const totalVotes = new Array(events.length).fill(0);

  for (let f = 0; f < numFrames; f++) {
    const t = (f + 0.5) * FRAME_SEC;
    let highestIdx = -1;
    let lowestIdx = -1;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.time <= t && t < e.time + e.durationSeconds) {
        totalVotes[i]++;
        if (highestIdx === -1 || e.midiNote > events[highestIdx].midiNote) highestIdx = i;
        if (lowestIdx === -1 || e.midiNote < events[lowestIdx].midiNote) lowestIdx = i;
      }
    }
    if (highestIdx !== -1) melodyVotes[highestIdx]++;
    if (lowestIdx !== -1 && lowestIdx !== highestIdx) bassVotes[lowestIdx]++;
  }

  const melody: NormalizedNoteEvent[] = [];
  const bass: NormalizedNoteEvent[] = [];
  const accompaniment: NormalizedNoteEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const accompanimentVotes = totalVotes[i] - melodyVotes[i] - bassVotes[i];
    if (totalVotes[i] === 0) {
      accompaniment.push(events[i]); // never sampled (shorter than a frame) — don't overclaim a role
    } else if (melodyVotes[i] >= bassVotes[i] && melodyVotes[i] >= accompanimentVotes) {
      melody.push(events[i]);
    } else if (bassVotes[i] >= accompanimentVotes) {
      bass.push(events[i]);
    } else {
      accompaniment.push(events[i]);
    }
  }

  return { melody, bass, accompaniment };
}
