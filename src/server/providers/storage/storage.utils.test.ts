/**
 * 文件定位（存储 Provider 单测）：
 * - 覆盖文件存储抽象层行为，连接业务模块与具体存储实现（本地/云）。
 * - 该层保障资源读写、路径处理与元数据解析的一致性。
 *
 * 业务职责：
 * - 约束存储键语义、文件存在性判断与异常处理分支。
 * - 降低更换存储后端时对上层业务的影响范围。
 */

import { describe, expect, it } from "vitest";

import {
  buildDatedStorageKey,
  formatStorageDateSegment,
  sanitizeStorageFileName
} from "@/server/providers/storage/storage.utils";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("storage.utils", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("formats storage date as YYYYMMDD", () => {
    // Arrange
    const date = new Date("2026-12-12T08:00:00.000Z");

    // Act
    const result = formatStorageDateSegment(date);

    // Assert
    expect(result).toBe("20261212");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("strips path segment from uploaded file names", () => {
    // Act
    const result = sanitizeStorageFileName("C:\\fakepath\\folder\\cover.png");

    // Assert
    expect(result).toBe("cover.png");
  });
});
