/**
 * nameAuthority：canonical 唯一事实来源 + 泛称安全级别。
 *
 * 借鉴 AI-Reader-V2（name_authority.py）：
 * - 泛称/亲属通称/共享称谓绝不作 canonical 或 Union-Find 节点（防桥接无关实体簇）
 * - canonical 选取：最短 + 高频优先，昵称/称号降级
 *
 * 这是"什么算正确名字"的验收标准，属于 L3（模型拿不到的规范），代码写死。
 */

/** 硬屏蔽：泛称/共享称谓，绝不作 canonical / UF 节点。 */
const HARD_BLOCKED: ReadonlySet<string> = new Set([
  "老爷",
  "太太",
  "夫人",
  "大人",
  "相公",
  "公子",
  "小姐",
  "老太太",
  "母亲",
  "父亲",
  "哥哥",
  "兄弟",
  "先生",
  "和尚",
  "衙役",
  "家人",
  "丫鬟",
  "小厮",
  "百姓",
  "众人",
  "那人",
  "此人",
  "老者",
]);

/** 可疑：可能共享或指代不明，canonical 降级。 */
const SOFT_BLOCK_PATTERNS: RegExp[] = [/^[^·]{1}$/, /^老.{1,2}$/, /^.{1,2}氏$/];

/** 称谓/官职后缀（canonical 降级）：范老爷/周学道 是称号，非真名。 */
const TITLE_SUFFIXES = [
  "老爷", "大人", "先生", "夫人", "太太", "公子", "小姐", "相公", "老太太",
  "学士", "学道", "知县", "知府", "尚书", "侍郎", "员外", "举人", "秀才", "进士", "监生",
];

export type AliasSafetyLevel = 0 | 1 | 2;

/** 别名安全级别：0=硬屏蔽，1=可疑，2=安全。 */
export function aliasSafetyLevel(alias: string): AliasSafetyLevel {
  const trimmed = alias.trim();
  if (!trimmed || HARD_BLOCKED.has(trimmed)) return 0;
  if (SOFT_BLOCK_PATTERNS.some((re) => re.test(trimmed))) return 1;
  return 2;
}

/** 是否可作 canonical（安全级别 ≥1 且非硬屏蔽）。 */
export function isBlockedName(name: string): boolean {
  return aliasSafetyLevel(name) === 0;
}

/** 是否昵称/称号/表字（canonical 降级用）。 */
export function isNicknameOrTitle(name: string): boolean {
  const t = name.trim();
  if (t.length <= 1) return true;
  if (/^老.{1,2}$/.test(t)) return true; // 老张/老王
  if (/^.{1,2}氏$/.test(t)) return true; // 王氏
  return TITLE_SUFFIXES.some((s) => t.endsWith(s) && t.length > s.length); // 范老爷/周学道
}

/**
 * 从别名组中选取 canonical。
 * 规则：非屏蔽 + 最短优先；同长取出现频次高者；昵称/称号降级。
 */
export function pickCanonical(members: string[], freq: Map<string, number>): string {
  const candidates = members.filter((m) => !isBlockedName(m) && m.trim().length >= 2);
  if (candidates.length === 0) {
    return members.find((m) => !isBlockedName(m)) ?? members[0];
  }

  return candidates.sort((a, b) => {
    const aTitle = isNicknameOrTitle(a) ? 1 : 0;
    const bTitle = isNicknameOrTitle(b) ? 1 : 0;
    if (aTitle !== bTitle) return aTitle - bTitle; // 非称号优先
    const lenDiff = a.trim().length - b.trim().length;
    if (lenDiff !== 0) return lenDiff; // 最短优先
    return (freq.get(b) ?? 0) - (freq.get(a) ?? 0); // 高频优先
  })[0];
}

/** 泛称过滤：判断一个名字是否为垃圾泛称（safety level 0 或单字）。 */
export function isGenericJunk(name: string): boolean {
  return isBlockedName(name) || name.trim().length < 2;
}
