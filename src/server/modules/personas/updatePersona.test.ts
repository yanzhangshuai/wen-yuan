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

  it("normalizes nullable fields and supports updating nameType", async () => {
    const update = vi.fn().mockResolvedValue({
      id        : "persona-2",
      name      : "老爷",
      aliases   : ["老爷"],
      gender    : null,
      hometown  : null,
      nameType  : NameType.TITLE_ONLY,
      globalTags: ["主角"],
      confidence: 0.51,
      updatedAt : new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue({ id: "persona-2" }),
        update
      }
    }));
    const service = createUpdatePersonaService({
      $transaction: transaction
    } as never);

    const result = await service.updatePersona("persona-2", {
      aliases   : [" 老爷 ", " ", "老爷"],
      gender    : "   ",
      hometown  : null,
      nameType  : NameType.TITLE_ONLY,
      globalTags: [" ", "主角", "主角"],
      confidence: 0.51
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        aliases   : ["老爷"],
        gender    : null,
        hometown  : null,
        nameType  : NameType.TITLE_ONLY,
        globalTags: ["主角"],
        confidence: 0.51
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      aliases   : ["老爷"],
      gender    : null,
      hometown  : null,
      nameType  : NameType.TITLE_ONLY,
      globalTags: ["主角"]
    }));
  });

  it("updates only the provided field without forcing optional normalization branches", async () => {
    const update = vi.fn().mockResolvedValue({
      id        : "persona-3",
      name      : "严监生",
      aliases   : [],
      gender    : null,
      hometown  : null,
      nameType  : NameType.NAMED,
      globalTags: [],
      confidence: 0.4,
      updatedAt : new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue({ id: "persona-3" }),
        update
      }
    }));
    const service = createUpdatePersonaService({
      $transaction: transaction
    } as never);

    const result = await service.updatePersona("persona-3", {
      name: " 严监生 "
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: "严监生" }
    }));
    expect(result).toEqual(expect.objectContaining({
      id  : "persona-3",
      name: "严监生"
    }));
  });

  it("updates current-book profile fields with persona fields in one transaction", async () => {
    const personaUpdate = vi.fn().mockResolvedValue({
      id        : "persona-4",
      name      : "王冕",
      aliases   : ["王参军"],
      gender    : "男",
      hometown  : "诸暨",
      nameType  : NameType.NAMED,
      globalTags: ["名士"],
      confidence: 0.9,
      updatedAt : new Date("2026-04-28T10:00:00.000Z")
    });
    const profileFindFirst = vi.fn().mockResolvedValue({ id: "profile-4" });
    const profileUpdate = vi.fn().mockResolvedValue({
      id           : "profile-4",
      bookId       : "book-1",
      localName    : "王冕",
      localSummary : "画荷名士",
      officialTitle: "参军",
      localTags    : ["名士"],
      ironyIndex   : 2,
      updatedAt    : new Date("2026-04-28T10:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue({ id: "persona-4" }),
        update   : personaUpdate
      },
      profile: {
        findFirst: profileFindFirst,
        update   : profileUpdate
      }
    }));
    const service = createUpdatePersonaService({
      $transaction: transaction
    } as never);

    const result = await service.updatePersona("persona-4", {
      bookId       : "book-1",
      name         : " 王冕 ",
      localName    : " 王冕 ",
      localSummary : " 画荷名士 ",
      officialTitle: " 参军 ",
      localTags    : ["名士", " 名士 "],
      ironyIndex   : 2
    });

    expect(profileFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        personaId: "persona-4",
        bookId   : "book-1",
        deletedAt: null
      }
    }));
    expect(profileUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "profile-4" },
      data : {
        localName    : "王冕",
        localSummary : "画荷名士",
        officialTitle: "参军",
        localTags    : ["名士"],
        ironyIndex   : 2
      }
    }));
    expect(result.profile).toEqual(expect.objectContaining({
      id           : "profile-4",
      localSummary : "画荷名士",
      officialTitle: "参军"
    }));
  });
});
