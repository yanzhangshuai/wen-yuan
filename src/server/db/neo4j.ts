import neo4j, { Driver } from "neo4j-driver";

declare global {
  var neo4jDriver: Driver | undefined;
}

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER;
const password = process.env.NEO4J_PASSWORD;

if (!uri || !user || !password) {
  throw new Error("Missing Neo4j connection env: NEO4J_URI/NEO4J_USER/NEO4J_PASSWORD");
}

export const neo4jDriver =
  globalThis.neo4jDriver ??
  neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.neo4jDriver = neo4jDriver;
}
