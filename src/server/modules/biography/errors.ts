/**
 * 功能：表示“目标传记事件不存在”业务异常。
 * 输入：`biographyId: string`（缺失记录主键）。
 * 输出：标准 Error 对象（message + biographyId）。
 * 异常：由调用方抛出并在 Route 层映射为 404。
 * 副作用：无。
 */
export class BiographyRecordNotFoundError extends Error {
  /** 丢失的传记记录 ID。 */
  readonly biographyId: string;

  /**
   * @param biographyId 传记记录主键 ID（UUID 字符串）。
   */
  constructor(biographyId: string) {
    super(`Biography record not found: ${biographyId}`);
    this.biographyId = biographyId;
  }
}

/**
 * 功能：表示“传记输入参数不合法”业务异常。
 * 输入：`message: string`（可直接透传到前端的校验失败描述）。
 * 输出：标准 Error 对象（仅 message）。
 * 异常：由调用方抛出并在 Route 层映射为 400。
 * 副作用：无。
 */
export class BiographyInputError extends Error {
  /**
   * @param message 业务可读错误信息（string）。
   */
  constructor(message: string) {
    super(message);
  }
}
