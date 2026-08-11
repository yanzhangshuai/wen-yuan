import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { lookupRelationshipTypeNames } from "@/server/modules/skills";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/books/getBookGraph.ts`
 * ----------------------------------------------------------------------------
 * 这是图谱读取核心服务：根据书籍与可选章节上限，返回图谱快照（nodes + edges）。
 *
 * 分层角色：
 * - server module（服务端逻辑层）；
 * - 被 `GET /api/books/:id/graph` 调用；
 * - 负责跨表聚合（relationship/entityProfile/entity/mention）与前端友好字段计算。
 *
 * 业务目标：
 * - 支持“全书视图”与“按章节回放视图”；
 * - 提供前端渲染直接可用的字段（sentiment/factionIndex/influence/x/y）。
 *
 * 关键约束：
 * - 图谱中节点不仅来自实体档案，还可能来自 mention/relationship（历史数据兼容）；
 * - 章节过滤下若某人物仅在关系或提及中出现，也必须补节点，避免悬空边。
 * ============================================================================
 */

type RelationSentiment = "positive" | "negative" | "neutral";

/**
 * 图谱视觉层的关系情感映射。
 *
 * 注意：
 * - 这里只服务于“边颜色渲染”，不是关系类型合法性校验；
 * - 未收录的新关系类型默认回落为 neutral，避免渲染中断。
 */
const RELATION_SENTIMENT_MAP: Readonly<Record<string, RelationSentiment>> = {
  父子 : "positive",
  母子 : "positive",
  兄弟 : "positive",
  夫妻 : "positive",
  姻亲 : "positive",
  师生 : "positive",
  同年 : "positive",
  荐举 : "positive",
  友好 : "positive",
  同盟 : "positive",
  欣赏 : "positive",
  同僚 : "positive",
  敌对 : "negative",
  嘲讽 : "negative",
  竞争 : "negative",
  债主 : "negative",
  债务人: "negative",
  下属 : "neutral",
  上司 : "neutral",
  其他 : "neutral"
};

/** 图谱查询输入参数。 */
export interface GetBookGraphInput {
  /** 书籍 ID（图谱域边界）。 */
  bookId  : string;
  /** 可选截止章节号（时间轴过滤上限，包含该章节）。 */
  chapter?: number;
}

/**
 * 图谱节点结构。
 */
export interface BookGraphNode {
  /** 人物 ID。 */
  id          : string;
  /** 人物名称。 */
  name        : string;
  /** 人名类型（NAMED/TITLE_ONLY）。 */
  nameType    : string;
  /** 实体类型（PERSON/LOCATION/ORGANIZATION），用于前端节点形状区分。 */
  entityType  : string;
  /** 节点资料确认状态。 */
  status      : ProcessingStatus;
  /** 派系颜色索引（前端着色用）。 */
  factionIndex: number;
  /** 影响力分值（当前实现为“关系计数 * 讽刺指数”）。 */
  influence   : number;
  /** 可选 X 坐标（持久化布局）。 */
  x?          : number;
  /** 可选 Y 坐标（持久化布局）。 */
  y?          : number;
}

/**
 * 图谱边结构。
 */
export interface BookGraphEdge {
  /** 关系 ID。 */
  id        : string;
  /** 起点人物 ID。 */
  source    : string;
  /** 终点人物 ID。 */
  target    : string;
  /** 关系类型。 */
  type      : string;
  /** 权重（关系强度，= 底层 RELATION 事实数）。 */
  weight    : number;
  /** 该结构关系下聚合出的事件（事实）数量。 */
  eventCount: number;
  /** 情感极性（正/负/中性）。 */
  sentiment : RelationSentiment;
  /** 关系资料确认状态。 */
  status    : ProcessingStatus;
}

/**
 * 图谱快照。
 */
export interface BookGraphSnapshot {
  /** 节点列表。 */
  nodes: BookGraphNode[];
  /** 边列表。 */
  edges: BookGraphEdge[];
}

/**
 * 根据关系类型推导情感极性。
 * 未命中映射时回落 neutral，保证新增关系类型不会导致前端渲染中断。
 */
function resolveSentiment(type: string): BookGraphEdge["sentiment"] {
  return RELATION_SENTIMENT_MAP[type] ?? "neutral";
}

/**
 * 由数据来源推导默认节点状态。
 * 业务意图：人工录入默认可信（VERIFIED），AI 产出默认待确认（DRAFT）。
 */
function resolveNodeStatus(recordSource: RecordSource): ProcessingStatus {
  if (recordSource === RecordSource.MANUAL) {
    return ProcessingStatus.VERIFIED;
  }

  return ProcessingStatus.DRAFT;
}

/**
 * 对 personaId 做稳定 hash，生成 0~11 的派系颜色索引。
 * 目的：同一人物跨刷新保持颜色一致，提升图谱视觉连续性。
 */
function hashFactionIndex(personaId: string): number {
  let hash = 0;
  for (let index = 0; index < personaId.length; index += 1) {
    hash = (hash + personaId.charCodeAt(index)) % 12;
  }

  return hash;
}

/**
 * 从实体档案的 visualConfig 中安全提取坐标。
 * 防御原因：历史数据或脏数据可能不是对象，必须先做运行时收窄。
 */
function parseNodePosition(visualConfig: unknown): { x?: number; y?: number } {
  if (!visualConfig || typeof visualConfig !== "object" || Array.isArray(visualConfig)) {
    return {};
  }

  const data = visualConfig as Record<string, unknown>;
  const x = typeof data.x === "number" ? data.x : undefined;
  const y = typeof data.y === "number" ? data.y : undefined;

  return { x, y };
}

export function createGetBookGraphService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：获取单本书图谱（节点+边）。
   * 输入：书籍 ID，可选章节截止号。
   * 输出：图谱快照（节点含影响力与可选坐标，边含情感极性）。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：无（只读查询）。
   */
  async function getBookGraph(input: GetBookGraphInput): Promise<BookGraphSnapshot> {
    // Step 1) 先验证书籍存在，避免后续多表查询无意义执行。
    const book = await prismaClient.book.findFirst({
      where: {
        id       : input.bookId,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!book) {
      throw new BookNotFoundError(input.bookId);
    }

    // Step 2) 查询关系边（可按章节截断）。
    const relationships = await prismaClient.relationship.findMany({
      where: {
        deletedAt: null,
        bookId   : input.bookId,
        ...(typeof input.chapter === "number"
          ? { firstChapterNo: { lte: input.chapter } }
          : {}),
        source: { deletedAt: null },
        target: { deletedAt: null }
      },
      orderBy: [{ updatedAt: "desc" }],
      select : {
        id                  : true,
        sourceEntityId      : true,
        targetEntityId      : true,
        relationshipTypeCode: true,
        factCount           : true,
        weight              : true,
        status              : true
      }
    });

    const mentionedPersonaIds = typeof input.chapter === "number"
      ? await prismaClient.mention.findMany({
        where: {
          deletedAt: null,
          chapter  : {
            bookId: input.bookId,
            no    : { lte: input.chapter }
          },
          entity: { deletedAt: null }
        },
        select: {
          entityId: true
        },
        distinct: ["entityId"]
      })
      : [];

    // Step 3) 收集所有“应出现在图中的人物 ID”：
    // - 关系两端人物；
    // - 被提及人物（即使暂时无关系边，也应保留为孤立节点）。
    const relationshipPersonaIds = new Set<string>();
    for (const relation of relationships) {
      relationshipPersonaIds.add(relation.sourceEntityId);
      relationshipPersonaIds.add(relation.targetEntityId);
    }
    for (const mention of mentionedPersonaIds) {
      relationshipPersonaIds.add(mention.entityId);
    }

    const personaIdFilter = typeof input.chapter === "number"
      ? Array.from(relationshipPersonaIds)
      : undefined;

    // Step 4) 读取实体档案作为主节点来源（包含 ironyIndex 与 visualConfig）。
    const entityProfiles = await prismaClient.entityProfile.findMany({
      where: {
        bookId   : input.bookId,
        deletedAt: null,
        entity   : {
          deletedAt: null
        },
        ...(personaIdFilter ? { entityId: { in: personaIdFilter } } : {})
      },
      orderBy: [{ updatedAt: "desc" }],
      select : {
        entityId    : true,
        ironyIndex  : true,
        visualConfig: true,
        entity      : {
          select: {
            id          : true,
            name        : true,
            nameType    : true,
            entityType  : true,
            recordSource: true
          }
        }
      }
    });

    const relationCountMap = new Map<string, number>();
    for (const relation of relationships) {
      relationCountMap.set(relation.sourceEntityId, (relationCountMap.get(relation.sourceEntityId) ?? 0) + 1);
      relationCountMap.set(relation.targetEntityId, (relationCountMap.get(relation.targetEntityId) ?? 0) + 1);
    }

    // Step 5) 先从实体档案构建节点。
    const nodes: BookGraphNode[] = entityProfiles.map((entityProfile) => {
      const relationCount = relationCountMap.get(entityProfile.entityId) ?? 0;
      // 影响力是前端展示指标，当前采用线性乘积并保留两位小数。
      const influence = Number((relationCount * entityProfile.ironyIndex).toFixed(2));
      const position = parseNodePosition(entityProfile.visualConfig);

      return {
        id          : entityProfile.entity.id,
        name        : entityProfile.entity.name,
        nameType    : entityProfile.entity.nameType,
        entityType  : entityProfile.entity.entityType,
        status      : resolveNodeStatus(entityProfile.entity.recordSource),
        factionIndex: hashFactionIndex(entityProfile.entity.id),
        influence,
        ...position
      };
    });

    // Step 6) 补齐“只有关系/提及但无档案”的缺失节点，避免出现边指向不存在节点。
    const existingNodeIds = new Set(nodes.map((item) => item.id));
    const missingPersonaIds = Array.from(relationshipPersonaIds).filter((item) => !existingNodeIds.has(item));
    if (missingPersonaIds.length > 0) {
      const missingEntities = await prismaClient.entity.findMany({
        where: {
          id       : { in: missingPersonaIds },
          deletedAt: null
        },
        select: {
          id          : true,
          name        : true,
          nameType    : true,
          entityType  : true,
          recordSource: true
        }
      });

      for (const entity of missingEntities) {
        nodes.push({
          id          : entity.id,
          name        : entity.name,
          nameType    : entity.nameType,
          entityType  : entity.entityType,
          status      : resolveNodeStatus(entity.recordSource),
          factionIndex: hashFactionIndex(entity.id),
          // 缺失档案时没有 ironyIndex，退化为纯关系计数。
          influence   : relationCountMap.get(entity.id) ?? 0
        });
      }
    }

    // Step 7) 批量加载 KB 类型名称，构建边结构并附带情感极性。
    const typeCodes = [...new Set(relationships.map((r) => r.relationshipTypeCode))];
    const nameByCode = await lookupRelationshipTypeNames(typeCodes, prismaClient);
    const edges: BookGraphEdge[] = relationships.map((relation) => {
      // 关系强度取物化表的 weight/factCount（= 底层 RELATION 事实数），
      // 不再硬编码 1，让边粗细与力布局能反映关系紧密程度。
      const eventCount = relation.factCount;
      return {
        id       : relation.id,
        source   : relation.sourceEntityId,
        target   : relation.targetEntityId,
        type     : nameByCode.get(relation.relationshipTypeCode) ?? relation.relationshipTypeCode,
        weight   : Math.max(relation.weight ?? eventCount, 1),
        eventCount,
        sentiment: resolveSentiment(relation.relationshipTypeCode),
        status   : relation.status
      };
    });

    // Step 8) 返回图谱快照。
    return {
      nodes,
      edges
    };
  }

  return {
    getBookGraph
  };
}

export const { getBookGraph } = createGetBookGraphService();
