import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/assets/[...key]/route";

/**
 * 文件定位（Next.js Catch-all Route Handler 单测）：
 * - 对应 `app/api/assets/[...key]/route.ts`，`[...key]` 是捕获式动态段，会把路径拆成数组传入参数。
 * - 该接口承担本地存储静态资源回源职责（封面、原文等），属于服务端接口层能力。
 *
 * 运行语义：
 * - 测试通过临时目录模拟 `STORAGE_LOCAL_ROOT`，验证 route 在 Node 环境下的文件读取与安全防护行为。
 */
describe("GET /api/assets/[...key]", () => {
  let storageRoot: string | null = null;
  const previousStorageRoot = process.env.STORAGE_LOCAL_ROOT;

  afterEach(async () => {
    // 资源清理目的：避免临时目录泄漏影响后续用例，也恢复环境变量防止跨用例污染。
    process.env.STORAGE_LOCAL_ROOT = previousStorageRoot;

    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
      storageRoot = null;
    }
  });

  it("returns stored file content for a valid local asset key", async () => {
    // 成功分支：合法 key 应映射到本地文件并输出正确 MIME，保证前端能正确展示文本/图片资源。
    // Arrange
    storageRoot = await mkdtemp(path.join(tmpdir(), "wen-yuan-assets-"));
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    const directoryPath = path.join(storageRoot, "books/book-1/source");
    const filePath = path.join(directoryPath, "original.txt");

    await mkdir(directoryPath, { recursive: true });
    await writeFile(filePath, "hello asset", "utf8");

    // Act
    const response = await GET(
      new Request("http://localhost/api/assets/books/book-1/source/original.txt"),
      {
        params: Promise.resolve({
          key: ["books", "book-1", "source", "original.txt"]
        })
      }
    );

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    await expect(response.text()).resolves.toBe("hello asset");
  });

  it("returns 404 when the asset file does not exist", async () => {
    // 缺失分支：目标资源不存在时返回 404，避免把“文件不存在”误报为系统异常。
    // Arrange
    storageRoot = await mkdtemp(path.join(tmpdir(), "wen-yuan-assets-"));
    process.env.STORAGE_LOCAL_ROOT = storageRoot;

    // Act
    const response = await GET(
      new Request("http://localhost/api/assets/books/book-1/source/missing.txt"),
      {
        params: Promise.resolve({
          key: ["books", "book-1", "source", "missing.txt"]
        })
      }
    );

    // Assert
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("Not Found");
  });

  it("returns 400 for unsafe path traversal keys", async () => {
    // 安全分支：阻断 `..` 路径穿越，防止越权读取存储根目录之外的敏感文件。
    // Arrange
    storageRoot = await mkdtemp(path.join(tmpdir(), "wen-yuan-assets-"));
    process.env.STORAGE_LOCAL_ROOT = storageRoot;

    // Act
    const response = await GET(
      new Request("http://localhost/api/assets/../escape.txt"),
      {
        params: Promise.resolve({
          key: ["..", "escape.txt"]
        })
      }
    );

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Bad Request");
  });
});
