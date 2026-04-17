import type { BookTypeCode } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { BookTypeExampleStage } from "@/server/modules/knowledge/booktype-example-baselines";

/**
 * 文件定位（分析运行时 / Prompt 组装层）：
 * - 三阶段架构 Stage A/B/C Prompt baseline 内嵌 `{bookTypeFewShots}` 占位符；
 * - 运行时调用 `getFewShots(code, stage)`，返回该书籍类型 × 阶段下高优先级 few-shot 拼接字符串；
 * - 下游（resolvePromptTemplate 调用方）直接把返回串替换占位符。
 *
 * 设计要点：
 * 1. 纯读。从 `book_type_examples` 表按 (bookTypeCode, stage, active=true) 过滤，
 *    `ORDER BY priority DESC, createdAt ASC LIMIT FEW_SHOT_LIMIT` 取前 N 条；
 * 2. 模块级缓存。一次 Node 进程生命周期内按 key=`code|stage` 缓存 Promise<string>，
 *    避免每次 Stage 调用都敲库（契约 §0-F.3：few-shot 上限 5，数据几乎不变）；
 * 3. 不做副作用。未命中直接返回空字符串（下游 Prompt 自然无示例段，不会出错）。
 * 4. 测试友好。导出 `resetFewShotsCache()` 让单元测试隔离缓存。
 */

export const FEW_SHOT_LIMIT = 5;

const cache: Map<string, Promise<string>> = new Map();

function cacheKey(code: BookTypeCode, stage: BookTypeExampleStage): string {
  return `${code}|${stage}`;
}

/**
 * 把单条 example 按 OpenAI few-shot 风格格式化：
 *
 *   ### 示例 N：<label>
 *   输入：
 *   <exampleInput>
 *
 *   期望输出：
 *   <exampleOutput>
 */
export function formatFewShot(params: {
  index        : number;
  label        : string;
  exampleInput : string;
  exampleOutput: string;
}): string {
  return [
    `### 示例 ${params.index}：${params.label}`,
    "输入：",
    params.exampleInput,
    "",
    "期望输出：",
    params.exampleOutput
  ].join("\n");
}

async function loadFewShots(
  code : BookTypeCode,
  stage: BookTypeExampleStage
): Promise<string> {
  const rows = await prisma.bookTypeExample.findMany({
    where: {
      bookTypeCode: code,
      stage,
      active      : true
    },
    orderBy: [
      { priority: "desc" },
      { createdAt: "asc" }
    ],
    take: FEW_SHOT_LIMIT
  });

  if (rows.length === 0) return "";

  return rows
    .map((row, idx) =>
      formatFewShot({
        index        : idx + 1,
        label        : row.label,
        exampleInput : row.exampleInput,
        exampleOutput: row.exampleOutput
      })
    )
    .join("\n\n");
}

/**
 * 运行时查询 few-shot 字符串。
 *
 * @param code  BookTypeCode 枚举值（5 选一）
 * @param stage STAGE_A | STAGE_B | STAGE_C
 * @returns     已按 few-shot 格式拼接好的字符串；无记录时返回空串。
 *
 * 注意：返回 Promise<string>（跨异步 I/O），但对同一 (code, stage) 的并发调用只触发一次 DB 查询。
 */
export function getFewShots(
  code : BookTypeCode,
  stage: BookTypeExampleStage
): Promise<string> {
  const key = cacheKey(code, stage);
  const existing = cache.get(key);
  if (existing) return existing;

  const task = loadFewShots(code, stage).catch((err) => {
    // 失败时清除缓存，以便下次调用重试；但当前调用方仍收到 rejection。
    cache.delete(key);
    throw err;
  });
  cache.set(key, task);
  return task;
}

/** 单元测试专用：清空模块级缓存，避免用例间干扰。 */
export function resetFewShotsCache(): void {
  cache.clear();
}
