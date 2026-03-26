import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus } from "@/generated/prisma/enums";
import { getNeo4jDriver } from "@/server/db/neo4j";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 最短路径查询输入。
 */
export interface FindPersonaPathInput {
  /** 书籍 ID，路径搜索在单书域内进行。 */
  bookId         : string;
  /** 起点人物 ID。 */
  sourcePersonaId: string;
  /** 终点人物 ID。 */
  targetPersonaId: string;
}

/**
 * 路径结果中的节点结构。
 */
export interface PersonaPathNode {
  /** 人物 ID。 */
  id  : string;
  /** 人物展示名。 */
  name: string;
}

/**
 * 路径结果中的边结构。
 */
export interface PersonaPathEdge {
  /** 关系 ID。 */
  id       : string;
  /** 起点人物 ID。 */
  source   : string;
  /** 终点人物 ID。 */
  target   : string;
  /** 关系类型。 */
  type     : string;
  /** 关系权重。 */
  weight   : number;
  /** 关系所在章节 ID。 */
  chapterId: string;
  /** 关系所在章节序号。 */
  chapterNo: number;
}

/**
 * 最短路径查询结果。
 */
export interface PersonaPathResult {
  /** 书籍 ID。 */
  bookId         : string;
  /** 起点人物 ID。 */
  sourcePersonaId: string;
  /** 终点人物 ID。 */
  targetPersonaId: string;
  /** 是否找到可达路径。 */
  found          : boolean;
  /** 跳数（边数量）。 */
  hopCount       : number;
  /** 路径节点序列。 */
  nodes          : PersonaPathNode[];
  /** 路径边序列。 */
  edges          : PersonaPathEdge[];
}

/**
 * 内部图边快照（用于 BFS 与结果映射）。
 */
interface GraphEdge {
  id       : string;
  sourceId : string;
  targetId : string;
  type     : string;
  weight   : number;
  chapterId: string;
  chapterNo: number;
}

/**
 * BFS 回溯所需前驱信息。
 */
interface PreviousStep {
  prevNodeId: string;
  edge      : GraphEdge;
}

/**
 * 人物最小快照。
 */
interface PersonaSnapshot {
  id  : string;
  name: string;
}

/**
 * Neo4j 记录最小抽象（便于测试 mock）。
 */
interface Neo4jRecordLike {
  get(key: string): unknown;
}

/**
 * Neo4j 查询结果最小抽象。
 */
interface Neo4jResultLike {
  records: Neo4jRecordLike[];
}

/**
 * Neo4j 会话最小抽象。
 */
interface Neo4jSessionLike {
  run(query: string, params?: Record<string, unknown>): Promise<Neo4jResultLike>;
  close(): Promise<void>;
}

/**
 * Neo4j Driver 最小抽象。
 */
interface Neo4jDriverLike {
  session(): Neo4jSessionLike;
}

/**
 * 指定人物不存在错误（书域内）。
 */
export class PersonaNotFoundError extends Error {
  /** 不存在的人物 ID。 */
  readonly personaId: string;

  /**
   * @param personaId 人物主键 ID。
   */
  constructor(personaId: string) {
    super(`Persona not found: ${personaId}`);
    this.personaId = personaId;
  }
}

/**
 * 从边列表构建无向邻接表。
 * 说明：路径查找按「关系可双向走通」处理。
 */
function buildAdjacency(edges: GraphEdge[]): Map<string, Array<{ nodeId: string; edge: GraphEdge }>> {
  const adjacency = new Map<string, Array<{ nodeId: string; edge: GraphEdge }>>();

  function push(from: string, to: string, edge: GraphEdge) {
    const current = adjacency.get(from) ?? [];
    current.push({ nodeId: to, edge });
    adjacency.set(from, current);
  }

  for (const edge of edges) {
    push(edge.sourceId, edge.targetId, edge);
    push(edge.targetId, edge.sourceId, edge);
  }

  return adjacency;
}

/**
 * 将 Neo4j 返回值安全转换为字符串数组。
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item))
    .filter((item) => item.length > 0);
}

/**
 * PostgreSQL 回退方案：BFS 计算无权最短路径。
 */
function bfsShortestPath(
  sourcePersonaId: string,
  targetPersonaId: string,
  edges: GraphEdge[]
): { nodeIds: string[]; pathEdges: GraphEdge[] } | null {
  if (sourcePersonaId === targetPersonaId) {
    return {
      nodeIds  : [sourcePersonaId],
      pathEdges: []
    };
  }

  const adjacency = buildAdjacency(edges);
  const queue: string[] = [sourcePersonaId];
  const visited = new Set<string>([sourcePersonaId]);
  const previous = new Map<string, PreviousStep>();

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId) {
      break;
    }

    const neighbors = adjacency.get(currentNodeId) ?? [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.nodeId)) {
        continue;
      }

      visited.add(neighbor.nodeId);
      previous.set(neighbor.nodeId, {
        prevNodeId: currentNodeId,
        edge      : neighbor.edge
      });

      if (neighbor.nodeId === targetPersonaId) {
        const nodeIds: string[] = [targetPersonaId];
        const pathEdges: GraphEdge[] = [];

        let cursor = targetPersonaId;
        while (cursor !== sourcePersonaId) {
          const step = previous.get(cursor);
          if (!step) {
            break;
          }

          pathEdges.push(step.edge);
          nodeIds.push(step.prevNodeId);
          cursor = step.prevNodeId;
        }

        nodeIds.reverse();
        pathEdges.reverse();
        return { nodeIds, pathEdges };
      }

      queue.push(neighbor.nodeId);
    }
  }

  return null;
}

