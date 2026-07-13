import type { Locale } from "../locale";

interface TonalityTabDict {
  keyTimeline: { label: string; heading: string; description: string };
  notatedKey: (text: string) => string;
  fourierTimeline: { label: string; heading: string; description: string };
}

export const tonalityTabDict: Record<Locale, TonalityTabDict> = {
  ja: {
    keyTimeline: {
      label: "TONAL STRUCTURE",
      heading: "キーの推移",
      description:
        "Krumhansl-Schmucklerアルゴリズムにより、一定時間ごとのピッチクラス分布と24調(12長調+12短調)の相関を計算し、最も近い調を推定します。",
    },
    notatedKey: (text) => `記譜された調(推定ではなく楽譜に指定された値): ${text}`,
    fourierTimeline: {
      label: "HARMONIC SPECTRUM",
      heading: "フーリエ解析の推移",
      description: "ピッチクラス集合を12点の離散フーリエ変換にかけ、|X₅|(五度圏上の集中度=ダイアトニック度)を中心に、調性的な特徴の推移を示します。",
    },
  },
  en: {
    keyTimeline: {
      label: "TONAL STRUCTURE",
      heading: "Key Over Time",
      description:
        "The Krumhansl-Schmuckler algorithm correlates the pitch-class distribution in each time window against all 24 keys (12 major + 12 minor) and estimates the closest match.",
    },
    notatedKey: (text) => `Notated key (as specified in the score, not estimated): ${text}`,
    fourierTimeline: {
      label: "HARMONIC SPECTRUM",
      heading: "Fourier Analysis Over Time",
      description:
        "The pitch-class set run through a 12-point discrete Fourier transform, centered on |X₅| (concentration on the circle of fifths = diatonicity) as a measure of tonal character over time.",
    },
  },
};
