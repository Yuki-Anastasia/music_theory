import Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisFacts } from "@/lib/theory/summaryPrompt";
import type { MoodFacts } from "@/lib/theory/summaryPrompt";
import type { KeyTimelinePoint } from "@/lib/theory/keyTimeline";
import type { TonnetzTimelinePoint } from "@/lib/theory/tonnetzTimeline";
import type { AestheticMetrics } from "@/lib/theory/aestheticMetrics";
import type { ArcSection } from "@/lib/theory/songArc";
import type { MeterAnalysisResult } from "@/lib/theory/meterAnalysis";
import type { CounterpointAnalysis } from "@/lib/theory/counterpoint";
import type { Locale } from "@/lib/i18n/locale";

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
  includedParts?: string[];
  locale?: Locale;
  /** Prior conversation turns (assistant's initial explanation + any earlier follow-up Q&A), oldest first. Empty/omitted for the initial "generate" call. */
  history?: ConversationTurn[];
  /** The user's follow-up question. Omitted for the initial "generate" call, which asks for the standard two-part explanation instead. */
  question?: string;
}

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT: Record<Locale, string> = {
  ja:
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
    "事実の冒頭に「解析対象パート」が示されている場合、それはこの解析が曲全体ではなく特定の楽器パートのみを対象にしていることを" +
    "意味します。曲やアンサンブル全体について語っているかのような書き方は避け、「ギターパートでは」のように、" +
    "どのパートについて述べているかが伝わる形で説明してください。示されていない場合(単一楽器の楽譜、または音声解析)は" +
    "通常どおり曲全体として説明して構いません。" +
    "\n\n" +
    "強弱の傾向や感情円環モデル(valence/arousal)による推定は「曲の推移」の区間ごとの値としてのみ与えられています。" +
    "曲全体の単一の強弱・感情値は存在しないので、区間ごとの変化として説明してください。" +
    "ただし感情の推定は表面的な音楽特徴からの仮説であり、検証済みの感情認識モデルではないことを明確にしてください。" +
    "事実にない情報を推測したり、数値を作り変えたりしないでください。" +
    "\n\n" +
    "あなたの最初の返答(このメッセージへの返答)は必ず上記の2部構成にしてください。" +
    "その後、ユーザーから追加の質問が来た場合は、「■曲の展開」「■数理的根拠」の見出し構成を使わず、" +
    "自然な文章でその質問にだけ端的に答えてください。ここでも、事実として与えられていない具体的な数値" +
    "(例えば区間の粒度が違う協和度の値など)を聞かれた場合は、決して数値を作り出さず、" +
    "「その値は今回の解析には含まれていません」のように正直に答えてください。" +
    "一方で、音楽理論用語の説明や、一般的な作曲上のアドバイスは、事実の記述に縛られる必要はありません。" +
    "あなたの音楽理論の知識を使って自由に答えてください。特に、ユーザーが「これは自分で作った曲です」" +
    "といった文脈で質問してきた場合は、自作曲の相談だと理解し、数値の解説にとどまらず、" +
    "その数値が示唆する意味や、どう変えるとどうなるか(例: 「この区間の和声的テンションを下げるには〜」)" +
    "といった具体的で建設的な助言も行ってください。ただしその際も、それはあなたの分析に基づく一つの視点であり、" +
    "唯一の正解ではないことを一言添えてください。",
  en:
    "You are a music theory commentator. Below are established facts obtained by mathematically analyzing a song. " +
    "Using only these facts, describe the song's character in natural English prose, about 350-400 words total, " +
    "always in the following two-part structure. Mark the section breaks with the literal headings " +
    '"■ Song Arc" and "■ Mathematical Basis", separated by a blank line.' +
    "\n\n" +
    "■ Song Arc (Part 1, ~150 words): without going deep into formulas or metric names yet, " +
    'describe first, as a narrative for the listener, how the song changes from beginning to end, centered on the ' +
    '"song arc (section-by-section)" facts. Prioritize temporal developments — consonance dropping as tension rises, ' +
    "dynamics building to a climax, the mood-circumplex position shifting from calm to excited — and avoid reducing " +
    "the whole song to a list of aggregate values or a single average." +
    "\n\n" +
    "■ Mathematical Basis (Part 2, ~200-250 words): only now take up each metric under \"metrics that may correlate " +
    "with beauty\" one at a time. Don't just state the formula or number — name the underlying theory (Euler's measure " +
    "of pleasantness, Shannon's information entropy, voice-leading distance, autocorrelation) and connect the number " +
    "to how it might concretely affect the listener's experience — e.g. a low-consonance passage tends to sound " +
    "tense or unstable, a highly predictable (low-entropy) passage tends to feel reassuring and familiar, a highly " +
    "self-similar passage tends to stick in the ear as a repeated motif, a large harmonic-tension transition tends " +
    "to sound like an unexpected turn. Always tie the formula to the listening experience this way. For " +
    "predictability and self-similarity, you may also mention how they relate to generative algorithms like a " +
    "Markov chain. Make clear, however, that these are not proof of the listener's impression, but a " +
    "hypothesis-generating view based on mathematical correlation. " +
    'If the facts include a "meter/syncopation analysis" or a "counterpoint check", treat those the same way as the ' +
    "other metrics in Part 2 (connect theory name, numbers, and listening experience). If they're not included, " +
    'there is no need to force a mention. If an "analyzed part(s)" line appears at the top of the facts, it means ' +
    "this analysis covers only a specific instrument part, not the whole song. Avoid writing as if describing the " +
    'whole song or ensemble — make clear which part you\'re describing, e.g. "in the guitar part". If it is not ' +
    "shown (a single-instrument score, or audio transcription), you may describe the song as a whole as usual." +
    "\n\n" +
    'Dynamics trend and the mood-circumplex (valence/arousal) estimate are given ONLY as per-section values in the ' +
    '"song arc" — there is no single whole-song dynamics/mood value, so describe them as a section-by-section ' +
    "change. Make clear, however, that the mood estimate is a hypothesis from surface musical features, not a " +
    "validated emotion-recognition model. Do not infer information that isn't in the facts, and do not alter any numbers." +
    "\n\n" +
    "Your first reply (to this message) must always use the two-part structure above. If the user then asks a " +
    "follow-up question, drop the \"■ Song Arc\" / \"■ Mathematical Basis\" headings and just answer that specific " +
    "question concisely in natural prose. Here too, if asked for a specific number that wasn't given as a fact " +
    "(e.g. a consonance value at a finer time granularity than what was computed), never invent a number — say " +
    "plainly that it wasn't part of this analysis. On the other hand, explaining music-theory terminology or " +
    "giving general compositional advice is not bound to the facts — feel free to draw on your own music-theory " +
    "knowledge. In particular, if the user's question implies this is their own composition (e.g. \"I wrote this " +
    "song\"), treat it as a request for feedback on their own work: go beyond restating the numbers and offer " +
    "concrete, constructive suggestions (e.g. \"to lower the harmonic tension in this section, you could...\"), " +
    "while noting that this is one interpretation based on the analysis, not the only correct answer.",
};

