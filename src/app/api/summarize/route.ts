import Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisFacts } from "@/lib/theory/summaryPrompt";
import type { KeyTimelinePoint } from "@/lib/theory/keyTimeline";
import type { FourierTimelinePoint } from "@/lib/theory/fourierTimeline";
import type { TonnetzTimelinePoint } from "@/lib/theory/tonnetzTimeline";
import type { AestheticMetrics } from "@/lib/theory/aestheticMetrics";
import type { InstrumentTagWindow } from "@/lib/audio/instrumentTagger";

interface SummarizeRequestBody {
  label: string;
  durationSec: number;
  keyTimeline: KeyTimelinePoint[];
  fourierTimeline: FourierTimelinePoint[];
  tonnetzTrajectory: TonnetzTimelinePoint[];
  metrics: AestheticMetrics;
  instrumentTags: InstrumentTagWindow[];
}

const SYSTEM_PROMPT =
  "あなたは音楽理論の解説者です。以下は曲を数学的に解析して得られた確定的な事実です。" +
  "この事実だけを根拠に、曲の特徴を400字程度の自然な日本語で説明してください。" +
  "「美しさと相関しうる数理的特徴」の各指標については、単に数式や数値を説明するだけでは不十分です。" +
  "その背後にある理論名(オイラーの快さの尺度、シャノンの情報エントロピー、声部進行の距離、自己相関)に触れつつ、" +
  "その数値が具体的に聴き手(オーディエンス)にどう作用しうるか — 例えば協和度が低い箇所は緊張感や不安定さとして" +
  "聴こえやすい、予測可能性が高い(エントロピーが低い)部分は安心感・親しみやすさにつながりやすい、" +
  "自己相似性が高い箇所はモチーフの反復として耳に残りやすい、和声的テンションが大きい遷移は意外性のある展開に" +
  "聴こえやすい、といった形で、数式と聴取体験を必ず結びつけて説明してください。" +
  "予測可能性や自己相似性については、マルコフ連鎖のような生成的アルゴリズムとどう関係しうるかにも触れてよいです。" +
  "ただし、これらは聴き手に与える印象の証明ではなく、数学的な相関に基づく仮説的な視点であることを明確にしてください。" +
  "楽器・声質タグ(YAMNet)についても言及があれば、曲の音の混合の特徴として触れてよいですが、" +
  "これは音符ごとの楽器分離ではなく曲全体・区間ごとの粗い推定であることを明確にしてください。" +
  "事実にない情報を推測したり、数値を作り変えたりしないでください。";

function isValidBody(body: unknown): body is SummarizeRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.label === "string" &&
    typeof b.durationSec === "number" &&
    Array.isArray(b.keyTimeline) &&
    Array.isArray(b.fourierTimeline) &&
    Array.isArray(b.tonnetzTrajectory) &&
    typeof b.metrics === "object" &&
    b.metrics !== null &&
    Array.isArray(b.instrumentTags)
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
    body.fourierTimeline,
    body.tonnetzTrajectory,
    body.metrics,
    body.instrumentTags
  );

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
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
