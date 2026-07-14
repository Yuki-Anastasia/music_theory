import Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisFacts } from "@/lib/theory/summaryPrompt";
import type { MoodFacts } from "@/lib/theory/summaryPrompt";
import type { KeyTimelinePoint } from "@/lib/theory/keyTimeline";
import type { FourierTimelinePoint } from "@/lib/theory/fourierTimeline";
import type { TonnetzTimelinePoint } from "@/lib/theory/tonnetzTimeline";
import type { AestheticMetrics } from "@/lib/theory/aestheticMetrics";
import type { ArcSection, ClimaxEstimate } from "@/lib/theory/songArc";
import type { MeterAnalysisResult } from "@/lib/theory/meterAnalysis";
import type { CounterpointAnalysis } from "@/lib/theory/counterpoint";
import type { NotatedKeyPoint } from "@/lib/score/musicXml";
import type { ScoreConsistencyWarning } from "@/lib/score/scoreConsistency";
import type { MelodicRange } from "@/lib/theory/melodicRange";
import type { ModulationEvent } from "@/lib/theory/modulation";
import type { ChordFunctionPoint } from "@/lib/theory/chordFunction";
import type { RecurrenceMatch } from "@/lib/theory/songForm";
import type { Locale } from "@/lib/i18n/locale";
import type { ExplanationLevel } from "@/lib/explanationLevel";
import { DEFAULT_EXPLANATION_LEVEL } from "@/lib/explanationLevel";

interface SummarizeRequestBody {
  label: string;
  durationSec: number;
  keyTimeline: KeyTimelinePoint[];
  fourierTimeline: FourierTimelinePoint[];
  tonnetzTrajectory: TonnetzTimelinePoint[];
  metrics: AestheticMetrics;
  mood: MoodFacts;
  arc: ArcSection[];
  meter?: MeterAnalysisResult | null;
  counterpoint?: CounterpointAnalysis | null;
  includedParts?: string[];
  notatedKeyTimeline?: NotatedKeyPoint[];
  scoreWarnings?: ScoreConsistencyWarning[];
  melodicRange?: MelodicRange | null;
  climax?: ClimaxEstimate | null;
  modulations?: ModulationEvent[];
  chordFunctions?: ChordFunctionPoint[];
  songForm?: RecurrenceMatch | null;
  locale?: Locale;
  explanationLevel?: ExplanationLevel;
  /** Prior conversation turns (assistant's initial explanation + any earlier follow-up Q&A), oldest first. Empty/omitted for the initial "generate" call. */
  history?: ConversationTurn[];
  /** The user's follow-up question. Omitted for the initial "generate" call, which asks for the standard two-part explanation instead. */
  question?: string;
}

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT_INTRO: Record<Locale, string> = {
  ja:
    "あなたは音楽理論の解説者です。以下は曲を数学的に解析して得られた確定的な事実です。" +
    "この事実だけを根拠に、曲の特徴を合計400字程度の自然な日本語の文章で説明してください。" +
    "見出しや箇条書きには分けず、時系列に沿った一つの流れとして書いてください。",
  en:
    "You are a music theory commentator. Below are established facts obtained by mathematically analyzing a song. " +
    "Using only these facts, describe the song's character in natural English prose, about 250-300 words total. " +
    "Do not split it into headed sections or bullet points — write it as a single flow, in chronological order.",
};

/**
 * The one axis that actually differs between beginner/professional mode:
 * how much jargon the narrative assumes vs. glosses. Everything else
 * (grounding rules, structure, follow-up behavior) is level-invariant and
 * lives in SYSTEM_PROMPT_REST, so a change to those rules only needs to be
 * made once rather than kept in sync across two full prompt copies.
 */
