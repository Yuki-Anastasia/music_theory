import type { Locale } from "../locale";

interface ChartsDict {
  waveform: { label: string };
  spectrogram: { label: (khz: number) => string; detecting: string; silent: string };
  pianoRoll: { empty: string };
  moodQuadrant: { pleasant: string; unpleasant: string; aroused: string; calm: string; caption: string };
  keyTimeline: { empty: string; label: string; lowConfidence: string };
  fourierTimeline: {
    empty: string;
    label: string;
    coefficients: Record<number, string>;
  };
  tonnetzView: { empty: string; label: string; lowConfidence: string; lowConfidenceMark: string; start: string; end: string };
}

export const chartsDict: Record<Locale, ChartsDict> = {
  ja: {
    waveform: { label: "波形(オシロスコープ)" },
    spectrogram: {
      label: (khz) => `スペクトログラム(0–${khz}kHz、左→右に時間経過)`,
      detecting: "● 音を検出中",
      silent: "○ 無音",
    },
    pianoRoll: { empty: "検出された音符がありません。" },
    moodQuadrant: {
      pleasant: "快",
      unpleasant: "不快",
      aroused: "覚醒",
      calm: "沈静",
      caption: "Russellの感情円環モデルに基づく仮説的な推定",
    },
    keyTimeline: {
      empty: "キーを推定できるだけの音符がありません。",
      label: "キーの推移(五度圏順、●=長調 / ○=短調、薄い点=確信度低)",
      lowConfidence: "(確信度低)",
    },
    fourierTimeline: {
      empty: "解析できるだけの音符がありません。",
      label: "|X₅| ダイアトニック度の推移(1=五度圏上に強く集中、0=分散)",
      coefficients: {
        1: "半音階的な偏り",
        3: "増三和音的",
        4: "オクタトニック的",
        5: "ダイアトニック的(五度圏)",
        6: "全音音階的",
      },
    },
    tonnetzView: {
      empty: "和音を推定できるだけの音符がありません。",
      label: "Tonnetz軌跡(薄い点=確信度低、色が濃いほど後の時刻)",
      lowConfidence: "(確信度低)",
      lowConfidenceMark: "?(確信度低)",
      start: "開始",
      end: "終了",
    },
  },
  en: {
    waveform: { label: "Waveform (oscilloscope)" },
    spectrogram: {
      label: (khz) => `Spectrogram (0–${khz}kHz, time flows left→right)`,
      detecting: "● Signal detected",
      silent: "○ Silent",
    },
    pianoRoll: { empty: "No notes detected." },
    moodQuadrant: {
      pleasant: "Pleasant",
      unpleasant: "Unpleasant",
      aroused: "Aroused",
      calm: "Calm",
      caption: "A hypothesis-generating estimate based on Russell's circumplex model of affect",
    },
    keyTimeline: {
      empty: "Not enough notes to estimate a key.",
      label: "Key over time (circle-of-fifths order, ●=major / ○=minor, faint dot=low confidence)",
      lowConfidence: "(low confidence)",
    },
    fourierTimeline: {
      empty: "Not enough notes to analyze.",
      label: "|X₅| diatonicity over time (1=strongly clustered on the circle of fifths, 0=dispersed)",
      coefficients: {
        1: "chromatic bias",
        3: "augmented-triad-like",
        4: "octatonic-like",
        5: "diatonic (circle of fifths)",
        6: "whole-tone-like",
      },
    },
    tonnetzView: {
      empty: "Not enough notes to estimate chords.",
      label: "Tonnetz trajectory (faint dot=low confidence, darker=later in time)",
      lowConfidence: "(low confidence)",
      lowConfidenceMark: "?(low confidence)",
      start: "Start",
      end: "End",
    },
  },
};
