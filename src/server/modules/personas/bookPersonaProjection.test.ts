import { describe, expect, it } from "vitest";

import { mapPersonaProjectionRows } from "@/server/modules/personas/bookPersonaProjection";

describe("bookPersonaProjection", () => {
  it("maps promoted persona rows into book persona list items", () => {
    const result = mapPersonaProjectionRows("book-1", [
      {
        id                     : "persona-1",
        name                   : "鲍廷玺",
        aliases                : ["鲍二"],
        gender                 : "男",
        hometown               : null,
        nameType               : "NAMED",
        globalTags             : ["盐商"],
        confidence             : 0.93,
        recordSource           : "AI",
        status                 : "CONFIRMED",
        mentionCount           : 4,
        effectiveBiographyCount: 2,
        distinctChapters       : 3
      }
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        id       : "persona-1",
        profileId: null,
        bookId   : "book-1",
        name     : "鲍廷玺",
        localName: "鲍廷玺",
        aliases  : ["鲍二"]
      })
    ]);
  });
});
