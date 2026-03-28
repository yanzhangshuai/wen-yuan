import { describe, expect, it } from "vitest";

import {
  buildDatedStorageKey,
  formatStorageDateSegment,
  sanitizeStorageFileName
} from "@/server/providers/storage/storage.utils";

describe("storage.utils", () => {
  it("formats storage date as YYYYMMDD", () => {
    // Arrange
    const date = new Date("2026-12-12T08:00:00.000Z");

    // Act
    const result = formatStorageDateSegment(date);

    // Assert
    expect(result).toBe("20261212");
  });

  it("builds dated key for books directory", () => {
    // Act
    const result = buildDatedStorageKey({
      directory   : "books",
      fileName    : "rulin.txt",
      date        : new Date("2026-12-12T08:00:00.000Z"),
      uniquePrefix: "book-1"
    });

    // Assert
    expect(result).toBe("books/20261212/book-1-rulin.txt");
  });

  it("builds dated key for images directory", () => {
    // Act
    const result = buildDatedStorageKey({
      directory: "images",
      fileName : "cover.png",
      date     : new Date("2026-12-12T08:00:00.000Z")
    });

    // Assert
    expect(result).toBe("images/20261212/cover.png");
  });

  it("strips path segment from uploaded file names", () => {
    // Act
    const result = sanitizeStorageFileName("C:\\fakepath\\folder\\cover.png");

    // Assert
    expect(result).toBe("cover.png");
  });
});
