/**
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
    this.personaId = personaId;
  }
}
