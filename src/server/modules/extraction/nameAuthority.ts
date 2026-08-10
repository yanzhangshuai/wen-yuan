/**
 * nameAuthority（极简版）
 *
 * v5 原则：模型能力强，称谓/实体性/canonical 判断交给模型（读全章 + skill 语义知识）。
 * 代码不再预写泛称/称谓规则（棘轮法：eval 暴露真实失败后再针对性加，不预写）。
 *
 * 仅保留"纯指代"安全兜底——任何模型都不该把指代词/单字提为实体。
 * 这是验收兜底，不是领域知识（领域知识在 skill）。
 */
/** 缺省虚指代词集合（提取未显式传入名单时的兜底）。 */
export const DEFAULT_DEICTIC_JUNK: ReadonlySet<string> = new Set(["众人", "那人", "此人", "老者", "百姓", "人们"]);

/**
 * 是否纯指代/单字垃圾（不建实体）。
 * 极简兜底：单字、指代词。称谓/泛称的实体性判断交给模型。
 * @param junkList 虚指名单（装载上下文 GLOBAL skill 契约 deicticJunk）；缺省回退 DEFAULT_DEICTIC_JUNK。
 */
export function isDeicticJunk(name: string, junkList?: ReadonlySet<string>): boolean {
  const t = name.trim();
  if (!t) return true;
  if (t.length < 2) return true; // 单字不建实体
  const list = junkList ?? DEFAULT_DEICTIC_JUNK;
  return list.has(t);
}
