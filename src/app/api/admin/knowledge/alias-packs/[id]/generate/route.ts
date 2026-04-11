import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { generateEntries, reviewGenerateEntries } from "@/server/modules/knowledge";
import { createJob, getJob, updateJob } from "@/server/lib/knowledge-job-store";
import type { AliasPackGenerationReviewResult, AliasPackGenerationResult } from "@/server/modules/knowledge/generateEntries";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, generateEntriesSchema, uuidParamSchema } from "../../../_shared";

const PATH = "/api/admin/knowledge/alias-packs/[id]/generate";

/** GET ?jobId=<uuid> — 查询异步任务进度 */
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

    const job = getJob<AliasPackGenerationReviewResult | AliasPackGenerationResult>(jobId);
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
      code   : "ADMIN_ALIAS_PACK_GENERATION_JOB_STATUS",
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

/** POST — 提交异步生成任务，立即返回 jobId */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = uuidParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(PATH, requestId, startedAt, "知识包 ID 不合法");
    }

    const parsedBody = generateEntriesSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(PATH, requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求参数不合法");
    }

    const jobId = randomUUID();
    const isDryRun = parsedBody.data.dryRun;
    createJob(jobId);

    // 在后台异步执行，不阻塞本次 HTTP 响应
    void (async () => {
      updateJob(jobId, { status: "running", step: "正在连接模型，准备生成…" });
      try {
        const result = isDryRun
          ? await reviewGenerateEntries({
            packId                : parsedParams.data.id,
            targetCount           : parsedBody.data.targetCount,
            modelId               : parsedBody.data.modelId,
            bookId                : parsedBody.data.bookId,
            additionalInstructions: parsedBody.data.additionalInstructions
          })
          : await generateEntries({
            packId                : parsedParams.data.id,
            targetCount           : parsedBody.data.targetCount,
            modelId               : parsedBody.data.modelId,
            bookId                : parsedBody.data.bookId,
            additionalInstructions: parsedBody.data.additionalInstructions,
            operatorId            : auth.userId ?? undefined
          });

        updateJob(jobId, { status: "done", step: "生成完成", result });
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
      code   : isDryRun ? "ADMIN_ALIAS_PACK_GENERATION_REVIEW_JOB_SUBMITTED" : "ADMIN_ALIAS_PACK_GENERATION_JOB_SUBMITTED",
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
