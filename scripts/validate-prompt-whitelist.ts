/**
 * Stage A/B/C Prompt baseline 白名单校验 CLI。
 *
 * 用法：
 *   pnpm check:prompt-whitelist
 *
 * 退出码：
 *   0 = 全部通过；非 0 = 发现违规（stdout 打印违规详情）。
 *
 * 仅校验 STAGE_A/B/C 三条 baseline（见 STAGE_BCD_PROMPT_SLUGS），避免误伤
 * twopass / sequential 历史管线的示例人物。
 */
import { STAGE_BCD_PROMPT_SLUGS } from "../src/lib/prompt-template-metadata.ts";
import {
  formatWhitelistViolations,
  validatePromptWhitelist
} from "../src/lib/prompt-whitelist.ts";
import { PROMPT_TEMPLATE_BASELINES } from "../src/server/modules/knowledge/prompt-template-baselines.ts";

function main(): void {
  const stageSet = new Set<string>(STAGE_BCD_PROMPT_SLUGS);
  const candidates = PROMPT_TEMPLATE_BASELINES
    .filter((baseline) => stageSet.has(baseline.slug))
    .map((baseline) => ({
      slug        : baseline.slug,
      systemPrompt: baseline.systemPrompt,
      userPrompt  : baseline.userPrompt
    }));

  if (candidates.length !== STAGE_BCD_PROMPT_SLUGS.length) {
    console.error(
      `✖ baseline 缺失：期望 ${STAGE_BCD_PROMPT_SLUGS.length} 条 Stage baseline，实际 ${candidates.length} 条`
    );
    process.exit(1);
  }

  const violations = validatePromptWhitelist(candidates);

  if (violations.length === 0) {
    console.log(
      `✓ 白名单校验通过：已扫描 ${candidates.length} 条 Stage baseline（${STAGE_BCD_PROMPT_SLUGS.join(", ")}）。`
    );
    return;
  }

  console.error(`✖ Prompt 白名单命中 ${violations.length} 处违规：`);
  console.error(formatWhitelistViolations(violations));
  process.exit(1);
}

main();
