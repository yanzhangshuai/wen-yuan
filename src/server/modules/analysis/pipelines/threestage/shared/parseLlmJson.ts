/**
 * 文件定位（三阶段管线 · LLM JSON 解析容错）：
 * - 服务端共享工具：统一 LLM 返回字符串到 JSON 对象的容错解析。
 * - 解决三阶段 Stage A/C 在生产中遇到的常见 LLM 输出畸形：
 *   1. 输出包裹 ```json ... ``` 代码栅栏（Qwen / Gemini / 部分兼容网关常见）；
 *   2. 输出末尾被 max_tokens 截断，导致最后一个 record 不完整；
 *   3. 输出夹带 BOM / 前导空白 / 尾部解释性文字。
 *
 * 设计原则：
 * - 只做"语法层"修复，不改变语义；解析后仍由调用方做 schema 校验与降级。
 * - 不抛错；返回 `null` 由调用方包装为各 Stage 自己的错误类型，保持错误链可读。
 */

/**
 * 移除 LLM 输出中的代码栅栏（``` 或 ```json）。
 * - 仅在字符串首尾各出现一次栅栏时剥离；中间含栅栏的字符串原样返回。
 */
export function stripCodeFence(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  // 允许 ```json / ```JSON / ``` 等多种前缀
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline === -1) return trimmed;

  const fenceLine = trimmed.slice(0, firstNewline).trim();
  if (!/^```[a-zA-Z]*$/.test(fenceLine)) return trimmed;

  const body = trimmed.slice(firstNewline + 1);
  const closeIdx = body.lastIndexOf("```");
  if (closeIdx === -1) return body.trim();
  return body.slice(0, closeIdx).trim();
}

/**
 * 尝试修复被 max_tokens 截断的 JSON 数组字面量。
 * - 仅当顶层是 `{ "records": [...]}` / `{ "mentions": [...] }` / `[...]` 形式时生效。
 * - 截断后剥离最后一条不完整 record（回退到最近一个完整 `}`），然后补齐括号。
 * - 仅做有限尝试，失败时返回 null 由调用方原样向上抛错。
 */
export function repairTruncatedJson(input: string): string | null {
  const text = input.trim();
  if (text.length === 0) return null;

  // 只处理 JSON 对象/数组开头
  if (text[0] !== "{" && text[0] !== "[") return null;

  // 找到最后一个完整 record 的结束位置（最近的 `}` 后是 `,` `]` `}` 或字符串末尾）。
  // 简单实现：从尾部找最后一个 `}` ，截断到那里，再追加合适的闭合符。
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace === -1) return null;
  const head = text.slice(0, lastBrace + 1);

  // 统计未闭合的 `[` 和 `{` 数量（粗略：忽略字符串内引号转义）
  let open = 0;
  let openArr = 0;
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < head.length; i += 1) {
    const ch = head[i];
    if (inStr) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") { inStr = true; continue; }
    if (ch === "{") open += 1;
    else if (ch === "}") open -= 1;
    else if (ch === "[") openArr += 1;
    else if (ch === "]") openArr -= 1;
  }

  if (open < 0 || openArr < 0) return null;

  let repaired = head;
  while (openArr > 0) { repaired += "]"; openArr -= 1; }
  while (open > 0) { repaired += "}"; open -= 1; }

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

/**
 * 容错 JSON 解析：
 * 1. 直接 `JSON.parse`；
 * 2. 失败 → 剥离代码栅栏后再 parse；
 * 3. 仍失败 → 尝试修复截断；
 * 4. 全部失败 → 返回 `null`，由调用方决定如何上抛。
 */
export function parseLlmJsonSafely(content: string): unknown {
  if (typeof content !== "string" || content.length === 0) return null;

  try {
    return JSON.parse(content);
  } catch {
    // continue
  }

  const stripped = stripCodeFence(content);
  if (stripped !== content.trim()) {
    try {
      return JSON.parse(stripped);
    } catch {
      // continue
    }
  }

  const repaired = repairTruncatedJson(stripped);
  if (repaired !== null) {
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }

  return null;
}
