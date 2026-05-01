import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import {
  createGetPersonaByIdService,
  PersonaNotFoundError
} from "@/server/modules/personas/getPersonaById";

/**
 * 文件定位（人物详情聚合服务单测）：
 * - 验证服务可按人物 ID 聚合基础档案、时间线（biography）、关系网络（relationship）。
 * - 该服务通常服务于人物详情页，是跨模块读模型（read model）的典型实现。
 *
 * 业务重点：
 * - 输出不仅包含人物基础字段，还包含“关系方向”“时间线状态”等前端展示关键派生语义。
 */
describe("getPersonaById service", () => {
  it("returns persona detail snapshot", async () => {
    // 成功场景：同时存在生平与关系时，应输出完整快照，供详情页一次渲染。
    const service = createGetPersonaByIdService({
      persona: {
        findFirst: vi.fn().mockResolvedValue({
          id          : "persona-1",
          name        : "周进",
          aliases     : ["周学道"],
          gender      : "男",
          hometown    : "会稽",
          nameType    : "NAMED",
          recordSource: RecordSource.AI,
          confidence  : 0.96,
          profiles    : [
            {
              id           : "profile-1",
              bookId       : "book-1",
              localName    : "周进",
              localSummary : "旧儒生",
              officialTitle: "学道",
              localTags    : ["清苦"],
              ironyIndex   : 2.2,
              book         : { title: "儒林外史" }
            }
          ]
        })
      },
      biographyRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id          : "bio-1",
            chapterId   : "chapter-1",
            chapterNo   : 1,
            category    : "EVENT",
            title       : null,
            location    : null,
            event       : "出场",
            recordSource: RecordSource.AI,
            status      : ProcessingStatus.DRAFT,
            chapter     : {
              bookId: "book-1",
              book  : { title: "儒林外史" }
            }
          }
        ])
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-1",
            bookId              : "book-1",
            relationshipTypeCode: "师生",
            recordSource        : RecordSource.AI,
            status              : ProcessingStatus.DRAFT,
            sourceId            : "persona-1",
            targetId            : "persona-2",
            book                : { title: "儒林外史" },
            source              : { id: "persona-1", name: "周进" },
            target              : { id: "persona-2", name: "范进" },
            events              : [
              {
                chapterId: "chapter-1",
                chapterNo: 1,
                evidence : "原文证据"
              }
            ]
          }
        ])
      }
    } as never);

    const result = await service.getPersonaById("persona-1");

    expect(result.id).toBe("persona-1");
    expect(result.status).toBe(ProcessingStatus.DRAFT);
    expect(result.timeline).toHaveLength(1);
    expect(result.relationships[0]).toEqual(expect.objectContaining({
      direction      : "outgoing",
      counterpartName: "范进"
    }));
  });

  it("throws not found when persona is missing", async () => {
    // 防御分支：目标人物不存在时抛领域错误，避免上游页面把 null 误解为空态而继续渲染错误信息。
    const service = createGetPersonaByIdService({
      persona: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as never);

    await expect(service.getPersonaById("missing")).rejects.toBeInstanceOf(PersonaNotFoundError);
  });
});
