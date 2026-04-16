# Neo4j 使用规范

> 本项目用 Neo4j 存储人物关系图谱，与 Prisma（PostgreSQL）并存。
> 两个数据库**不能共享事务**，必须在业务层明确边界。

---

## 核心规则

### 1. Session 必须手动关闭

Neo4j Driver 使用连接池。Session 用完不关，连接泄漏，最终导致查询 hang 死。

```typescript
// 禁止：忘记关闭 session
const session = neo4jDriver.session();
const result = await session.run('MATCH (n) RETURN n LIMIT 10');
return result.records;

// 正确：try/finally 确保关闭
const session = neo4jDriver.session();
try {
  const result = await session.run('MATCH (n) RETURN n LIMIT 10');
  return result.records;
} finally {
  await session.close();
}
```

推荐封装一个工具函数避免每次写 try/finally：

```typescript
// src/server/db/neo4j.ts
export async function withNeo4jSession<T>(
  fn: (session: Session) => Promise<T>
): Promise<T> {
  const session = neo4jDriver.session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

// 使用
const result = await withNeo4jSession(session =>
  session.run('MATCH (p:Persona {id: $id}) RETURN p', { id: personaId })
);
```

### 2. Cypher 参数化查询，禁止字符串拼接

字符串拼接 Cypher 等同于 SQL 注入，且会导致查询计划缓存失效。

```typescript
// 禁止：字符串拼接
const query = `MATCH (p:Persona {name: "${name}"}) RETURN p`;
await session.run(query);

// 正确：参数化
await session.run(
  'MATCH (p:Persona {name: $name}) RETURN p',
  { name }
);

// 复杂关系查询示例（人物关系网络）
await session.run(
  `MATCH (source:Persona {id: $sourceId})-[r:RELATION]->(target:Persona)
   WHERE r.type IN $types
   RETURN source, r, target
   LIMIT $limit`,
  { sourceId, types: ['父子', '姻亲', '师生'], limit: 50 }
);
```

### 3. `disableLosslessIntegers: true`（已配置，理解其含义）

Neo4j 原生整数是 64-bit，超过 JavaScript `Number.MAX_SAFE_INTEGER`（2^53）会精度丢失。
本项目在 Driver 初始化时已设置 `disableLosslessIntegers: true`，返回的整数是 JS number。

- **影响**：节点/关系的 Neo4j 内部 ID（`identity`）如果超过 2^53 会被截断，但对本项目无影响（数据量不会到这个级别）。
- **禁止**：不要移除这个配置，否则整数返回类型变为 `Integer` 对象，TypeScript 类型会报错。

### 4. Prisma + Neo4j 的事务边界

两个数据库不能共享事务。当一个操作同时写 Prisma 和 Neo4j 时，必须明确处理"半成功"。

```typescript
// 模式一：Prisma 先写，Neo4j 后同步（适合最终一致）
async function createPersonaWithGraph(data: PersonaData) {
  // Prisma 写入（强一致性，支持回滚）
  const persona = await prisma.persona.create({ data });

  // Neo4j 写入（最终一致，失败时记录错误，不回滚 Prisma）
  try {
    await withNeo4jSession(session =>
      session.run(
        'CREATE (p:Persona {id: $id, name: $name})',
        { id: persona.id, name: persona.name }
      )
    );
  } catch (err) {
    // 记录 Neo4j 同步失败，后续可重试（不要抛出，不要回滚 Prisma）
    console.error('[Neo4j sync failed]', { personaId: persona.id, err });
  }

  return persona;
}

// 模式二：Neo4j 仅用于读（图遍历），Prisma 负责所有写入
// 推荐！图谱可视化只需读 Neo4j，写入走 Prisma。
```

---

## 何时用 Neo4j，何时用 Prisma

| 场景 | 用哪个 |
|------|-------|
| 人物基本信息 CRUD | Prisma |
| 关系条目增删改 | Prisma |
| 图遍历：N 度人脉、最短路径 | Neo4j |
| 图遍历：派系聚类、影响力中心 | Neo4j |
| 3D 力导向图数据源 | Neo4j（或 Prisma 导出后转换） |
| 事务性批量写入 | Prisma |

---

## 类型安全

```typescript
import type { RecordShape } from 'neo4j-driver';

// 定义 Cypher 返回值类型（手动，Neo4j 没有 ORM 级别的类型推导）
interface PersonaNode {
  id: string;
  name: string;
  faction?: string;
}

async function findPersona(id: string): Promise<PersonaNode | null> {
  return withNeo4jSession(async session => {
    const result = await session.run<RecordShape>(
      'MATCH (p:Persona {id: $id}) RETURN p',
      { id }
    );
    if (result.records.length === 0) return null;
    return result.records[0].get('p').properties as PersonaNode;
  });
}
```

---

## 禁用模式

- Session 未关闭（内存 / 连接泄漏）。
- Cypher 字符串拼接用户输入（注入风险 + 缓存失效）。
- 在 Prisma 事务回调中调用 Neo4j（两个 DB 无共享事务）。
- 移除 `disableLosslessIntegers: true` 配置。
- 把 Neo4j 当主数据库写入业务数据（写入用 Prisma，图遍历用 Neo4j）。
