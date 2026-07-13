import type { KeyTimelinePoint } from "./keyTimeline";
import { collapseKeySegments, keyLabel } from "./keyProfile";
import type { Mode } from "./keyProfile";

export type KeyRelationship = "relativeMajorMinor" | "parallelMajorMinor" | "dominant" | "subdominant" | "other";

export interface ModulationEvent {
  time: number; // pivot point = the new segment's start
  fromTonic: number;
  fromMode: Mode;
  toTonic: number;
  toMode: Mode;
  relationship: KeyRelationship;
  lowConfidence: boolean;
}

/** Upward semitone distance from a to b, wrapped into [0, 11]. */
export function semitonesUp(a: number, b: number): number {
  return ((b - a) % 12 + 12) % 12;
}

/**
 * Classifies a from -> to key change by tonic distance + mode change:
 * - same tonic, mode flips              -> parallel (同主調)
 * - mode flips, minor tonic is 3 semi-  -> relative (平行調 — e.g. C major's
 *   tones below the major tonic            relative minor is A minor)
 * - same mode, +7 semitones up          -> dominant (属調)
 * - same mode, +5 semitones up          -> subdominant (下属調)
 * - anything else                       -> other
 */
export function classifyKeyRelationship(
  from: { tonic: number; mode: Mode },
  to: { tonic: number; mode: Mode }
): KeyRelationship {
  if (from.tonic === to.tonic) {
    return from.mode !== to.mode ? "parallelMajorMinor" : "other";
  }
  if (from.mode !== to.mode) {
    const minorTonic = from.mode === "minor" ? from.tonic : to.tonic;
    const majorTonic = from.mode === "major" ? from.tonic : to.tonic;
    return semitonesUp(minorTonic, majorTonic) === 3 ? "relativeMajorMinor" : "other";
  }
  const distance = semitonesUp(from.tonic, to.tonic);
  if (distance === 7) return "dominant";
  if (distance === 5) return "subdominant";
  return "other";
}

/** Diffs adjacent collapsed key segments (see keyProfile.ts's collapseKeySegments) into discrete pivot points, rather than re-deriving segment boundaries. */
export function detectModulations(keyTimeline: KeyTimelinePoint[], durationSec: number): ModulationEvent[] {
  const segments = collapseKeySegments(keyTimeline, durationSec, (p) => p.key, (p) => p.key.confidence === "low");
  const events: ModulationEvent[] = [];
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    events.push({
      time: curr.start,
      fromTonic: prev.tonic,
      fromMode: prev.mode,
      toTonic: curr.tonic,
      toMode: curr.mode,
      relationship: classifyKeyRelationship(prev, curr),
      lowConfidence: prev.flagged || curr.flagged,
    });
  }
  return events;
}

export function modulationLabel(event: ModulationEvent): string {
  return `${keyLabel({ tonic: event.fromTonic, mode: event.fromMode })} → ${keyLabel({ tonic: event.toTonic, mode: event.toMode })}`;
}
