# 两遍式架构重构 — 消除级联错误

## Goal

重构书籍解析管线，从"单遍累积式"架构切换到"两遍式"架构，彻底消除 entityId 数字编号错误导致的级联人物合并问题。

## 问题背景

### 当前架构的致命缺陷

儒林外史 56 章实测（220 人物）暴露出严重准确率问题：

1. **entityId 数字索引是灾难根源**：ROSTER Phase 1 向 LLM 传入 `[1] 范进|...\n[2] 周进|...\n...[150] 景兰江|...`，要求 LLM 返回 `entityId: N` 对应编号。当列表超过 100 行时，LLM 选错编号的概率极高。

2. **rosterMap 快速路径无条件信任**：`PersonaResolver.resolve()` 中 rosterMap 命中直接返回 `confidence: 0.97`，无任何名字相似度校验。当 LLM 返回 `{ surfaceForm: "景兰江", entityId: 1 }` 时，景兰江被直接绑到范进的 personaId 上。

3. **级联污染**：每次错误合并会修改 persona 的 aliases 和 profile.localName，污染后续所有章节的候选匹配池。第 3 章的一个 entityId 错误会通过 alias/profile 传播到第 4-56 章。

### 实测症状

- 张铁臂 aliases 包含 马纯上、牛浦郎、牛浦（4 个不同人物）
- 范进 aliases 包含 景兰江
- 周进 aliases 包含 王惠
- 娄三公子和娄四公子被合并（两个不同人物）
- 垃圾实体：整句话被提取为 personaName
- 缺失实体：朱元璋（吴王）未被识别

## Requirements

### R1: 两遍式架构

**Pass 1 — 独立章节提取（Chapter Independent Extraction）**
- 每章独立发给 LLM，不传入任何已知人物列表
- LLM 只需识别本章出现的人物称谓，输出 `{ name, description, aliases[], category }` 列表
- 各章完全独立，可并行执行
- 消除 entityId 数字编号问题

**Pass 2 — 全书实体消歧（Global Entity Resolution）**
- 收集所有章节的实体列表
- 规则预分组：精确名字匹配 + 姓氏前缀匹配 + 编辑距离相似度
- LLM 辅助判断：对模糊候选组调用 LLM 判断"以下称谓是否指同一人？"
- 生成全书级 persona 映射表：`surfaceForm → personaId`

**Pass 3 — 章节细节提取（Chapter Detail Extraction）**
- 使用 Pass 2 的干净映射表，对每章提取 mentions/biographies/relationships
- 复用现有 CHUNK_EXTRACTION prompt 和 persistResult 逻辑
- rosterMap 来自 Pass 2 的映射表（而非 LLM 返回的数字编号）

### R2: 消除 entityId 数字编号

- Pass 1 不传入 profiles 列表 → 不需要 entityId
- Pass 2 的映射表由代码构建（名字精确匹配）→ 不依赖 LLM 编号选择
- Pass 3 的 rosterMap 直接用 personaId UUID → 不经过数字编号转换

### R3: rosterMap 安全校验

- 即使保留任何 roster 机制，增加名字相似度校验：
  - rosterMap 命中时，检查 `surfaceForm` 与目标 persona.name 的相似度
  - 相似度 < 0.3 时拒绝映射（即 "景兰江" 不会被映射到 "范进"）
- 这是**防御层**，两遍式架构是**根治层**

### R4: 实体名长度校验

- personaName 长度 > 10 的实体视为垃圾，直接过滤
- 清理 AI 返回的垃圾（整句话作为 personaName）

### R5: 向后兼容

- 保留现有 API 接口 `POST /api/books/:id/analyze` 不变
- 保留 AnalysisJob 状态机（QUEUED → RUNNING → COMPLETED/FAILED）
- 保留现有数据库 schema（Persona, Profile, Mention, Relationship）
- 保留 CHAPTER_VALIDATION 和 BOOK_VALIDATION 收尾流程

## Architecture

### 新管线流程

