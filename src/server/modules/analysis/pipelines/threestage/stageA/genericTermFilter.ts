/**
 * Stage A 后置过滤：剔除"无法成为 persona"的纯泛称 / 代词指代。
 *
 * 背景：在 LLM 偶尔放过的情况下，类似「儿、娘、母亲、他母亲、令叔祖、道士、虔婆、贵人、
 * 小厮、姐夫」这样的纯亲属称谓 / 角色泛称 / 代词指代会进入 Stage A 输出，
 * 经过 Stage B 候选分组后被推为独立 persona，造成审核工作台噪声（如儒林外史 4×母亲、
 * 5×道士）。
 *
 * 策略：仅在 `aliasType !== "NAMED"`（即未被 LLM 标记为专名）时启用过滤——
 * 1) 命中 {@link GENERIC_ROLE_TERMS} 的精确 surfaceForm；
 * 2) 以代词起头（他/她/我/你/咱/这/那/令）+ 称谓（母/父/兄/姐/弟/妹/叔/伯/姑/舅/姨/
 *    爷/奶/夫/妻/子/女/孙/姪/相公/老人家 等）。
 *
 * NAMED（专名）一律保留——避免误伤"道明""母老虎""老爷子"等真实人物名。
 */

import { type StageAMention } from "@/server/modules/analysis/pipelines/threestage/stageA/types";

/** 纯泛称（无专名前缀）。命中即过滤。 */
const GENERIC_ROLE_TERMS = new Set<string>([
  // 亲属称谓
  "母亲", "父亲", "儿", "女", "娘", "爹", "爷", "奶",
  "兄", "弟", "姐", "妹", "叔", "伯", "姑", "舅", "姨",
  "夫", "妻", "子", "孙", "姪",
  "母", "父",
  "儿子", "女儿", "孙子", "孙女", "侄子", "侄女",
  "姐夫", "妹夫", "嫂子", "弟妹", "姐姐", "妹妹", "哥哥", "弟弟",
  // 役使 / 身份称谓
  "夫人", "太太", "老爷", "老爷子", "相公", "公子", "小姐", "姑娘",
  "丫鬟", "丫头", "小厮", "小哥", "家人", "佣人", "下人", "婢女",
  "管家", "门房",
  // 出家 / 神秘人物
  "道士", "和尚", "尼姑", "僧人", "道姑", "法师",
  // 身份模糊
  "贵人", "虔婆", "媒人", "客人", "主人"
]);

/** 代词前缀（用于"他母亲""你相公""令叔祖"等结构）。 */
const PRONOUN_PREFIXES = ["他", "她", "我", "你", "咱", "这", "那", "令"];

/** 代词后可接的称谓尾词（含多字符复合称谓）。 */
const KIN_SUFFIX_RE = /(母亲|父亲|爹爹|娘亲|爷爷|奶奶|姐姐|妹妹|哥哥|弟弟|相公|公子|老人家|叔祖|姑奶奶|叔叔|伯伯|姑姑|舅舅|姨妈|嫂子|弟妹|姐夫|妹夫|姑爷|母|父|兄|弟|姐|妹|叔|伯|姑|舅|姨|爷|奶|夫|妻|子|女|孙|姪|家|奴|婢)$/;

/**
 * 判断单个 mention 是否应被过滤。
 *
 * @returns true 表示应过滤（不进 persona 表）。
 */
export function isGenericMention(mention: StageAMention): boolean {
  if (mention.aliasType === "NAMED") return false;

  const sf = mention.surfaceForm;
  if (sf.length === 0) return true;

  if (GENERIC_ROLE_TERMS.has(sf)) return true;

  if (sf.length >= 2 && PRONOUN_PREFIXES.includes(sf[0]) && KIN_SUFFIX_RE.test(sf)) {
    return true;
  }

  return false;
}

/**
 * 批量过滤 Stage A mentions。
 *
 * @returns `{ kept, dropped }` —— `dropped` 用于审计 / 日志统计。
 */
export function filterGenericMentions(
  mentions: readonly StageAMention[]
): { kept: StageAMention[]; dropped: StageAMention[] } {
  const kept    : StageAMention[] = [];
  const dropped : StageAMention[] = [];
  for (const m of mentions) {
    if (isGenericMention(m)) {
      dropped.push(m);
    } else {
      kept.push(m);
    }
  }
  return { kept, dropped };
}
