# 子任务 D：Pair 聚合 API（结构关系 + 事件聚合查询）

> **父任务**：[04-30-character-relation-entry-design](../04-30-character-relation-entry-design/prd.md)
> **依赖**：子任务 A（schema 必须就位）
> **可与 B、C 并行**
> **验收点映射**：父 §7.7

---

## 1. 目标

新增 `GET /api/persona-pairs/:bookId/:aId/:bId`：返回两个人物之间所有结构关系，每条结构关系下挂全部关系事件，按 `chapterNo` 升序。MVP 不引入 cache（父 §10 已确认）。

---

## 2. 路由与契约

**文件（新建）**：`src/app/api/persona-pairs/[bookId]/[aId]/[bId]/route.ts`

### 2.1 路由约束

- 方法：`GET`。
- 鉴权：登录态即可（admin + viewer）；未登录 401。
- 路径参数全部 UUID 校验失败 → 400。
- `aId === bId` → 400 `RelationshipInputError("起点和终点不能相同")`。

### 2.2 请求

无 body / query。

### 2.3 响应（成功 200）

```ts
interface PersonaPairResponse {
  bookId       : string;
  aId          : string;
  bId          : string;
  // canonical 视角下两端的人物快照
  personas     : {
    id            : string;
    name          : string;
    aliases       : string[];
    portraitUrl   : string | null;
  }[];                                  // 长度 2，按 [a, b] 顺序
  relationships: PersonaPairRelationship[];
}

interface PersonaPairRelationship {
  id                  : string;
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;
  relationshipType    : {
    code         : string;
    name         : string;
    group        : string;
    directionMode: "SYMMETRIC" | "INVERSE" | "DIRECTED";
    inverseLabel : string | null;       // 反向显示标签（如父→子 反向 子→父）
  };
  recordSource        : "DRAFT_AI" | "AI" | "MANUAL";
  status              : "PENDING" | "VERIFIED" | "REJECTED";
  firstChapterNo      : number | null;  // MIN(events.chapter_no)
  lastChapterNo       : number | null;  // MAX(events.chapter_no)
  eventCount          : number;
  events              : PersonaPairEvent[];
}

interface PersonaPairEvent {
  id            : string;
  chapterId     : string;
  chapterNo     : number;
  chapterTitle  : string;
  sourceId      : string;
  targetId      : string;
  summary       : string;
  evidence      : string | null;
  attitudeTags  : string[];
  paraIndex     : number | null;
  confidence    : number;
  recordSource  : "DRAFT_AI" | "AI" | "MANUAL";
  status        : "PENDING" | "VERIFIED" | "REJECTED";
}
```

### 2.4 错误响应

| 状态 | code | 触发 |
| ---- | ---- | ---- |
| 400  | `BAD_REQUEST`            | UUID 非法 / aId == bId |
| 401  | `UNAUTHORIZED`           | 未登录 |
| 404  | `BOOK_NOT_FOUND`         | 书籍不存在或软删 |
| 404  | `PERSONA_NOT_FOUND`      | 任一人物不存在或软删 |
| 500  | `COMMON_INTERNAL_ERROR`  | 兜底 |

---

## 3. Service

**文件（新建）**：`src/server/modules/relationships/getPersonaPair.ts`

### 3.1 函数签名

```ts
export interface GetPersonaPairInput {
  bookId: string;
  aId   : string;
  bId   : string;
}

export interface GetPersonaPairResult { /* = PersonaPairResponse */ }

export function createGetPersonaPairService(prismaClient: PrismaClient = prisma) {
  async function getPersonaPair(input: GetPersonaPairInput): Promise<GetPersonaPairResult> { ... }
  return { getPersonaPair };
}

export const { getPersonaPair } = createGetPersonaPairService();
```

### 3.2 查询规划（必须避免 N+1）

```ts
// Step 1: 并发校验 book + 两个 persona 存在
const [book, personas] = await Promise.all([
  prisma.book.findFirst({ where: { id: bookId, deletedAt: null }, select: { id: true } }),
  prisma.persona.findMany({
    where : { id: { in: [aId, bId] }, deletedAt: null },
    select: { id: true, name: true, aliases: true, portraitUrl: true }
  })
]);
if (!book) throw new BookNotFoundError(bookId);
if (personas.length !== 2) throw new PersonaNotFoundError(...);

// Step 2: 拉取双向关系（覆盖 a→b 与 b→a）
const relationships = await prisma.relationship.findMany({
  where: {
    bookId,
    deletedAt: null,
    OR: [
      { sourceId: aId, targetId: bId },
      { sourceId: bId, targetId: aId }
    ]
  },
  include: {
    relationshipType: true,
    events: {
      where  : { deletedAt: null },
      orderBy: [{ chapterNo: "asc" }, { paraIndex: "asc" }, { createdAt: "asc" }],
      include: {
        chapter: { select: { id: true, no: true, title: true } }
      }
    }
  },
  orderBy: [{ relationshipTypeCode: "asc" }]
});

// Step 3: 组装 firstChapterNo / lastChapterNo / eventCount + 映射输出 DTO
```

