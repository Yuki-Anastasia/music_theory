export interface FourierCoefficient {
  k: number;
  magnitude: number;
  /** magnitude / total energy (X_0), so it's comparable 0-1 regardless of how loud/dense the window is. */
  normalizedMagnitude: number;
  phase: number;
}

/**
 * Discrete Fourier transform of a 12-dimensional pitch-class distribution
 * (technical spec A-4). Only k=0..6 carry musical meaning:
 * |X_5| = "how diatonic" (fifths/circle-of-fifths clustering, large for
 * major/minor scales), |X_6| = whole-tone-ness, |X_4| = octatonic-ness,
 * |X_3| = augmented/major-third-cycle-ness, |X_1| = chromatic clustering.
 */
export function pitchClassDFT(histogram: number[]): FourierCoefficient[] {
  const total = histogram.reduce((sum, v) => sum + v, 0);

  const coefficients: FourierCoefficient[] = [];
  for (let k = 0; k <= 6; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < 12; n++) {
      const angle = (-2 * Math.PI * k * n) / 12;
      re += histogram[n] * Math.cos(angle);
      im += histogram[n] * Math.sin(angle);
    }
    const magnitude = Math.hypot(re, im);
    coefficients.push({
      k,
      magnitude,
      normalizedMagnitude: total === 0 ? 0 : magnitude / total,
      phase: Math.atan2(im, re),
    });
  }
  return coefficients;
}

/** Convenience accessor: |X_5| normalized, the "diatonicity" headline metric. */
export function diatonicity(histogram: number[]): number {
  return pitchClassDFT(histogram)[5].normalizedMagnitude;
}
