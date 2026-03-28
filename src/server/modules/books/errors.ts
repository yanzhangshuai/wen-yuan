/**
 * 功能：表示指定书籍不存在。
 * 输入：`bookId`（书籍主键 ID）。
 * 输出：`BookNotFoundError` 错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class BookNotFoundError extends Error {
  /** 不存在的书籍 ID。 */
  readonly bookId: string;

  /**
   * @param bookId 书籍主键 ID。
   */
  constructor(bookId: string) {
    super(`Book not found: ${bookId}`);
    this.bookId = bookId;
  }
}

/**
 * 功能：表示书籍源文件不存在（sourceFileKey 为空）。
 * 输入：`bookId`（书籍主键 ID）。
 * 输出：`BookSourceFileMissingError` 错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class BookSourceFileMissingError extends Error {
  /** 缺失源文件的书籍 ID。 */
  readonly bookId: string;

  /**
   * @param bookId 书籍主键 ID。
   */
  constructor(bookId: string) {
    super(`Book source file is missing: ${bookId}`);
    this.bookId = bookId;
  }
}

/**
 * 功能：表示书籍尚无可用章节数据。
 * 输入：`bookId`（书籍主键 ID）。
 * 输出：`BookRawContentMissingError` 错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class BookRawContentMissingError extends Error {
  /** 缺失章节数据的书籍 ID。 */
  readonly bookId: string;

  /**
   * @param bookId 书籍主键 ID。
   */
  constructor(bookId: string) {
    super(`Book chapters are empty: ${bookId}`);
    this.bookId = bookId;
  }
}

/**
 * 功能：表示解析模型不存在。
 * 输入：`modelId`（模型主键 ID）。
 * 输出：`AnalysisModelNotFoundError` 错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class AnalysisModelNotFoundError extends Error {
  /** 不存在的模型 ID。 */
  readonly modelId: string;

  /**
   * @param modelId 模型主键 ID。
   */
  constructor(modelId: string) {
    super(`AI model not found: ${modelId}`);
    this.modelId = modelId;
  }
}

/**
 * 功能：表示解析模型处于禁用状态。
 * 输入：`modelId`（模型主键 ID）。
 * 输出：`AnalysisModelDisabledError` 错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class AnalysisModelDisabledError extends Error {
  /** 被禁用的模型 ID。 */
  readonly modelId: string;

  /**
   * @param modelId 模型主键 ID。
   */
  constructor(modelId: string) {
    super(`AI model is disabled: ${modelId}`);
    this.modelId = modelId;
  }
}

/**
 * 功能：表示解析范围参数不合法。
 * 输入：`message`（可直接返回给调用方的错误信息）。
 * 输出：`AnalysisScopeInvalidError` 错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class AnalysisScopeInvalidError extends Error {
  /**
   * @param message 业务可读错误信息。
   */
  constructor(message: string) {
    super(message);
  }
}
