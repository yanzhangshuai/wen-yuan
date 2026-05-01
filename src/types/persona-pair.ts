import type { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";

export type PersonaPairDirectionMode = "SYMMETRIC" | "INVERSE" | "DIRECTED";

export interface PersonaPairPersona {
  id         : string;
  name       : string;
  aliases    : string[];
  portraitUrl: string | null;
}

export interface PersonaPairRelationshipType {
  code         : string;
  name         : string;
  group        : string;
  directionMode: PersonaPairDirectionMode;
  inverseLabel : string | null;
}

export interface PersonaPairEvent {
  id          : string;
  chapterId   : string;
  chapterNo   : number;
  chapterTitle: string;
  sourceId    : string;
  targetId    : string;
  summary     : string;
  evidence    : string | null;
  attitudeTags: string[];
  paraIndex   : number | null;
  confidence  : number;
  recordSource: RecordSource;
  status      : ProcessingStatus;
}

export interface PersonaPairRelationship {
  id                  : string;
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;
  relationshipType    : PersonaPairRelationshipType;
  recordSource        : RecordSource;
  status              : ProcessingStatus;
  firstChapterNo      : number | null;
  lastChapterNo       : number | null;
  eventCount          : number;
  events              : PersonaPairEvent[];
}

export interface PersonaPairResponse {
  bookId       : string;
  aId          : string;
  bId          : string;
  personas     : PersonaPairPersona[];
  relationships: PersonaPairRelationship[];
}