/**
 * 从 PostgreSQL 加载路径搜索所需图数据（人物 + 已审核关系）。
 */
async function loadBookGraphData(prismaClient: PrismaClient, bookId: string): Promise<{
  personas  : PersonaSnapshot[];
  graphEdges: GraphEdge[];
}> {
  const [relationships, profiles] = await Promise.all([
    prismaClient.relationship.findMany({
      where: {
        deletedAt: null,
        status   : ProcessingStatus.VERIFIED,
        chapter  : {
          bookId
        },
        source: { deletedAt: null },
        target: { deletedAt: null }
      },
      orderBy: [
        { chapter: { no: "asc" } },
        { createdAt: "asc" }
      ],
      select: {
        id       : true,
        sourceId : true,
        targetId : true,
        type     : true,
        weight   : true,
        chapterId: true,
        chapter  : {
          select: {
            no: true
          }
        }
      }
    }),
    prismaClient.profile.findMany({
      where: {
        bookId,
        deletedAt: null,
        persona  : {
          deletedAt: null
        }
      },
      select: {
        persona: {
          select: {
            id  : true,
            name: true
          }
        }
      }
    })
  ]);

  const graphEdges: GraphEdge[] = relationships.map((item) => ({
    id       : item.id,
    sourceId : item.sourceId,
    targetId : item.targetId,
    type     : item.type,
    weight   : item.weight,
    chapterId: item.chapterId,
    chapterNo: item.chapter.no
  }));

  const personas = profiles.map((item) => item.persona);
  const personaIdSet = new Set(personas.map((item) => item.id));

  for (const edge of graphEdges) {
    personaIdSet.add(edge.sourceId);
    personaIdSet.add(edge.targetId);
  }

  const missingPersonaIds = Array.from(personaIdSet).filter((personaId) => !personas.some((item) => item.id === personaId));
  if (missingPersonaIds.length > 0) {
    const extraPersonas = await prismaClient.persona.findMany({
      where: {
        id       : { in: missingPersonaIds },
        deletedAt: null
      },
      select: {
        id  : true,
        name: true
      }
    });
    personas.push(...extraPersonas);
  }

  return {
    personas,
    graphEdges
  };
}

/**
 * 将当前书籍图同步到 Neo4j（节点增量更新 + 边全量重建）。
 */
async function syncNeo4jBookGraph(
  neo4jDriver: Neo4jDriverLike,
  bookId: string,
  personas: PersonaSnapshot[],
  graphEdges: GraphEdge[]
): Promise<void> {
  const session = neo4jDriver.session();
  try {
    await session.run(
      `
      UNWIND $personas AS persona
      MERGE (p:Persona {id: persona.id, bookId: $bookId})
      SET p.name = persona.name
      `,
      {
        bookId,
        personas
      }
    );

    await session.run(
      `
      MATCH ()-[r:RELATES {bookId: $bookId}]->()
      DELETE r
      `,
      { bookId }
    );

    await session.run(
      `
      UNWIND $edges AS edge
      MATCH (source:Persona {id: edge.sourceId, bookId: $bookId})
      MATCH (target:Persona {id: edge.targetId, bookId: $bookId})
      MERGE (source)-[r:RELATES {id: edge.id, bookId: $bookId}]->(target)
      SET r.type = edge.type,
          r.weight = edge.weight,
          r.chapterId = edge.chapterId,
          r.chapterNo = edge.chapterNo
      `,
      {
        bookId,
        edges: graphEdges
      }
    );
  } finally {
    await session.close();
  }
}

/**
 * 使用 Neo4j `shortestPath` 查询最短路径。
 * 返回节点序列与边序列 ID，后续由 PostgreSQL 快照补全字段。
 */
