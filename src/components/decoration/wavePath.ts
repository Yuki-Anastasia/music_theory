/**
 * Samples a sine curve into an SVG path string. Used by the decorative
 * waveform/notation motifs — pure math, no runtime data dependency, so the
 * result is static (computed once at module load), matching the
 * decoration system's "no animation" rule.
 */
export function sineWavePath(
  width: number,
  centerY: number,
  cycles: number,
  amplitudeAt: (fractionOfWidth: number) => number,
  phase = 0,
  samples = 100
): string {
  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const fraction = i / samples;
    const x = fraction * width;
    const t = fraction * cycles * Math.PI * 2 + phase;
    const y = centerY + Math.sin(t) * amplitudeAt(fraction);
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(" ");
}
