import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

/**
 * 文件定位（评估数据质检层）：
 * - 本脚本用于校验 goldset 数据质量，确保后续指标计算和门禁判定使用的是“结构正确 + 语义一致”的标注数据。
 * - 它是离线 CLI 工具，不参与 Next.js 路由运行时。
 *
 * 上游输入：
 * - goldset schema 文件（用于确认元信息与必要字段约束）。
 * - goldset JSONL 数据文件（每行一条章节标注记录）。
 *
 * 下游输出：
 * - 控制台 JSON 报告；
 * - 可选写入报告文件（供 CI/人工评审留档）。
 *
 * 关键业务规则（不是技术限制）：
 * - 同一章节号不得重复标注；
 * - 关系中的 source/target 必须能在 personas（含 alias）中解析到；
 * - 检测问题时尽量“继续扫描”并汇总全部问题，避免一次只报一个错误。
 */
interface CliArgs {
  // JSON Schema 路径，用于读取 schema id 等元信息并校验基础结构。
  schemaPath : string;
  // 待校验 goldset JSONL 路径。
  inputPath  : string;
  // 可选输出报告路径；未传则仅打印到 stdout。
  outputPath?: string;
}

interface ValidationIssue {
  // 问题所在行号（从 1 开始）。
  line  : number;
  // 机器可读错误码（用于 CI/告警分组）。
  code  : string;
  // 人类可读错误详情。
  detail: string;
}

interface GoldsetRecord {
  // 书籍 ID（用于和实验 bookId 对齐）。
  bookId       : string;
  // 章节号（业务唯一键之一）。
  chapterNo    : number;
  // 章节标题（可选）。
  chapterTitle?: string;
  // 文本长度（可选）。
  textLength?  : number;
  // 人物真值（名称 + 可选别名）。
  personas     : Array<{
    name    : string;
    aliases?: string[];
  }>;
  // 关系真值（source/target/type 三元组）。
  relationships: Array<{
    source: string;
    target: string;
    type  : string;
  }>;
}

const schemaMetaSchema = z.object({
  $id     : z.string().min(1),
  type    : z.literal("object"),
  required: z.array(z.string()).min(1)
}).passthrough();

const personaSchema = z.object({
  name   : z.string().min(1),
  aliases: z.array(z.string().min(1)).optional()
}).strict();

const relationshipSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type  : z.string().min(1)
}).strict();

const goldsetRecordSchema = z.object({
  bookId       : z.string().min(1),
  chapterNo    : z.number().int().min(1),
  chapterTitle : z.string().optional(),
  textLength   : z.number().int().min(0).optional(),
  personas     : z.array(personaSchema),
  relationships: z.array(relationshipSchema)
}).strict();

/**
 * 解析命令行参数。
 *
 * @param argv 原始 CLI 参数
 * @returns 校验任务所需参数
 */
function parseCliArgs(argv: string[]): CliArgs {
  const pairs = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数缺失: ${token}`);
    }

    pairs.set(token, value);
    index += 1;
  }

  const schemaPath = pairs.get("--schema");
  const inputPath = pairs.get("--input");
  const outputPath = pairs.get("--output");

  if (!schemaPath || !inputPath) {
    throw new Error("用法: pnpm ts-node scripts/eval/validate-goldset.ts --schema <schema.json> --input <goldset.jsonl> [--output <report.json>]");
  }

  return {
    schemaPath,
    inputPath,
    outputPath
  };
}

// 名称归一化：确保空格差异不会影响“同名/别名冲突”判断。
function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * 读取并校验 schema 元信息。
 *
 * @param schemaPath schema 文件路径
 * @returns 通过校验的 schema meta（至少包含 `$id`）
 */
async function loadSchemaMeta(schemaPath: string) {
  const raw = await fs.readFile(schemaPath, "utf8");
  const parsedJson: unknown = JSON.parse(raw);
  const parsed = schemaMetaSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(`schema 文件格式无效: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }

  return parsed.data;
}

/**
 * 语义级校验（超出 JSON Schema 的业务约束）。
 *
 * @param record 单条 goldset 记录
 * @param line 当前记录行号（用于错误定位）
 * @returns 当前记录的所有业务问题
 */
