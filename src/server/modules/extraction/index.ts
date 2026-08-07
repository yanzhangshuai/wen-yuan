/**
 * 事实提取域（Pass1-3）模块入口。
 *
 * v5 架构：Pass1 分片单轮提取 + Pass2 确定性护栏 + Pass3 确定性聚合。
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.2
 */
export * from "./types.ts";
export * from "./slices.ts";
export * from "./schema.ts";
export * from "./nameAuthority.ts";
export * from "./aliasResolver.ts";
export * from "./guardrails.ts";
export * from "./prompts.ts";
export * from "./extractor.ts";
export * from "./aggregator.ts";
