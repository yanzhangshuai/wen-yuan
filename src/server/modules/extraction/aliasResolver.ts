/**
 * aliasResolver：Union-Find 别名合并。
 *
 * - 合并同一实体的别名组（来自 entities.aliases + aliases 表 + 提取新别名）
 * - safety level 0 的泛称**不注册为 UF 节点**（防桥接无关实体簇）
 * - canonical 选择走 nameAuthority.pickCanonical
 *
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.3（name authority）
 */
import { aliasSafetyLevel, pickCanonical } from "./nameAuthority.ts";

/** 一个实体候选：已有 ID（可为空）+ 别名集 + 出现频次。 */
export interface AliasGroupCandidate {
  entityId: string | null;
  aliases: string[];
}

/**
 * Union-Find 别名合并。
 * @param groups 实体候选列表（每个含别名集）
 * @returns 合并后的组（每个组的实体 ID 集 + canonical + 全部别名）
 */
export function mergeAliasGroups(groups: AliasGroupCandidate[]): Array<{
  entityIds: string[];
  canonical: string;
  aliases: string[];
}> {
  // 归一化后的别名 → 组索引（UF 父）
  const parent = Array.from({ length: groups.length }, (_, i) => i);
  const aliasToGroup = new Map<string, number>();

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  // 注册安全别名到 UF
  for (let i = 0; i < groups.length; i++) {
    for (const alias of groups[i].aliases) {
      if (aliasSafetyLevel(alias) === 0) continue; // 泛称不注册节点
      const key = alias.trim();
      const existing = aliasToGroup.get(key);
      if (existing !== undefined) {
        union(existing, i);
      } else {
        aliasToGroup.set(key, i);
      }
    }
  }

  // 汇总合并组
  const mergedMap = new Map<number, { entityIds: string[]; aliasSet: Set<string>; freq: Map<string, number> }>();
  for (let i = 0; i < groups.length; i++) {
    const root = find(i);
    let entry = mergedMap.get(root);
    if (!entry) {
      entry = { entityIds: [], aliasSet: new Set(), freq: new Map() };
      mergedMap.set(root, entry);
    }
    if (groups[i].entityId) entry.entityIds.push(groups[i].entityId!);
    for (const alias of groups[i].aliases) {
      entry.aliasSet.add(alias.trim());
      entry.freq.set(alias.trim(), (entry.freq.get(alias.trim()) ?? 0) + 1);
    }
  }

  return Array.from(mergedMap.values()).map((entry) => ({
    entityIds: entry.entityIds,
    canonical: pickCanonical(Array.from(entry.aliasSet), entry.freq),
    aliases: Array.from(entry.aliasSet).filter((a) => aliasSafetyLevel(a) !== 0),
  }));
}
