export interface BookSourceFileSnapshot {
  key : string | null;
  url : string | null;
  name: string | null;
  mime: string | null;
  size: number | null;
}

export const BOOK_STATUS_VALUES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "ERROR"
] as const;

export type BookStatus = (typeof BOOK_STATUS_VALUES)[number];

export function isBookStatus(value: string): value is BookStatus {
  return BOOK_STATUS_VALUES.includes(value as BookStatus);
}

export function normalizeBookStatus(value: string): BookStatus {
  return isBookStatus(value) ? value : "PENDING";
}

export interface CreateBookResponseData {
  id         : string;
  title      : string;
  author     : string | null;
  dynasty    : string | null;
  description: string | null;
  status     : BookStatus;
  sourceFile : BookSourceFileSnapshot;
}

export interface BookLibraryListItem {
  id              : string;
  title           : string;
  author          : string | null;
  dynasty         : string | null;
  coverUrl        : string | null;
  status          : BookStatus;
  chapterCount    : number;
  personaCount    : number;
  lastAnalyzedAt  : string | null;
  currentModelName: string | null;
  failureSummary  : string | null;
  parseProgress   : number;
  parseStage      : string | null;
  createdAt       : string;
  updatedAt       : string;
  sourceFile      : BookSourceFileSnapshot;
}