```
POST /api/books/:id/analyze
  → runAnalysisJobById(jobId)
    → loadChaptersForJob()

    ════════ Pass 1: Independent Extraction ════════
    → for each chapter (并发=chapterConcurrency):
        extractChapterEntities(chapter)
          → buildIndependentExtractionPrompt(bookTitle, chapterNo, content)
          → AI: 返回 ChapterEntityList
          → 存入内存: Map<chapterId, ChapterEntityList>

    ════════ Pass 2: Global Entity Resolution ════════
    → collectAllEntities(allChapterEntities)
      → 规则预合并: exactNameMatch + surnamePrefixGroup
      → 模糊候选: editDistance + cosine similarity
      → LLM 辅助: batchEntityResolution(candidateGroups)
      → 生成: GlobalEntityMap (surfaceForm → personaId)
      → 批量创建 Persona + Profile

    ════════ Pass 3: Chapter Detail Extraction ════════
    → for each chapter (并发=chapterConcurrency):
        analyzeChapterWithMapping(chapter, globalEntityMap)
          → buildChapterAnalysisPrompt(with profiles from globalEntityMap)
          → CHUNK_EXTRACTION (现有逻辑)
          → persistResult (rosterMap = globalEntityMap 的子集)

    ════════ 收尾 (与现有相同) ════════
    → CHAPTER_VALIDATION (条件触发)
    → markOrphanPersonas()
    → resolvePersonaTitles()
    → runGrayZoneArbitration()
    → validateBookResult()
```

### 关键变更点

| 文件 | 变更 |
|------|------|
| `runAnalysisJob.ts` | 重构 workerLoop → 三遍式流程编排 |
| `ChapterAnalysisService.ts` | 新增 `extractChapterEntities()` (Pass 1), `resolveGlobalEntities()` (Pass 2), 修改 `analyzeChapter()` 接受外部映射表 |
| `prompts.ts` | 新增 `buildIndependentExtractionPrompt()` (Pass 1), 新增 `buildEntityResolutionPrompt()` (Pass 2) |
| `PersonaResolver.ts` | rosterMap 快速路径增加名字相似度校验 |
| `pipeline.ts` | 新增 Pass 2 相关配置常量 |

### Pass 1 输出格式

```typescript
interface ChapterEntityEntry {
  name       : string;   // 人物称谓（如"范进"）
  aliases    : string[]; // 本章出现的别名（如["范举人","范老爷"]）
  description: string;   // 简短描述（如"落魄书生，考中举人"）
  category   : string;   // PERSON | MENTIONED_ONLY
  chapterNo  : number;   // 所属章节
}

interface ChapterEntityList {
  chapterId: string;
  entities : ChapterEntityEntry[];
}
```

### Pass 2 全局消歧策略

1. **精确匹配**：name 完全相同 → 合并
2. **姓氏+别名交叉**：同姓且别名有交集 → 候选
3. **编辑距离**：Levenshtein ≤ 1 → 候选
4. **LLM 判断**：对候选组发给 LLM：
   ```
   以下人物列表可能指同一个人：
   A) 范进 — 落魄书生（第3章）; 范举人 — 新中举人（第5章）; 范老爷 — 举人（第8章）
   B) 周进 — 老秀才（第2章）
   请判断：哪些是同一人？返回合并方案。
   ```
5. **输出**：`Map<string, string>` → surfaceForm → personaId

## Acceptance Criteria

- [ ] Pass 1 每章独立提取，不传入任何 profiles
- [ ] Pass 2 全局消歧正确合并同义称谓（如 范进/范举人/范老爷），不错误合并不同人物（如 娄三公子/娄四公子）
- [ ] Pass 3 使用 Pass 2 映射表而非 LLM 返回的 entityId
- [ ] rosterMap 快速路径增加名字相似度校验
- [ ] personaName 长度 > 10 的垃圾实体被过滤
- [ ] 现有 126 个测试全部通过
- [ ] TypeScript 编译无错误
- [ ] API 接口向后兼容
- [ ] 儒林外史 56 章实测不再出现跨人物错误合并

## Technical Notes

- Pass 1 不依赖任何已有 persona 数据 → 完全消除级联污染
- Pass 2 的 LLM 判断任务是"两个名字是否同一人" → 远简单于"从 200 行列表选编号"
- Pass 1 和 Pass 3 各章可完全并行 → 速度可能更快
- Pass 1 不传入 profiles → 省去 ROSTER 阶段的 profiles token → 总成本可能更低
- 保留 CHAPTER_VALIDATION / BOOK_VALIDATION 作为最后防线
