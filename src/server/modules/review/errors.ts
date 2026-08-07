/**
 * review 域错误族（Pass4 例外审核流 + roleWorkbench 适配共用）。
 *
 * 替代已删除的 v4 biography/errors、personas/errors、relationships/errors——
 * 审核/角色工作台相关错误统一收敛到本文件。
 */
export class ReviewError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
  }
}

/** 输入校验错误（人工事件/合并建议等非法入参）。 */
export class ReviewInputError extends ReviewError {
  constructor(message: string) {
    super("REVIEW_INPUT_INVALID", message);
    this.name = "ReviewInputError";
  }
}

/** 资源不存在（事件/合并建议/实体等找不到）。 */
export class ReviewNotFoundError extends ReviewError {
  constructor(message: string) {
    super("REVIEW_NOT_FOUND", message);
    this.name = "ReviewNotFoundError";
  }
}

/** 实体合并冲突（合并源/目标不存在、自合并、状态不允许）。 */
export class EntityMergeConflictError extends ReviewError {
  constructor(message: string) {
    super("REVIEW_ENTITY_MERGE_CONFLICT", message);
    this.name = "EntityMergeConflictError";
  }
}
