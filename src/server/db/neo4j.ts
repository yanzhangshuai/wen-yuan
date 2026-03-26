import neo4j, { type Driver } from "neo4j-driver";

declare global {
  var neo4jDriver: Driver | undefined;
}

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
 * 延迟创建 Neo4j Driver。
 * 未配置环境变量时返回 null，避免在不启用 Neo4j 的环境直接抛错。
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
    disableLosslessIntegers: true
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.neo4jDriver = driver;
  }

  return driver;
}
