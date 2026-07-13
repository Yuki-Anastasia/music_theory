import type { Locale } from "../locale";
import type { MotionType } from "@/lib/theory/counterpoint";

interface HarmonyTabDict {
  tonnetz: { label: string; heading: string; description: string };
  notatedChord: (text: string) => string;
  metrics: {
    label: string;
    heading: string;
    description: string;
    consonance: { title: string; theory: string; value: (avg: string) => string; note: string };
    tension: { title: string; theory: string; value: (avg: string, max: string) => string; note: string };
    predictability: { title: string; theory: string; value: (bits: string, max: string) => string; note: string };
    selfSimilarity: { title: string; theory: string; value: (lag: number, corr: string) => string; note: string };
  };
  counterpoint: {
    label: string;
    heading: string;
    description: (extra: string) => string;
    descriptionExtra: (found: number, analyzed: number) => string;
    partColumn: string;
    parallelColumn: string;
    motion: Record<MotionType, string>;
  };
  generative: {
    label: string;
    heading: string;
    description: string;
    generate: string;
    originalColumn: string;
    generatedColumn: string;
    consonanceRow: string;
    predictabilityRow: string;
  };
}

export const harmonyTabDict: Record<Locale, HarmonyTabDict> = {
  ja: {
    tonnetz: {
      label: "HARMONIC GEOMETRY",
      heading: "Tonnetz軌跡",
      description: "Eulerの音格子(Tonnetz)上で、検出された和音の進行を軌跡として描きます。隣接する三角形は共通音を1〜2音共有する、声部移動の小さい和音同士です。",
    },
    notatedChord: (text) => `記譜されたコード進行(楽譜のコードネーム表記): ${text}`,
    metrics: {
      label: "STRUCTURAL METRICS",
      heading: "美しさと相関しうる数理的特徴",
      description: "これらは「美しさの証明」ではありません。音楽理論・情報理論上の名前のついた指標との、数学的な相関を示す仮説的な視点です。",
      consonance: {
        title: "協和度",
        theory: "オイラーの快さの尺度 (Gradus Suavitatis, 1739)",
        value: (avg) => `平均 Γ = ${avg}`,
        note: "値が小さいほど協和的(完全五度Γ=4、短二度Γ=11)",
      },
      tension: {
        title: "和声的テンション",
        theory: "声部進行の最小移動距離 (Neo-Riemannian理論)",
        value: (avg, max) => `平均 ${avg}半音 / 最大 ${max}半音`,
        note: "値が大きいほど、遠い和音への跳躍",
      },
      predictability: {
        title: "予測可能性",
        theory: "シャノンの条件付きエントロピー (情報理論, 1948)",
        value: (bits, max) => `${bits} bit (最大 ${max} bit)`,
        note: "値が小さいほど、次の音が予測しやすい",
      },
      selfSimilarity: {
        title: "旋律の自己相似性",
        theory: "自己相関によるモチーフ検出",
        value: (lag, corr) => `ラグ${lag}音で相関 ${corr}`,
        note: "1に近いほど、その間隔で旋律が反復",
      },
    },
    counterpoint: {
      label: "VOICE LEADING",
      heading: "複声部の対位法チェック",
      description: (extra) =>
        `各パートを瞬間ごとに最高音1音へ単純化(単声化)し、パートの組ごとに声部間の運動(反行/斜行/並行/平行)を分類しています。いずれかのパートが休符の瞬間は比較から除外しています。平行5度・平行8度は古典的な対位法(Fuxのspecies counterpoint)で避けるべきとされる進行です。${extra}`,
      descriptionExtra: (found, analyzed) => ` パートが${found}あるため、先頭の${analyzed}パートのみ比較しています。`,
      partColumn: "パート",
      parallelColumn: "平行5度/8度",
      motion: { contrary: "反行", oblique: "斜行", similar: "並行", parallel: "平行" },
    },
    generative: {
      label: "GENERATIVE MODEL",
      heading: "アルゴリズムによる生成(1次マルコフ連鎖)",
      description: "曲中のピッチクラス遷移確率(上の「予測可能性」と同じ行列)から、次の音を確率的にサンプリングして新しい音列を生成します。元の曲を作曲したアルゴリズムの再現ではなく、統計的性質を近似する単純な1次マルコフモデルによる生成です。",
      generate: "生成する",
      originalColumn: "元の曲",
      generatedColumn: "生成列",
      consonanceRow: "協和度(平均Γ)",
      predictabilityRow: "予測可能性(bit)",
    },
  },
  en: {
    tonnetz: {
      label: "HARMONIC GEOMETRY",
      heading: "Tonnetz Trajectory",
      description: "The detected chord progression drawn as a trajectory on Euler's Tonnetz lattice. Adjacent triangles share 1–2 common tones — chords with small voice-leading distance.",
    },
    notatedChord: (text) => `Notated chord progression (chord symbols from the score): ${text}`,
    metrics: {
      label: "STRUCTURAL METRICS",
      heading: "Metrics That May Correlate With Beauty",
      description: "These are not \"proof of beauty.\" They're a hypothesis-generating view of mathematical correlations with named metrics from music theory and information theory.",
      consonance: {
        title: "Consonance",
        theory: "Euler's measure of pleasantness (Gradus Suavitatis, 1739)",
        value: (avg) => `Avg Γ = ${avg}`,
        note: "Lower is more consonant (perfect fifth Γ=4, minor second Γ=11)",
      },
      tension: {
        title: "Harmonic Tension",
        theory: "Minimal voice-leading distance (Neo-Riemannian theory)",
        value: (avg, max) => `Avg ${avg} semitones / Max ${max} semitones`,
        note: "Higher means a leap to a more distant chord",
      },
      predictability: {
        title: "Predictability",
        theory: "Shannon's conditional entropy (information theory, 1948)",
        value: (bits, max) => `${bits} bit (max ${max} bit)`,
        note: "Lower means the next note is easier to predict",
      },
      selfSimilarity: {
        title: "Melodic Self-Similarity",
        theory: "Motif detection via autocorrelation",
        value: (lag, corr) => `Correlation ${corr} at lag ${lag} notes`,
        note: "Closer to 1 means the melody repeats at that interval",
      },
    },
    counterpoint: {
      label: "VOICE LEADING",
      heading: "Counterpoint Check",
      description: (extra) =>
        `Each part is reduced to its single highest note at every instant (monophonic reduction), and voice motion between each pair of parts is classified (contrary/oblique/similar/parallel). Instants where either part rests are excluded. Parallel fifths/octaves are progressions classical counterpoint (Fux's species counterpoint) advises avoiding.${extra}`,
      descriptionExtra: (found, analyzed) => ` There are ${found} parts, so only the first ${analyzed} are compared.`,
      partColumn: "Part",
      parallelColumn: "Parallel 5ths/8ves",
      motion: { contrary: "Contrary", oblique: "Oblique", similar: "Similar", parallel: "Parallel" },
    },
    generative: {
      label: "GENERATIVE MODEL",
      heading: "Algorithmic Generation (1st-Order Markov Chain)",
      description: "Probabilistically samples the next note from the song's pitch-class transition probabilities (the same matrix as \"predictability\" above) to generate a new sequence. Not a reproduction of the algorithm that composed the original — a simple 1st-order Markov model approximating its statistical properties.",
      generate: "Generate",
      originalColumn: "Original song",
      generatedColumn: "Generated",
      consonanceRow: "Consonance (avg Γ)",
      predictabilityRow: "Predictability (bit)",
    },
  },
};
