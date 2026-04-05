import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import { createUpdateGraphLayoutService } from "@/server/modules/graph/updateGraphLayout";

/**
 * 文件定位（图谱布局保存服务单测）：
 * - 验证用户在前端拖拽节点后，布局坐标可回写到 profile.visualConfig。
 * - 服务需要兼容“已有 profile 更新”和“缺失 profile 自动创建”两种分支。
 *
 * 业务价值：
 * - 保存后的坐标决定下次打开图谱时的视觉稳定性，是编辑体验关键链路。
 */
describe("updateGraphLayout service", () => {
  it("updates profile positions and creates missing profiles", async () => {
    // 场景说明：
    // - persona-1：已有 profile，更新坐标时保留原 locked 等配置。
    // - persona-2：无 profile，按最小信息创建并写入坐标。
    // - persona-3：书内不存在，需忽略并返回 ignoredPersonaIds 供前端提示。
    const profileUpsert = vi.fn().mockResolvedValue(null);
    const txClient = {
      profile: {
        upsert: profileUpsert
      }
    };
    const service = createUpdateGraphLayoutService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([
          {
            personaId   : "persona-1",
            visualConfig: {
              locked: true,
              x     : 1,
              y     : 2
            }
          }
        ]),
        upsert: profileUpsert
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "persona-1", name: "周进" },
          { id: "persona-2", name: "范进" }
        ])
      },
      $transaction: vi.fn().mockImplementation(
        async (
          callback: (tx: typeof txClient) => Promise<unknown>
        ): Promise<unknown> => callback(txClient)
      )
    } as never);

    const result = await service.updateGraphLayout({
      graphId: "book-1",
      nodes  : [
        { personaId: "persona-1", x: 120, y: 240 },
        { personaId: "persona-2", x: 80, y: 90 },
        { personaId: "persona-3", x: 10, y: 20 }
      ]
    });

    expect(profileUpsert).toHaveBeenCalledTimes(2);
    expect(profileUpsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where : { personaId_bookId: { personaId: "persona-1", bookId: "book-1" } },
        update: expect.objectContaining({
          visualConfig: {
            locked: true,
            x     : 120,
            y     : 240
          }
        })
      })
    );
    expect(profileUpsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where : { personaId_bookId: { personaId: "persona-2", bookId: "book-1" } },
        create: expect.objectContaining({
          localName   : "范进",
          visualConfig: {
            x: 80,
            y: 90
          }
        })
      })
    );

    expect(result.graphId).toBe("book-1");
    expect(result.savedCount).toBe(2);
    expect(result.createdCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.ignoredPersonaIds).toEqual(["persona-3"]);
    expect(typeof result.updatedAt).toBe("string");
  });

  it("throws when graph book does not exist", async () => {
    // 防御边界：graphId 对应书籍不存在时不允许保存布局，避免写入孤立数据。
    const service = createUpdateGraphLayoutService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as never);

    await expect(service.updateGraphLayout({
      graphId: "missing-book",
      nodes  : [{ personaId: "persona-1", x: 0, y: 0 }]
    })).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
