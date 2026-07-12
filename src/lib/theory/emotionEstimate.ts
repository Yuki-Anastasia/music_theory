import type { KeyTimelinePoint } from "./keyTimeline";
import type { DynamicsSummary } from "./dynamicsAnalysis";
import type { HarmonicTensionEstimate, SelfSimilarityEstimate } from "./aestheticMetrics";

/**
 * Russell's circumplex model of affect (1980): perceived emotion mapped to
 * two axes, valence (pleasant<->unpleasant) and arousal (energetic<->calm).
 * The estimates below are a simple heuristic combination of already-computed
 * musical features, not a calibrated or validated emotion-recognition
 * model — a hypothesis-generating view, consistent with the project's
 * "don't assert" ethos applied elsewhere (key/chord confidence flags,
 * aesthetic metrics framing).
 */

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Voice-leading distance (semitones) is treated as neutral around 3 —
 * roughly a single common-tone-preserving parsimonious move — with the
 * scale set so a very distant transition (~8 semitones) saturates at ±1.
 */
function tensionSignal(harmonicTension: HarmonicTensionEstimate): number {
  return clamp(-1, 1, (harmonicTension.averageVoiceLeadingDistance - 3) / 5);
}

/**
 * Valence (-1..1) from the duration-weighted major/minor balance of the key
 * timeline (major -> positive, minor -> negative), the consonance score
 * (1/averageGradus from aestheticMetrics.ts; typical real-music values run
 * ~0.1-0.25, mapped here to -1..1), and harmonic tension (parsimonious
 * voice-leading distance between consecutive chords — more distant/abrupt
 * transitions read as less pleasant).
 */
export function estimateValence(
  keyTimeline: KeyTimelinePoint[],
  consonanceScore: number,
  harmonicTension: HarmonicTensionEstimate
): number {
  if (keyTimeline.length === 0) return 0;

  let majorWeight = 0;
  let totalWeight = 0;
  for (let i = 0; i < keyTimeline.length; i++) {
    const next = keyTimeline[i + 1];
    const duration = next ? next.time - keyTimeline[i].time : 1;
    totalWeight += duration;
    if (keyTimeline[i].key.mode === "major") majorWeight += duration;
  }
  const modeValence = totalWeight === 0 ? 0 : (majorWeight / totalWeight) * 2 - 1;
  const consonanceValence = clamp(-1, 1, (consonanceScore - 0.15) / 0.1);
  const tensionValence = -tensionSignal(harmonicTension);

  return clamp(-1, 1, modeValence * 0.5 + consonanceValence * 0.3 + tensionValence * 0.2);
}

/**
 * Arousal (-1..1) from tempo (bpm, centered on 90), average loudness (0-1),
 * rhythmic entropy in bits, harmonic tension (distant chord-to-chord voice
 * leading reads as more activated), and melodic unpredictability (low
 * self-similarity/autocorrelation — per Huron's expectation theory, less
 * predictable melodic contour reads as more aroused).
 */
export function estimateArousal(
  bpm: number,
  dynamics: DynamicsSummary,
  rhythmEntropyBits: number,
  harmonicTension: HarmonicTensionEstimate,
  selfSimilarity: SelfSimilarityEstimate
): number {
  const tempoArousal = clamp(-1, 1, (bpm - 90) / 60);
  const loudnessArousal = clamp(-1, 1, dynamics.averageLoudness * 2 - 1);
  const rhythmArousal = clamp(-1, 1, (rhythmEntropyBits - 1.5) / 1.5);
  const tensionArousal = tensionSignal(harmonicTension);
  const unpredictabilityArousal = clamp(-1, 1, (0.5 - selfSimilarity.correlation) / 0.5);
  return clamp(
    -1,
    1,
    tempoArousal * 0.3 + loudnessArousal * 0.25 + rhythmArousal * 0.2 + tensionArousal * 0.15 + unpredictabilityArousal * 0.1
  );
}

/** Maps a (valence, arousal) point to Russell's 4 quadrant descriptions. */
export function describeMoodQuadrant(valence: number, arousal: number): string {
  if (valence >= 0 && arousal >= 0) return "高揚・喜び(高覚醒×快)";
  if (valence < 0 && arousal >= 0) return "緊張・不安(高覚醒×不快)";
  if (valence < 0 && arousal < 0) return "悲しみ・沈鬱(低覚醒×不快)";
  return "穏やか・安らぎ(低覚醒×快)";
}
