import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activatePromptVersion,
  createPromptVersion,
  diffPromptVersions,
  getPromptTemplate,
  listPromptTemplates,
  previewPrompt,
  resolvePromptTemplateOrFallback
} from "@/server/modules/knowledge/prompt-templates";

const hoisted = vi.hoisted(() => ({
  prisma: {
    promptTemplate: {
      findMany  : vi.fn(),
      findUnique: vi.fn(),
      update    : vi.fn()
    },
    promptTemplateVersion: {
      findFirst : vi.fn(),
      findUnique: vi.fn(),
      create    : vi.fn(),
      update    : vi.fn(),
      updateMany: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

describe("prompt-templates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists templates and fetches template details", async () => {
    hoisted.prisma.promptTemplate.findMany.mockResolvedValueOnce([{ slug: "BOOK_VALIDATION" }]);
    hoisted.prisma.promptTemplate.findUnique.mockResolvedValueOnce({ slug: "BOOK_VALIDATION", versions: [] });

    await expect(listPromptTemplates()).resolves.toEqual([{ slug: "BOOK_VALIDATION" }]);
    await expect(getPromptTemplate("BOOK_VALIDATION")).resolves.toEqual({
      slug    : "BOOK_VALIDATION",
      versions: []
    });

    expect(hoisted.prisma.promptTemplate.findMany).toHaveBeenCalledWith({
      orderBy: { slug: "asc" },
      include: {
        versions: {
          orderBy: { createdAt: "desc" },
          take   : 1,
          select : { id: true, versionNo: true, createdAt: true, changeNote: true }
        }
      }
    });
  });

  it("creates prompt versions and validates activation ownership", async () => {
    hoisted.prisma.promptTemplate.findUnique
      .mockResolvedValueOnce({
        id      : "template-1",
        slug    : "BOOK_VALIDATION",
        versions: [{ versionNo: 2 }]
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id  : "template-1",
        slug: "BOOK_VALIDATION"
      })
      .mockResolvedValueOnce({
        id  : "template-1",
        slug: "BOOK_VALIDATION"
      });
    hoisted.prisma.promptTemplateVersion.create.mockResolvedValueOnce({
      id       : "version-3",
      versionNo: 3
    });
    hoisted.prisma.promptTemplateVersion.findUnique
      .mockResolvedValueOnce({ id: "version-other", templateId: "template-2" })
      .mockResolvedValueOnce({ id: "version-3", templateId: "template-1", bookTypeId: null });
    hoisted.prisma.$transaction.mockResolvedValueOnce([{ count: 0 }, { id: "version-3" }]);

    await expect(createPromptVersion("BOOK_VALIDATION", {
      systemPrompt: "system",
      userPrompt  : "user",
      changeNote  : "manual",
      createdBy   : "tester"
    })).resolves.toEqual({
      id       : "version-3",
      versionNo: 3
    });
    await expect(createPromptVersion("MISSING", {
      systemPrompt: "system",
      userPrompt  : "user"
    })).rejects.toThrow("模板 MISSING 不存在");
    await expect(activatePromptVersion("BOOK_VALIDATION", "version-other")).rejects.toThrow(
      "版本不属于该模板"
    );
    await expect(activatePromptVersion("BOOK_VALIDATION", "version-3")).resolves.toEqual({
      id        : "version-3",
      templateId: "template-1",
      bookTypeId: null
    });

    expect(hoisted.prisma.promptTemplateVersion.create).toHaveBeenCalledWith({
      data: {
        templateId  : "template-1",
        versionNo   : 3,
        systemPrompt: "system",
        userPrompt  : "user",
        bookTypeId  : undefined,
        changeNote  : "manual",
        createdBy   : "tester",
        isBaseline  : false
      }
    });
  });

  it("diffs versions and previews active or fallback content", async () => {
    hoisted.prisma.promptTemplateVersion.findUnique
      .mockResolvedValueOnce({
        id          : "v1",
        versionNo   : 1,
        systemPrompt: "sys-1",
        userPrompt  : "user-1"
      })
      .mockResolvedValueOnce({
        id          : "v2",
        versionNo   : 2,
        systemPrompt: "sys-2",
        userPrompt  : "user-2"
      });
    hoisted.prisma.promptTemplateVersion.findFirst
      .mockResolvedValueOnce({
        id          : "v10",
        versionNo   : 10,
        systemPrompt: "system {bookTitle}",
        userPrompt  : "user {chapterNo}"
      })
      .mockResolvedValueOnce(null);
    hoisted.prisma.promptTemplate.findUnique
      .mockResolvedValueOnce({
        id     : "tmpl-1",
        slug   : "BOOK_VALIDATION",
        codeRef: "buildBookValidationPrompt"
      })
      .mockResolvedValueOnce({
        id     : "tmpl-2",
        slug   : "CHAPTER_VALIDATION",
        codeRef: "buildChapterValidationPrompt"
      });

    await expect(diffPromptVersions("BOOK_VALIDATION", "v1", "v2")).resolves.toEqual({
      v1: { id: "v1", versionNo: 1, systemPrompt: "sys-1", userPrompt: "user-1" },
      v2: { id: "v2", versionNo: 2, systemPrompt: "sys-2", userPrompt: "user-2" }
    });
    await expect(previewPrompt("BOOK_VALIDATION", undefined, {
      bookTitle: "儒林外史",
      chapterNo: "3"
    })).resolves.toEqual({
      systemPrompt: "system 儒林外史",
      userPrompt  : "user 3",
      versionNo   : 10
    });
    await expect(previewPrompt("CHAPTER_VALIDATION")).resolves.toEqual({
      systemPrompt: "(未配置版本，使用代码默认提示词)",
      userPrompt  : "",
      codeRef     : "buildChapterValidationPrompt"
    });
  });

  it("rejects missing prompt versions when diffing", async () => {
    hoisted.prisma.promptTemplateVersion.findUnique
      .mockResolvedValueOnce({ id: "v1", versionNo: 1, systemPrompt: "sys", userPrompt: "user" })
      .mockResolvedValueOnce(null);

    await expect(diffPromptVersions("BOOK_VALIDATION", "v1", "missing")).rejects.toThrow(
      "指定版本不存在"
    );
  });

  it("bypasses runtime prompt lookup in the test environment", async () => {
    vi.stubEnv("NODE_ENV", "test");

    await expect(resolvePromptTemplateOrFallback({
      slug    : "CHAPTER_VALIDATION",
      fallback: { system: "fallback-system", user: "fallback-user" }
    })).resolves.toEqual({
      system: "fallback-system",
      user  : "fallback-user"
    });

    expect(hoisted.prisma.promptTemplate.findUnique).not.toHaveBeenCalled();
  });

  it("resolves runtime templates through genre-specific, active and fallback versions", async () => {
    vi.stubEnv("NODE_ENV", "production");

    hoisted.prisma.promptTemplate.findUnique
      .mockResolvedValueOnce({
        id     : "template-1",
        codeRef: "buildChapterValidationPrompt"
      })
      .mockResolvedValueOnce({
        id     : "template-2",
        codeRef: "buildBookValidationPrompt"
      })
      .mockResolvedValueOnce({
        id     : "template-3",
        codeRef: "buildEntityResolutionPrompt"
      })
      .mockResolvedValueOnce(null);
    hoisted.prisma.promptTemplateVersion.findFirst
      // Call 1 (CHAPTER_VALIDATION, bookTypeId=classic): genre-specific → found
      .mockResolvedValueOnce({
        id          : "genre-1",
        versionNo   : 8,
        systemPrompt: "genre {genre}",
        userPrompt  : "user {bookTitle}"
      })
      // Call 2 (BOOK_VALIDATION, bookTypeId=classic): genre-specific → null
      .mockResolvedValueOnce(null)
      // Call 2 continued: isActive=true, bookTypeId=null → found
      .mockResolvedValueOnce({
        id          : "active-2",
        versionNo   : 3,
        systemPrompt: "active {bookTitle}",
        userPrompt  : "active-user {chapterNo}"
      })
      // Call 3 (ENTITY_RESOLUTION, bookTypeId=classic): genre-specific → null
      .mockResolvedValueOnce(null)
      // Call 3 continued: isActive=true, bookTypeId=null → null
      .mockResolvedValueOnce(null)
      // Call 3 continued: fallback → found
      .mockResolvedValueOnce({
        id          : "fallback-3",
        versionNo   : 5,
        systemPrompt: "fallback {bookTitle}",
        userPrompt  : "fallback-user {genre}"
      });

    await expect(resolvePromptTemplateOrFallback({
      slug        : "CHAPTER_VALIDATION",
      bookTypeId  : "classic",
      replacements: { genre: "classic", bookTitle: "儒林外史" },
      fallback    : { system: "fallback-system", user: "fallback-user" }
    })).resolves.toEqual({
      system   : "genre classic",
      user     : "user 儒林外史",
      versionId: "genre-1",
      versionNo: 8,
      codeRef  : "buildChapterValidationPrompt"
    });

    await expect(resolvePromptTemplateOrFallback({
      slug        : "BOOK_VALIDATION",
      bookTypeId  : "classic",
      replacements: { bookTitle: "儒林外史", chapterNo: "7" },
      fallback    : { system: "fallback-system", user: "fallback-user" }
    })).resolves.toEqual({
      system   : "active 儒林外史",
      user     : "active-user 7",
      versionId: "active-2",
      versionNo: 3,
      codeRef  : "buildBookValidationPrompt"
    });

    await expect(resolvePromptTemplateOrFallback({
      slug        : "ENTITY_RESOLUTION",
      bookTypeId  : "classic",
      replacements: { bookTitle: "儒林外史", genre: "classic" },
      fallback    : { system: "fallback-system", user: "fallback-user" }
    })).resolves.toEqual({
      system   : "fallback 儒林外史",
      user     : "fallback-user classic",
      versionId: "fallback-3",
      versionNo: 5,
      codeRef  : "buildEntityResolutionPrompt"
    });

    await expect(resolvePromptTemplateOrFallback({
      slug    : "MISSING_TEMPLATE",
      fallback: { system: "fallback-system", user: "fallback-user" }
    })).resolves.toEqual({
      system: "fallback-system",
      user  : "fallback-user"
    });
  });

  it("falls back and logs a warning when runtime template lookup fails", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    hoisted.prisma.promptTemplate.findUnique.mockRejectedValueOnce(new Error("db offline"));

    await expect(resolvePromptTemplateOrFallback({
      slug        : "BOOK_VALIDATION",
      bookTypeId  : "classic",
      replacements: { bookTitle: "儒林外史" },
      fallback    : { system: "fallback-system", user: "fallback-user" }
    })).resolves.toEqual({
      system: "fallback-system",
      user  : "fallback-user"
    });

    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("creates the first prompt version from an empty template history", async () => {
    hoisted.prisma.promptTemplate.findUnique.mockResolvedValueOnce({
      id      : "template-1",
      slug    : "ENTITY_RESOLUTION",
      versions: []
    });
    hoisted.prisma.promptTemplateVersion.create.mockResolvedValueOnce({
      id       : "version-1",
      versionNo: 1
    });

    await expect(createPromptVersion("ENTITY_RESOLUTION", {
      systemPrompt: "system",
      userPrompt  : "user",
      bookTypeId  : "classic",
      createdBy   : "tester",
      isBaseline  : true
    })).resolves.toEqual({
      id       : "version-1",
      versionNo: 1
    });

    expect(hoisted.prisma.promptTemplateVersion.create).toHaveBeenCalledWith({
      data: {
        templateId  : "template-1",
        versionNo   : 1,
        systemPrompt: "system",
        userPrompt  : "user",
        bookTypeId  : "classic",
        changeNote  : undefined,
        createdBy   : "tester",
        isBaseline  : true
      }
    });
  });

  it("rejects activation when the template is missing", async () => {
    hoisted.prisma.promptTemplate.findUnique.mockResolvedValueOnce(null);

    await expect(activatePromptVersion("MISSING", "version-1")).rejects.toThrow("模板 MISSING 不存在");
  });

  it("previews an explicit version id and leaves placeholders unchanged without sample input", async () => {
    hoisted.prisma.promptTemplate.findUnique.mockResolvedValueOnce({
      slug           : "BOOK_VALIDATION",
      activeVersionId: "active-1",
      codeRef        : "buildBookValidationPrompt"
    });
    hoisted.prisma.promptTemplateVersion.findUnique.mockResolvedValueOnce({
      id          : "version-12",
      versionNo   : 12,
      systemPrompt: "system {bookTitle}",
      userPrompt  : "user {chapterNo}"
    });

    await expect(previewPrompt("BOOK_VALIDATION", "version-12")).resolves.toEqual({
      systemPrompt: "system {bookTitle}",
      userPrompt  : "user {chapterNo}",
      versionNo   : 12
    });
  });

  it("rejects preview requests for missing templates", async () => {
    hoisted.prisma.promptTemplate.findUnique.mockResolvedValueOnce(null);

    await expect(previewPrompt("MISSING_TEMPLATE")).rejects.toThrow("模板 MISSING_TEMPLATE 不存在");
  });

  it("uses the active runtime version unchanged when genre and replacements are absent", async () => {
    vi.stubEnv("NODE_ENV", "production");

    hoisted.prisma.promptTemplate.findUnique.mockResolvedValueOnce({
      id     : "template-1",
      codeRef: "buildBookValidationPrompt"
    });
    hoisted.prisma.promptTemplateVersion.findFirst.mockResolvedValueOnce({
      id          : "active-1",
      versionNo   : 4,
      systemPrompt: "system literal",
      userPrompt  : "user literal"
    });

    await expect(resolvePromptTemplateOrFallback({
      slug    : "BOOK_VALIDATION",
      fallback: { system: "fallback-system", user: "fallback-user" }
    })).resolves.toEqual({
      system   : "system literal",
      user     : "user literal",
      versionId: "active-1",
      versionNo: 4,
      codeRef  : "buildBookValidationPrompt"
    });
  });

  it("falls back when a template has no usable active or fallback runtime version", async () => {
    vi.stubEnv("NODE_ENV", "production");

    hoisted.prisma.promptTemplate.findUnique.mockResolvedValueOnce({
      id     : "template-1",
      codeRef: "buildEntityResolutionPrompt"
    });
    // isActive=true → null, fallback → null
    hoisted.prisma.promptTemplateVersion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(resolvePromptTemplateOrFallback({
      slug    : "ENTITY_RESOLUTION",
      fallback: { system: "fallback-system", user: "fallback-user" }
    })).resolves.toEqual({
      system: "fallback-system",
      user  : "fallback-user"
    });
  });

  it("falls back and stringifies non-Error runtime lookup failures", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    hoisted.prisma.promptTemplate.findUnique.mockRejectedValueOnce("db offline");

    await expect(resolvePromptTemplateOrFallback({
      slug    : "BOOK_VALIDATION",
      fallback: { system: "fallback-system", user: "fallback-user" }
    })).resolves.toEqual({
      system: "fallback-system",
      user  : "fallback-user"
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "[knowledge.prompt-templates] runtime resolve failed, using fallback",
      expect.objectContaining({
        slug   : "BOOK_VALIDATION",
        message: "db offline"
      })
    );
    warnSpy.mockRestore();
  });
});
