import type { Locale } from "../locale";

type TabId = "overview" | "tonality" | "harmony" | "expression" | "ai";

interface AnalyzeShellDict {
  tabs: Record<TabId, string>;
  intro: { heading: string; description: string };
  orScoreDivider: string;
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
        "曲ファイルをアップロードするか、マイクで録音してください。Basic Pitch(ブラウザ内、和音・複数声部対応)で解析し、音符のタイムラインを表示します。1〜6分の曲で目安30秒以内に処理しますが、環境によってはそれ以上かかる場合があります。",
    },
    orScoreDivider: "または、楽譜データから精密に解析",
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
        "Upload a song file, or record from your mic. It's analyzed with Basic Pitch (an in-browser model supporting chords and multiple voices) and shown as a note timeline. Songs 1–6 minutes long usually process within about 30 seconds, though it can take longer depending on your environment.",
    },
    orScoreDivider: "Or, for precise analysis, use score data",
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
