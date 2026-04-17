/**
 * Book-type few-shot baseline 白名单校验 CLI。
 *
 * 用法：
 *   pnpm check:fewshot-whitelist
 *
 * 退出码：
 *   0 = 全部通过；非 0 = 发现违规（stdout 打印违规详情）。
 *
 * 校验对象：
 * - `BOOK_TYPE_EXAMPLE_BASELINES` 每一条的 exampleInput + exampleOutput；
 * - 复用 `validatePromptWhitelist`，与 Prompt baseline 校验使用同一规则集（§0-1）；
 * - slug 命名：`<bookTypeCode>:<stage>:<label>`，便于定位违规来源。
 */
import {
  formatWhitelistViolations,
  validatePromptWhitelist
} from "../src/lib/prompt-whitelist.ts";
import { BOOK_TYPE_EXAMPLE_BASELINES } from "../src/server/modules/knowledge/booktype-example-baselines.ts";

function main(): void {
  if (BOOK_TYPE_EXAMPLE_BASELINES.length === 0) {
    console.error("✖ BOOK_TYPE_EXAMPLE_BASELINES 为空，无法校验。");
    process.exit(1);
  }

  const candidates = BOOK_TYPE_EXAMPLE_BASELINES.map((baseline) => ({
    slug        : `${baseline.bookTypeCode}:${baseline.stage}:${baseline.label}`,
    systemPrompt: baseline.exampleInput,
    userPrompt  : baseline.exampleOutput
  }));

  const violations = validatePromptWhitelist(candidates);

  if (violations.length === 0) {
    console.log(
      `✓ Few-shot 白名单校验通过：已扫描 ${candidates.length} 条 baseline。`
    );
    return;
  }

  console.error(`✖ Few-shot 白名单命中 ${violations.length} 处违规：`);
  console.error(formatWhitelistViolations(violations));
  process.exit(1);
}

main();
