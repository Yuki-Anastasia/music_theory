import Anthropic from "@anthropic-ai/sdk";
import { buildPromptParseTool, parsePromptConceptsToolInput, PARSE_PROMPT_TOOL_NAME } from "@/lib/prompt/promptParserTool";
import { describeFeatureNamesForPrompt } from "@/lib/prompt/ontology";
import type { Locale } from "@/lib/i18n/locale";

interface ParsePromptRequestBody {
  prompt: string;
  locale?: Locale;
}

const SYSTEM_PROMPT_INTRO: Record<Locale, string> = {
  ja:
    "あなたは音楽生成AI(Suno/Udioなど)のプロンプト文を解析するアシスタントです。" +
    "以下のプロンプト文が暗示している音楽的な概念を抽出し、それぞれを、このアプリが実際に測定できる特徴量に結びつけてください。" +
    "特徴量は下記の一覧にあるものだけを使い、存在しない特徴量を作り出してはいけません。" +
    "プロンプトが「速い」「静かな」のような定性的な表現をしている場合は、bpmのような具体的な範囲を持つ特徴量に対しては、" +
    "あなた自身の判断で具体的な数値範囲に変換してください。",
  en:
    "You are an assistant that parses text prompts used with AI music generators (Suno/Udio, etc.). " +
    "Extract the musical concepts implied by the prompt below, and tie each one to specific features this app can actually measure. " +
    "Only use features from the list below — never invent a feature that isn't listed. " +
    "When the prompt uses qualitative language ('fast', 'sparse', etc.) for a feature that only supports a concrete target range " +
    "(e.g. tempo in BPM), translate it into a concrete numeric range yourself.",
};

const FEATURE_LIST_LABEL: Record<Locale, string> = {
  ja: "利用可能な特徴量一覧:",
  en: "Available features:",
};

const API_MESSAGES: Record<Locale, { badJson: string; missingFields: string; noApiKey: string; rateLimited: string; badApiKey: string; genericFailure: string }> = {
  ja: {
    badJson: "リクエストボディがJSONとして解析できません",
    missingFields: "必須フィールドが不足しています",
    noApiKey: "サーバーにANTHROPIC_API_KEYが設定されていません(.env.localを確認してください)",
    rateLimited: "レート制限に達しました。しばらく待って再試行してください",
    badApiKey: "APIキーが無効です(サーバー設定を確認してください)",
    genericFailure: "プロンプトの解析に失敗しました",
  },
  en: {
    badJson: "The request body could not be parsed as JSON",
    missingFields: "Required fields are missing",
    noApiKey: "ANTHROPIC_API_KEY is not set on the server (check .env.local)",
    rateLimited: "Rate limit reached. Please wait and try again",
    badApiKey: "Invalid API key (check the server configuration)",
    genericFailure: "Failed to parse the prompt",
  },
};

function extractLocale(body: unknown): Locale {
  if (typeof body === "object" && body !== null) {
    const l = (body as Record<string, unknown>).locale;
    if (l === "en") return "en";
  }
  return "ja";
}

function isValidBody(body: unknown): body is ParsePromptRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b.prompt === "string" && b.prompt.trim().length > 0 && (b.locale === undefined || b.locale === "ja" || b.locale === "en");
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

  const systemPrompt = [SYSTEM_PROMPT_INTRO[locale], FEATURE_LIST_LABEL[locale], describeFeatureNamesForPrompt()].join("\n\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: body.prompt }],
      tools: [buildPromptParseTool()],
      tool_choice: { type: "tool", name: PARSE_PROMPT_TOOL_NAME },
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: errorMessages.genericFailure }, { status: 500 });
    }

    const toolBlock = response.content.find((block) => block.type === "tool_use" && block.name === PARSE_PROMPT_TOOL_NAME);
    const concepts = toolBlock && toolBlock.type === "tool_use" ? parsePromptConceptsToolInput(toolBlock.input) : [];

    return Response.json({ concepts });
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
