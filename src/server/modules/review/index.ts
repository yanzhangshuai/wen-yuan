/**
 * review 域模块出口（Pass4 例外审核流 + roleWorkbench 适配）。
 *
 * - 自动接受栈 / 人审队列 / 棘轮校准 / 关系级幻觉定向抽样 / 跨模型复核；
 * - 错误族（替代已删的 v4 biography/personas/relationships errors）。
 */
export { ReviewError, ReviewInputError, ReviewNotFoundError, EntityMergeConflictError } from "./errors";

export { acceptFactsForJob, type AcceptResult } from "./autoAccept";
