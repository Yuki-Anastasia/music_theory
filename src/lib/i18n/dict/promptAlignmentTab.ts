import type { Locale } from "../locale";
import type { Category } from "@/lib/prompt/ontology";

interface PromptAlignmentTabDict {
  label: string;
  heading: string;
  description: string;
  placeholder: string;
  analyze: string;
  analyzing: string;
  emptyHint: string;
  overall: {
    heading: string;
    noScoreable: string;
    scoreLabel: (percent: number) => string;
  };
  caveat: string;
  category: Record<Category, string>;
  status: { scored: string; insufficientEvidence: string };
  score: (percent: number) => string;
  coverage: (percent: number) => string;
  support: string;
  missing: string;
  mismatches: string;
  contradictions: string;
}

export const promptAlignmentTabDict: Record<Locale, PromptAlignmentTabDict> = {
  ja: {
    label: "PROMPT ALIGNMENT",
    heading: "生成プロンプトとの整合性",
    description:
      "AI音楽生成(Suno/Udioなど)に使ったプロンプト文を入力すると、そのプロンプトが示す音楽的な概念と、実際の解析結果がどれだけ一致しているかを、根拠・信頼度つきで確認できます。",
    placeholder: "例:「疾走感のあるエネルギッシュな曲、サビでオーケストラが盛り上がる」",
    analyze: "整合性を解析",
    analyzing: "解析中…",
    emptyHint: "プロンプト文を入力して解析すると、ここに概念ごとの一致度が表示されます。",
    overall: {
      heading: "全体的な整合性",
      noScoreable: "十分な根拠がある概念がなく、全体スコアは算出できませんでした。",
      scoreLabel: (percent) => `全体一致度 ${percent}%`,
    },
    caveat: "これはMVP段階の推定値であり、科学的に検証されたプロンプト忠実度の判定ではありません。証拠不十分な概念は上記の数値から除外されています。",
    category: {
      tempo: "テンポ",
      energy: "勢い",
      mood: "雰囲気",
      instrumentation: "楽器編成",
      texture: "質感",
      harmony: "和声",
      rhythm: "リズム",
      dynamics: "強弱",
      genre: "ジャンル",
      form: "構成",
    },
    status: { scored: "評価済み", insufficientEvidence: "証拠不十分" },
    score: (percent) => `一致度 ${percent}%`,
    coverage: (percent) => `根拠の網羅率 ${percent}%`,
    support: "根拠",
    missing: "不足している根拠",
    mismatches: "改善のヒント(測定値との差分)",
    contradictions: "矛盾",
  },
  en: {
    label: "PROMPT ALIGNMENT",
    heading: "Alignment with the Generation Prompt",
    description:
      "Enter the prompt used with an AI music generator (Suno/Udio, etc.) to see how well its musical concepts match this song's actual analysis — with evidence and confidence attached to every score.",
    placeholder: 'e.g. "an energetic, driving track that builds to an orchestral climax in the chorus"',
    analyze: "Analyze alignment",
    analyzing: "Analyzing…",
    emptyHint: "Enter a prompt and analyze it to see a per-concept alignment breakdown here.",
    overall: {
      heading: "Overall Alignment",
      noScoreable: "No concept had enough evidence to be scored, so no overall figure could be computed.",
      scoreLabel: (percent) => `Overall alignment ${percent}%`,
    },
    caveat:
      "This is an MVP-stage estimate, not a scientifically verified judgment of prompt fidelity. Concepts with insufficient evidence are excluded from the figure above.",
    category: {
      tempo: "Tempo",
      energy: "Energy",
      mood: "Mood",
      instrumentation: "Instrumentation",
      texture: "Texture",
      harmony: "Harmony",
      rhythm: "Rhythm",
      dynamics: "Dynamics",
      genre: "Genre",
      form: "Form",
    },
    status: { scored: "Scored", insufficientEvidence: "Insufficient evidence" },
    score: (percent) => `Score ${percent}%`,
    coverage: (percent) => `Evidence coverage ${percent}%`,
    support: "Support",
    missing: "Missing evidence",
    mismatches: "Improvement hints (gap vs. measured value)",
    contradictions: "Contradictions",
  },
};
