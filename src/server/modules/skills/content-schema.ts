import { load as yamlLoad } from "js-yaml";
import { z } from "zod";

/**
 * =============================================================================
 * 文件定位（Skill 域：MD 文档元数据解析）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/skills/content-schema.ts`
 *
 * 模块职责：
 * - skill = MD 文档（frontmatter 仅元数据 + 正文为知识/指令全文，AI 直接阅读）；
 * - `parseSkillMetadata(md)` 仅解析 frontmatter 的装载元数据（name/description/relationshipCodes），
 *   用于装载过滤与契约读取；
 * - 正文（含可能的结构化段落）作为完整文档交由 AI 阅读，不做知识抽取/字典合并。
 *
 * 设计背景（2026-08 简化）：
 * - 社区标准 + "减法"趋势：技能即上下文，AI 自主阅读与应用；
 * - 已移除 kind/triggers/deicticJunk 等无运行时消费的元数据，frontmatter 只保留
 *   name/description（展示覆盖）与 relationshipCodes（提取护栏码表闭集数据源）。
 * =============================================================================
 */

/**
 * 关系码契约（关系码闭集进 skill frontmatter）。
 * direction 与 seed 教学码表一致：INVERSE=方向性（父子/师生/主仆），SYMMETRIC=对称（兄弟/夫妻）。
 */
export const relationshipCodeSchema = z.object({
  code     : z.string().min(1),
  direction: z.enum(["INVERSE", "SYMMETRIC"]),
  category : z.string(),
  aliases  : z.array(z.string()).default([])
});

/** frontmatter 元数据（装载/展示用，非知识内容）。 */
export const skillFrontmatterSchema = z.object({
  name             : z.string().optional(),
  description      : z.string().optional(),
  /** 关系码契约（relationship-type skill 携带；guardrail 从契约取码闭集）。 */
  relationshipCodes: z.array(relationshipCodeSchema).optional()
});

/** 解析后的 skill 元数据。 */
export interface SkillMetadata {
  name             : string | null;
  description      : string | null;
  /** 关系码契约列表（可选，契约未携带时为 null）。 */
  relationshipCodes: RelationshipCode[] | null;
}

export type RelationshipCode = z.infer<typeof relationshipCodeSchema>;

/** 可同步到 Skill DB 列的 frontmatter 字段（编辑保存时宽容读取）。 */
const editableSkillMetadataSchema = z.object({
  name       : z.string().min(1).optional(),
  description: z.string().optional(),
  scope      : z.enum(["GLOBAL", "BOOK_TYPE"]).optional()
});

/**
 * 功能：从 skill MD frontmatter 宽容提取可同步到 DB 列的字段（name/description/scope）。
 * 输入：skill MD 字符串。
 * 输出：出现过的可编辑字段；frontmatter 缺失或字段非法时返回空对象（不抛错）。
 * 设计说明：正文 MD 是内容源，DB 列仅作展示/过滤冗余；同步时"出现了才覆盖"，避免误清空。
 */
export function parseEditableSkillMetadata(md: string): {
  name?       : string;
  description?: string;
  scope?      : "GLOBAL" | "BOOK_TYPE";
} {
  const { frontmatter } = extractFrontmatter(md);
  if (frontmatter === null || frontmatter.trim().length === 0) {
    return {};
  }

  let frontmatterData: unknown;
  try {
    frontmatterData = yamlLoad(frontmatter);
  } catch {
    return {};
  }

  const parsed = editableSkillMetadataSchema.safeParse(frontmatterData);
  if (!parsed.success) {
    return {};
  }
  return parsed.data;
}

/** 装载候选（含全文 MD，供 AI 阅读）。 */
export interface SkillDocument {
  slug       : string;
  name       : string;
  description: string | null;
  metadata   : SkillMetadata;
  /** 完整 MD 文档（frontmatter + 正文），AI 阅读与装载。 */
  markdown   : string;
}

const FRONTMATTER_DELIMITER = "---";

/**
 * 提取 MD 文档的 YAML frontmatter。
 * 输出：`{ frontmatter: string | null; body: string }`。
 */
function extractFrontmatter(md: string): { frontmatter: string | null; body: string } {
  const trimmed = md.trimStart();
  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return { frontmatter: null, body: md.trim() };
  }

  const lines = trimmed.split("\n");
  let endIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === FRONTMATTER_DELIMITER) {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontmatter: null, body: md.trim() };
  }

  const frontmatter = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n").trim();
  return { frontmatter, body };
}

/**
 * 功能：解析 skill MD 的装载元数据（frontmatter）。
 * 输入：skill 的 MD 内容字符串。
 * 输出：SkillMetadata（name/description/relationshipCodes）。
 * 异常：frontmatter YAML 语法错误或字段非法时抛错。
 */
export function parseSkillMetadata(md: string): SkillMetadata {
  const { frontmatter } = extractFrontmatter(md);

  let frontmatterData: unknown = {};
  if (frontmatter !== null && frontmatter.trim().length > 0) {
    try {
      frontmatterData = yamlLoad(frontmatter);
    } catch (error) {
      throw new Error(`skill MD frontmatter YAML 解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const parsed = skillFrontmatterSchema.safeParse(frontmatterData);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`skill frontmatter 校验失败: ${issues}`);
  }

  return {
    name             : parsed.data.name ?? null,
    description      : parsed.data.description ?? null,
    relationshipCodes: parsed.data.relationshipCodes ?? null
  };
}
