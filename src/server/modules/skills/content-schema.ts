import { dump as yamlDump, load as yamlLoad } from "js-yaml";
import { z } from "zod";

/**
 * =============================================================================
 * 文件定位（Skill 域：MD 文档元数据解析）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/skills/content-schema.ts`
 *
 * 模块职责：
 * - skill = MD 文档（frontmatter 仅元数据 + 正文为知识/指令全文，AI 直接阅读）；
 * - `parseSkillMetadata(md)` 仅解析 frontmatter 的装载元数据（kind/triggers/name/description），
 *   用于装载过滤与候选列表展示；
 * - 正文（含可能的结构化段落）作为完整文档交由 AI 阅读，不做知识抽取/字典合并。
 *
 * 设计背景（2026-08 简化）：
 * - 社区标准 + "减法"趋势：技能即上下文，AI 自主阅读与应用；
 * - 不再预建确定性字典/工具层；确定性检查只在 persist 落库时按需保留（防已实测失败）。
 * =============================================================================
 */

/** 触发条件：bookTypeKeys 空/["*"] = 全部书型；taskTypes 空 = 全部阶段。 */
export const skillTriggersSchema = z.object({
  bookTypeKeys: z.array(z.string().min(1)).optional(),
  taskTypes   : z.array(z.string().min(1)).optional(),
  priority    : z.number().int().min(0).default(0)
});

/** frontmatter 元数据（装载/展示用，非知识内容）。 */
export const skillFrontmatterSchema = z.object({
  kind        : z.string().min(1).default("HYBRID"),
  triggers    : skillTriggersSchema.default({ priority: 0 }),
  name        : z.string().optional(),
  description : z.string().optional()
});

/** 解析后的 skill 元数据。 */
export interface SkillMetadata {
  kind        : string;
  triggers    : SkillTriggers;
  name        : string | null;
  description : string | null;
}

/** 装载候选（含全文 MD，供 AI 阅读）。 */
export interface SkillDocument {
  slug      : string;
  name      : string;
  description: string | null;
  versionNo : number;
  metadata  : SkillMetadata;
  /** 完整 MD 文档（frontmatter + 正文），AI 阅读/load_skill 加载。 */
  markdown  : string;
}

export type SkillTriggers = z.infer<typeof skillTriggersSchema>;

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
 * 输出：SkillMetadata（kind/triggers/name/description）。
 * 异常：frontmatter YAML 语法错误或字段非法时抛错。
 */
export function parseSkillMetadata(md: string): SkillMetadata {
  const { frontmatter } = extractFrontmatter(md);

  let frontmatterData: unknown = {};
  if (frontmatter !== null && frontmatter.trim().length > 0) {
    try {
      frontmatterData = yamlLoad(frontmatter) as unknown;
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
    kind        : parsed.data.kind,
    triggers    : parsed.data.triggers,
    name        : parsed.data.name ?? null,
    description : parsed.data.description ?? null
  };
}

/**
 * 功能：序列化装载元数据为 frontmatter（供创建/生成 skill 时初始化）。
 * 输入：kind/triggers。
 * 输出：MD frontmatter 块（不含正文）。
 */
export function serializeSkillFrontmatter(input: { kind?: string; triggers?: SkillTriggers }): string {
  const frontmatter: Record<string, unknown> = {
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.triggers ? { triggers: input.triggers } : {})
  };

  const parts: string[] = [FRONTMATTER_DELIMITER];
  parts.push(yamlDump(frontmatter, { lineWidth: -1 }).trimEnd());
  parts.push(FRONTMATTER_DELIMITER);
  return parts.join("\n");
}
