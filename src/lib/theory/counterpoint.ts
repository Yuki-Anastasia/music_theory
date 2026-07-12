import { NormalizedNoteEvent, highestActiveNoteAt } from "./normalizedEvents";

// Covers the most common pedagogically-relevant cases (SATB chorale, string
// quartet) while keeping the pairwise table and compute cost bounded. A
// 5th+ part (in document order) is dropped — a real scope choice, not
// silent: totalPartsFound on the result still reports the true count.
const MAX_PARTS = 4;
const MAX_PARALLEL_EVENTS_PER_PAIR = 20;

export type MotionType = "contrary" | "oblique" | "similar" | "parallel";

export interface ParallelMotionEvent {
  time: number;
  intervalClass: 0 | 7; // 0 = octave/unison, 7 = perfect fifth
}

export interface PartPairStats {
  partA: string;
  partB: string;
  verticalityCount: number;
  motionCounts: Record<MotionType, number>;
  motionPercentages: Record<MotionType, number>; // sums to ~100 when verticalityCount > 1
  parallelFifthsCount: number;
  parallelOctavesCount: number;
  /** Capped for display; parallelFifthsCount/parallelOctavesCount above always reflect the true, uncapped totals. */
  parallelMotionEvents: ParallelMotionEvent[];
}

export interface CounterpointAnalysis {
  pairs: PartPairStats[];
  partsAnalyzed: string[];
  totalPartsFound: number;
}

function intervalClassBetween(midiA: number, midiB: number): number {
  return Math.abs(midiA - midiB) % 12;
}

/**
 * The 4-way species-counterpoint bucket, using the EXACT interval (not
 * interval class): contrary = opposite directions; oblique = one voice
 * static (the both-static case is a degenerate instance folded in here,
 * since neither classical bucket fits it); parallel = same direction AND
 * same exact interval; similar = same direction, different interval.
 */
function classifyMotion(deltaA: number, deltaB: number, prevInterval: number, currInterval: number): MotionType {
  if (deltaA === 0 || deltaB === 0) return "oblique";
  if (Math.sign(deltaA) !== Math.sign(deltaB)) return "contrary";
  return prevInterval === currInterval ? "parallel" : "similar";
}

interface Verticality {
  time: number;
  noteA: number;
  noteB: number;
}

/**
 * Builds one "verticality" per combined onset time of the two parts,
 * reducing each (possibly polyphonic) part to its highest active note via
 * highestActiveNoteAt. Skips an onset instant when either part is resting
 * — simplest correct option; sustaining the last note through a rest
 * risked misrepresenting genuine silence as sustained motion.
 */
function buildVerticalities(eventsA: NormalizedNoteEvent[], eventsB: NormalizedNoteEvent[]): Verticality[] {
  const onsetTimes = Array.from(new Set([...eventsA.map((e) => e.time), ...eventsB.map((e) => e.time)])).sort(
    (a, b) => a - b
  );

  const verticalities: Verticality[] = [];
  for (const time of onsetTimes) {
    const a = highestActiveNoteAt(eventsA, time);
    const b = highestActiveNoteAt(eventsB, time);
    if (a === null || b === null) continue;
    verticalities.push({ time, noteA: a.midiNote, noteB: b.midiNote });
  }
  return verticalities;
}

function analyzePair(
  partA: string,
  eventsA: NormalizedNoteEvent[],
  partB: string,
  eventsB: NormalizedNoteEvent[]
): PartPairStats {
  const verticalities = buildVerticalities(eventsA, eventsB);

  const motionCounts: Record<MotionType, number> = { contrary: 0, oblique: 0, similar: 0, parallel: 0 };
  const motionPercentages: Record<MotionType, number> = { contrary: 0, oblique: 0, similar: 0, parallel: 0 };
  const parallelMotionEvents: ParallelMotionEvent[] = [];
  let parallelFifthsCount = 0;
  let parallelOctavesCount = 0;

  for (let i = 1; i < verticalities.length; i++) {
    const prev = verticalities[i - 1];
    const curr = verticalities[i];
    const deltaA = curr.noteA - prev.noteA;
    const deltaB = curr.noteB - prev.noteB;
    const prevInterval = Math.abs(prev.noteA - prev.noteB);
    const currInterval = Math.abs(curr.noteA - curr.noteB);

    motionCounts[classifyMotion(deltaA, deltaB, prevInterval, currInterval)]++;

    // Separate, broader pass for parallel 5ths/8ves using interval CLASS
    // (mod 12) rather than the strict-exact-interval "parallel" bucket
    // above, so it also catches "hidden" compound cases (a 5th moving to a
    // 12th, same direction) that Fux's prohibition actually targets.
    if (deltaA !== 0 && deltaB !== 0 && Math.sign(deltaA) === Math.sign(deltaB)) {
      const prevClass = intervalClassBetween(prev.noteA, prev.noteB);
      const currClass = intervalClassBetween(curr.noteA, curr.noteB);
      if (prevClass === currClass && (prevClass === 0 || prevClass === 7)) {
        if (prevClass === 7) parallelFifthsCount++;
        else parallelOctavesCount++;
        if (parallelMotionEvents.length < MAX_PARALLEL_EVENTS_PER_PAIR) {
          parallelMotionEvents.push({ time: curr.time, intervalClass: prevClass as 0 | 7 });
        }
      }
    }
  }

  const totalMotions = verticalities.length - 1;
  if (totalMotions > 0) {
    (Object.keys(motionCounts) as MotionType[]).forEach((type) => {
      motionPercentages[type] = (motionCounts[type] / totalMotions) * 100;
    });
  }

  return {
    partA,
    partB,
    verticalityCount: verticalities.length,
    motionCounts,
    motionPercentages,
    parallelFifthsCount,
    parallelOctavesCount,
    parallelMotionEvents,
  };
}

/**
 * Only meaningful for score-imported input with 2+ parts (partLabel is
 * only set by the MusicXML/Guitar Pro paths — audio-transcribed events
 * never set it, so this returns null there). partNames should be
 * ScoreAnalysis.partNames (document order), not re-derived from event
 * insertion order, so which parts get included under the MAX_PARTS cap is
 * deterministic and matches the score's own ordering.
 */
export function analyzeCounterpoint(events: NormalizedNoteEvent[], partNames: string[]): CounterpointAnalysis | null {
  const groups = new Map<string, NormalizedNoteEvent[]>();
  for (const event of events) {
    if (!event.partLabel) continue;
    const list = groups.get(event.partLabel);
    if (list) list.push(event);
    else groups.set(event.partLabel, [event]);
  }

  if (groups.size < 2) return null;

  const includedParts = partNames.filter((name) => groups.has(name)).slice(0, MAX_PARTS);

  const pairs: PartPairStats[] = [];
  for (let i = 0; i < includedParts.length; i++) {
    for (let j = i + 1; j < includedParts.length; j++) {
      const partA = includedParts[i];
      const partB = includedParts[j];
      pairs.push(analyzePair(partA, groups.get(partA)!, partB, groups.get(partB)!));
    }
  }

  return { pairs, partsAnalyzed: includedParts, totalPartsFound: groups.size };
}
