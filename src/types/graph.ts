/**
 * 图谱前端类型定义。
 * 复用后端 BookGraphSnapshot 结构，扩展 D3 力导向图所需字段。
 */

/** 关系情感极性。 */
export type RelationSentiment = "positive" | "negative" | "neutral";

/** 审核状态（前端只读展示用，与 Prisma ProcessingStatus 对齐）。 */
export type ProcessingStatus = "DRAFT" | "VERIFIED" | "REJECTED";

/** 图谱节点（后端返回结构）。 */
export interface GraphNode {
  id          : string;
  name        : string;
  nameType    : string;
  status      : ProcessingStatus;
  factionIndex: number;
  influence   : number;
  x?          : number;
  y?          : number;
}

/** 图谱边（后端返回结构）。 */
export interface GraphEdge {
  id       : string;
  source   : string;
  target   : string;
  type     : string;
  weight   : number;
  sentiment: RelationSentiment;
  status   : ProcessingStatus;
}

/** 图谱快照（后端返回顶层结构）。 */
export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** D3 力导向图节点（运行时扩展 x/y/vx/vy）。 */
export interface SimulationNode extends GraphNode {
  x  : number;
  y  : number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

/** D3 力导向图边（运行时 source/target 变为节点对象引用）。 */
export interface SimulationEdge {
  id       : string;
  source   : SimulationNode;
  target   : SimulationNode;
  type     : string;
  weight   : number;
  sentiment: RelationSentiment;
  status   : ProcessingStatus;
}

/** 人物详情面板用的时间轴事件。 */
export interface TimelineEvent {
  id          : string;
  bookId      : string;
  bookTitle   : string;
  chapterId   : string;
  chapterNo   : number;
  category    : string;
  title       : string | null;
  location    : string | null;
  event       : string;
  recordSource: string;
  status      : ProcessingStatus;
}

/** 人物详情面板用的关系项。 */
export interface PersonaRelation {
  id             : string;
  bookId         : string;
  bookTitle      : string;
  chapterId      : string;
  chapterNo      : number;
  direction      : "outgoing" | "incoming";
  counterpartId  : string;
  counterpartName: string;
  type           : string;
  weight         : number;
  evidence       : string | null;
  recordSource   : string;
  status         : ProcessingStatus;
}

/** 人物书内档案。 */
export interface PersonaProfile {
  profileId    : string;
  bookId       : string;
  bookTitle    : string;
  localName    : string;
  localSummary : string | null;
  officialTitle: string | null;
  localTags    : string[];
  ironyIndex   : number;
}

/** 人物详情快照（完整数据）。 */
export interface PersonaDetail {
  id           : string;
  name         : string;
  aliases      : string[];
  gender       : string | null;
  hometown     : string | null;
  nameType     : string;
  recordSource : string;
  confidence   : number;
  status       : ProcessingStatus;
  profiles     : PersonaProfile[];
  timeline     : TimelineEvent[];
  relationships: PersonaRelation[];
}

/** 路径查找结果。 */
export interface PathResult {
  bookId         : string;
  sourcePersonaId: string;
  targetPersonaId: string;
  found          : boolean;
  hopCount       : number;
  nodes          : { id: string; name: string }[];
  edges          : { id: string; source: string; target: string; type: string; weight: number; chapterId: string; chapterNo: number }[];
}

/** 图谱布局模式。 */
export type GraphLayoutMode = "force" | "radial" | "tree";

/** 图谱筛选条件。 */
export interface GraphFilter {
  relationTypes : string[];
  statuses      : ProcessingStatus[];
  factionIndices: number[];
  searchQuery   : string;
}
