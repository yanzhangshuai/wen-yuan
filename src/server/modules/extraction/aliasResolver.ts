/**
 * aliasResolver：Union-Find 别名合并。
 *
 * - 合并同一实体的别名组（来自 entities.aliases + aliases 表 + 提取新别名）
 * - canonical 取模型输出中最常见的形式（不重新判称谓——模型能力强，判断交给模型）
 * - 仅跳过纯指代/单字（isDeicticJunk 兜底），防无关实体被单字桥接
 *
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.3
 */
import { isDeicticJunk } from "./nameAuthority.ts";

/** 一个实体候选：已有 ID（可为空）+ 模型给出的 canonical + 别名集。 */
export interface AliasGroupCandidate {
  entityId  : string | null;
  /** 模型输出选定的 canonical（优先采用；组内多数决） */
  canonical?: string;
  aliases   : string[];
}

/**
 * Union-Find 别名合并。
 * canonical 选择：优先取组内模型提供的 canonical（多数决），否则取频次最高表面形式。
 */
export function mergeAliasGroups(groups: AliasGroupCandidate[]): Array<{
  entityIds: string[];
  canonical: string;
  aliases  : string[];
}> {
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

  // 注册别名到 UF（跳过纯指代/单字，防无关实体被桥接）
  for (let i = 0; i < groups.length; i++) {
    for (const alias of groups[i].aliases) {
      if (isDeicticJunk(alias)) continue;
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
  const mergedMap = new Map<number, { entityIds: string[]; aliasSet: Set<string>; freq: Map<string, number>; modelCanonicals: Map<string, number> }>();
  for (let i = 0; i < groups.length; i++) {
    const root = find(i);
    let entry = mergedMap.get(root);
    if (!entry) {
      entry = { entityIds: [], aliasSet: new Set(), freq: new Map(), modelCanonicals: new Map() };
      mergedMap.set(root, entry);
    }
    if (groups[i].entityId) entry.entityIds.push(groups[i].entityId!);
    if (groups[i].canonical) {
      const c = groups[i].canonical!.trim();
      if (c) entry.modelCanonicals.set(c, (entry.modelCanonicals.get(c) ?? 0) + 1);
    }
    for (const alias of groups[i].aliases) {
      const key = alias.trim();
      entry.aliasSet.add(key);
      entry.freq.set(key, (entry.freq.get(key) ?? 0) + 1);
    }
  }

  return Array.from(mergedMap.values()).map((entry) => {
    const members = Array.from(entry.aliasSet).filter((a) => !isDeicticJunk(a));

    // canonical：模型提供的 canonical 多数决优先
    let canonical = "";
    let maxVotes = 0;
    for (const [c, votes] of entry.modelCanonicals) {
      if (votes > maxVotes) {
        maxVotes = votes;
        canonical = c;
      }
    }
    // 回退：组内频次最高表面形式
    if (!canonical) {
      let maxFreq = -1;
      for (const m of members) {
        const f = entry.freq.get(m) ?? 0;
        if (f > maxFreq) {
          maxFreq = f;
          canonical = m;
        }
      }
    }

    return {
      entityIds: entry.entityIds,
      canonical: canonical || members[0] || "",
      aliases  : members
    };
  });
}
