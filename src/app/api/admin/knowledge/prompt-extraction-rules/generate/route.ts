import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { createJob, getJob, updateJob } from "@/server/lib/knowledge-job-store";
import { generatePromptExtractionRules } from "@/server/modules/knowledge";
import type { PromptExtractionGenerationResult } from "@/server/modules/knowledge/generatePromptExtractionRules";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, generatePromptRulesSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/prompt-extraction-rules/generate";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const jobId = new URL(request.url).searchParams.get("jobId");
    if (!jobId) {
      return badRequestJson(PATH, requestId, startedAt, "缺少 jobId 参数");
    }

    const job = getJob<PromptExtractionGenerationResult>(jobId);
    if (!job) {
      return failJson({
        path           : PATH,
        requestId,
        startedAt,
        error          : new Error("任务不存在或已过期"),
        fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
        fallbackMessage: "任务不存在或已过期"
      });
    }

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "ADMIN_PROMPT_RULE_GENERATION_JOB_STATUS",
      message: job.step,
      data   : {
        jobId : job.id,
        status: job.status,
        step  : job.step,
        result: job.result ?? null,
        error : job.error ?? null
      }
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "查询任务状态失败"
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = generatePromptRulesSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const jobId = randomUUID();
    createJob<PromptExtractionGenerationResult>(jobId);

    void (async () => {
      updateJob(jobId, { status: "running", step: "正在连接模型，准备生成…" });
      try {
        const result = await generatePromptExtractionRules(parsed.data);
        updateJob<PromptExtractionGenerationResult>(jobId, {
          status: "done",
          step  : "生成完成",
          result
        });
      } catch (err) {
        updateJob(jobId, {
          status: "error",
          step  : "生成失败",
          error : err instanceof Error ? err.message : String(err)
        });
      }
    })();

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "ADMIN_PROMPT_RULE_GENERATION_JOB_SUBMITTED",
      message: "生成任务已提交",
      data   : { jobId }
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "提交生成任务失败"
    });
  }
}
