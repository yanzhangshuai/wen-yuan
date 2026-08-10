/**
 * 提取域类型契约（v5-extraction）。
 *
 * 对齐 scripts/eval/types.ts 的 ExtractionChapter（eval 可对比 F1），
 * 但保留管线需要的额外信息（chapterNos、newEntityCandidates）。
 */
export type EntityTypeStr = "PERSON" | "LOCATION" | "ORGANIZATION" | "CONCEPT";

export interface ExtractedEntity {
  canonical: string;
  type     : EntityTypeStr;
  aliases? : string[];
}

export interface ExtractedRelation {
  typeCode       : string;
  sourceCanonical: string;
  targetCanonical: string;
  attitudeTags?  : string[];
  /** 原文证据（落库 facts.evidence 必填，护栏校验） */
  evidence?      : string;
}

export type BioFactCategory = "BIRTH" | "EXAM" | "CAREER" | "TRAVEL" | "SOCIAL" | "DEATH" | "EVENT";

export interface ExtractedBioFact {
  category        : BioFactCategory;
  subjectCanonical: string;
  summary         : string;
  location?       : string;
  /** 原文证据（落库 facts.evidence 必填，护栏校验） */
  evidence?       : string;
}

/** 单章提取输出（v7：逐章提取，chapterNo 由片章号决定）。 */
export interface ExtractionSlice {
  book      : string;
  chapterNos: number[];
  entities  : ExtractedEntity[];
  relations : ExtractedRelation[];
  bioFacts  : ExtractedBioFact[];
}
