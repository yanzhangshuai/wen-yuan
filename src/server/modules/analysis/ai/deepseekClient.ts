import { buildChapterAnalysisPrompt } from "@/server/modules/analysis/ai/prompts";
import type { AiAnalysisClient, AnalyzeChunkInput } from "@/server/modules/analysis/ai/types";
import { type ChapterAnalysisResponse, parseChapterAnalysisResponse } from "@/types/analysis";

interface DeepSeekChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

/**
 * 功能：实现 DeepSeek Provider，按统一接口输出结构化结果。
 * 输入：构造参数（apiKey、baseUrl、modelName）与 analyzeChapterChunk 参数。
 * 输出：ChapterAnalysisResponse。
 * 异常：缺少 API Key、接口失败、空响应或解析失败时抛错。
 * 副作用：发起外部网络请求到 DeepSeek 服务。
 */
export class DeepSeekClient implements AiAnalysisClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly modelName: string;

  /**
   * 功能：初始化 DeepSeek 客户端配置。
   * 输入：apiKey、baseUrl、modelName。
   * 输出：DeepSeekClient 实例。
   * 异常：apiKey 缺失时抛错。
   * 副作用：无。
   */
  constructor(
    apiKey = process.env.DEEPSEEK_API_KEY,
    baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    modelName = process.env.DEEPSEEK_MODEL ?? "deepseek-chat"
  ) {
    if (!apiKey) {
      throw new Error("Missing DeepSeek API key: DEEPSEEK_API_KEY");
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.modelName = modelName;
  }

  /**
   * 功能：调用 DeepSeek 分析单分段文本并返回结构化结果。
   * 输入：input - 分段文本与人物上下文。
   * 输出：ChapterAnalysisResponse。
   * 异常：接口调用失败、空响应或 JSON 解析失败时抛错。
   * 副作用：发起外部 API 请求。
   */
  async analyzeChapterChunk(input: AnalyzeChunkInput): Promise<ChapterAnalysisResponse> {
    const prompt = buildChapterAnalysisPrompt({
      bookTitle: input.bookTitle,
      chapterNo: input.chapterNo,
      chapterTitle: input.chapterTitle,
      content: input.content,
      profiles: input.profiles,
      chunkIndex: input.chunkIndex,
      chunkCount: input.chunkCount
    });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelName,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }]
      })
    });

    const payload = (await response.json()) as DeepSeekChatResponse;

    if (!response.ok) {
      const message = payload.error?.message ?? `DeepSeek request failed: ${response.status}`;
      throw new Error(message);
    }

    const raw = payload.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("DeepSeek returned an empty response");
    }

    return parseChapterAnalysisResponse(raw);
  }
}
