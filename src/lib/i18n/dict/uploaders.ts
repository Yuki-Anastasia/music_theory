import type { Locale } from "../locale";

interface UploadersDict {
  song: {
    chooseFile: string;
    recordStop: (seconds: number) => string;
    recordStart: string;
    recordedLabel: string;
    micDenied: string;
  };
  score: {
    chooseFile: string;
    parsing: string;
    description: string;
  };
  partSelector: {
    label: string;
    heading: string;
    description: string;
    noneSelected: string;
  };
}

export const uploadersDict: Record<Locale, UploadersDict> = {
  ja: {
    song: {
      chooseFile: "ファイルを選択",
      recordStop: (s) => `● 録音停止 (${s}s)`,
      recordStart: "マイクで録音",
      recordedLabel: "録音",
      micDenied: "マイクの権限が拒否されました。ブラウザの設定を確認してください。",
    },
    score: {
      chooseFile: "楽譜/タブ譜ファイルを選択",
      parsing: "解析中…",
      description:
        ".musicxml/.xml/.mxl、またはGuitar Pro(.gp3/.gp4/.gp5/.gpx/.gp)に対応。" +
        "複数ファイル(例:ギター・ベース・ドラムを別々に書き出した場合)は1曲として結合し、" +
        "ズレがあれば読み込み後に警告します。",
    },
    partSelector: {
      label: "PART SELECTION",
      heading: "解析するパートを選択",
      description:
        "この楽譜には複数の楽器パートが含まれています。チェックを外すと、そのパートを解析対象から除外できます(既定では全パートを結合して解析します)。ピアノロール・和声・対位法・AIによる解説など、以降のすべての解析はここで選択したパートのみを対象に再計算されます。",
      noneSelected: "少なくとも1つのパートを選択してください。",
    },
  },
  en: {
    song: {
      chooseFile: "Choose a file",
      recordStop: (s) => `● Stop recording (${s}s)`,
      recordStart: "Record with mic",
      recordedLabel: "Recording",
      micDenied: "Microphone access was denied. Please check your browser settings.",
    },
    score: {
      chooseFile: "Choose score/tab files",
      parsing: "Parsing…",
      description:
        "Accepts .musicxml/.xml/.mxl or Guitar Pro (.gp3/.gp4/.gp5/.gpx/.gp). Multiple files (e.g. separate " +
        "guitar/bass/drums exports) are merged into one song; mismatches are flagged after import.",
    },
    partSelector: {
      label: "PART SELECTION",
      heading: "Choose parts to analyze",
      description:
        "This score contains multiple instrument parts. Unchecking a part excludes it from the analysis (by default all parts are combined). Every downstream analysis — piano roll, harmony, counterpoint, AI explanation — is recomputed using only the parts selected here.",
      noneSelected: "Please select at least one part.",
    },
  },
};
