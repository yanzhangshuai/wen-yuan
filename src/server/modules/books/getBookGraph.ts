import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/books/getBookGraph.ts`
 * ----------------------------------------------------------------------------
 * 这是图谱读取核心服务：根据书籍与可选章节上限，返回图谱快照（nodes + edges）。
 *
 * 分层角色：
 * - server module（服务端逻辑层）；
 * - 被 `GET /api/books/:id/graph` 调用；
 * - 负责跨表聚合（relationship/profile/persona/mention）与前端友好字段计算。
 *
 * 业务目标：
 * - 支持“全书视图”与“按章节回放视图”；
 * - 提供前端渲染直接可用的字段（sentiment/factionIndex/influence/x/y）。
 *
 * 关键约束：
 * - 图谱中节点不仅来自 profile，还可能来自 mention/relationship（历史数据兼容）；
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
  /** 节点审核状态。 */
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
  id       : string;
  /** 起点人物 ID。 */
  source   : string;
  /** 终点人物 ID。 */
  target   : string;
  /** 关系类型。 */
  type     : string;
  /** 权重。 */
  weight   : number;
  /** 情感极性（正/负/中性）。 */
  sentiment: RelationSentiment;
  /** 关系审核状态。 */
  status   : ProcessingStatus;
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
 * 业务意图：人工录入默认可信（VERIFIED），AI 产出默认待审核（DRAFT）。
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
 * 从 profile.visualConfig 中安全提取坐标。
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
        chapter  : {
          bookId: input.bookId,
          ...(typeof input.chapter === "number" ? { no: { lte: input.chapter } } : {})
        },
        source: { deletedAt: null },
        target: { deletedAt: null }
      },
      orderBy: [{ updatedAt: "desc" }],
      select : {
        id      : true,
        sourceId: true,
        targetId: true,
        type    : true,
        weight  : true,
        status  : true
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
          persona: { deletedAt: null }
        },
        select: {
          personaId: true
        },
        distinct: ["personaId"]
      })
      : [];

    // Step 3) 收集所有“应出现在图中的人物 ID”：
    // - 关系两端人物；
    // - 被提及人物（即使暂时无关系边，也应保留为孤立节点）。
    const relationshipPersonaIds = new Set<string>();
    for (const relation of relationships) {
      relationshipPersonaIds.add(relation.sourceId);
      relationshipPersonaIds.add(relation.targetId);
    }
    for (const mention of mentionedPersonaIds) {
      relationshipPersonaIds.add(mention.personaId);
    }

    const personaIdFilter = typeof input.chapter === "number"
      ? Array.from(relationshipPersonaIds)
      : undefined;

    // Step 4) 读取 profile 作为主节点来源（包含 ironyIndex 与 visualConfig）。
    const profiles = await prismaClient.profile.findMany({
      where: {
        bookId   : input.bookId,
        deletedAt: null,
        persona  : {
          deletedAt: null
        },
        ...(personaIdFilter ? { personaId: { in: personaIdFilter } } : {})
      },
      orderBy: [{ updatedAt: "desc" }],
      select : {
        personaId   : true,
        ironyIndex  : true,
        visualConfig: true,
        persona     : {
          select: {
            id          : true,
            name        : true,
            nameType    : true,
            recordSource: true
          }
        }
      }
    });

    const relationCountMap = new Map<string, number>();
    for (const relation of relationships) {
      relationCountMap.set(relation.sourceId, (relationCountMap.get(relation.sourceId) ?? 0) + 1);
      relationCountMap.set(relation.targetId, (relationCountMap.get(relation.targetId) ?? 0) + 1);
    }

    // Step 5) 先从 profile 构建节点。
    const nodes: BookGraphNode[] = profiles.map((profile) => {
      const relationCount = relationCountMap.get(profile.personaId) ?? 0;
      // 影响力是前端展示指标，当前采用线性乘积并保留两位小数。
      const influence = Number((relationCount * profile.ironyIndex).toFixed(2));
      const position = parseNodePosition(profile.visualConfig);

      return {
        id          : profile.persona.id,
        name        : profile.persona.name,
        nameType    : profile.persona.nameType,
        status      : resolveNodeStatus(profile.persona.recordSource),
        factionIndex: hashFactionIndex(profile.persona.id),
        influence,
        ...position
      };
    });

    // Step 6) 补齐“只有关系/提及但无 profile”的缺失节点，避免出现边指向不存在节点。
    const existingNodeIds = new Set(nodes.map((item) => item.id));
    const missingPersonaIds = Array.from(relationshipPersonaIds).filter((item) => !existingNodeIds.has(item));
    if (missingPersonaIds.length > 0) {
      const missingPersonas = await prismaClient.persona.findMany({
        where: {
          id       : { in: missingPersonaIds },
          deletedAt: null
        },
        select: {
          id          : true,
          name        : true,
          nameType    : true,
          recordSource: true
        }
      });

      for (const persona of missingPersonas) {
        nodes.push({
          id          : persona.id,
          name        : persona.name,
          nameType    : persona.nameType,
          status      : resolveNodeStatus(persona.recordSource),
          factionIndex: hashFactionIndex(persona.id),
          // 缺失 profile 时没有 ironyIndex，退化为纯关系计数。
          influence   : relationCountMap.get(persona.id) ?? 0
        });
      }
    }

    // Step 7) 构建边结构并附带情感极性。
    const edges: BookGraphEdge[] = relationships.map((relation) => ({
      id       : relation.id,
      source   : relation.sourceId,
      target   : relation.targetId,
      type     : relation.type,
      weight   : relation.weight,
      sentiment: resolveSentiment(relation.type),
      status   : relation.status
    }));

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
