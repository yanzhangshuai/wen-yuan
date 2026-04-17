/**
 * 文件定位（跨层共享：解析架构类型）：
 * - 提供前端、路由层、服务层与 pipeline 层共用的 architecture 枚举值。
 * - 保持架构选择在 HTTP 协议、数据库持久化与运行时分发之间使用同一套字面量。
 */

/** 支持的解析架构枚举值。 */
export const ANALYSIS_ARCHITECTURE_VALUES = ["sequential", "threestage"] as const;

/** 解析架构类型。 */
export type AnalysisArchitecture = (typeof ANALYSIS_ARCHITECTURE_VALUES)[number];