async function findShortestPathFromNeo4j(
  neo4jDriver: Neo4jDriverLike,
  input: FindPersonaPathInput
): Promise<{ nodeIds: string[]; edgeIds: string[] } | null> {
  const session = neo4jDriver.session();
  try {
    const result = await session.run(
      `
      MATCH (source:Persona {id: $sourcePersonaId, bookId: $bookId})
      MATCH (target:Persona {id: $targetPersonaId, bookId: $bookId})
      OPTIONAL MATCH path = shortestPath((source)-[:RELATES*]-(target))
      RETURN CASE WHEN path IS NULL THEN [] ELSE [n IN nodes(path) | n.id] END AS nodeIds,
             CASE WHEN path IS NULL THEN [] ELSE [r IN relationships(path) | r.id] END AS edgeIds
      `,
      {
        bookId         : input.bookId,
        sourcePersonaId: input.sourcePersonaId,
        targetPersonaId: input.targetPersonaId
      }
    );

    const record = result.records[0];
    if (!record) {
      return null;
    }

    const nodeIds = toStringArray(record.get("nodeIds"));
    const edgeIds = toStringArray(record.get("edgeIds"));

    if (nodeIds.length === 0) {
      return null;
    }

    return {
      nodeIds,
      edgeIds
    };
  } finally {
    await session.close();
  }
}

/**
 * 构造「未找到路径」标准返回体。
 */
function buildNotFoundResult(input: FindPersonaPathInput): PersonaPathResult {
  return {
    bookId         : input.bookId,
    sourcePersonaId: input.sourcePersonaId,
    targetPersonaId: input.targetPersonaId,
    found          : false,
    hopCount       : 0,
    nodes          : [],
    edges          : []
  };
}

/**
 * 构造「找到路径」标准返回体。
 */
function buildFoundResult(
  input: FindPersonaPathInput,
  nodeIds: string[],
  pathEdges: GraphEdge[],
  personaNameMap: Map<string, string>
): PersonaPathResult {
  return {
    bookId         : input.bookId,
    sourcePersonaId: input.sourcePersonaId,
    targetPersonaId: input.targetPersonaId,
    found          : true,
    hopCount       : pathEdges.length,
    nodes          : nodeIds.map((nodeId) => ({
      id  : nodeId,
      name: personaNameMap.get(nodeId) ?? ""
    })),
    edges: pathEdges.map((item) => ({
      id       : item.id,
      source   : item.sourceId,
      target   : item.targetId,
      type     : item.type,
      weight   : item.weight,
      chapterId: item.chapterId,
      chapterNo: item.chapterNo
    }))
  };
}

export function createFindPersonaPathService(
  prismaClient: PrismaClient = prisma,
  neo4jDriver: Neo4jDriverLike | null = getNeo4jDriver()
) {
  /**
   * 功能：查询单书内两个人物之间的最短关系路径。
   * 输入：书籍 ID、起点人物 ID、终点人物 ID。
   * 输出：路径结果（含是否找到、节点序列、边序列）。
   * 异常：
   * - `BookNotFoundError`：书籍不存在；
   * - `PersonaNotFoundError`：起点或终点人物不在该书图谱中。
   * 副作用：
   * - 若 Neo4j 可用，会先同步该书图数据再查询；
   * - 若 Neo4j 不可用/失败，自动回退到 PostgreSQL BFS。
   */
  async function findPersonaPath(input: FindPersonaPathInput): Promise<PersonaPathResult> {
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

    const { personas, graphEdges } = await loadBookGraphData(prismaClient, input.bookId);

    const endpointIds = new Set(personas.map((item) => item.id));
    if (!endpointIds.has(input.sourcePersonaId)) {
      throw new PersonaNotFoundError(input.sourcePersonaId);
    }
    if (!endpointIds.has(input.targetPersonaId)) {
      throw new PersonaNotFoundError(input.targetPersonaId);
    }

    const personaNameMap = new Map(personas.map((item) => [item.id, item.name] as const));

    if (input.sourcePersonaId === input.targetPersonaId) {
      return buildFoundResult(input, [input.sourcePersonaId], [], personaNameMap);
    }

    if (neo4jDriver) {
      try {
        await syncNeo4jBookGraph(neo4jDriver, input.bookId, personas, graphEdges);
        const shortestPath = await findShortestPathFromNeo4j(neo4jDriver, input);
        if (!shortestPath) {
          return buildNotFoundResult(input);
        }

        const edgeMap = new Map(graphEdges.map((edge) => [edge.id, edge] as const));
        const pathEdges = shortestPath.edgeIds
          .map((edgeId) => edgeMap.get(edgeId))
          .filter((edge): edge is GraphEdge => Boolean(edge));
        if (pathEdges.length === shortestPath.edgeIds.length) {
          return buildFoundResult(
            input,
            shortestPath.nodeIds,
            pathEdges,
            personaNameMap
          );
        }
      } catch {
        // Neo4j 不可用时，退化为 PostgreSQL BFS，保证接口可用。
      }
    }

    const shortestPath = bfsShortestPath(input.sourcePersonaId, input.targetPersonaId, graphEdges);
    if (!shortestPath) {
      return buildNotFoundResult(input);
    }

    return buildFoundResult(input, shortestPath.nodeIds, shortestPath.pathEdges, personaNameMap);
  }

  return {
    findPersonaPath
  };
}

export const { findPersonaPath } = createFindPersonaPathService();
