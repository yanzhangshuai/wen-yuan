# 删除 classical-names.ts 硬编码

> **收敛修订 2026-04-13**: 根据 D1/D2/D11 决策修订。不再 @deprecated，数据迁移后**直接删除整个文件**。

## Goal

将 `src/server/modules/analysis/config/classical-names.ts` 中所有硬编码的角色别名数据迁移到知识库 DB 表，修复已知 bug（牛布衣 aliases 包含牛浦郎 — D1），然后**直接删除该文件（D11: 不做 @deprecated 过渡，直接删除）**。

## 前置文档

- `docs/全局知识库服务化重构设计.md` — 第 7 节
- `docs/角色解析准确率审计报告-儒林3.md` — 5.6 节

## 依赖

- `04-12-wave2-kb-schema-extend` — 新 KB 表 + `loadFullRuntimeKnowledge()` 能替代硬编码

## 验收标准

- [ ] RULIN_NAMES 中所有数据迁移到 KnowledgeEntry（type=CHARACTER_ALIAS，pack=rulin）+ seed JSON
- [ ] 修复 牛布衣 aliases 中的 牛浦郎 错误（牛浦郎是独立角色 D1）
- [ ] 现有 5 个 genre 的数据（rulin、sanguozhi、xiyouji、honglou、shuihu）全部迁移到 `data/knowledge-base/` JSON
- [ ] `classical-names.ts` **直接删除**（D11: 不做 @deprecated 过渡）
- [ ] 所有 import classical-names 的文件改为使用 `loadFullRuntimeKnowledge()` 或 DB 查询
- [ ] 已有测试全通过

## R1: 数据迁移 — 生成 seed JSON

将每个 genre 的硬编码数据转换为 JSON（**含 honglou 和 shuihu 补充**）:

文件: `data/knowledge-base/rulin-characters.seed.json`
```json
[
  {
    "canonicalName": "匡超人",
    "aliases": ["匡迥", "匡二"],
    "type": "CHARACTER_ALIAS",
    "genre": "rulin"
  },
  {
    "canonicalName": "牛布衣",
    "aliases": [],
    "type": "CHARACTER_ALIAS",
    "genre": "rulin",
    "note": "D1: 牛浦郎(牛浦) is a DIFFERENT character — NOT an alias of 牛布衣"
  },
  {
    "canonicalName": "牛浦郎",
    "aliases": ["牛浦"],
    "type": "CHARACTER_ALIAS",
    "genre": "rulin",
    "note": "D1: 独立角色，冒充牛布衣"
  }
]
```

类似地：
- `data/knowledge-base/sanguozhi-characters.seed.json`
- `data/knowledge-base/xiyouji-characters.seed.json`
- `data/knowledge-base/honglou-characters.seed.json`（新增）
- `data/knowledge-base/shuihu-characters.seed.json`（新增）

## R2: 修复牛布衣/牛浦郎 bug（D1）

当前 `classical-names.ts`:
```typescript
{ name: "牛布衣", aliases: ["牛浦", "牛浦郎", ...] }
```

**D1 已确认** 修正为:
- `牛布衣` aliases: **全部移除牛浦郎与牛浦相关错误映射** — 牛布衣是独立角色，且书中已死亡
- 新增独立条目: `{ name: "牛浦郎", aliases: ["牛浦"] }`
- **"牛浦"归属**: 牛浦=牛浦郎（D1）。牛浦郎冒用"牛布衣"之名招摇过市，冒充期间的经历归属牛浦郎
- `AliasMapping` 需补充 `source=IMPERSONATION` 记录其冒名阶段，避免把冒充事件错误并入牛布衣

## R3: init 脚本扩展

扩展 `scripts/init-knowledge-base.ts` 或新建 `scripts/init-knowledge-characters.ts`:

```typescript
// 读取 data/knowledge-base/*-characters.seed.json
// 写入 KnowledgeEntry / KnowledgePack
// 使用 upsert 避免重复
```

## R4: 代码引用替换 + 直接删除（D11）

> **D11 已确认**: 不做 @deprecated 过渡，数据迁移完成后直接删除。

搜索所有 `import ... from 'classical-names'` 或引用 `RULIN_NAMES` 等的文件:

预期涉及:
- `src/server/modules/analysis/services/ChapterAnalysisService.ts`
- `src/server/modules/analysis/services/PersonaResolver.ts`
- `src/server/modules/analysis/services/AliasRegistryService.ts`
- `src/server/modules/analysis/services/prompts.ts`
- `src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts`

替换模式:
```typescript
// Before:
import { resolveByKnowledgeBase, buildAliasLookup } from "../config/classical-names";
const lookup = buildAliasLookup(RULIN_NAMES);

// After:
const runtimeKB = await loadFullRuntimeKnowledge(bookId, bookTypeKey, prisma);
const lookup = runtimeKB.aliasLookup;
```

**然后直接删除 `classical-names.ts` 文件。**

## R5: 同步删除 GENRE_PRESETS（D11）

同时在 `pipeline.ts` 中删除 `GENRE_PRESETS` 对象:
```typescript
// 删除整个 GENRE_PRESETS 对象及其类型定义
// BookType.presetConfig 成为唯一配置来源
```

## 关键文件

- `src/server/modules/analysis/config/classical-names.ts`
- `data/knowledge-base/rulin-characters.seed.json`（新建）
- `data/knowledge-base/sanguozhi-characters.seed.json`（新建）
- `data/knowledge-base/xiyouji-characters.seed.json`（新建）
- `scripts/init-knowledge-base.ts`（修改）
- 所有引用 classical-names 的文件
