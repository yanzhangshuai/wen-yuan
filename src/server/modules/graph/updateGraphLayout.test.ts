import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import { createUpdateGraphLayoutService } from "@/server/modules/graph/updateGraphLayout";

describe("updateGraphLayout service", () => {
  it("updates profile positions and creates missing profiles", async () => {
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
