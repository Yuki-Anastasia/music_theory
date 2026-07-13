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
      chooseFile: "楽譜/タブ譜ファイルを選択(複数可)",
      parsing: "解析中…",
      description:
        "Finale/Sibelius/Dorico/MuseScoreなどからエクスポートした.musicxml/.xml/.mxlファイル、または" +
        "Guitar Proのタブ譜ファイル(.gp3/.gp4/.gp5/.gpx/.gp)を読み込みます。" +
        "音声を経由せず、記譜データそのものを解析するため、和音のピッチ推定に音声解析特有の誤りが生じません。" +
        "複数ファイルを同時に選択すると(例:ギター・ベース・ドラムをそれぞれ別ファイルでエクスポートした場合)、" +
        "1つの曲として結合して解析します。ファイル間で長さ・テンポ・調・拍子が大きく異なる場合は警告を表示します。",
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
      chooseFile: "Choose score/tab files (multiple OK)",
      parsing: "Parsing…",
      description:
        "Loads a .musicxml/.xml/.mxl file exported from Finale/Sibelius/Dorico/MuseScore, or a Guitar Pro tab " +
        "file (.gp3/.gp4/.gp5/.gpx/.gp). Since it reads notated data directly rather than going through audio, " +
        "it avoids the pitch-estimation errors specific to audio transcription. Selecting multiple files at once " +
        "(e.g. Guitar/Bass/Drums each exported separately) merges them into one combined song. A warning is shown " +
        "if duration, tempo, key, or meter differ significantly between files.",
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
