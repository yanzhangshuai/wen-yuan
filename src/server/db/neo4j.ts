import neo4j, { type Driver } from "neo4j-driver";

declare global {
  /**
   * 开发环境全局单例缓存：
   * - 目的：避免热更新反复创建 Driver 导致连接膨胀。
   * - 仅在当前 Node.js 进程有效，不会跨进程共享。
   */
  var neo4jDriver: Driver | undefined;
}

/**
 * 读取 Neo4j 连接配置。
 *
 * @returns
 * - 配置完整时返回 `{ uri, user, password }`
 * - 任一关键变量缺失时返回 `null`
 *
 * 设计原因：
 * - 将“未启用 Neo4j”视为可接受状态，而非启动即失败，便于在不同部署环境按需启用图数据库。
 */
function readNeo4jConfig(): { uri: string; user: string; password: string } | null {
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !user || !password) {
    return null;
  }

  return { uri, user, password };
}

/**
 * 文件定位（Next.js 服务端）：
 * - 数据访问层的 Neo4j Driver 提供器，仅在 Node.js 服务端运行。
 * - 被图谱/关系等业务模块调用，作为图数据库连接入口。
 *
 * 延迟创建 Neo4j Driver。
 * 未配置环境变量时返回 null，避免在不启用 Neo4j 的环境直接抛错。
 *
 * @returns Neo4j Driver 实例；若当前环境未配置 Neo4j 则返回 `null`。
 *
 * 分支说明：
 * - 命中 `globalThis.neo4jDriver`：复用已有连接，降低连接初始化成本；
 * - 配置缺失返回 `null`：业务层可据此走降级或跳过图操作；
 * - `NODE_ENV !== "production"` 才写全局缓存：生产环境通常由进程生命周期管理连接，避免全局状态歧义。
 */
export function getNeo4jDriver(): Driver | null {
  if (globalThis.neo4jDriver) {
    return globalThis.neo4jDriver;
  }

  const config = readNeo4jConfig();
  if (!config) {
    return null;
  }

  const driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
    // 关闭 Neo4j Integer 包装，减少上层序列化与数值转换负担。
    disableLosslessIntegers: true
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.neo4jDriver = driver;
  }

  return driver;
}
