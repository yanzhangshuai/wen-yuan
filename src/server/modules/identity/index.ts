/**
 * 身份解析域（Pass0 + 登记表）模块入口。
 *
 * v5 架构：双 tier 身份解析 + 登记表派生视图 + 身份判定原语 + 分布式冲突扫描 + reconcile。
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.3
 */
export * from "./registry.ts";
export * from "./conflictScan.ts";
export * from "./primitive.ts";
export * from "./identityService.ts";
export * from "./tier1.ts";
export * from "./tier2.ts";
export * from "./reconcile.ts";
