import { type Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 文件定位（图谱服务层）：
 * - 本文件负责保存用户在图谱页面拖拽后的节点坐标，属于服务端数据写入逻辑。
 * - 通常由图谱相关 API route 调用，不直接参与 React 渲染。
 *
 * 核心职责：
 * - 校验图谱（与 bookId 对齐）存在；
 * - 对输入节点坐标去重并批量 upsert 到 `entityProfile.visualConfig`；
 * - 返回本次新增/更新/忽略统计，供前端提示保存结果。
 *
 * 业务说明：
 * - 图谱布局是“用户交互偏好数据”，不影响人物关系语义；
 * - `ignoredPersonaIds` 用于显式反馈脏输入（不存在/已删除的实体）。
 */
/**
 * 图谱节点布局输入。
 */
export interface GraphLayoutNodeInput {
  /** 人物 ID（Persona 主键）。 */
  personaId: string;
  /** 节点 X 坐标。 */
  x        : number;
  /** 节点 Y 坐标。 */
  y        : number;
}

/**
 * 图谱布局更新输入。
 */
export interface UpdateGraphLayoutInput {
  /** 图谱 ID（与书籍 ID 对齐）。 */
  graphId: string;
  /** 本次提交的节点坐标列表。 */
  nodes  : GraphLayoutNodeInput[];
}

/**
 * 图谱布局更新结果。
 */
export interface UpdateGraphLayoutResult {
  /** 图谱 ID。 */
  graphId          : string;
  /** 成功保存（新增+更新）节点数量。 */
  savedCount       : number;
  /** 新增实体档案记录数量。 */
  createdCount     : number;
  /** 更新已有实体档案记录数量。 */
  updatedCount     : number;
  /** 被忽略的人物 ID（不存在或已删除）。 */
  ignoredPersonaIds: string[];
  /** 本次处理完成时间（ISO 字符串）。 */
  updatedAt        : string;
}

/**
 * 将现有 visualConfig 与新坐标合并。
 * 保留现有 JSON 字段，覆盖 `x/y`。
 */
function mergeVisualConfig(
  current: unknown,
  position: { x: number; y: number }
): Prisma.InputJsonValue {
  // 仅在 current 是对象时保留旧字段，避免把数组/原始值错误扩散到 visualConfig。
  const baseConfig = current && typeof current === "object" && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};

  return {
    ...baseConfig,
    x: position.x,
    y: position.y
  };
}

export function createUpdateGraphLayoutService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：批量保存图谱节点布局坐标。
   * 输入：图谱 ID + 节点坐标列表。
   * 输出：保存统计（新增/更新/忽略）。
   * 异常：图谱对应书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：批量 upsert `entityProfile.visualConfig`，恢复被软删实体档案（`deletedAt=null`）。
   */
  async function updateGraphLayout(input: UpdateGraphLayoutInput): Promise<UpdateGraphLayoutResult> {
    const book = await prismaClient.book.findFirst({
      where: {
        id       : input.graphId,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!book) {
      throw new BookNotFoundError(input.graphId);
    }

    const dedupedNodes = new Map<string, GraphLayoutNodeInput>();
    for (const node of input.nodes) {
      // 同一 persona 多次提交时“后写覆盖前写”，以用户最后一次拖拽位置为准。
      dedupedNodes.set(node.personaId, node);
    }

    if (dedupedNodes.size === 0) {
      return {
        graphId          : input.graphId,
        savedCount       : 0,
        createdCount     : 0,
        updatedCount     : 0,
        ignoredPersonaIds: [],
        updatedAt        : new Date().toISOString()
      };
    }

    const personaIds = Array.from(dedupedNodes.keys());
    const [entityProfiles, entities] = await Promise.all([
      prismaClient.entityProfile.findMany({
        where: {
          bookId  : input.graphId,
          entityId: {
            in: personaIds
          }
        },
        select: {
          entityId    : true,
          visualConfig: true
        }
      }),
      prismaClient.entity.findMany({
        where: {
          id: {
            in: personaIds
          },
          deletedAt: null
        },
        select: {
          id  : true,
          name: true
        }
      })
    ]);

    const entityProfileMap = new Map(entityProfiles.map((item) => [item.entityId, item] as const));
    const entityMap = new Map(entities.map((item) => [item.id, item] as const));
    const ignoredPersonaIds = personaIds.filter((personaId) => !entityMap.has(personaId));

    let createdCount = 0;
    let updatedCount = 0;

    await prismaClient.$transaction(async (tx) => {
      for (const [personaId, node] of dedupedNodes) {
        const entity = entityMap.get(personaId);
        if (!entity) {
          // 不存在的实体不落库，只在返回值中记录，避免事务被无效数据中断。
          continue;
        }

        const entityProfile = entityProfileMap.get(personaId);
        const visualConfig = mergeVisualConfig(entityProfile?.visualConfig, node);

        await tx.entityProfile.upsert({
          where: {
            entityId_bookId: {
              entityId: personaId,
              bookId  : input.graphId
            }
          },
          update: {
            visualConfig,
            deletedAt: null
          },
          create: {
            entityId : personaId,
            bookId   : input.graphId,
            localName: entity.name,
            visualConfig
          }
        });

        if (entityProfile) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }
      }
    });

    return {
      graphId   : input.graphId,
      savedCount: createdCount + updatedCount,
      createdCount,
      updatedCount,
      ignoredPersonaIds,
      updatedAt : new Date().toISOString()
    };
  }

  return {
    updateGraphLayout
  };
}

export const { updateGraphLayout } = createUpdateGraphLayoutService();
