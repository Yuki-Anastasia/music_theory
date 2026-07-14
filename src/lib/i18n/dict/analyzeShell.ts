import type { Locale } from "../locale";

type TabId = "overview" | "tonality" | "harmony" | "expression" | "ai";

interface AnalyzeShellDict {
  tabs: Record<TabId, string>;
  intro: { heading: string; description: string };
  source: { label: string; heading: string };
  audio: { label: string; heading: string; description: string };
  score: { label: string; heading: string; description: string };
  analyzing: (label: string | null) => string;
  elapsed: (seconds: string) => string;
  overTarget: string;
  analysisFailed: (message: string) => string;
  warnings: { heading: string; note: string };
  summaryFailedFallback: string;
}

export const analyzeShellDict: Record<Locale, AnalyzeShellDict> = {
  ja: {
    tabs: { overview: "概要", tonality: "調性", harmony: "和声", expression: "リズム・表現", ai: "AI解説" },
    intro: {
      heading: "曲を解析する",
      description:
        "音声ファイルのアップロード・マイク録音、または楽譜データのインポートから曲を解析し、調性・和声・リズムなどのタイムラインを表示します。1〜6分の曲で目安30秒以内に処理しますが、環境によってはそれ以上かかる場合があります。",
    },
    source: {
      label: "ANALYSIS SOURCE",
      heading: "解析方法を選択",
    },
    audio: {
      label: "AUDIO",
      heading: "音声から解析",
      description:
        "ファイルをアップロードするか、マイクで録音してください。Basic Pitch(ブラウザ内AI、和音・複数声部対応)でピッチ・リズム・強弱などを推定します。",
    },
    score: {
      label: "SCORE",
      heading: "楽譜から解析",
      description:
        "MusicXMLやGuitar Proの楽譜データを直接読み込みます。記譜・パート・調・コードネームを音声解析を介さずそのまま解析します。",
    },
    analyzing: (label) => `解析中: ${label}`,
    elapsed: (s) => `${s}s経過`,
    overTarget: "(目安の30秒を超えています)",
    analysisFailed: (message) => `解析に失敗しました: ${message}`,
    warnings: {
      heading: "複数ファイルの整合性に関する注意",
      note:
        "これは自動判定の目安であり、正当な理由(演奏に伴う揺れ、移調楽器の記譜など)で差が出ている場合もあります。" +
        "解析結果はそのまま表示していますが、パート間の比較(対位法チェックなど)は同じタイムラインである前提に基づく点にご注意ください。",
    },
    summaryFailedFallback: "AI解説の生成に失敗しました",
  },
  en: {
    tabs: { overview: "Overview", tonality: "Tonality", harmony: "Harmony", expression: "Rhythm & Expression", ai: "AI Explanation" },
    intro: {
      heading: "Analyze a Song",
      description:
        "Analyze a song from an uploaded audio file, a mic recording, or imported score data, and see a timeline of its tonality, harmony, and rhythm. Songs 1–6 minutes long usually process within about 30 seconds, though it can take longer depending on your environment.",
    },
    source: {
      label: "ANALYSIS SOURCE",
      heading: "Choose an Analysis Source",
    },
    audio: {
      label: "AUDIO",
      heading: "From Audio",
      description:
        "Upload a file, or record from your mic. Basic Pitch (an in-browser model supporting chords and multiple voices) estimates pitch, rhythm, and dynamics.",
    },
    score: {
      label: "SCORE",
      heading: "From Score",
      description:
        "Import MusicXML or Guitar Pro data directly. Notation, parts, keys, and chord symbols are analyzed as written, without going through audio.",
    },
    analyzing: (label) => `Analyzing: ${label}`,
    elapsed: (s) => `${s}s elapsed`,
    overTarget: "(over the ~30s target)",
    analysisFailed: (message) => `Analysis failed: ${message}`,
    warnings: {
      heading: "Note on consistency across multiple files",
      note:
        "This is only an automatic heuristic — a difference can have a legitimate cause (performance timing variation, a transposing instrument's notation, etc.). " +
        "The analysis results below are shown as-is, but keep in mind that cross-part comparisons (like the counterpoint check) assume all parts share the same timeline.",
    },
    summaryFailedFallback: "Failed to generate the AI explanation",
  },
};
