/**
 * 文件定位（人物模块领域错误定义）：
 * - 文件路径：`src/server/modules/personas/errors.ts`
 * - 所属层次：服务端领域模块错误层。
 *
 * 功能：表示指定人物不存在。
 * 输入：`personaId`（人物主键 ID）。
 * 输出：`PersonaNotFoundError` 错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class PersonaNotFoundError extends Error {
  /** 不存在的人物 ID。 */
  readonly personaId: string;

  /**
   * @param personaId 人物主键 ID。
   */
  constructor(personaId: string) {
    super(`Persona not found: ${personaId}`);
    // 保留结构化字段，便于上层 route handler 做精确错误分流（例如 404 响应）。
    this.personaId = personaId;
  }
}
