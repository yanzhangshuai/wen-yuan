import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/assets/[...key]/route";

describe("GET /api/assets/[...key]", () => {
  let storageRoot: string | null = null;
  const previousStorageRoot = process.env.STORAGE_LOCAL_ROOT;

  afterEach(async () => {
    process.env.STORAGE_LOCAL_ROOT = previousStorageRoot;

    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
      storageRoot = null;
    }
  });

  it("returns stored file content for a valid local asset key", async () => {
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
