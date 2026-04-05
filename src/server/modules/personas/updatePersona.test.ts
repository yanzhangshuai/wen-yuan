import { NameType } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { createUpdatePersonaService } from "@/server/modules/personas/updatePersona";

/**
 * 文件定位（人物服务更新单测）：
 * - 覆盖“人工修订人物信息”流程，校验字段归一化与存在性校验。
 * - 该服务常由管理端编辑表单提交触发，是人物主数据治理链路的关键环节。
 *
 * 业务规则：
 * - 昵称、标签等文本字段需要去空格、去重，避免同义重复污染图谱质量。
 */
describe("updatePersona service", () => {
  it("updates persona fields with normalization", async () => {
    // 场景：用户在表单中可能输入前后空格或重复值，服务必须做规范化以保障数据一致性。
    const findFirst = vi.fn().mockResolvedValue({ id: "persona-1" });
    const update = vi.fn().mockResolvedValue({
      id        : "persona-1",
      name      : "周进",
      aliases   : ["周学道", "周大人"],
      gender    : "男",
      hometown  : "会稽",
      nameType  : NameType.NAMED,
      globalTags: ["儒生"],
      confidence: 0.82,
      updatedAt : new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst,
        update
      }
    }));
    const service = createUpdatePersonaService({
      $transaction: transaction
    } as never);

    const result = await service.updatePersona("persona-1", {
      name      : " 周进 ",
      aliases   : ["周学道", " 周大人 ", "周学道"],
      globalTags: ["儒生", " 儒生 "],
      gender    : " 男 ",
      hometown  : " 会稽 ",
      confidence: 0.82
    });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id       : "persona-1",
        deletedAt: null
      })
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "persona-1" },
      data : expect.objectContaining({
        name      : "周进",
        aliases   : ["周学道", "周大人"],
        globalTags: ["儒生"],
        gender    : "男",
        hometown  : "会稽",
        confidence: 0.82
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      id        : "persona-1",
      name      : "周进",
      aliases   : ["周学道", "周大人"],
      globalTags: ["儒生"]
    }));
  });

  it("throws not found when persona does not exist", async () => {
    // 边界：编辑对象已被删除或 ID 失效时，必须抛领域错误阻断更新。
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createUpdatePersonaService({
      $transaction: transaction
    } as never);

    await expect(service.updatePersona("missing", { name: "周进" }))
      .rejects.toBeInstanceOf(PersonaNotFoundError);
  });
});
