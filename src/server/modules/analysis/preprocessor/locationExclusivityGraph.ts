/**
 * 文件定位（Stage 0 · 地点互斥图）：
 * - 提供"通用地名层级"互斥关系的常量查找表，供 Stage B.5（T13）
 *   做"同一 persona 同章节出现在两个互斥地点 → IMPERSONATION_CANDIDATE"判定。
 * - 契约源：§0-3(b) REV-2 跨地点并发冲突检测。
 *
 * 设计原则：
 * - 仅使用"通用地名层级"互斥对（城内/城外、南方/北方、京师/江南…），
 *   不纳入任何书中具名地点（如"状元府""贾府"），避免剧情侵入规则层。
 * - 邻接表以对称方式在 `buildAdjacency` 中一次性展开；对外只提供判定函数。
 * - 不做传递闭包：A↔B 且 B↔C 不推 A↔C，避免噪声扩散。
 * - 本模块是常量数据，不依赖 DB / LLM；便于被纯函数复用。
 */

// ── 互斥对定义 ───────────────────────────────────────────────────────────

/**
 * 通用地名互斥对（≥ 10 条）。
 * 每一对在下方邻接表中会被双向展开。
 */
export const MUTUAL_EXCLUSION_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["城内", "城外"],
  ["京师", "江南"],
  ["北方", "南方"],
  ["宫中", "民间"],
  ["山上", "山下"],
  ["关内", "关外"],
  ["朝中", "江湖"],
  ["京城", "乡下"],
  ["东京", "西京"],
  ["南京", "北京"],
  ["水上", "岸上"],
  ["江南", "塞北"]
] as const;

// ── 邻接表（模块加载时构建一次） ─────────────────────────────────────────

/**
 * 功能：把互斥对列表展开为对称邻接表 `Map<string, Set<string>>`。
 * 输入：互斥对数组（无序，允许重复定义；重复会被 Set 去重）。
 * 输出：双向邻接表。
 * 异常：无。
 * 副作用：无。
 */
function buildAdjacency(
  pairs: ReadonlyArray<readonly [string, string]>
): ReadonlyMap<string, ReadonlySet<string>> {
  const adj = new Map<string, Set<string>>();
  for (const [a, b] of pairs) {
    if (!adj.has(a)) adj.set(a, new Set<string>());
    if (!adj.has(b)) adj.set(b, new Set<string>());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  return adj;
}

const EXCLUSIVITY_ADJACENCY = buildAdjacency(MUTUAL_EXCLUSION_PAIRS);

// ── 对外 API ────────────────────────────────────────────────────────────

/**
 * 功能：判定两个地点是否属于定义好的互斥对。
 * 输入：任意两个地点字面（字符串）。
 * 输出：
 *   - 在互斥邻接表中直接成对 → `true`
 *   - 相同地点 / 未定义关系 → `false`
 *   - 本函数不做传递性推理（A↔B, B↔C 不推 A↔C）。
 * 异常：无。
 * 副作用：无。
 *
 * 注意事项：
 * - 输入按字面完全匹配；不做归一（如"京师"≠"京城"）。
 *   由上游（Stage B.5）负责在必要时对地名做同义归并后再调用。
 */
export function areMutuallyExclusive(locA: string, locB: string): boolean {
  if (!locA || !locB) return false;
  if (locA === locB) return false;
  const neighbors = EXCLUSIVITY_ADJACENCY.get(locA);
  if (!neighbors) return false;
  return neighbors.has(locB);
}
