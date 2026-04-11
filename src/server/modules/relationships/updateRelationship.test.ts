import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus } from "@/generated/prisma/enums";
import { createUpdateRelationshipService } from "@/server/modules/relationships/updateRelationship";
import {
  RelationshipInputError,
  RelationshipNotFoundError
} from "@/server/modules/relationships/errors";

/**
 * 文件定位（人物关系更新服务单测）：
 * - 验证关系编辑流程中的字段更新、输入有效性校验与不存在资源处理。
 * - 服务层输出会直接影响关系图边属性（类型/权重/置信度/状态）展示与后续分析结果。
 */
describe("updateRelationship service", () => {
  it("updates relationship fields", async () => {
    // 场景：编辑表单常出现“带空格文本”，服务应归一化后入库，避免前后端显示不一致。
    const relationshipFindFirst = vi.fn().mockResolvedValue({ id: "rel-1" });
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id         : "rel-1",
      chapterId  : "chapter-1",
      sourceId   : "persona-a",
      targetId   : "persona-b",
      type       : "同盟",
      weight     : 1.5,
      description: "更新背景",
      evidence   : "更新证据",
      confidence : 0.88,
      status     : ProcessingStatus.VERIFIED,
      updatedAt  : new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        findFirst: relationshipFindFirst,
        update   : relationshipUpdate
      }
    }));

    const service = createUpdateRelationshipService({
      $transaction: transaction
    } as never);

    const result = await service.updateRelationship("rel-1", {
      type      : " 同盟 ",
      weight    : 1.5,
      status    : ProcessingStatus.VERIFIED,
      confidence: 0.88
    });

    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type      : "同盟",
        weight    : 1.5,
        status    : ProcessingStatus.VERIFIED,
        confidence: 0.88
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      id       : "rel-1",
      type     : "同盟",
      status   : ProcessingStatus.VERIFIED,
      updatedAt: "2026-03-25T00:00:00.000Z"
    }));
  });

  it("throws input error when no update field provided", async () => {
    // 防御规则：空更新请求不允许落库，这是业务规则，不是技术限制，目的是防止无意义写操作污染审计日志。
    const service = createUpdateRelationshipService({
      $transaction: vi.fn()
    } as never);

    await expect(service.updateRelationship("rel-1", {}))
      .rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("throws not found when relationship does not exist", async () => {
    // 边界条件：关系已删除/ID 错误时应快速失败，让路由层可映射为明确错误响应。
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createUpdateRelationshipService({
      $transaction: transaction
    } as never);

    await expect(service.updateRelationship("rel-missing", { type: "同盟" }))
      .rejects.toBeInstanceOf(RelationshipNotFoundError);
  });

  it("normalizes nullable description and evidence fields", async () => {
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id         : "rel-2",
      chapterId  : "chapter-1",
      sourceId   : "persona-a",
      targetId   : "persona-b",
      type       : "师生",
      weight     : 1,
      description: null,
      evidence   : null,
      confidence : 0.6,
      status     : ProcessingStatus.DRAFT,
      updatedAt  : new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        findFirst: vi.fn().mockResolvedValue({ id: "rel-2" }),
        update   : relationshipUpdate
      }
    }));
    const service = createUpdateRelationshipService({
      $transaction: transaction
    } as never);

    const result = await service.updateRelationship("rel-2", {
      description: "   ",
      evidence   : null
    });

    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        description: null,
        evidence   : null
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      description: null,
      evidence   : null
    }));
  });
});
