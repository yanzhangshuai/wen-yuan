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

export interface PersonaPairRelationship {
  id                  : string;
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;
  relationshipType    : PersonaPairRelationshipType;
  recordSource        : RecordSource;
  status              : ProcessingStatus;
  chapterId           : string | null;
  chapterNo           : number | null;
  evidence            : string | null;
  summary             : string | null;
  attitudeTags        : string[];
}

export interface PersonaPairResponse {
  bookId       : string;
  aId          : string;
  bId          : string;
  personas     : PersonaPairPersona[];
  relationships: PersonaPairRelationship[];
}
