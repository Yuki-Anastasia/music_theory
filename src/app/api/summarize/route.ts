import Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisFacts } from "@/lib/theory/summaryPrompt";
import type { MoodFacts } from "@/lib/theory/summaryPrompt";
import type { KeyTimelinePoint } from "@/lib/theory/keyTimeline";
import type { TonnetzTimelinePoint } from "@/lib/theory/tonnetzTimeline";
import type { AestheticMetrics } from "@/lib/theory/aestheticMetrics";
import type { ArcSection } from "@/lib/theory/songArc";
import type { MeterAnalysisResult } from "@/lib/theory/meterAnalysis";
import type { CounterpointAnalysis } from "@/lib/theory/counterpoint";

interface SummarizeRequestBody {
  label: string;
  durationSec: number;
  keyTimeline: KeyTimelinePoint[];
  tonnetzTrajectory: TonnetzTimelinePoint[];
  metrics: AestheticMetrics;
  mood: MoodFacts;
  arc: ArcSection[];
  meter?: MeterAnalysisResult | null;
  counterpoint?: CounterpointAnalysis | null;
}

const SYSTEM_PROMPT =
  "あなたは音楽理論の解説者です。以下は曲を数学的に解析して得られた確定的な事実です。" +
  "この事実だけを根拠に、曲の特徴を合計600字程度の自然な日本語で、必ず次の2部構成で説明してください。" +
  "部の切れ目には「■曲の展開」「■数理的根拠」という見出しをそのまま使い、改行で区切ってください。" +
  "\n\n" +
  "■曲の展開(第1部、250字程度): 数式や指標名にはまだ深入りせず、" +
  "「曲の推移(区間ごと)」の事実を軸に、序盤から終盤にかけて曲がどう変化していくかを、" +
  "聴き手にとっての物語(flow)として先に描写してください。" +
  "協和度が下がって緊張が高まる、強弱が増して盛り上がる、感情円環モデルの位置が穏やかから高揚へ移る、" +
  "といった時間的な展開を優先し、曲全体を1つの集計値の羅列にしたり単一の平均値だけを述べたりするのは避けてください。" +
  "\n\n" +
  "■数理的根拠(第2部、350字程度): ここで初めて、「美しさと相関しうる数理的特徴」の各指標を1つずつ順番に取り上げ、" +
  "単に数式や数値を説明するだけでなく、その背後にある理論名(オイラーの快さの尺度、シャノンの情報エントロピー、" +
  "声部進行の距離、自己相関)に触れつつ、その数値が具体的に聴き手(オーディエンス)にどう作用しうるか — " +
  "例えば協和度が低い箇所は緊張感や不安定さとして聴こえやすい、予測可能性が高い(エントロピーが低い)部分は" +
  "安心感・親しみやすさにつながりやすい、自己相似性が高い箇所はモチーフの反復として耳に残りやすい、" +
  "和声的テンションが大きい遷移は意外性のある展開に聴こえやすい、といった形で、数式と聴取体験を必ず結びつけて" +
  "説明してください。予測可能性や自己相似性については、マルコフ連鎖のような生成的アルゴリズムとどう関係しうるかにも" +
  "触れてよいです。ただし、これらは聴き手に与える印象の証明ではなく、数学的な相関に基づく仮説的な視点であることを" +
  "明確にしてください。" +
  "事実に「拍子・シンコペーション分析」や「複声部の対位法チェック」が含まれている場合は、それらも第2部の中で" +
  "他の指標と同様に扱ってください(理論名・数値・聴取体験を結びつける)。含まれていない場合は無理に触れる必要はありません。" +
  "\n\n" +
  "強弱の傾向や感情円環モデル(valence/arousal)による推定は「曲の推移」の区間ごとの値としてのみ与えられています。" +
  "曲全体の単一の強弱・感情値は存在しないので、区間ごとの変化として説明してください。" +
  "ただし感情の推定は表面的な音楽特徴からの仮説であり、検証済みの感情認識モデルではないことを明確にしてください。" +
  "事実にない情報を推測したり、数値を作り変えたりしないでください。";

function isValidBody(body: unknown): body is SummarizeRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.label === "string" &&
    typeof b.durationSec === "number" &&
    Array.isArray(b.keyTimeline) &&
    Array.isArray(b.tonnetzTrajectory) &&
    typeof b.metrics === "object" &&
    b.metrics !== null &&
    typeof b.mood === "object" &&
    b.mood !== null &&
    Array.isArray(b.arc) &&
    (b.meter === undefined || b.meter === null || typeof b.meter === "object") &&
    (b.counterpoint === undefined || b.counterpoint === null || typeof b.counterpoint === "object")
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエストボディがJSONとして解析できません" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return Response.json({ error: "必須フィールドが不足しています" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "サーバーにANTHROPIC_API_KEYが設定されていません(.env.localを確認してください)" },
      { status: 500 }
    );
  }

  const facts = buildAnalysisFacts(
    body.label,
    body.durationSec,
    body.keyTimeline,
    body.tonnetzTrajectory,
    body.metrics,
    body.mood,
    body.arc,
    body.meter,
    body.counterpoint
  );

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: facts }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return Response.json({ summary: textBlock?.text ?? "" });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "レート制限に達しました。しばらく待って再試行してください" }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "APIキーが無効です(サーバー設定を確認してください)" }, { status: 500 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "AI解説の生成に失敗しました" },
      { status: 500 }
    );
  }
}
