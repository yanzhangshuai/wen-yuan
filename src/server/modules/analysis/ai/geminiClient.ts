import { GoogleGenerativeAI } from "@google/generative-ai";

import { buildChapterAnalysisPrompt } from "@/server/modules/analysis/ai/prompts";
import type { AiAnalysisClient, AnalyzeChunkInput } from "@/server/modules/analysis/ai/types";
import { type ChapterAnalysisResponse, parseChapterAnalysisResponse } from "@/types/analysis";

/**
 * 功能：实现 Gemini Provider，按统一接口输出结构化结果。
 * 输入：构造参数（apiKey、modelName）与 analyzeChapterChunk 参数。
 * 输出：ChapterAnalysisResponse。
 * 异常：缺少 API Key、空响应或解析失败时抛错。
 * 副作用：发起外部网络请求到 Gemini 服务。
 */
export class GeminiClient implements AiAnalysisClient {
  private readonly client: GoogleGenerativeAI;
  private readonly modelName: string;

  /**
   * 功能：初始化 Gemini 客户端与模型配置。
   * 输入：apiKey - Gemini Key；modelName - 模型名（默认 gemini-3.1-flash）。
   * 输出：GeminiClient 实例。
   * 异常：apiKey 缺失时抛错。
   * 副作用：无。
   */
  constructor(apiKey = process.env.GEMINI_API_KEY, modelName = process.env.GEMINI_MODEL ?? "gemini-3.1-flash") {
    if (!apiKey) {
      throw new Error("Missing Gemini API key: GEMINI_API_KEY");
    }

    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  /**
   * 功能：调用 Gemini 分析单分段文本并返回结构化结果。
   * 输入：input - 分段文本与人物上下文。
   * 输出：ChapterAnalysisResponse。
   * 异常：接口调用失败、空响应或 JSON 解析失败时抛错。
   * 副作用：发起外部 API 请求。
   */
  async analyzeChapterChunk(input: AnalyzeChunkInput): Promise<ChapterAnalysisResponse> {
    // 先构建高约束 Prompt，降低输出格式漂移概率。
    const prompt = buildChapterAnalysisPrompt({
      bookTitle: input.bookTitle,
      chapterNo: input.chapterNo,
      chapterTitle: input.chapterTitle,
      content: input.content,
      profiles: input.profiles,
      chunkIndex: input.chunkIndex,
      chunkCount: input.chunkCount
    });

    // 按当前配置加载模型（默认 gemini-3.1-flash）。
    const model = this.client.getGenerativeModel({ model: this.modelName });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // 强制模型直接返回 JSON 文本，便于后端解析。
        responseMimeType: "application/json",
        // 温度偏低，优先稳定输出而非创造性发挥。
        temperature: 0.2
      }
    });

    const raw = result.response.text();

    if (!raw) {
      throw new Error("Gemini returned an empty response");
    }

    // 执行二次结构校验与归一化。
    return parseChapterAnalysisResponse(raw);
  }
}