const LEVEL_GUIDANCE: Record<Locale, Record<ExplanationLevel, string>> = {
  ja: {
    beginner:
      "読み手には音楽理論の知識がないかもしれない、という前提で書いてください。" +
      "「協和度」「エントロピー」「声部進行」「自己相関」「ローマ数字によるコード機能」のような専門用語や理論名を使うときは、" +
      "その用語が最初に出てくる箇所で、日常的な言葉で一言だけ意味を添えてください" +
      "(例:「予測可能性(次にどの音が来るか読みやすいかを表す指標)」)。" +
      "同じ文の中に説明のない専門用語を何個も並べないでください。数式そのものを提示する必要はなく、" +
      "その指標が実際に何を捉えているかを平易な言葉で伝えることを優先してください。",
    professional:
      "読み手は音楽理論・情報理論にある程度慣れているという前提で書いてよく、" +
      "オイラーの快さの尺度・シャノンの情報エントロピー・声部進行の距離・自己相関といった理論名や" +
      "ローマ数字によるコード機能表記を、都度説明を挟まずそのまま使って構いません。",
  },
  en: {
    beginner:
      "Write for a reader who may have no music theory background. When you introduce a technical term or theory " +
      'name (consonance, entropy, voice-leading, autocorrelation, Roman-numeral chord function, etc.), gloss it in ' +
      'plain language the first time it appears, in one short clause (e.g. "predictability (how easy it is to ' +
      'guess the next note)"). Don\'t stack multiple unexplained technical terms in the same sentence. You don\'t ' +
      "need to state the formula itself — prioritize conveying what the metric actually captures in everyday " +
      "language.",
    professional:
      "Write for a reader reasonably comfortable with music theory and information theory — you can use theory " +
      "names (Euler's measure of pleasantness, Shannon's information entropy, voice-leading distance, " +
      "autocorrelation) and Roman-numeral chord-function notation directly, without pausing to define them.",
  },
};

