import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import {
  evidenceReviewRerunPlanner
} from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner";
import {
  EVIDENCE_REVIEW_KB_CHANGE_KIND_VALUES,
  EVIDENCE_REVIEW_RELATION_CATALOG_IMPACT_MODE_VALUES,
  type EvidenceReviewRerunChange
} from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/types";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { PROJECTION_FAMILY_VALUES } from "@/server/modules/review/evidence-review/projections/types";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../_shared";

const PATH = "/api/admin/review/rerun-plan";

const nonEmptyStringSchema = z.string().trim().min(1);
const projectionFamiliesSchema = z.array(z.enum(PROJECTION_FAMILY_VALUES)).min(1);

const projectionScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind              : z.literal("FULL_BOOK"),
    bookId            : nonEmptyStringSchema,
    projectionFamilies: projectionFamiliesSchema.optional()
  }),
  z.object({
    kind              : z.literal("CHAPTER"),
    bookId            : nonEmptyStringSchema,
    chapterId         : nonEmptyStringSchema,
    chapterNo         : z.number().int().positive().optional(),
    projectionFamilies: projectionFamiliesSchema.optional()
  }),
  z.object({
    kind              : z.literal("PERSONA"),
    bookId            : nonEmptyStringSchema,
    personaId         : nonEmptyStringSchema,
    projectionFamilies: projectionFamiliesSchema.optional()
  }),
  z.object({
    kind              : z.literal("TIME_SLICE"),
    bookId            : nonEmptyStringSchema,
    timeLabel         : nonEmptyStringSchema,
    projectionFamilies: projectionFamiliesSchema.optional()
  }),
  z.object({
    kind              : z.literal("RELATION_EDGE"),
    bookId            : nonEmptyStringSchema,
    sourcePersonaId   : nonEmptyStringSchema,
    targetPersonaId   : nonEmptyStringSchema,
    relationTypeKey   : nonEmptyStringSchema.optional(),
    projectionFamilies: projectionFamiliesSchema.optional()
  }),
  z.object({
    kind              : z.literal("PROJECTION_ONLY"),
    bookId            : nonEmptyStringSchema,
    projectionFamilies: projectionFamiliesSchema
  })
]);

const rerunChangeSchema: z.ZodType<EvidenceReviewRerunChange> = z.discriminatedUnion("changeKind", [
  z.object({
    changeKind        : z.literal("REVIEW_MUTATION"),
    bookId            : nonEmptyStringSchema,
    reason            : nonEmptyStringSchema,
    runId             : nonEmptyStringSchema.nullish(),
    claimFamilies     : z.array(nonEmptyStringSchema).min(1).optional(),
    projectionScopes  : z.array(projectionScopeSchema).min(1),
    projectionFamilies: projectionFamiliesSchema.optional()
  }),
  z.object({
    changeKind   : z.literal("CHAPTER_TEXT_CHANGE"),
    bookId       : nonEmptyStringSchema,
    reason       : nonEmptyStringSchema,
    previousRunId: nonEmptyStringSchema.nullish(),
    chapterIds   : z.array(nonEmptyStringSchema).min(1),
    segmentIds   : z.array(nonEmptyStringSchema).min(1).optional()
  }),
  z.object({
    changeKind      : z.literal("KNOWLEDGE_BASE_CHANGE"),
    bookId          : nonEmptyStringSchema,
    reason          : nonEmptyStringSchema,
    previousRunId   : nonEmptyStringSchema.nullish(),
    kbChangeKinds   : z.array(z.enum(EVIDENCE_REVIEW_KB_CHANGE_KIND_VALUES)).min(1),
    affectedEntryIds: z.array(nonEmptyStringSchema).min(1)
  }),
  z.object({
    changeKind      : z.literal("RELATION_CATALOG_CHANGE"),
    bookId          : nonEmptyStringSchema,
    reason          : nonEmptyStringSchema,
    previousRunId   : nonEmptyStringSchema.nullish(),
    relationTypeKeys: z.array(nonEmptyStringSchema).min(1),
    impactMode      : z.enum(EVIDENCE_REVIEW_RELATION_CATALOG_IMPACT_MODE_VALUES)
  })
]);

/**
 * POST `/api/admin/review/rerun-plan`
 * 功能：预览 evidence review 增量重跑计划，供审核控制面先看影响范围与预计阶段。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedBody = rerunChangeSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await evidenceReviewRerunPlanner.planChange(parsedBody.data);

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "REVIEW_RERUN_PLAN_PREVIEWED",
      message: "审核重跑计划预览成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "审核重跑计划预览失败"
    });
  }
}
