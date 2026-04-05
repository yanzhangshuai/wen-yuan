/**
 * ============================================================================
 * 文件定位：`src/types/graph.ts`
 * ----------------------------------------------------------------------------
 * 本文件是图谱域的“跨层共享类型定义层”（TypeScript contract layer）。
 *
 * 在 Next.js 应用中的职责：
 * - 为 Client Component（如 `GraphView/ForceGraph`）提供静态类型契约；
 * - 与服务层 `src/lib/services/graph.ts`、后端模块 `getBookGraph/findPersonaPath/getPersonaById`
 *   形成前后端数据结构对齐；
 * - 把“后端原始字段”与“前端运行态扩展字段（D3 simulation）”明确区分。
 *
 * 维护边界（业务规则，不是技术限制）：
 * - 这里的字段命名代表前后端协作契约，改名会影响 API 消费与组件渲染；
 * - `Simulation*` 类型属于运行时增强类型，不应直接回传到后端写接口。
 * ============================================================================
 */

/** 关系情感极性：用于前端边颜色/样式映射。 */
export type RelationSentiment = "positive" | "negative" | "neutral";

/**
 * 审核状态（只读展示值）。
 * 与后端 Prisma `ProcessingStatus` 对齐，属于业务流程状态，不建议前端自行扩展新值。
 */
export type ProcessingStatus = "DRAFT" | "VERIFIED" | "REJECTED";

/** 图谱节点（后端快照节点，前端渲染输入）。 */
export interface GraphNode {
  /** 人物 ID（节点主键）。 */
  id          : string;
  /** 人物展示名。 */
  name        : string;
  /** 姓名类型（如 NAMED/TITLE_ONLY），用于节点样式区分。 */
  nameType    : string;
  /** 审核状态。 */
  status      : ProcessingStatus;
  /** 派系颜色索引，前端可据此生成稳定配色。 */
  factionIndex: number;
  /** 影响力分值（关系强度聚合结果）。 */
  influence   : number;
  /** 可选 X 坐标（布局持久化时存在）。 */
  x?          : number;
  /** 可选 Y 坐标（布局持久化时存在）。 */
  y?          : number;
}

/** 图谱边（后端快照关系边）。 */
export interface GraphEdge {
  /** 关系 ID。 */
  id       : string;
  /** 起点节点 ID。 */
  source   : string;
  /** 终点节点 ID。 */
  target   : string;
  /** 关系类型（如“同僚”“敌对”）。 */
  type     : string;
  /** 关系权重。 */
  weight   : number;
  /** 情感极性（影响颜色语义）。 */
  sentiment: RelationSentiment;
  /** 审核状态。 */
  status   : ProcessingStatus;
}

/** 图谱快照（图谱接口顶层 payload）。 */
export interface GraphSnapshot {
  /** 节点集合。 */
  nodes: GraphNode[];
  /** 边集合。 */
  edges: GraphEdge[];
}

/**
 * D3 力导向运行态节点。
 * 在 `GraphNode` 基础上增加 simulation 计算字段，仅前端运行时使用。
 */
export interface SimulationNode extends GraphNode {
  /** 当前 x 坐标（由 simulation 动态更新）。 */
  x  : number;
  /** 当前 y 坐标（由 simulation 动态更新）。 */
  y  : number;
  /** x 方向速度。 */
  vx?: number;
  /** y 方向速度。 */
  vy?: number;
  /** 固定锚点 x（拖拽时可能设置）。 */
  fx?: number | null;
  /** 固定锚点 y（拖拽时可能设置）。 */
  fy?: number | null;
}

/**
 * D3 力导向运行态边。
 * 注意 `source/target` 从 ID 变为节点对象引用，这是 D3 link force 的数据要求。
 */
export interface SimulationEdge {
  /** 关系 ID。 */
  id       : string;
  /** 起点节点对象引用。 */
  source   : SimulationNode;
  /** 终点节点对象引用。 */
  target   : SimulationNode;
  /** 关系类型。 */
  type     : string;
  /** 权重。 */
  weight   : number;
  /** 情感极性。 */
  sentiment: RelationSentiment;
  /** 审核状态。 */
  status   : ProcessingStatus;
}

