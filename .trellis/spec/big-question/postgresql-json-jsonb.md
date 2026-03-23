# PostgreSQL JSON vs JSONB 类型问题

> 严重等级：**Critical**（查询直接报错）
> 来源：adapted from mindfold-ai marketplace-specs/big-question/postgres-json-jsonb.md

## 问题现象

使用 PostgreSQL 的 `jsonb_*` 函数查询时报错，即使列中确实存储了 JSON 数据：

```
function jsonb_array_elements(json) does not exist
HINT: No function matches the given name and argument types.
You might need to add explicit type casts.
```

## 根因

### 问题一：Prisma schema 中 `Json` 映射到 PostgreSQL `json`，不是 `jsonb`

```prisma
model Character {
  id       String @id
  metadata Json   // 创建的是 PostgreSQL 'json' 类型，不是 'jsonb'
}
```

PostgreSQL 有两种 JSON 类型，函数不通用：

| 特性 | `json` | `jsonb` |
|------|--------|---------|
| 存储 | 文本（保留空格和 key 顺序） | 二进制（归一化） |
| 函数 | 只能用 `json_*` | 只能用 `jsonb_*` |
| 索引 | 有限 | 支持 GIN 索引 |
| 性能 | 操作较慢 | 操作较快 |

`jsonb_array_elements`、`jsonb_extract_path` 等函数**只能用于 `jsonb` 类型**。

### 问题二：camelCase 列名在原始 SQL 中需要双引号

PostgreSQL 对未加引号的标识符统一转小写：

```sql
-- 失败：PostgreSQL 将 metaData 转为 metadata（找不到列）
SELECT metaData->>'userId' FROM characters;

-- 正确：双引号保留大小写
SELECT "metaData"->>'userId' FROM characters;
```

## 解决方案

### 方案一：在原始 SQL 中添加 `::jsonb` 类型转换

```typescript
// 在 Prisma $queryRaw 中使用
import { Prisma } from '@prisma/client';

// 错误（报错）
const result = await prisma.$queryRaw`
  SELECT jsonb_array_elements(relationships) as rel
  FROM "Character"
  WHERE id = ${characterId}
`;

// 正确（显式转换）
const result = await prisma.$queryRaw`
  SELECT jsonb_array_elements(relationships::jsonb) as rel
  FROM "Character"
  WHERE id = ${characterId}
`;
```

### 方案二：在 Prisma schema 中将列定义为 `jsonb`

```prisma
// schema.prisma
model Character {
  id            String   @id @default(cuid())
  metadata      Json     @db.JsonB   // 明确指定 jsonb 类型
  relationships Json     @db.JsonB
}
```

**注意**：已有数据的列需要执行迁移。

### 方案三：camelCase 列名在原始 SQL 中加双引号

```typescript
// 错误（列名找不到）
const result = await prisma.$queryRaw`
  SELECT userId, createdAt FROM "Character"
`;

// 正确
const result = await prisma.$queryRaw`
  SELECT "userId", "createdAt" FROM "Character"
`;
```

### 完整示例：查询存储人物关系的 JSON 数组

```typescript
// 人物关系存储格式：[{ "target": "贾宝玉", "type": "父子", "evidence": "..." }]
async function getCharacterRelationships(characterId: string) {
  const result = await prisma.$queryRaw<Array<{
    target: string;
    type: string;
    evidence: string;
  }>>`
    SELECT
      rel->>'target' as target,
      rel->>'type' as type,
      rel->>'evidence' as evidence
    FROM "Character",
    jsonb_array_elements("relationships"::jsonb) as rel
    WHERE id = ${characterId}
  `;
  return result;
}
```

## 关键结论

1. **区分 `json` 和 `jsonb`**：函数不通用，用错直接报错
2. **Prisma 默认 `Json` = PostgreSQL `json`**，需要 `@db.JsonB` 才能用 `jsonb_*` 函数
3. **原始 SQL 中的 camelCase 列名必须加双引号**
4. **优先使用 Prisma 的类型安全 API**，仅在必要时用 `$queryRaw`
5. **在 Prisma client 中直接操作前先测试**原始 SQL 语句

## 参考

- [PostgreSQL JSON 类型文档](https://www.postgresql.org/docs/current/datatype-json.html)
- [Prisma JSON 字段文档](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields)
