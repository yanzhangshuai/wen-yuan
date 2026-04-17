import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus } from "@/generated/prisma/enums";
import { getNeo4jDriver } from "@/server/db/neo4j";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/graph/findPersonaPath.ts`
 * ----------------------------------------------------------------------------
 * 图谱路径查询服务（单书域最短路径）。
 *
 * 核心策略：
 * - 优先使用 Neo4j `shortestPath` 执行图查询（性能与图语义更优）；
 * - 若 Neo4j 不可用/失败，回退到 PostgreSQL 数据上的 BFS（可用性优先）；
 * - 最终统一输出稳定 DTO（found/hopCount/nodes/edges）。
 *
 * 分层职责：
 * - 不处理 HTTP，不直接返回 Response；
 * - 对外只抛领域错误（BookNotFoundError / PersonaNotFoundError）；
 * - 允许在服务层内做数据源切换与容灾。
 *
 * 关键业务边界：
 * - 路径查询限定在“单本书图谱域”；
 * - 关系边口径与图谱展示对齐：纳入 `DRAFT` + `VERIFIED`，排除 `REJECTED`。
 * ============================================================================
 */

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
  /** 跳数（即路径边数量）。 */
  hopCount       : number;
  /** 路径节点序列。 */
  nodes          : PersonaPathNode[];
  /** 路径边序列。 */
  edges          : PersonaPathEdge[];
}

/** 内部图边快照（用于 BFS 与结果映射）。 */
interface GraphEdge {
  id       : string;
  sourceId : string;
  targetId : string;
  type     : string;
  weight   : number;
  chapterId: string;
  chapterNo: number;
}

/** BFS 回溯所需前驱信息。 */
interface PreviousStep {
  prevNodeId: string;
  edge      : GraphEdge;
}

/** 人物最小快照。 */
interface PersonaSnapshot {
  id  : string;
  name: string;
}

/**
 * 路径搜索关系状态白名单：
 * - 与图谱展示口径保持一致，避免“图上有边但路径不可达”的认知冲突。
 */
const PATH_SEARCH_RELATIONSHIP_STATUSES: ProcessingStatus[] = [
  ProcessingStatus.DRAFT,
  ProcessingStatus.VERIFIED
];

/**
 * Neo4j 路径查询软超时：
 * - 目标是避免图数据库不可达时卡住接口，超时后快速回退 PG BFS。
 */
const NEO4J_PATH_QUERY_TIMEOUT_MS = 2_000;

/** Neo4j 记录最小抽象（便于测试 mock）。 */
interface Neo4jRecordLike {
  get(key: string): unknown;
}

/** Neo4j 查询结果最小抽象。 */
interface Neo4jResultLike {
  records: Neo4jRecordLike[];
}

/** Neo4j 会话最小抽象。 */
interface Neo4jSessionLike {
  run(query: string, params?: Record<string, unknown>): Promise<Neo4jResultLike>;
  close(): Promise<void>;
}

/** Neo4j Driver 最小抽象。 */
interface Neo4jDriverLike {
  session(): Neo4jSessionLike;
}

/** 指定人物不存在错误（在当前书域图谱内不存在）。 */
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
 * 从边列表构建“无向”邻接表。
 * 业务说明：当前关系路径查询默认“可双向到达”，因此 source->target 与 target->source 都可走通。
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

/** 将 Neo4j 返回值安全转换为字符串数组。 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item))
    .filter((item) => item.length > 0);
}

/**
 * 给异步操作增加超时保护。
 * 超时后抛错，由上层统一走降级逻辑。
 */
async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * PostgreSQL 回退方案：BFS 无权最短路径。
 *
 * 设计原因：
 * - 回退路径首要目标是“保证可用”，而非复杂加权最优；
 * - BFS 在无权图上可稳定找到最短 hop 路径，满足当前产品语义。
 */
function bfsShortestPath(
  sourcePersonaId: string,
  targetPersonaId: string,
  edges: GraphEdge[]
): { nodeIds: string[]; pathEdges: GraphEdge[] } | null {
  if (sourcePersonaId === targetPersonaId) {
    // 起点终点相同是合法业务输入，直接返回 0 跳路径。
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
        // 已访问节点跳过，避免环路死循环。
        continue;
      }

      visited.add(neighbor.nodeId);
      previous.set(neighbor.nodeId, {
        prevNodeId: currentNodeId,
        edge      : neighbor.edge
      });

      if (neighbor.nodeId === targetPersonaId) {
        // 命中终点后，通过 previous 映射回溯完整路径。
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
 * 从 PostgreSQL 加载路径搜索所需图数据。
 * 纳入路径搜索白名单状态（当前为 `DRAFT` + `VERIFIED`）。
 */
async function loadBookGraphData(prismaClient: PrismaClient, bookId: string): Promise<{
  personas  : PersonaSnapshot[];
  graphEdges: GraphEdge[];
}> {
  const [relationships, profiles] = await Promise.all([
    prismaClient.relationship.findMany({
      where: {
        deletedAt: null,
        status   : { in: PATH_SEARCH_RELATIONSHIP_STATUSES },
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

  // 先用 profile 作为人物主体集合。
  const personas = profiles.map((item) => item.persona);
  const personaIdSet = new Set(personas.map((item) => item.id));

  for (const edge of graphEdges) {
    personaIdSet.add(edge.sourceId);
    personaIdSet.add(edge.targetId);
  }

  // 关系边可能引用到尚未存在 profile 的人物，需补查避免路径节点缺名。
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
 * 将当前书籍图同步到 Neo4j。
 *
 * 策略说明：
 * - 节点使用 MERGE（增量更新）；
 * - 边先按 bookId 全删再重建，避免历史残边导致 shortestPath 污染。
 */
async function syncNeo4jBookGraph(
  neo4jDriver: Neo4jDriverLike,
  bookId: string,
  personas: PersonaSnapshot[],
  graphEdges: GraphEdge[]
): Promise<void> {
  const session = neo4jDriver.session();
  try {
    // 1) 同步节点。
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

    // 2) 清理本书旧关系边。
    await session.run(
      `
      MATCH ()-[r:RELATES {bookId: $bookId}]->()
      DELETE r
      `,
      { bookId }
    );

    // 3) 以当前快照全量写回关系边。
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
    // 无论成功失败都关闭 session，避免连接泄漏。
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
    // shortestPath 用无向关系模式 `-[:RELATES*]-`，与 BFS 回退语义保持一致。
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
      // 没有记录通常意味着 source/target 在 Neo4j 不存在或查询未命中。
      return null;
    }

    const nodeIds = toStringArray(record.get("nodeIds"));
    const edgeIds = toStringArray(record.get("edgeIds"));

    if (nodeIds.length === 0) {
      // path 为 null 时 Neo4j 返回空数组，统一视为“未找到路径”。
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
    // Step 1) 先校验书籍存在。
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

    // Step 2) 加载图数据（人物 + 路径白名单关系）。
    const { personas, graphEdges } = await loadBookGraphData(prismaClient, input.bookId);

    // Step 3) 校验起点终点是否在当前书域图谱内。
    const endpointIds = new Set(personas.map((item) => item.id));
    if (!endpointIds.has(input.sourcePersonaId)) {
      throw new PersonaNotFoundError(input.sourcePersonaId);
    }
    if (!endpointIds.has(input.targetPersonaId)) {
      throw new PersonaNotFoundError(input.targetPersonaId);
    }

    const personaNameMap = new Map(personas.map((item) => [item.id, item.name] as const));

    if (input.sourcePersonaId === input.targetPersonaId) {
      // 同一人物路径：found=true，hopCount=0。
      return buildFoundResult(input, [input.sourcePersonaId], [], personaNameMap);
    }

    if (neo4jDriver) {
      try {
        // Step 4) 优先 Neo4j：先同步，再 shortestPath。
        const shortestPath = await withTimeout(
          (async () => {
            await syncNeo4jBookGraph(neo4jDriver, input.bookId, personas, graphEdges);
            return findShortestPathFromNeo4j(neo4jDriver, input);
          })(),
          NEO4J_PATH_QUERY_TIMEOUT_MS
        );
        if (!shortestPath) {
          return buildNotFoundResult(input);
        }

        const edgeMap = new Map(graphEdges.map((edge) => [edge.id, edge] as const));
        const pathEdges = shortestPath.edgeIds
          .map((edgeId) => edgeMap.get(edgeId))
          .filter((edge): edge is GraphEdge => Boolean(edge));
        if (pathEdges.length === shortestPath.edgeIds.length) {
          // 只有当 edgeIds 都能回填到 PG 快照时才算成功，防止图数据不一致导致脏结果。
          return buildFoundResult(
            input,
            shortestPath.nodeIds,
            pathEdges,
            personaNameMap
          );
        }
      } catch (error) {
        console.warn("[findPersonaPath] Neo4j 不可用，退化为 PostgreSQL BFS", error);
      }
    }

    // Step 5) 回退 PostgreSQL BFS。
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
