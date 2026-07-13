import type { Locale } from "../locale";

interface OverviewTabDict {
  pianoRoll: { label: string; heading: string; description: string };
  noteCount: (n: number) => string;
  seconds: (s: string) => string;
  partComposition: (parts: string) => string;
  partNote: (name: string, count: number) => string;
  partSeparator: string;
  voiceSeparation: { label: string; heading: string; description: string };
  melodyCount: (n: number) => string;
  bassCount: (n: number) => string;
  accompanimentCount: (n: number) => string;
  histogram: { label: string; heading: string; description: string };
}

export const overviewTabDict: Record<Locale, OverviewTabDict> = {
  ja: {
    pianoRoll: {
      label: "TRANSCRIPTION",
      heading: "ピアノロール",
      description: "検出された音符を時間とピッチで並べた、この解析の基礎データです。",
    },
    noteCount: (n) => `${n}音`,
    seconds: (s) => `${s}秒`,
    partComposition: (parts) => `パート構成: ${parts}`,
    partNote: (name, count) => `${name}(${count}音)`,
    partSeparator: "、",
    voiceSeparation: {
      label: "VOICE SEPARATION",
      heading: "抽出されたメロディーライン",
      description:
        "各瞬間で最も高い音をメロディー、最も低い音をベース、残りを伴奏として分類しています(skyline algorithm)。この分離結果を、和音進行の検出や予測可能性・自己相似性の計算に使っています。",
    },
    melodyCount: (n) => `メロディー ${n}音`,
    bassCount: (n) => `ベース ${n}音`,
    accompanimentCount: (n) => `伴奏 ${n}音`,
    histogram: {
      label: "PITCH-CLASS DISTRIBUTION",
      heading: "ピッチクラス・ヒストグラム",
      description: "曲全体で各ピッチクラスが鳴っていた時間の合計です。",
    },
  },
  en: {
    pianoRoll: {
      label: "TRANSCRIPTION",
      heading: "Piano Roll",
      description: "The detected notes laid out by time and pitch — the base data for this analysis.",
    },
    noteCount: (n) => `${n} notes`,
    seconds: (s) => `${s}s`,
    partComposition: (parts) => `Parts: ${parts}`,
    partNote: (name, count) => `${name} (${count} notes)`,
    partSeparator: ", ",
    voiceSeparation: {
      label: "VOICE SEPARATION",
      heading: "Extracted Melody Line",
      description:
        "At each instant, the highest note is classified as melody, the lowest as bass, and the rest as accompaniment (skyline algorithm). This split feeds chord-progression detection and the predictability/self-similarity calculations.",
    },
    melodyCount: (n) => `Melody: ${n} notes`,
    bassCount: (n) => `Bass: ${n} notes`,
    accompanimentCount: (n) => `Accompaniment: ${n} notes`,
    histogram: {
      label: "PITCH-CLASS DISTRIBUTION",
      heading: "Pitch-Class Histogram",
      description: "Total sounding time for each pitch class across the whole song.",
    },
  },
};
