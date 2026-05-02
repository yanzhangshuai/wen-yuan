/**
 * 文件定位：
 * - 关系（relationships）领域异常定义，属于服务端业务层共享错误模块。
 * - 该文件不直接处理 HTTP，但会被 Route Handler 捕获后转换成 4xx 响应。
 *
 * 业务价值：
 * - 通过语义化错误类型表达“关系不存在”“输入不合法”等可预期失败，提升接口可观测性与可维护性。
 */

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
    // 这里保留缺失 ID，便于上层日志与 API 错误详情直接关联到具体记录。
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
    // 输入错误一般可反馈给调用方，因此 message 采用可读文本并原样保留。
    super(message);
  }
}

export class RelationshipEventNotFoundError extends Error {
  readonly eventId: string;

  constructor(eventId: string) {
    super(`Relationship event not found: ${eventId}`);
    this.eventId = eventId;
  }
}
