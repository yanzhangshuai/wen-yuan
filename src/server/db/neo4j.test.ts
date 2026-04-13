/**
 * 文件定位（数据库基础设施单测）：
 * - 覆盖 Neo4j Driver 提供器的配置分支与缓存策略。
 * - 该层位于图数据库业务模块下游，负责把环境变量契约转换为可复用连接。
 *
 * 业务职责：
 * - 在未启用 Neo4j 时稳定降级为 `null`。
 * - 在非生产环境复用全局 driver，避免热更新重复建连。
 * - 在生产环境避免写入全局缓存，把连接生命周期交给进程管理。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  authBasic   : vi.fn(),
  createDriver: vi.fn()
}));

vi.mock("neo4j-driver", () => ({
  default: {
    auth  : { basic: hoisted.authBasic },
    driver: hoisted.createDriver
  }
}));

async function importNeo4jModule() {
  vi.resetModules();
  return import("./neo4j");
}

function restoreEnv(key: string, value: string | undefined) {
  if (typeof value === "undefined") {
    Reflect.deleteProperty(process.env, key);
    return;
  }

  Reflect.set(process.env, key, value);
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("getNeo4jDriver", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUri = process.env.NEO4J_URI;
  const originalUser = process.env.NEO4J_USER;
  const originalPassword = process.env.NEO4J_PASSWORD;

  afterEach(() => {
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("NEO4J_URI", originalUri);
    restoreEnv("NEO4J_USER", originalUser);
    restoreEnv("NEO4J_PASSWORD", originalPassword);
    Reflect.deleteProperty(globalThis, "neo4jDriver");
    hoisted.authBasic.mockReset();
    hoisted.createDriver.mockReset();
    vi.resetModules();
  });

  function setCompleteConfig() {
    process.env.NEO4J_URI = "bolt://127.0.0.1:7687";
    process.env.NEO4J_USER = "neo4j";
    process.env.NEO4J_PASSWORD = "secret";
  }

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null when uri is missing", async () => {
    // Arrange
    Reflect.deleteProperty(process.env, "NEO4J_URI");
    process.env.NEO4J_USER = "neo4j";
    process.env.NEO4J_PASSWORD = "secret";

    const { getNeo4jDriver } = await importNeo4jModule();

    // Act
    const result = getNeo4jDriver();

    // Assert
    expect(result).toBeNull();
    expect(hoisted.authBasic).not.toHaveBeenCalled();
    expect(hoisted.createDriver).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null when user is missing", async () => {
    // Arrange
    process.env.NEO4J_URI = "bolt://127.0.0.1:7687";
    Reflect.deleteProperty(process.env, "NEO4J_USER");
    process.env.NEO4J_PASSWORD = "secret";

    const { getNeo4jDriver } = await importNeo4jModule();

    // Act
    const result = getNeo4jDriver();

    // Assert
    expect(result).toBeNull();
    expect(hoisted.authBasic).not.toHaveBeenCalled();
    expect(hoisted.createDriver).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null when password is missing", async () => {
    // Arrange
    process.env.NEO4J_URI = "bolt://127.0.0.1:7687";
    process.env.NEO4J_USER = "neo4j";
    Reflect.deleteProperty(process.env, "NEO4J_PASSWORD");

    const { getNeo4jDriver } = await importNeo4jModule();

    // Act
    const result = getNeo4jDriver();

    // Assert
    expect(result).toBeNull();
    expect(hoisted.authBasic).not.toHaveBeenCalled();
    expect(hoisted.createDriver).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("reuses cached global driver before reading env config", async () => {
    // Arrange
    const cachedDriver = { name: "cached-driver" } as never;
    globalThis.neo4jDriver = cachedDriver;

    const { getNeo4jDriver } = await importNeo4jModule();

    // Act
    const result = getNeo4jDriver();

    // Assert
    expect(result).toBe(cachedDriver);
    expect(hoisted.authBasic).not.toHaveBeenCalled();
    expect(hoisted.createDriver).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates and caches driver in non-production", async () => {
    // Arrange
    Reflect.set(process.env, "NODE_ENV", "development");
    setCompleteConfig();
    const authToken = { type: "basic-auth" };
    const driver = { name: "dev-driver" } as never;
    hoisted.authBasic.mockReturnValue(authToken);
    hoisted.createDriver.mockReturnValue(driver);

    const { getNeo4jDriver } = await importNeo4jModule();

    // Act
    const result = getNeo4jDriver();

    // Assert
    expect(hoisted.authBasic).toHaveBeenCalledWith("neo4j", "secret");
    expect(hoisted.createDriver).toHaveBeenCalledWith(
      "bolt://127.0.0.1:7687",
      authToken,
      {
        disableLosslessIntegers     : true,
        connectionTimeout           : 1_500,
        connectionAcquisitionTimeout: 1_500,
        maxTransactionRetryTime     : 1_000
      }
    );
    expect(result).toBe(driver);
    expect(globalThis.neo4jDriver).toBe(driver);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("does not cache driver in production", async () => {
    // Arrange
    Reflect.set(process.env, "NODE_ENV", "production");
    setCompleteConfig();
    const authToken = { type: "basic-auth" };
    const driver = { name: "prod-driver" } as never;
    hoisted.authBasic.mockReturnValue(authToken);
    hoisted.createDriver.mockReturnValue(driver);

    const { getNeo4jDriver } = await importNeo4jModule();

    // Act
    const result = getNeo4jDriver();

    // Assert
    expect(result).toBe(driver);
    expect(globalThis.neo4jDriver).toBeUndefined();
  });
});