/** 人物详情面板时间轴事件。 */
export interface TimelineEvent {
  /** 事件 ID。 */
  id          : string;
  /** 事件所属书籍 ID。 */
  bookId      : string;
  /** 事件所属书名。 */
  bookTitle   : string;
  /** 事件发生章节 ID。 */
  chapterId   : string;
  /** 章节序号。 */
  chapterNo   : number;
  /** 事件类别。 */
  category    : string;
  /** 事件标题，可为空。 */
  title       : string | null;
  /** 事件地点，可为空。 */
  location    : string | null;
  /** 事件正文。 */
  event       : string;
  /** 记录来源（AI/MANUAL）。 */
  recordSource: string;
  /** 审核状态。 */
  status      : ProcessingStatus;
}

/** 人物详情面板关系项。 */
export interface PersonaRelation {
  /** 关系 ID。 */
  id             : string;
  /** 关系所属书籍 ID。 */
  bookId         : string;
  /** 关系所属书名。 */
  bookTitle      : string;
  /** 关系章节 ID。 */
  chapterId      : string;
  /** 关系章节序号。 */
  chapterNo      : number;
  /** 相对当前人物方向（出边/入边）。 */
  direction      : "outgoing" | "incoming";
  /** 对端人物 ID。 */
  counterpartId  : string;
  /** 对端人物名。 */
  counterpartName: string;
  /** 关系类型。 */
  type           : string;
  /** 关系权重。 */
  weight         : number;
  /** 证据文本，可为空。 */
  evidence       : string | null;
  /** 记录来源。 */
  recordSource   : string;
  /** 审核状态。 */
  status         : ProcessingStatus;
}

/** 人物在单书内的档案信息。 */
export interface PersonaProfile {
  /** 档案 ID。 */
  profileId    : string;
  /** 所属书籍 ID。 */
  bookId       : string;
  /** 所属书名。 */
  bookTitle    : string;
  /** 书内称谓。 */
  localName    : string;
  /** 书内摘要，可为空。 */
  localSummary : string | null;
  /** 官职/头衔，可为空。 */
  officialTitle: string | null;
  /** 书内标签。 */
  localTags    : string[];
  /** 书内讽刺指数。 */
  ironyIndex   : number;
}

/** 人物详情快照（完整侧栏数据）。 */
export interface PersonaDetail {
  /** 人物 ID。 */
  id           : string;
  /** 标准名。 */
  name         : string;
  /** 别名数组。 */
  aliases      : string[];
  /** 性别。 */
  gender       : string | null;
  /** 籍贯。 */
  hometown     : string | null;
  /** 姓名类型。 */
  nameType     : string;
  /** 数据来源。 */
  recordSource : string;
  /** 置信度（0~1）。 */
  confidence   : number;
  /** 审核状态。 */
  status       : ProcessingStatus;
  /** 各书档案列表。 */
  profiles     : PersonaProfile[];
  /** 时间轴列表。 */
  timeline     : TimelineEvent[];
  /** 关系列表。 */
  relationships: PersonaRelation[];
}

/** 两人物最短路径查询结果。 */
export interface PathResult {
  /** 书籍域 ID。 */
  bookId         : string;
  /** 起点人物 ID。 */
  sourcePersonaId: string;
  /** 终点人物 ID。 */
  targetPersonaId: string;
  /** 是否找到可达路径。 */
  found          : boolean;
  /** 跳数（路径边数量）。 */
  hopCount       : number;
  /** 路径节点序列。 */
  nodes          : { id: string; name: string }[];
  /** 路径边序列。 */
  edges          : { id: string; source: string; target: string; type: string; weight: number; chapterId: string; chapterNo: number }[];
}

/** 图谱布局模式。 */
export type GraphLayoutMode = "force" | "radial" | "tree";

/**
 * 图谱筛选条件。
 * 属于前端交互状态，不直接等同后端查询参数；通常由前端本地过滤节点/边。
 */
export interface GraphFilter {
  /** 允许显示的关系类型集合。 */
  relationTypes : string[];
  /** 允许显示的审核状态集合。 */
  statuses      : ProcessingStatus[];
  /** 允许显示的派系索引集合。 */
  factionIndices: number[];
  /** 关键字搜索词。 */
  searchQuery   : string;
}
