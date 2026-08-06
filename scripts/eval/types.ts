/**
 * 提取结果契约（eval-gate 的输入）。
 *
 * 这是 v5-extraction（Pass1 分片提取）输出与 eval-gate 之间的接口定义：
 * 管线每章产出一个 ExtractionChapter，eval 与同章 goldset 对比算 F1。
 *
 * 与 goldset 结构对齐（canonical/aliases/typeCode/evidence），但提取结果
 * 不含证据字段（evidence 属于 facts 落库层，不进 F1 对比）。
 */

export interface ExtractedEntity {
  /** 实体标准名（提取器归一化后的名字） */
  canonical: string;
  /** PERSON | LOCATION | ORGANIZATION | CONCEPT */
  type: string;
  /** 同指代表面形式 */
  aliases?: string[];
}

export interface ExtractedRelation {
  /** 关系码，必须来自 relationship_types（全局 10 类 + 书型专属） */
  typeCode: string;
  sourceCanonical: string;
  targetCanonical: string;
}

export interface ExtractedBioFact {
  /** BIRTH | EXAM | CAREER | TRAVEL | SOCIAL | DEATH | EVENT */
  category: string;
  subjectCanonical: string;
  summary: string;
}

export interface ExtractionChapter {
  book: string;
  chapterNo: number;
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  bioFacts: ExtractedBioFact[];
}