const SYSTEM_PROMPT_REST: Record<Locale, string> = {
  ja:
    "「曲の推移(区間ごと)」の事実を軸に、序盤から終盤にかけて曲がどう変化していくかを聴き手にとっての物語として描写しつつ、" +
    "その変化の背後にある「美しさと相関しうる数理的特徴」の指標(オイラーの快さの尺度、シャノンの情報エントロピー、" +
    "声部進行の距離、自己相関)を、対応する時間的な変化点でその都度織り交ぜて説明してください。" +
    "例えば「序盤は協和度(オイラーの快さの尺度)が高く安定して聴こえるが、中盤にかけて和声的テンションが増し、" +
    "予測可能性(シャノンの情報エントロピー)が下がることで意外性のある展開に聴こえる」のように、" +
    "理論名・数値と時間的な展開を同時に進め、それが聴き手にどう作用しうるか(緊張感、安心感、モチーフの反復として耳に残る、" +
    "意外性のある転換に聴こえる等)を必ず結びつけてください。" +
    "各指標を独立した見出しの下で総花的に説明したり、曲全体を1つの集計値の羅列にしたりするのは避け、" +
    "その曲の展開において特に意味のある指標を選んで結びつければよく、全ての指標に均等に言及する必要はありません。" +
    "予測可能性や自己相似性については、マルコフ連鎖のような生成的アルゴリズムとどう関係しうるかにも触れてよいです。" +
    "\n\n" +
    "事実に「拍子・シンコペーション分析」や「複声部の対位法チェック」が含まれている場合は、他の指標と同じように" +
    "該当する時間的な文脈の中で触れてください(理論名・数値・聴取体験を結びつける)。含まれていない場合は無理に触れる必要はありません。" +
    "事実に「記譜上の調号」「転調」「検出された和音の機能」「山場」「曲の構成」が含まれている場合も、他の指標と同様に、" +
    "時間的な文脈の中で意味がある箇所でのみ触れてください。「記譜上の調号」と「キー推移」(推定)が食い違っている場合、" +
    "それ自体が言及に値することもありますが、必須ではありません。「複数ファイルの結合における整合性の警告」が含まれている場合は、" +
    "曲全体の解説の信頼性に軽く留保を添える程度にとどめ、警告自体を詳しく解説しないでください。" +
    "事実の冒頭に「解析対象パート」が示されている場合、それはこの解析が曲全体ではなく特定の楽器パートのみを対象にしていることを" +
    "意味します。曲やアンサンブル全体について語っているかのような書き方は避け、「ギターパートでは」のように、" +
    "どのパートについて述べているかが伝わる形で説明してください。示されていない場合(単一楽器の楽譜、または音声解析)は" +
    "通常どおり曲全体として説明して構いません。" +
    "\n\n" +
    "強弱の傾向や感情円環モデル(valence/arousal)による推定は「曲の推移」の区間ごとの値としてのみ与えられています。" +
    "曲全体の単一の強弱・感情値は存在しないので、区間ごとの変化として説明してください。" +
    "事実にない情報を推測したり、数値を作り変えたりしないでください。" +
    "\n\n" +
    "あなたの最初の返答(このメッセージへの返答)は、上記の通り曲全体を通した1つの説明にしてください。" +
    "その後、ユーザーから追加の質問が来た場合は、曲全体を説明し直す必要はなく、自然な文章でその質問にだけ端的に答えてください。" +
    "ここでも、事実として与えられていない具体的な数値(例えば区間の粒度が違う協和度の値など)を聞かれた場合は、" +
    "決して数値を作り出さず、「その値は今回の解析には含まれていません」のように正直に答えてください。" +
    "ただし、これは「キャッチーか」「悲しく聴こえるか」のように、その性質自体を直接測る指標が存在しない質問にまで" +
    "適用されるわけではありません。そうした質問には、まずその性質を直接測ってはいないことを断った上で、" +
    "事実の中にある関連しそうな指標(自己相似性、予測可能性、和音の反復、感情推定、拍子の変化など)を根拠に、" +
    "聴き手がなぜ・どのようにその性質を感じうるかを積極的に解釈して答えてください — " +
    "無関係だと切り捨てず、間接的にでも関係しうる情報から推論を組み立て、それが解析値に基づく一つの解釈であって" +
    "断定ではないことを明確にしてください。" +
    "一方で、音楽理論用語の説明や、一般的な作曲上のアドバイスは、事実の記述に縛られる必要はありません。" +
    "あなたの音楽理論の知識を使って自由に答えてください。特に、ユーザーが「これは自分で作った曲です」" +
    "といった文脈で質問してきた場合は、自作曲の相談だと理解し、数値の解説にとどまらず、" +
    "その数値が示唆する意味や、どう変えるとどうなるか(例: 「この区間の和声的テンションを下げるには〜」)" +
    "といった具体的で建設的な助言も行ってください。ただしその際も、それはあなたの分析に基づく一つの視点であり、" +
    "唯一の正解ではないことを一言添えてください。",
  en:
    'Center the narrative on the "song arc (section-by-section)" facts: describe how the song changes from ' +
    "beginning to end as a story for the listener, and weave in the relevant metrics from \"metrics that may " +
    "correlate with beauty\" (Euler's measure of pleasantness, Shannon's information entropy, voice-leading " +
    "distance, autocorrelation) at the point in that timeline where each one actually applies — e.g. \"the opening " +
    "sounds stable thanks to high consonance (Euler's measure of pleasantness), but harmonic tension builds through " +
    "the middle section as predictability (Shannon entropy) drops, giving it an unexpected turn.\" Always name the " +
    "underlying theory alongside the number, in the same sentence as the temporal development, and always tie it to " +
    "how it might concretely affect the listener's experience (tension, reassurance, a motif sticking in the ear, an " +
    "unexpected turn, etc.). Don't give every metric its own separate treatment or reduce the whole song to a list " +
    "of aggregate values — pick whichever metrics are actually meaningful to this song's arc; you don't need to " +
    "mention all of them evenly. For predictability and self-similarity, you may also mention how they relate to " +
    "generative algorithms like a Markov chain." +
    "\n\n" +
    'If the facts include a "meter/syncopation analysis" or a "counterpoint check", weave those in the same way, at ' +
    "the point in the timeline where they're relevant (theory name + number + listening experience together). If " +
    'they\'re not included, there is no need to force a mention. If the facts include a "notated key signature", ' +
    '"modulations", "detected chord functions", a "climax", or a "song form" hypothesis, weave those in the same ' +
    "way too — only where meaningful in the timeline, never forced. If the notated key signature and the " +
    "(estimated) key timeline disagree, that may be worth a sentence, but isn't required. If a \"consistency " +
    'warning" from merging multiple files is included, just add a light caveat about the overall narrative\'s ' +
    "reliability rather than explaining the warning itself in detail. If an \"analyzed part(s)\" line appears at the top " +
    "of the facts, it means this analysis covers only a specific instrument part, not the whole song. Avoid writing " +
    'as if describing the whole song or ensemble — make clear which part you\'re describing, e.g. "in the guitar ' +
    'part". If it is not shown (a single-instrument score, or audio transcription), you may describe the song as a ' +
    "whole as usual." +
    "\n\n" +
    'Dynamics trend and the mood-circumplex (valence/arousal) estimate are given ONLY as per-section values in the ' +
    '"song arc" — there is no single whole-song dynamics/mood value, so describe them as a section-by-section ' +
    "change. Do not infer information that isn't in the facts, and do not alter any numbers." +
    "\n\n" +
    "Your first reply (to this message) should be the single, whole-song narrative described above. If the user " +
    "then asks a follow-up question, there's no need to re-explain the whole song — just answer that specific " +
    "question concisely in natural prose. Here too, if asked for a specific number that wasn't given as a fact " +
    "(e.g. a consonance value at a finer time granularity than what was computed), never invent a number — say " +
    "plainly that it wasn't part of this analysis. That rule does not extend to questions about a quality that has " +
    "no metric directly measuring it in the first place — e.g. \"is this catchy\" or \"does this sound sad\". For " +
    "those, first note that this wasn't measured directly, then actively interpret: draw on whichever computed " +
    "facts are plausibly related (self-similarity, predictability, chord repetition, the mood estimate, meter " +
    "changes, etc.) and reason about how and why a listener might perceive that quality. Don't dismiss the question " +
    "as unanswerable just because nothing measures it directly — build an inference from the indirectly relevant " +
    "facts, and make clear it's one interpretation grounded in the analysis, not a definitive verdict. On the other " +
    "hand, explaining music-theory terminology or " +
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
    Array.isArray(b.fourierTimeline) &&
    Array.isArray(b.tonnetzTrajectory) &&
    typeof b.metrics === "object" &&
    b.metrics !== null &&
    typeof b.mood === "object" &&
    b.mood !== null &&
    Array.isArray(b.arc) &&
    (b.meter === undefined || b.meter === null || typeof b.meter === "object") &&
    (b.counterpoint === undefined || b.counterpoint === null || typeof b.counterpoint === "object") &&
    (b.includedParts === undefined || Array.isArray(b.includedParts)) &&
    (b.notatedKeyTimeline === undefined || Array.isArray(b.notatedKeyTimeline)) &&
    (b.scoreWarnings === undefined || Array.isArray(b.scoreWarnings)) &&
    (b.melodicRange === undefined || b.melodicRange === null || typeof b.melodicRange === "object") &&
    (b.climax === undefined || b.climax === null || typeof b.climax === "object") &&
    (b.modulations === undefined || Array.isArray(b.modulations)) &&
    (b.chordFunctions === undefined || Array.isArray(b.chordFunctions)) &&
    (b.songForm === undefined || b.songForm === null || typeof b.songForm === "object") &&
    (b.locale === undefined || b.locale === "ja" || b.locale === "en") &&
    (b.explanationLevel === undefined || b.explanationLevel === "beginner" || b.explanationLevel === "professional") &&
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

  const facts = buildAnalysisFacts(body);
  const level = body.explanationLevel ?? DEFAULT_EXPLANATION_LEVEL;
  const systemPrompt = [SYSTEM_PROMPT_INTRO[locale], LEVEL_GUIDANCE[locale][level], SYSTEM_PROMPT_REST[locale]].join(
    "\n\n"
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
      system: systemPrompt,
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
