/**
 * =============================================================================
 * 文件定位（review 业务域 Barrel 聚合出口）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/review/index.ts`
 *
 * 在 Next.js 项目中的角色：
 * - 该文件不是路由文件，不参与 Next.js 的 page/layout/route 约定；
 * - 它属于前端“组件组织层（barrel）”，用于统一导出审核中心相关组件。
 *
 * 核心职责：
 * 1) 对外提供稳定的 import 入口，调用方可通过 `@/components/review` 一次性按需引入；
 * 2) 隐藏 review 目录内部文件结构，降低上游页面对目录细节的耦合；
 * 3) 在不改变业务逻辑的前提下，提升维护期可迁移性（内部文件重排时可只改此处）。
 *
 * 上游输入：
 * - 无运行时输入；这是纯编译期模块组织文件。
 *
 * 下游输出：
 * - 向 `app/admin/review/*` 页面及其它审核相关组件暴露统一导出符号。
 *
 * 维护注意：
 * - 这里的导出名称属于“外部契约”，改名会影响所有 import 方；
 * - 若新增 review 子组件，建议同步在此补充导出，保持团队调用习惯一致。
 * =============================================================================
 */

/** 人物 x 章节矩阵审核页入口：承接 T13 claim-first 审核工作台。 */
export { PersonaChapterReviewPage } from "./persona-chapter-matrix/persona-chapter-review-page";
/** 审核模式导航：在人物章节矩阵、人物关系与人物时间矩阵间切换。 */
export { ReviewModeNav } from "./shared/review-mode-nav";
/** 共享 claim 详情面板：统一展示证据、AI 依据、版本差异和审核记录。 */
export { ReviewClaimDetailPanel } from "./evidence-panel";
/** 人物草稿编辑表单：用于审核过程中修正人物字段。 */
export { PersonaEditForm } from "./persona-edit-form";
/** 传记事件编辑表单：用于修正类别、标题、地点、事件描述。 */
export { BiographyEditForm } from "./biography-edit-form";
/** 别名映射审核页签组件：处理同义名映射的通过/拒绝流程。 */
export { AliasReviewTab } from "./alias-review-tab";
/** 自检报告页签组件：展示并处理规则校验产生的待复核项。 */
export { ValidationReportTab } from "./validation-report-tab";
