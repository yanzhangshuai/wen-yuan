import type { AnalysisProfileContext, ChapterAnalysisResponse } from "@/types/analysis";

/**
 * 功能：定义单个分段的 AI 分析输入参数。
 * 输入：无。
 * 输出：类型约束 AnalyzeChunkInput。
 * 异常：无。
 * 副作用：无。
 */
export interface AnalyzeChunkInput {
  bookTitle: string;
  chapterNo: number;
  chapterTitle: string;
  content: string;
  profiles: AnalysisProfileContext[];
  chunkIndex: number;
  chunkCount: number;
}

/**
 * 功能：定义 AI Provider 抽象接口。
 * 输入：AnalyzeChunkInput。
 * 输出：ChapterAnalysisResponse。
 * 异常：由具体实现决定。
 * 副作用：由具体实现决定。
 */
export interface AiAnalysisClient {
  analyzeChapterChunk(input: AnalyzeChunkInput): Promise<ChapterAnalysisResponse>;
}
