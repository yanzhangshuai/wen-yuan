import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { reviewGeneratedSurnames } from "@/server/modules/knowledge";
import { createJob, getJob, updateJob } from "@/server/lib/knowledge-job-store";
import type { SurnameGenerationReviewResult } from "@/server/modules/knowledge/generateSurnames";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, generateCatalogCandidatesSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/surnames/generate";

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

    const job = getJob<SurnameGenerationReviewResult>(jobId);
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
      code   : "ADMIN_SURNAME_GENERATION_JOB_STATUS",
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
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = generateCatalogCandidatesSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const jobId = randomUUID();
    createJob<SurnameGenerationReviewResult>(jobId);

    // 在后台异步执行，不阻塞本次 HTTP 响应
    void (async () => {
      updateJob(jobId, { status: "running", step: "正在连接模型，准备生成…" });
      try {
        const result = await reviewGeneratedSurnames(parsed.data);
        updateJob<SurnameGenerationReviewResult>(jobId, {
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
      code   : "ADMIN_SURNAME_GENERATION_JOB_SUBMITTED",
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
