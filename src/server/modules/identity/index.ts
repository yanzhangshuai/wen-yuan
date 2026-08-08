/**
 * 身份解析域（v6）模块入口。
 *
 * v6 架构：提取后身份 Pass（紧凑名单全局规范化）+ 确定性归并 + 登记表派生视图
 * + 身份判定原语（跨模型复核保留）+ 分布式冲突扫描。
 * 架构依据：docs/architecture/14-agent-architecture-v6.md
 */
export * from "./registry.ts";
export * from "./conflictScan.ts";
export * from "./primitive.ts";
export * from "./identityService.ts";
export * from "./identityPass.ts";
export * from "./projection.ts";
