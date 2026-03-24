"use server";

import { revalidatePath } from "next/cache";

import { chapterAnalysisService } from "@/server/modules/analysis/services/ChapterAnalysisService";
import type { ChapterAnalysisResult } from "@/server/modules/analysis/services/ChapterAnalysisService";

export interface AnalysisActionState {
  ok     : boolean;
  message: string;
  result?: ChapterAnalysisResult;
}

/**
 * 功能：启动章节解析任务。
 * 输入：chapterId。
 * 输出：ChapterAnalysisResult。
 * 异常：chapterId 为空或服务层失败时抛错。
 * 副作用：触发 AI 解析、写库，并 revalidate /analyze 页面缓存。
 */
export async function startChapterAnalysis(chapterId: string): Promise<ChapterAnalysisResult> {
  if (!chapterId) {
    throw new Error("chapterId is required");
  }

  const result = await chapterAnalysisService.analyzeChapter(chapterId);
  revalidatePath("/analyze");
  return result;
}

/**
 * 功能：用于 useActionState 的章节解析 Action。
 * 输入：prevState、formData（需包含 chapterId）。
 * 输出：AnalysisActionState。
 * 异常：无（统一转为失败状态）。
 * 副作用：触发 startChapterAnalysis。
 */
export async function runChapterAnalysisAction(
  _prevState: AnalysisActionState,
  formData: FormData
): Promise<AnalysisActionState> {
  const chapterId = formData.get("chapterId");

  if (typeof chapterId !== "string" || !chapterId) {
    return {
      ok     : false,
      message: "缺少章节 ID，无法发起解析"
    };
  }

  try {
    const result = await startChapterAnalysis(chapterId);
    return {
      ok     : true,
      message: `完成：新增 ${result.created.biographies} 条生平，${result.created.mentions} 条提及，${result.created.relationships} 条关系。`,
      result
    };
  } catch (error) {
    return {
      ok     : false,
      message: error instanceof Error ? error.message : "解析失败"
    };
  }
}
