/**
 * 文件定位：
 * - 传记模块（biography）领域错误定义文件，位于服务端业务层。
 * - 负责把“可预期业务失败”与“系统异常”区分开，供 Route 层映射为合适 HTTP 状态码。
 *
 * 设计原因：
 * - 使用专用 Error 子类而非字符串判断，可让上层 `instanceof` 精准分支，降低误判风险。
 * - 这类错误名称和字段属于跨层契约，下游路由和前端错误提示可能依赖，不能随意改名。
 */

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
    // message 面向日志/排障，biographyId 字段面向程序化分支（如 404 回包构造）。
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
    // 保持 message 直通，目的是把上游校验失败原因无损传递给 API 层。
    super(message);
  }
}
