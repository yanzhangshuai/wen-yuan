/**
 * goldset 标注文件校验器。
 *
 * 结构：每章一个 JSON 文件 { book, chapterNo, entities[], relations[], bioFacts[] }。
 * 校验两关：
 *   1. zod 结构校验（类型/必填/枚举）
 *   2. 交叉校验（relation / bioFact 引用的 canonical 必须存在于 entities）
 *
 * 标注规范见同目录 标注规范.md。
 */
import { z } from "zod";

export const EntityTypeEnum = z.enum(["PERSON", "LOCATION", "ORGANIZATION", "CONCEPT"]);
export const NameTypeEnum = z.enum(["NAMED", "TITLE_ONLY"]);
export const FactCategoryEnum = z.enum(["BIRTH", "EXAM", "CAREER", "TRAVEL", "SOCIAL", "DEATH", "EVENT"]);

export const GoldsetEntity = z.object({
  canonical: z.string().min(1),
  type: EntityTypeEnum,
  nameType: NameTypeEnum.default("NAMED"),
  aliases: z.array(z.string()).default([]),
  firstAppearancePara: z.number().int().positive(),
  activeChapters: z.array(z.number().int().positive()).default([]),
  note: z.string().optional(),
});

export const GoldsetRelation = z.object({
  typeCode: z.string().min(1),
  sourceCanonical: z.string().min(1),
  targetCanonical: z.string().min(1),
  evidence: z.string().min(1),
  chapterNo: z.number().int().positive(),
  paraIndex: z.number().int().positive().optional(),
});

export const GoldsetBioFact = z.object({
  category: FactCategoryEnum,
  subjectCanonical: z.string().min(1),
  summary: z.string().min(1),
  evidence: z.string().min(1),
  chapterNo: z.number().int().positive(),
  paraIndex: z.number().int().positive().optional(),
});

export const GoldsetFile = z.object({
  book: z.string().min(1),
  chapterNo: z.number().int().positive(),
  entities: z.array(GoldsetEntity),
  relations: z.array(GoldsetRelation).default([]),
  bioFacts: z.array(GoldsetBioFact).default([]),
});

export type GoldsetFileType = z.infer<typeof GoldsetFile>;
export type GoldsetEntityType = z.infer<typeof GoldsetEntity>;

/**
 * 校验一份 goldset 数据（对象）。
 * 返回 { ok, data } 或 { ok: false, errors }。
 */
export function validateGoldset(data: unknown): { ok: true; data: GoldsetFileType } | { ok: false; errors: unknown[] } {
  const result = GoldsetFile.safeParse(data);
  if (!result.success) {
    return { ok: false, errors: result.error.issues };
  }

  // 交叉校验：relation/bioFact 引用的 canonical 必须存在
  const canonicals = new Set(result.data.entities.map((e) => e.canonical));
  const dangling: string[] = [];
  for (const r of result.data.relations) {
    if (!canonicals.has(r.sourceCanonical)) dangling.push(`relation.source:${r.sourceCanonical}`);
    if (!canonicals.has(r.targetCanonical)) dangling.push(`relation.target:${r.targetCanonical}`);
  }
  for (const b of result.data.bioFacts) {
    if (!canonicals.has(b.subjectCanonical)) dangling.push(`bioFact.subject:${b.subjectCanonical}`);
  }
  if (dangling.length > 0) {
    return { ok: false, errors: [{ message: `悬空 canonical 引用: ${dangling.join(", ")}` }] };
  }

  return { ok: true, data: result.data };
}

/**
 * 校验一个 goldset 文件（路径），并解析 JSON。
 */
export async function validateGoldsetFile(path: string) {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(path, "utf-8");
  return validateGoldset(JSON.parse(raw));
}
