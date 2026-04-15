import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

/**
 * 知识库 API 路由族共享校验 Schema 与工具。
 */

export const uuidParamSchema = z.object({
  id: z.string().uuid("ID 不合法")
});

export const createBookTypeSchema = z.object({
  key         : z.string().trim().min(1, "key 不能为空"),
  name        : z.string().trim().min(1, "name 不能为空"),
  description : z.string().optional(),
  presetConfig: z.any().optional(),
  sortOrder   : z.number().int().optional()
});

export const updateBookTypeSchema = z.object({
  key         : z.string().trim().min(1, "key 不能为空").optional(),
  name        : z.string().trim().min(1, "name 不能为空").optional(),
  description : z.string().optional(),
  presetConfig: z.any().optional(),
  sortOrder   : z.number().int().optional(),
  isActive    : z.boolean().optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

export const createPackSchema = z.object({
  bookTypeId : z.string().uuid().optional(),
  name       : z.string().trim().min(1, "名称不能为空"),
  scope      : z.enum(["BOOK_TYPE", "BOOK"]),
  description: z.string().optional()
});

export const updatePackSchema = z.object({
  name       : z.string().trim().min(1).optional(),
  description: z.string().optional(),
  isActive   : z.boolean().optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

export const createEntrySchema = z.object({
  canonicalName: z.string().trim().min(1, "标准名不能为空"),
  aliases      : z.array(z.string().trim()).default([]),
  entryType    : z.enum(["CHARACTER", "LOCATION", "ORGANIZATION"]).default("CHARACTER"),
  notes        : z.string().optional()
});

export const updateEntrySchema = z.object({
  canonicalName: z.string().trim().min(1).optional(),
  aliases      : z.array(z.string().trim()).optional(),
  entryType    : z.enum(["CHARACTER", "LOCATION", "ORGANIZATION"]).optional(),
  notes        : z.string().nullable().optional(),
  confidence   : z.number().min(0).max(1).optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

export const batchVerifySchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "至少提供一个条目 ID")
});

export const batchRejectSchema = z.object({
  ids : z.array(z.string().uuid()).min(1, "至少提供一个条目 ID"),
  note: z.string().optional()
});

export const rejectSchema = z.object({
  note: z.string().optional()
});

export const importEntriesSchema = z.object({
  entries: z.array(z.object({
    canonicalName: z.string().trim().min(1),
    aliases      : z.array(z.string().trim()).default([]),
    entryType    : z.string().default("CHARACTER"),
    notes        : z.string().optional(),
    confidence   : z.number().min(0).max(1).optional()
  })).min(1, "至少提供一条条目"),
  reviewStatus: z.enum(["PENDING", "VERIFIED"]).default("PENDING"),
  source      : z.enum(["IMPORTED", "LLM_GENERATED"]).optional(),
  sourceDetail: z.string().trim().max(200).optional(),
  auditAction : z.enum(["IMPORT", "GENERATE"]).optional()
});

export const mountPackSchema = z.object({
  packId  : z.string().uuid("知识包 ID 不合法"),
  priority: z.number().int().default(0)
});

export function badRequestJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string,
  message = "请求参数不合法"
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(ERROR_CODES.COMMON_BAD_REQUEST, message, { type: "ValidationError", detail }, meta),
    400
  );
}

export function notFoundJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(ERROR_CODES.COMMON_NOT_FOUND, "资源不存在", { type: "NotFoundError", detail }, meta),
    404
  );
}

// ─── 姓氏 ──────────────────────────────────────────────
export const createSurnameSchema = z.object({
  surname    : z.string().trim().min(1, "姓氏不能为空"),
  isCompound : z.boolean().optional(),
  priority   : z.number().int().optional(),
  description: z.string().optional(),
  bookTypeId : z.string().uuid().optional(),
  source     : z.enum(["MANUAL", "LLM_SUGGESTED", "IMPORTED"]).optional()
});

export const updateSurnameSchema = z.object({
  priority   : z.number().int().optional(),
  description: z.string().optional(),
  bookTypeId : z.string().uuid().nullable().optional(),
  isActive   : z.boolean().optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

// ─── 泛化称谓 ──────────────────────────────────────────
export const createGenericTitleSchema = z.object({
  title         : z.string().trim().min(1, "称谓不能为空"),
  tier          : z.enum(["SAFETY", "DEFAULT"]).default("DEFAULT"),
  exemptInGenres: z.array(z.string().trim()).optional(),
  description   : z.string().optional(),
  source        : z.enum(["MANUAL", "LLM_SUGGESTED", "IMPORTED"]).optional()
});

export const updateGenericTitleSchema = z.object({
  tier          : z.enum(["SAFETY", "DEFAULT"]).optional(),
  exemptInGenres: z.array(z.string().trim()).nullable().optional(),
  description   : z.string().optional(),
  isActive      : z.boolean().optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

// ─── 提示词模板 ────────────────────────────────────────
export const createVersionSchema = z.object({
  systemPrompt: z.string().min(1, "系统提示词不能为空"),
  userPrompt  : z.string().min(1, "用户提示词不能为空"),
  genreKey    : z.string().optional(),
  changeNote  : z.string().optional(),
  isBaseline  : z.boolean().optional()
});

export const generateEntriesSchema = z.object({
  targetCount           : z.number().int().min(1).max(200).default(50),
  additionalInstructions: z.string().trim().max(2000).optional(),
  modelId               : z.string().uuid().optional(),
  bookId                : z.string().uuid().optional(),
  dryRun                : z.boolean().optional()
});

export const generateCatalogCandidatesSchema = z.object({
  targetCount           : z.number().int().min(1).max(200).default(30),
  additionalInstructions: z.string().trim().max(2000).optional(),
  modelId               : z.string().uuid().optional(),
  referenceBookTypeId   : z.string().uuid().optional()
});

// ─── NER 词典规则 ───────────────────────────────────────
export const createNerLexiconRuleSchema = z.object({
  ruleType  : z.enum(["HARD_BLOCK_SUFFIX", "SOFT_BLOCK_SUFFIX", "TITLE_STEM", "POSITION_STEM"]),
  content   : z.string().trim().min(1, "规则内容不能为空"),
  bookTypeId: z.string().uuid().optional(),
  sortOrder : z.number().int().optional(),
  changeNote: z.string().optional()
});

export const updateNerLexiconRuleSchema = z.object({
  content   : z.string().trim().min(1).optional(),
  bookTypeId: z.string().uuid().nullable().optional(),
  sortOrder : z.number().int().optional(),
  isActive  : z.boolean().optional(),
  changeNote: z.string().optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

export const reorderNerLexiconRulesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1)
});

// ─── Prompt 提取规则 ────────────────────────────────────
export const createPromptExtractionRuleSchema = z.object({
  ruleType  : z.enum(["ENTITY", "RELATIONSHIP"]).default("ENTITY"),
  content   : z.string().trim().min(1, "规则内容不能为空"),
  bookTypeId: z.string().uuid().optional(),
  sortOrder : z.number().int().optional(),
  changeNote: z.string().optional()
});

export const updatePromptExtractionRuleSchema = z.object({
  content   : z.string().trim().min(1).optional(),
  bookTypeId: z.string().uuid().nullable().optional(),
  sortOrder : z.number().int().optional(),
  isActive  : z.boolean().optional(),
  changeNote: z.string().optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

export const reorderPromptExtractionRulesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1)
});

export const previewPromptExtractionRulesSchema = z.object({
  ruleType  : z.enum(["ENTITY", "RELATIONSHIP"]),
  bookTypeId: z.string().uuid().optional()
});