const API_MESSAGES: Record<Locale, { badJson: string; missingFields: string; noApiKey: string; rateLimited: string; badApiKey: string; genericFailure: string }> = {
  ja: {
    badJson: "リクエストボディがJSONとして解析できません",
    missingFields: "必須フィールドが不足しています",
    noApiKey: "サーバーにANTHROPIC_API_KEYが設定されていません(.env.localを確認してください)",
    rateLimited: "レート制限に達しました。しばらく待って再試行してください",
    badApiKey: "APIキーが無効です(サーバー設定を確認してください)",
    genericFailure: "AI解説の生成に失敗しました",
  },
  en: {
    badJson: "The request body could not be parsed as JSON",
    missingFields: "Required fields are missing",
    noApiKey: "ANTHROPIC_API_KEY is not set on the server (check .env.local)",
    rateLimited: "Rate limit reached. Please wait and try again",
    badApiKey: "Invalid API key (check the server configuration)",
    genericFailure: "Failed to generate the AI explanation",
  },
};

function extractLocale(body: unknown): Locale {
  if (typeof body === "object" && body !== null) {
    const l = (body as Record<string, unknown>).locale;
    if (l === "en") return "en";
  }
  return "ja";
}

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
    (b.counterpoint === undefined || b.counterpoint === null || typeof b.counterpoint === "object") &&
    (b.includedParts === undefined || Array.isArray(b.includedParts)) &&
    (b.locale === undefined || b.locale === "ja" || b.locale === "en") &&
    (b.question === undefined || typeof b.question === "string") &&
    (b.history === undefined || isValidHistory(b.history))
  );
}

function isValidHistory(history: unknown): history is ConversationTurn[] {
  return (
    Array.isArray(history) &&
    history.every(
      (turn) =>
        typeof turn === "object" &&
        turn !== null &&
        ((turn as Record<string, unknown>).role === "user" || (turn as Record<string, unknown>).role === "assistant") &&
        typeof (turn as Record<string, unknown>).content === "string"
    )
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: API_MESSAGES.ja.badJson }, { status: 400 });
  }

  const locale = extractLocale(body);
  const errorMessages = API_MESSAGES[locale];

  if (!isValidBody(body)) {
    return Response.json({ error: errorMessages.missingFields }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: errorMessages.noApiKey }, { status: 500 });
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
    body.counterpoint,
    body.includedParts
  );

  // Turn 1 is always the facts; any prior conversation (the initial
  // explanation plus earlier follow-ups) replays in order, and a new
  // question - if present - is appended last. When history/question are
  // both absent, this is just the original single-turn "generate" call.
  const conversationMessages: ConversationTurn[] = [
    { role: "user", content: facts },
    ...(body.history ?? []),
    ...(body.question ? [{ role: "user" as const, content: body.question }] : []),
  ];

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1600,
      system: SYSTEM_PROMPT[locale],
      messages: conversationMessages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return Response.json({ summary: textBlock?.text ?? "" });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: errorMessages.rateLimited }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: errorMessages.badApiKey }, { status: 500 });
    }
    return Response.json({ error: err instanceof Error ? err.message : errorMessages.genericFailure }, { status: 500 });
  }
}
