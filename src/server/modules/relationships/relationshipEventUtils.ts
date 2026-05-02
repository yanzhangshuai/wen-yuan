import { type ProcessingStatus, type RecordSource } from "@/generated/prisma/enums";

export interface RelationshipEventResult {
  id            : string;
  relationshipId: string;
  bookId        : string;
  chapterId     : string;
  chapterNo     : number;
  sourceId      : string;
  targetId      : string;
  summary       : string;
  evidence      : string | null;
  attitudeTags  : string[];
  paraIndex     : number | null;
  confidence    : number;
  recordSource  : RecordSource;
  status        : ProcessingStatus;
  createdAt     : string;
  updatedAt     : string;
}

export const RELATIONSHIP_EVENT_SELECT = {
  id            : true,
  relationshipId: true,
  bookId        : true,
  chapterId     : true,
  chapterNo     : true,
  sourceId      : true,
  targetId      : true,
  summary       : true,
  evidence      : true,
  attitudeTags  : true,
  paraIndex     : true,
  confidence    : true,
  recordSource  : true,
  status        : true,
  createdAt     : true,
  updatedAt     : true
} as const;

export function normalizeRelationshipEventTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawTag of tags ?? []) {
    const tag = rawTag.trim();
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }

  return normalized;
}

export function nullableTrim(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}

export function toRelationshipEventResult(row: {
  id            : string;
  relationshipId: string;
  bookId        : string;
  chapterId     : string;
  chapterNo     : number;
  sourceId      : string;
  targetId      : string;
  summary       : string;
  evidence      : string | null;
  attitudeTags  : string[];
  paraIndex     : number | null;
  confidence    : number;
  recordSource  : RecordSource;
  status        : ProcessingStatus;
  createdAt     : Date;
  updatedAt     : Date;
}): RelationshipEventResult {
  return {
    id            : row.id,
    relationshipId: row.relationshipId,
    bookId        : row.bookId,
    chapterId     : row.chapterId,
    chapterNo     : row.chapterNo,
    sourceId      : row.sourceId,
    targetId      : row.targetId,
    summary       : row.summary,
    evidence      : row.evidence,
    attitudeTags  : row.attitudeTags,
    paraIndex     : row.paraIndex,
    confidence    : row.confidence,
    recordSource  : row.recordSource,
    status        : row.status,
    createdAt     : row.createdAt.toISOString(),
    updatedAt     : row.updatedAt.toISOString()
  };
}
