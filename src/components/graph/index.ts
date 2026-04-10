/**
 * 文件定位（前端组件聚合层）：
 * - 这是 `components/graph` 子系统的 Barrel File（聚合导出文件）。
 * - 在 Next.js App Router 下，页面组件通常只从目录入口导入能力，这里承担“稳定导入面”职责。
 *
 * 业务意义：
 * - 对外暴露图谱子系统的稳定导入面，调用方只依赖 `@/components/graph`；
 * - 避免页面层直接感知每个子组件文件路径，降低重构时的改动面。
 *
 * 上下游关系：
 * - 上游：图谱域内的具体实现组件（力导图、工具栏、人物详情、章节时间线等）。
 * - 下游：viewer 页面、图谱页容器组件、交互面板等消费方。
 *
 * 维护提示：
 * - 新增图谱组件若希望被外部使用，应在此补充导出；
 * - 这里的导出名就是“公共契约”，随意改名会导致下游编译失败。
 */
export { ForceGraph } from "./force-graph";
export { GraphToolbar } from "./graph-toolbar";
export { PersonaDetailPanel } from "./persona-detail-panel";
export { ChapterTimeline } from "./chapter-timeline";
export { TextReaderPanel } from "./text-reader-panel";
export { GraphContextMenu } from "./graph-context-menu";
export { GraphPageHeader } from "./graph-page-header";
export { GraphLegend } from "./graph-legend";
