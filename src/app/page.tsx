import Link from "next/link";

const FEATURES = [
  {
    title: "ピアノロール & キーの推移",
    body: "曲をアップロードすると、Basic Pitch(ブラウザ内AI)が音符を検出し、キーの移り変わりをKrumhansl-Schmucklerアルゴリズムで推定します。",
  },
  {
    title: "Tonnetz & フーリエ解析",
    body: "和音の進行をオイラーのTonnetz格子上の軌跡として、調性的な特徴をピッチクラス集合のフーリエ係数として可視化します。",
  },
  {
    title: "美しさと相関しうる数理的特徴",
    body: "協和度・和声的テンション・予測可能性・自己相似性など、名前のついた数学理論を曲のデータに適用した仮説的な視点を提示します。",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-16 px-8 py-20">
      <section className="flex flex-col gap-6">
        <h1 className="text-4xl font-semibold tracking-tight">音楽の数学</h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
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
      </section>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">{feature.title}</h2>
            <p className="mt-2 text-xs text-zinc-500">{feature.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
