import type { Locale } from "../locale";

interface HomeColumn {
  label: string;
  heading: string;
  body: string;
}

interface HomeDict {
  heading: string;
  intro: string;
  analyzeCta: string;
  liveCta: string;
  columns: { tonality: HomeColumn; harmony: HomeColumn; expression: HomeColumn };
}

export const homeDict: Record<Locale, HomeDict> = {
  ja: {
    heading: "Notewave",
    intro:
      "音楽を支配する数学的構造 — 音響物理・幾何学・フーリエ解析・情報理論 — を、実際の曲やあなたの声・演奏を通して聞いて・見て探求するインタラクティブツールです。",
    analyzeCta: "曲を解析する",
    liveCta: "ライブモードを試す",
    columns: {
      tonality: {
        label: "TONALITY",
        heading: "調性",
        body: "曲をアップロードすると、Basic Pitch(ブラウザ内AI)が音符を検出し、キーの移り変わりをKrumhansl-Schmucklerアルゴリズムで、調性的な特徴をピッチクラス集合のフーリエ係数で推定します。",
      },
      harmony: {
        label: "HARMONY",
        heading: "和声",
        body: "和音の進行をオイラーのTonnetz格子上の軌跡として可視化し、声部進行の距離やピッチクラス遷移から協和度・和声的テンションを計算します。",
      },
      expression: {
        label: "EXPRESSION",
        heading: "リズム・表現",
        body: "テンポ・強弱・リズムの複雑さ(シャノンエントロピー)から、曲の感情的な位置と時間的な推移を仮説的に推定します。",
      },
    },
  },
  en: {
    heading: "Notewave",
    intro:
      "The mathematical structures underlying music — acoustic physics, geometry, Fourier analysis, information theory — explored interactively through real songs and your own voice or playing.",
    analyzeCta: "Analyze a song",
    liveCta: "Try live mode",
    columns: {
      tonality: {
        label: "TONALITY",
        heading: "Tonality",
        body: "Upload a song and Basic Pitch (an in-browser AI model) detects its notes. Key changes are estimated with the Krumhansl-Schmuckler algorithm, and tonal character with the Fourier coefficients of the pitch-class set.",
      },
      harmony: {
        label: "HARMONY",
        heading: "Harmony",
        body: "Chord progressions are visualized as a trajectory on Euler's Tonnetz lattice, with consonance and harmonic tension computed from voice-leading distance and pitch-class transitions.",
      },
      expression: {
        label: "EXPRESSION",
        heading: "Rhythm & Expression",
        body: "From tempo, dynamics, and rhythmic complexity (Shannon entropy), the song's emotional position and how it shifts over time are estimated as a hypothesis.",
      },
    },
  },
};
