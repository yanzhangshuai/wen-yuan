/**
 * 功能：表示指定关系记录不存在。
 * 输入：`relationshipId`（关系主键 ID）。
 * 输出：`RelationshipNotFoundError` 错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class RelationshipNotFoundError extends Error {
  /** 丢失的关系主键 ID（UUID）。 */
  readonly relationshipId: string;

  /**
   * @param relationshipId 关系主键 ID。
   */
  constructor(relationshipId: string) {
    super(`Relationship not found: ${relationshipId}`);
    this.relationshipId = relationshipId;
  }
}

/**
 * 功能：表示关系业务输入不合法（如重复关系、空更新）。
 * 输入：`message`（业务可读错误信息）。
 * 输出：`RelationshipInputError` 错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class RelationshipInputError extends Error {
  /**
   * @param message 业务可读错误信息。
   */
  constructor(message: string) {
    super(message);
  }
}