> **避免 N+1**：通过 Prisma `include.events` 一次取齐；`chapter` 通过 nested include 一次 join。
> **排序**：关系按 `relationshipTypeCode` 字母序；事件按 `chapterNo ASC, paraIndex ASC, createdAt ASC`。

### 3.3 边界

- 关系空集时返回 `relationships: []`，仍为 200。
- 软删的关系/事件不返回。

---

## 4. 客户端 fetch 工具

**文件（新建）**：`src/lib/services/persona-pairs.ts`

```ts
import { clientFetch } from "./client-fetch";   // 项目已有工具
import type { PersonaPairResponse } from "@/types/persona-pair";

export async function fetchPersonaPair(bookId: string, aId: string, bId: string): Promise<PersonaPairResponse> {
  return clientFetch(`/api/persona-pairs/${encodeURIComponent(bookId)}/${encodeURIComponent(aId)}/${encodeURIComponent(bId)}`);
}
```

类型声明放 `src/types/persona-pair.ts`（新建）以便服务端与客户端共享。

---

## 5. 单元测试

### 5.1 service 单测

**文件（新建）**：`src/server/modules/relationships/getPersonaPair.test.ts`

| # | 用例 |
| ---- | ---- |
| 1 | 正常路径：返回 2 条关系 + 5 条事件，事件按 `chapterNo` 升序 |
| 2 | 无关系：返回 `relationships: []`，仍 200 |
| 3 | 软删的关系/事件被过滤 |
| 4 | 双向关系（a→b 与 b→a）都返回 |
| 5 | book 不存在 → `BookNotFoundError` |
| 6 | 任一 persona 不存在 → `PersonaNotFoundError` |
| 7 | aId == bId → `RelationshipInputError` |
| 8 | `firstChapterNo / lastChapterNo / eventCount` 正确 |
| 9 | 多 typeCode 关系按字母序排序 |

### 5.2 route handler 集成测

**文件（新建）**：`src/app/api/persona-pairs/[bookId]/[aId]/[bId]/route.test.ts`（仅测路径参数解析 + 错误码映射）

| # | 用例 |
| ---- | ---- |
| 1 | 200 正常返回 |
| 2 | 401 未登录 |
| 3 | 400 UUID 非法 |
| 4 | 404 book 不存在 |

### 5.3 客户端工具单测

**文件（新建）**：`src/lib/services/persona-pairs.test.ts` —— mock `clientFetch` 验证 URL 拼接正确（含 encode）。

行覆盖率 ≥ 95%。

---

## 6. 性能与监控

- 预期 p95 < 100ms（典型 Pair 关系数 ≤ 5、事件数 ≤ 100）。
- MVP **不实现** ETag / Redis cache（父 §10 已确认）。
- service 入口加 `console.timeEnd` / metric 埋点（如项目已有），便于 APM 观测。

---

## 7. 验收清单

- [ ] `pnpm type-check` 全绿。
- [ ] `pnpm test src/server/modules/relationships/getPersonaPair.test.ts src/app/api/persona-pairs` 全绿，覆盖率 ≥ 95%。
- [ ] 手动 `curl /api/persona-pairs/<book>/<a>/<b>` 返回 JSON 与本 PRD §2.3 schema 一致。
- [ ] 关系按 typeCode 字母序、事件按 chapterNo 升序，肉眼验证。
- [ ] 无 N+1（开 Prisma `log: ["query"]` 验证只有 ≤ 4 次 SQL）。
- [ ] 父 §7.7 验收通过。

---

## 8. 风险与回退

- **响应体过大**：典型 Pair 事件数 < 100，体积 < 50KB；若极端情况（> 500 事件）出现，下次迭代加 `?limit & ?cursor` 分页。
- **`include.events` 内排序兼容性**：Prisma 7 支持 nested orderBy，验证 `pnpm prisma:generate` 后类型可用。
