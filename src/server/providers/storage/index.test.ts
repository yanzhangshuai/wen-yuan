import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LocalStorageProvider,
  OssStorageProvider,
  provideStorage
} from "@/server/providers/storage";
import type {
  StorageClientFactory,
  StorageProviderClient
} from "@/server/providers/storage";

/**
 * 测试只关心 provider 路由行为，因此使用最小 client 替身隔离真实存储实现。
 */
function createFakeClient(): StorageProviderClient {
  return {
    putObject   : async () => ({ key: "books/demo.txt", url: "/api/assets/books/demo.txt", contentType: "text/plain", size: 4 }),
    deleteObject: async () => undefined,
    getObjectUrl: (key) => `/api/assets/${key}`,
    getObject   : async () => Buffer.from("")
  };
}

describe("provideStorage", () => {
  it("uses local as default provider when provider is empty", () => {
    // Arrange
    const localFactory = vi.fn(createFakeClient);
    const ossFactory = vi.fn(createFakeClient);
    const factories: Record<string, StorageClientFactory> = {
      local: localFactory,
      oss  : ossFactory
    };

    // Act
    provideStorage(undefined, factories);

    // Assert
    expect(localFactory).toHaveBeenCalledTimes(1);
    expect(ossFactory).not.toHaveBeenCalled();
  });

  it("normalizes provider name before routing", () => {
    // Arrange
    const localFactory = vi.fn(createFakeClient);
    const ossFactory = vi.fn(createFakeClient);
    const factories: Record<string, StorageClientFactory> = {
      local: localFactory,
      oss  : ossFactory
    };

    // Act
    provideStorage("LOCAL", factories);

    // Assert
    expect(localFactory).toHaveBeenCalledTimes(1);
    expect(ossFactory).not.toHaveBeenCalled();
  });

  it("throws explicit error for unsupported provider", () => {
    // Arrange
    const factories: Record<string, StorageClientFactory> = {
      local: createFakeClient
    };

    // Act / Assert
    expect(() => provideStorage("unknown", factories)).toThrowError("Unsupported STORAGE_PROVIDER: unknown");
  });

  it("routes to oss provider factory when oss provider is selected", () => {
    // Arrange
    const localFactory = vi.fn(createFakeClient);
    const ossFactory = vi.fn(createFakeClient);
    const factories: Record<string, StorageClientFactory> = {
      local: localFactory,
      oss  : ossFactory
    };

    // Act
    provideStorage("oss", factories);

    // Assert
    expect(ossFactory).toHaveBeenCalledTimes(1);
    expect(localFactory).not.toHaveBeenCalled();
  });
});

describe("LocalStorageProvider", () => {
  let storageRoot: string | null = null;

  afterEach(async () => {
    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
      storageRoot = null;
    }
  });

  it("writes object to disk and returns logical metadata", async () => {
    // Arrange
    storageRoot = await mkdtemp(path.join(tmpdir(), "wen-yuan-storage-"));
    const provider = new LocalStorageProvider(storageRoot, "/api/assets");

    // Act
    const result = await provider.putObject({
      key        : "books/book-1/source/original.txt",
      body       : "hello world",
      contentType: "text/plain"
    });

    // Assert
    expect(result).toEqual({
      key        : "books/book-1/source/original.txt",
      url        : "/api/assets/books/book-1/source/original.txt",
      contentType: "text/plain",
      size       : 11
    });

    const savedContent = await readFile(path.join(storageRoot, "books/book-1/source/original.txt"), "utf8");
    expect(savedContent).toBe("hello world");
  });

  it("deletes object from disk", async () => {
    // Arrange
    storageRoot = await mkdtemp(path.join(tmpdir(), "wen-yuan-storage-"));
    const provider = new LocalStorageProvider(storageRoot, "/api/assets");
    const key = "books/book-1/cover/cover.png";

    await provider.putObject({
      key,
      body       : Buffer.from([1, 2, 3]),
      contentType: "image/png"
    });

    // Act
    await provider.deleteObject(key);

    // Assert
    await expect(access(path.join(storageRoot, key))).rejects.toThrow();
  });

  it("builds object urls without exposing physical paths", () => {
    // Arrange
    const provider = new LocalStorageProvider("/tmp/wen-yuan-storage", "https://assets.example.com/files/");

    // Act
    const objectUrl = provider.getObjectUrl("books/book-1/images/page-1.jpg");

    // Assert
    expect(objectUrl).toBe("https://assets.example.com/files/books/book-1/images/page-1.jpg");
  });

  it("rejects unsafe object keys", async () => {
    // Arrange
    storageRoot = await mkdtemp(path.join(tmpdir(), "wen-yuan-storage-"));
    const provider = new LocalStorageProvider(storageRoot, "/api/assets");

    // Act / Assert
    await expect(provider.putObject({ key: "../escape.txt", body: "x" })).rejects.toThrowError(
      "Invalid storage object key: ../escape.txt"
    );
  });
});

describe("OssStorageProvider", () => {
  it("uploads object and returns derived metadata", async () => {
    // Arrange
    const put = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const provider = new OssStorageProvider({
      endpoint       : "oss-cn-beijing.aliyuncs.com",
      bucket         : "demo-bucket",
      region         : "oss-cn-beijing",
      accessKeyId    : "ak",
      accessKeySecret: "sk",
      publicBaseUrl  : "https://cdn.example.com/assets/",
      client         : { put, delete: remove, get: vi.fn() }
    });

    // Act
    const result = await provider.putObject({
      key        : "books/20260328/demo.txt",
      body       : "hello",
      contentType: "text/plain; charset=utf-8"
    });

    // Assert
    expect(put).toHaveBeenCalledWith(
      "books/20260328/demo.txt",
      expect.any(Buffer),
      {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      }
    );
    expect(result).toEqual({
      key        : "books/20260328/demo.txt",
      url        : "https://cdn.example.com/assets/books/20260328/demo.txt",
      contentType: "text/plain; charset=utf-8",
      size       : 5
    });
  });

  it("ignores delete for missing object", async () => {
    // Arrange
    const provider = new OssStorageProvider({
      endpoint       : "oss-cn-beijing.aliyuncs.com",
      bucket         : "demo-bucket",
      region         : "oss-cn-beijing",
      accessKeyId    : "ak",
      accessKeySecret: "sk",
      client         : {
        put   : vi.fn(),
        delete: vi.fn().mockRejectedValue({ code: "NoSuchKey" }),
        get   : vi.fn()
      }
    });

    // Act / Assert
    await expect(provider.deleteObject("books/20260328/missing.txt")).resolves.toBeUndefined();
  });

  it("throws when mandatory OSS config is missing", () => {
    // Arrange / Act / Assert
    expect(() => new OssStorageProvider({
      bucket         : "",
      accessKeyId    : "ak",
      accessKeySecret: "sk"
    })).toThrowError("OSS_BUCKET is required");
  });
});
