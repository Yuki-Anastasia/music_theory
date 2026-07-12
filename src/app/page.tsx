import Link from "next/link";
import HeroNotationMotif from "@/components/decoration/HeroNotationMotif";
import MiniPianoRoll from "@/components/decoration/MiniPianoRoll";
import TonnetzFragment from "@/components/decoration/TonnetzFragment";
import WaveformFragment from "@/components/decoration/WaveformFragment";

/** EXPRESSION column's diagram: a function curve annotated with the two formulas it's standing in for. */
function ExpressionDiagram({ className }: { className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <WaveformFragment className="h-full w-full" />
      <span className="absolute left-0 top-0 font-mono text-[9px] text-navy">H(X)</span>
      <span className="absolute bottom-0 right-1 font-mono text-[9px] text-navy">r(τ)</span>
    </div>
  );
}

const COLUMNS = [
  {
    label: "TONALITY",
    heading: "調性",
    body: "曲をアップロードすると、Basic Pitch(ブラウザ内AI)が音符を検出し、キーの移り変わりをKrumhansl-Schmucklerアルゴリズムで、調性的な特徴をピッチクラス集合のフーリエ係数で推定します。",
    Decoration: MiniPianoRoll,
  },
  {
    label: "HARMONY",
    heading: "和声",
    body: "和音の進行をオイラーのTonnetz格子上の軌跡として可視化し、声部進行の距離やピッチクラス遷移から協和度・和声的テンションを計算します。",
    Decoration: TonnetzFragment,
  },
  {
    label: "EXPRESSION",
    heading: "リズム・表現",
    body: "テンポ・強弱・リズムの複雑さ(シャノンエントロピー)から、曲の感情的な位置と時間的な推移を仮説的に推定します。",
    Decoration: ExpressionDiagram,
  },
] as const;

export default function Home() {
  return (
    <main className="flex-1">
      <section className="relative mx-auto max-w-5xl overflow-hidden px-8 py-20 lg:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-2/3 text-navy opacity-[0.14] lg:block"
        >
          <HeroNotationMotif className="h-full w-full" />
        </div>

        <div className="relative flex max-w-xl flex-col gap-6">
          <h1 className="text-4xl font-semibold tracking-tight">音楽の数学</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            音楽を支配する数学的構造 — 音響物理・幾何学・フーリエ解析・情報理論 —
            を、実際の曲やあなたの声・演奏を通して聞いて・見て探求するインタラクティブツールです。
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/analyze"
              className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              曲を解析する
            </Link>
            <Link
              href="/live"
              className="flex h-12 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
            >
              ライブモードを試す
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-12 divide-y divide-zinc-200 border-t border-zinc-200 px-8 pb-24 dark:divide-zinc-800 dark:border-zinc-800 sm:grid-cols-3 sm:gap-8 sm:divide-x sm:divide-y-0">
        {COLUMNS.map(({ label, heading, body, Decoration }) => (
          <div key={label} className="flex flex-col gap-4 pt-8 first:pt-8 sm:px-8 sm:pt-0 sm:first:pl-0">
            <Decoration className="h-14 w-28 text-navy opacity-40" />
            <div>
              <p className="text-xs font-medium tracking-[0.15em] text-navy">{label}</p>
              <h2 className="mt-1 text-sm font-semibold">{heading}</h2>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
