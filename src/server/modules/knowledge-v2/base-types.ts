import { z } from "zod";

export const knowledgeScopeTypeSchema = z.enum(["GLOBAL", "BOOK_TYPE", "BOOK", "RUN"]);
export type KnowledgeScopeType = z.infer<typeof knowledgeScopeTypeSchema>;

export const knowledgeReviewStateSchema = z.enum(["PENDING", "VERIFIED", "REJECTED", "DISABLED"]);
export type KnowledgeReviewState = z.infer<typeof knowledgeReviewStateSchema>;

export const knowledgeSourceSchema = z.enum([
  "SYSTEM_PRESET",
  "MANUAL_ENTRY",
  "CLAIM_PROMOTION",
  "IMPORTED",
  "LEGACY_SEED"
]);
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

const trimmedNonEmptyString = z.string().trim().min(1);

export const knowledgeWindowBoundSchema = z.object({
  kind : z.enum(["CHAPTER_NO", "RELATIVE_PHASE", "TIME_HINT_ID", "FREEFORM"]),
  value: z.union([z.number().int().positive(), trimmedNonEmptyString]),
  label: trimmedNonEmptyString.nullable().default(null)
});
export type KnowledgeWindowBound = z.infer<typeof knowledgeWindowBoundSchema>;

export const knowledgeScopeSelectorSchema = z.object({
  scopeType: knowledgeScopeTypeSchema,
  scopeId  : trimmedNonEmptyString.nullable().default(null)
}).superRefine((value, ctx) => {
  if (value.scopeType === "GLOBAL" && value.scopeId !== null) {
    ctx.addIssue({
      code   : "custom",
      path   : ["scopeId"],
      message: "GLOBAL scope must not define scopeId"
    });
  }

  if (value.scopeType !== "GLOBAL" && value.scopeId === null) {
    ctx.addIssue({
      code   : "custom",
      path   : ["scopeId"],
      message: `${value.scopeType} scope requires scopeId`
    });
  }
});
export type KnowledgeScopeSelector = z.infer<typeof knowledgeScopeSelectorSchema>;

export const runtimeVisibilityModeSchema = z.enum(["VERIFIED_ONLY", "INCLUDE_PENDING"]);
export type RuntimeVisibilityMode = z.infer<typeof runtimeVisibilityModeSchema>;

/**
 * 运行时严格模式只消费 VERIFIED；审核台预览模式才额外暴露 PENDING 草稿。
 */
export function getRuntimeReviewStates(mode: RuntimeVisibilityMode): KnowledgeReviewState[] {
  return mode === "INCLUDE_PENDING"
    ? ["VERIFIED", "PENDING"]
    : ["VERIFIED"];
}
