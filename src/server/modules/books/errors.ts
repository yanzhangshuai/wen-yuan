export class BookNotFoundError extends Error {
  readonly bookId: string;

  constructor(bookId: string) {
    super(`Book not found: ${bookId}`);
    this.bookId = bookId;
  }
}

export class BookRawContentMissingError extends Error {
  readonly bookId: string;

  constructor(bookId: string) {
    super(`Book raw content is empty: ${bookId}`);
    this.bookId = bookId;
  }
}

export class AnalysisModelNotFoundError extends Error {
  readonly modelId: string;

  constructor(modelId: string) {
    super(`AI model not found: ${modelId}`);
    this.modelId = modelId;
  }
}

export class AnalysisModelDisabledError extends Error {
  readonly modelId: string;

  constructor(modelId: string) {
    super(`AI model is disabled: ${modelId}`);
    this.modelId = modelId;
  }
}

export class AnalysisScopeInvalidError extends Error {
  constructor(message: string) {
    super(message);
  }
}

