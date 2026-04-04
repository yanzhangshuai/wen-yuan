import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

interface CliArgs {
  schemaPath: string;
  inputPath : string;
  outputPath?: string;
}

interface ValidationIssue {
  line  : number;
  code  : string;
  detail: string;
}

interface GoldsetRecord {
  bookId       : string;
  chapterNo    : number;
  chapterTitle?: string;
  textLength?  : number;
  personas     : Array<{
    name    : string;
    aliases?: string[];
  }>;
  relationships: Array<{
    source: string;
    target: string;
    type  : string;
  }>;
}

const schemaMetaSchema = z.object({
  $id   : z.string().min(1),
  type  : z.literal("object"),
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

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function loadSchemaMeta(schemaPath: string) {
  const raw = await fs.readFile(schemaPath, "utf8");
  const parsedJson: unknown = JSON.parse(raw);
  const parsed = schemaMetaSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(`schema 文件格式无效: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }

  return parsed.data;
}

function validateRecord(record: GoldsetRecord, line: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
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

    if (!source || !target || !type) {
      issues.push({
        line,
        code  : "EVAL_GOLDSET_RELATION_EMPTY",
        detail: "relationships.source/target/type 不能为空"
      });
      continue;
    }

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

async function writeJson(targetPath: string, data: unknown) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

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

  const result = {
    startedAt,
    finishedAt: new Date().toISOString(),
    schemaId  : schema.$id,
    inputPath : args.inputPath,
    totalLines: lines.length,
    validLines: lines.length - new Set(issues.map((item) => item.line)).size,
    invalidLines: new Set(issues.map((item) => item.line)).size,
    success: issues.length === 0,
    code   : issues.length === 0 ? "EVAL_GOLDSET_VALID" : "EVAL_GOLDSET_VALIDATION_FAILED",
    issues
  };

  if (args.outputPath) {
    await writeJson(args.outputPath, result);
  }

  console.log(JSON.stringify(result, null, 2));

  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const output = {
    success: false,
    code   : "EVAL_GOLDSET_UNEXPECTED_ERROR",
    message
  };

  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
});