function validateRecord(record: GoldsetRecord, line: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // 记录“任意写法名字 -> 规范人物名”，用于 alias 冲突检测与关系引用校验。
  const personaMap = new Map<string, string>();

  for (const persona of record.personas) {
    const canonical = normalizeName(persona.name);
    if (!canonical) {
      issues.push({
        line,
        code  : "EVAL_GOLDSET_PERSONA_EMPTY",
        detail: "personas.name 不能为空字符串"
      });
      continue;
    }

    // 同一规范名重复定义会引发评估时多义性，必须禁止。
    if (personaMap.has(canonical)) {
      issues.push({
        line,
        code  : "EVAL_GOLDSET_PERSONA_DUPLICATED",
        detail: `人物重复定义: ${canonical}`
      });
      continue;
    }

    personaMap.set(canonical, canonical);

    for (const alias of persona.aliases ?? []) {
      const aliasName = normalizeName(alias);
      if (!aliasName) {
        issues.push({
          line,
          code  : "EVAL_GOLDSET_ALIAS_EMPTY",
          detail: `人物 ${canonical} 存在空 alias`
        });
        continue;
      }

      // alias 已被其他人物占用时视为冲突，会导致关系归属不确定。
      if (personaMap.has(aliasName) && personaMap.get(aliasName) !== canonical) {
        issues.push({
          line,
          code  : "EVAL_GOLDSET_ALIAS_CONFLICT",
          detail: `alias 冲突: ${aliasName}`
        });
        continue;
      }

      personaMap.set(aliasName, canonical);
    }
  }

  const relationKeySet = new Set<string>();
  for (const relation of record.relationships) {
    const source = normalizeName(relation.source);
    const target = normalizeName(relation.target);
    const type = normalizeName(relation.type);

    // 三元组任一字段为空，后续无法参与稳定匹配。
    if (!source || !target || !type) {
      issues.push({
        line,
        code  : "EVAL_GOLDSET_RELATION_EMPTY",
        detail: "relationships.source/target/type 不能为空"
      });
      continue;
    }

    // source/target 必须先在人物集合中声明，避免“悬挂关系”。
    if (!personaMap.has(source)) {
      issues.push({
        line,
        code  : "EVAL_GOLDSET_RELATION_SOURCE_UNKNOWN",
        detail: `关系 source 未在 personas 中声明: ${source}`
      });
    }

    if (!personaMap.has(target)) {
      issues.push({
        line,
        code  : "EVAL_GOLDSET_RELATION_TARGET_UNKNOWN",
        detail: `关系 target 未在 personas 中声明: ${target}`
      });
    }

    // 同章内完全相同的关系重复出现，属于标注冗余/错误。
    const key = `${source}::${target}::${type}`;
    if (relationKeySet.has(key)) {
      issues.push({
        line,
        code  : "EVAL_GOLDSET_RELATION_DUPLICATED",
        detail: `重复关系: ${key}`
      });
      continue;
    }

    relationKeySet.add(key);
  }

  return issues;
}

/**
 * 安全写入 JSON 报告。
 * - 先建目录，避免首次运行因目录不存在失败。
 */
async function writeJson(targetPath: string, data: unknown) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * 主流程：
 * 1. 读取 schema 与 goldset；
 * 2. 逐行做 JSON 解析、结构校验、业务语义校验；
 * 3. 汇总统计并输出结果。
 */
async function main() {
  const startedAt = new Date().toISOString();
  const args = parseCliArgs(process.argv.slice(2));
  const schema = await loadSchemaMeta(args.schemaPath);
  const rawInput = await fs.readFile(args.inputPath, "utf8");
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const issues: ValidationIssue[] = [];
  const chapterSet = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    let parsedLine: unknown;

    try {
      parsedLine = JSON.parse(lines[index]);
    } catch (error) {
      // 单行 JSON 解析失败时继续后续行，确保一次执行能暴露尽可能多的问题。
      issues.push({
        line  : lineNo,
        code  : "EVAL_GOLDSET_JSONL_PARSE_FAILED",
        detail: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    const recordResult = goldsetRecordSchema.safeParse(parsedLine);
    if (!recordResult.success) {
      const issue = recordResult.error.issues[0];
      issues.push({
        line  : lineNo,
        code  : "EVAL_GOLDSET_RECORD_INVALID",
        detail: issue?.message ?? "record 校验失败"
      });
      continue;
    }

    const record = recordResult.data;
    // chapterNo 按文件维度要求唯一，避免评估时同章节真值来源冲突。
    if (chapterSet.has(record.chapterNo)) {
      issues.push({
        line  : lineNo,
        code  : "EVAL_GOLDSET_CHAPTER_DUPLICATED",
        detail: `chapterNo 重复: ${record.chapterNo}`
      });
      continue;
    }

    chapterSet.add(record.chapterNo);
    issues.push(...validateRecord(record, lineNo));
  }

  // valid/invalid 按“行是否出现问题”统计，而非按问题条目数统计，更贴近数据修复视角。
  const result = {
    startedAt,
    finishedAt  : new Date().toISOString(),
    schemaId    : schema.$id,
    inputPath   : args.inputPath,
    totalLines  : lines.length,
    validLines  : lines.length - new Set(issues.map((item) => item.line)).size,
    invalidLines: new Set(issues.map((item) => item.line)).size,
    success     : issues.length === 0,
    code        : issues.length === 0 ? "EVAL_GOLDSET_VALID" : "EVAL_GOLDSET_VALIDATION_FAILED",
    issues
  };

  if (args.outputPath) {
    await writeJson(args.outputPath, result);
  }

  // 控制台固定输出 JSON，便于 CI 解析。
  console.log(JSON.stringify(result, null, 2));

  // 只要有问题即返回非 0，确保流水线能正确阻断。
  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  // 未捕获异常统一包装，避免上游拿到杂乱堆栈文本。
  const message = error instanceof Error ? error.message : String(error);
  const output = {
    success: false,
    code   : "EVAL_GOLDSET_UNEXPECTED_ERROR",
    message
  };

  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
});
