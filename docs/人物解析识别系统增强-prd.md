# PRD: 人物解析识别系统增强 — 别名归一 / 自检 Agent / 性能优化

> **版本**: v2.0  
> **日期**: 2026-03-31  
> **目标**: 可落地、可编码、可验证  
> **执行方式**: Codex 5.3 一次性执行

---

## 一、需求理解

### 核心目标

| # | 需求 | 核心目标 | 核心难点 |
|---|------|----------|----------|
| 1 | 别名/称号/封号识别与回填真实名称 | 将"太祖皇帝""吴王""丞相"等非真名称谓映射到真实人物，避免创建伪实体 | 同一称号不同时期对应不同人物；同一人物不同阶段有不同称呼；需要跨章节上下文判断 |
| 2 | 自检 Agent | 对解析结果做 AI 二次校验，输出结构化修正建议 | 避免自检 Agent 自身产生幻觉或过度修正；需要精确的 Prompt 边界控制 |
| 3 | 准确率优先的性能优化 | 在不降低准确率的前提下提升整体解析吞吐 | 并行化可能影响别名归并的上下文完整性；缓存策略需要精确的失效机制 |

### 现有系统分析

当前系统已有 5 个 Phase 的解析流程：
- **Phase 1**: 全章人物名册发现（`buildRosterDiscoveryPrompt`）→ 输出 `ChapterRosterEntry[]`
- **Phase 2**: 分段内容分析（`buildChapterAnalysisPrompt`）→ 输出 `biographies/mentions/relationships`
- **Phase 3**: 事务持久化 + `PersonaResolver` 实体对齐
- **Phase 4**: 孤儿检测（`markOrphanPersonas`）
- **Phase 5**: 称号真名溯源（`resolvePersonaTitles`）— **仅在 FULL_BOOK 完成后执行一次**

**现有不足**:
1. Phase 5 称号溯源只在全书完成后运行，无法利用章节级上下文（共现人物、事件线索）
2. Phase 5 只依赖 AI 推断历史真名，不支持"书中上下文推断"（如"丞相"在第3回指张三，第10回指李四）
3. 无二次校验机制，AI 解析结果直接入库（DRAFT 状态）
4. `PersonaResolver` 的相似度打分仅用字符串匹配，不感知语义上下文
5. 章节串行执行，无章节间并行能力

---

## 二、总体方案设计

### 增强后的解析流程

```
原始文本输入
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Phase 1: 人物名册发现（现有，增强）                    │
│  - 增加: 别名/称号分类标注                             │
│  - 增加: 上下文线索提取（共现人物、事件）               │
│  - 输出: ChapterRosterEntry[] + AliasContextHint[]    │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│ Phase 2: 分段内容分析（现有，Prompt 增强）              │
│  - 增加: 别名使用上下文证据输出                        │
│  - 输出: ChapterAnalysisResponse + AliasEvidence[]    │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│ Phase 3: 实体对齐 + 别名映射（现有，增强）              │
│  - 增强: PersonaResolver 增加别名注册表查询             │
│  - 新增: AliasRegistry 维护别名→真名映射 + 时间窗口     │
│  - 新增: 别名映射记录持久化（alias_mappings 表）         │
│  - 输出: ResolveResult + AliasMapping[]               │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│ Phase 4: 孤儿检测（现有，不变）                        │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│ Phase 5: 称号真名溯源（现有，增强为分层 + 增量策略）       │
│  - 增量溯源: 每 5 章对新增 TITLE_ONLY 执行一次              │
│  - 第一层: 规则引擎（已知历史人物直接映射）              │
│  - 第二层: 上下文推断（利用 AliasRegistry 累积信息）     │
│  - 第三层: AI 推断（兜底）                             │
│  - 全书溯源: 全书完成后终极校正                          │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│ Phase 6: 自检 Agent（新增，全书完成后执行）                │
│  - 全书完成后统一执行，不影响章节解析速度                   │
│  - 读取全书解析结果 + 原文片段                             │
│  - 输出结构化检查报告 ValidationReport                 │
│  - 自动修正高置信问题，标记低置信问题待人工审核          │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│ 最终结果输出                                          │
│  - DRAFT 数据入库                                     │
│  - 自检报告存入 validation_reports 表                  │
│  - merge_suggestions 自动生成                         │
└─────────────────────────────────────────────────────┘
```

---

## 三、需求 1 详细方案：别名/称号/封号识别与回填

### 3.1 数据结构设计

#### 新增 Prisma 模型: `alias_mappings`

```prisma
model AliasMapping {
  id            String   @id @default(uuid()) @db.Uuid
  bookId        String   @db.Uuid
  personaId     String?  @db.Uuid
  alias         String            // 原始称呼，如 "太祖皇帝"、"丞相"
  resolvedName  String?           // 推断出的真实名称，如 "朱元璋"
  aliasType     AliasType         // TITLE / POSITION / KINSHIP / NICKNAME / COURTESY_NAME
  confidence    Float   @default(0)
  evidence      String?           // 推断依据（≤200字）
  status        AliasMappingStatus @default(PENDING)  // PENDING / CONFIRMED / REJECTED
  chapterStart  Int?              // 该映射生效的起始章节号
  chapterEnd    Int?              // 该映射失效的章节号（null=持续到全书结束）
  contextHash   String?           // 上下文特征哈希，用于缓存去重
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  book    Book     @relation(fields: [bookId], references: [id])
  persona Persona? @relation(fields: [personaId], references: [id])

  @@index([bookId, alias], "alias_book_idx")
  @@index([bookId, personaId], "persona_book_idx")
  @@map("alias_mappings")
}

enum AliasType {
  TITLE          // 封号/尊号: 太祖皇帝、吴王
  POSITION       // 职位称呼: 丞相、知府
  KINSHIP        // 亲属代称: 世子、皇后
  NICKNAME       // 绰号/外号: 范老爷
  COURTESY_NAME  // 字号: 子美
}

enum AliasMappingStatus {
  PENDING    // 待确认
  CONFIRMED  // 已确认
  REJECTED   // 已拒绝
}
```

#### TypeScript 类型定义

在 `src/types/analysis.ts` 中新增:

```typescript
/** 别名上下文线索（Phase 1 增强输出） */
export interface AliasContextHint {
  alias: string;                    // 原始称呼
  aliasType: AliasType;             // 称号类型
  coOccurringPersonas: string[];    // 同段落共现人物名
  contextClue: string;              // 上下文线索描述（≤100字）
  suggestedRealName?: string;       // AI 建议的真实名称
  confidence: number;               // 0-1
}

/** 别名映射结果 */
export interface AliasMappingResult {
  alias: string;
  resolvedName: string | null;
  personaId: string | null;
  aliasType: AliasType;
  confidence: number;
  evidence: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  chapterScope?: { start: number; end?: number };
}

/** Phase 1 增强输出 */
export interface EnhancedChapterRosterEntry extends ChapterRosterEntry {
  aliasType?: AliasType;
  contextHint?: AliasContextHint;
}
```

### 3.2 别名注册表服务: `AliasRegistryService`

**文件**: `src/server/modules/analysis/services/AliasRegistryService.ts`

**核心职责**:
1. 维护书籍级别的 `alias → personaId` 映射缓存
2. 支持章节范围限定（同一称号不同章节可能指不同人物）
3. 提供查询接口供 `PersonaResolver` 调用
4. 在每章解析后增量更新

```typescript
export interface AliasRegistryService {
  /**
   * 查询别名映射：给定 alias + 当前章节号，返回最匹配的映射。
   * 优先返回 chapterScope 匹配 + confidence 最高的映射。
   * 若无匹配返回 null。
   */
  lookupAlias(bookId: string, alias: string, chapterNo: number): Promise<AliasMappingResult | null>;

  /**
   * 注册新的别名映射（Phase 3 / Phase 5 调用）。
   * 如果已存在相同 alias+chapterScope 的映射且 confidence 更高，则跳过。
   */
  registerAlias(input: RegisterAliasInput): Promise<void>;

  /**
   * 批量加载本书所有已确认的别名映射，构建内存缓存。
   * 在章节解析开始前调用一次。
   */
  loadBookAliasCache(bookId: string): Promise<Map<string, AliasMappingResult[]>>;

  /**
   * 获取所有待确认的别名映射（供审核页面使用）。
   */
  listPendingMappings(bookId: string): Promise<AliasMappingResult[]>;
}
```

### 3.3 PersonaResolver 增强

在现有 `PersonaResolver.resolve()` 的 Step 2（rosterMap 快速路径）之后、Step 3（相似度打分）之前，插入新的 Step 2.5:

```typescript
// Step 2.5: 别名注册表查询——检查 AliasRegistry 中是否有已确认的映射。
const aliasResult = await aliasRegistry.lookupAlias(input.bookId, extracted, chapterNo);
if (aliasResult && aliasResult.confidence >= 0.7 && aliasResult.personaId) {
  await client.profile.upsert({
    where: { personaId_bookId: { personaId: aliasResult.personaId, bookId: input.bookId } },
    update: {},
    create: { personaId: aliasResult.personaId, bookId: input.bookId, localName: input.extractedName }
  });
  return {
    status: "resolved",
    personaId: aliasResult.personaId,
    confidence: aliasResult.confidence,
    matchedName: aliasResult.resolvedName ?? undefined
  };
}
```

### 3.4 Phase 1 Prompt 增强

在 `buildRosterDiscoveryPrompt` 中增加别名类型标注要求:

```
9. 若 surfaceForm 是别名/称号/封号类型，额外标注:
   - "aliasType": "TITLE" | "POSITION" | "KINSHIP" | "NICKNAME" | "COURTESY_NAME"
   - "contextHint": 简述该称呼在本章上下文中的线索（≤100字），如共现人物、事件关联
   - "suggestedRealName": 如果上下文能推断出真实名称，填写；否则省略
   - "aliasConfidence": 0-1，对 suggestedRealName 的确信度
```

### 3.5 防止错误合并的策略

1. **置信度门槛**: 别名映射 confidence < 0.7 时标记 PENDING，不自动归并
2. **章节范围限定**: 同一称号在不同章节范围可能指不同人物（如"丞相"在第1-10回指张三，第11-20回指李四），通过 `chapterStart/chapterEnd` 限定
3. **共现人物校验**: 如果候选映射的 persona 与当前上下文共现人物有矛盾（如"丞相"候选是A，但A在本章已以本名出场），降低置信度
4. **人工确认兜底**: 所有自动映射初始状态为 PENDING，高置信度（≥0.9）自动确认，中等置信度（0.7-0.9）标记待确认，低置信度（<0.7）不映射

---

## 四、需求 2 详细方案：自检 Agent

### 4.1 职责边界

| 职责 | 说明 |
|------|------|
| ✅ 检查别名误识别为新人物 | 对比 TITLE_ONLY + 低置信新建 Persona，检查是否应合并到已知人物 |
| ✅ 检查不同人物错误合并 | 检查高频出场 Persona 的别名列表是否自洽 |
| ✅ 检查漏掉的真实名称映射 | 检查 TITLE_ONLY Persona 是否有上下文线索可推断真名 |
| ✅ 检查不合理的人物关系 | 检查自我关系、矛盾关系（如A是B的父亲同时B是A的父亲）|
| ✅ 检查同名不同人 | 检查同名 Persona 在不同章节的行为是否一致 |
| ❌ 不修改数据 | 自检 Agent 只输出建议，不直接修改数据库 |
| ❌ 不重新解析原文 | 只基于已有解析结果 + 原文片段做对比检查 |

### 4.2 数据结构

#### 新增 Prisma 模型: `validation_reports`

```prisma
model ValidationReport {
  id         String   @id @default(uuid()) @db.Uuid
  bookId     String   @db.Uuid
  jobId      String?  @db.Uuid
  scope      String               // "CHAPTER" | "FULL_BOOK"
  chapterId  String?  @db.Uuid
  status     String   @default("PENDING")  // PENDING | REVIEWED | APPLIED
  issues     Json                 // ValidationIssue[]
  summary    Json                 // ValidationSummary
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  book    Book          @relation(fields: [bookId], references: [id])
  job     AnalysisJob?  @relation(fields: [jobId], references: [id])

  @@index([bookId], "validation_book_idx")
  @@index([jobId], "validation_job_idx")
  @@map("validation_reports")
}
```

#### TypeScript 类型

新增文件 `src/types/validation.ts`:

```typescript
/** 问题类型枚举 */
export type ValidationIssueType =
  | 'ALIAS_AS_NEW_PERSONA'       // 别名误识别为新人物
  | 'WRONG_MERGE'                // 不同人物错误合并
  | 'MISSING_NAME_MAPPING'       // 漏掉真实名称映射
  | 'INVALID_RELATIONSHIP'       // 不合理的人物关系
  | 'SAME_NAME_DIFFERENT_PERSON' // 同名不同人
  | 'DUPLICATE_PERSONA'          // 同一人物多条记录未合并
  | 'LOW_CONFIDENCE_ENTITY'      // 低置信实体需审核
  | 'ORPHAN_MENTION';            // 孤立提及无对应人物

/** 单条检查问题 */
export interface ValidationIssue {
  id: string;                     // 问题唯一ID (uuid)
  type: ValidationIssueType;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  confidence: number;             // 0-1，自检 Agent 对该问题判断的确信度
  description: string;            // 问题描述
  evidence: string;               // 原文/数据证据
  affectedPersonaIds: string[];   // 涉及的 Persona ID
  affectedChapterIds?: string[];  // 涉及的章节 ID
  suggestion: ValidationSuggestion;
}

/** 修正建议 */
export interface ValidationSuggestion {
  action: 'MERGE' | 'SPLIT' | 'UPDATE_NAME' | 'ADD_ALIAS' | 'DELETE' | 'ADD_MAPPING' | 'MANUAL_REVIEW';
  targetPersonaId?: string;
  sourcePersonaId?: string;
  newName?: string;
  newAlias?: string;
  reason: string;
}

/** 检查报告摘要 */
export interface ValidationSummary {
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  autoFixable: number;           // 可自动修正的问题数
  needsReview: number;           // 需人工审核的问题数
}
```

### 4.3 自检 Agent 服务

**文件**: `src/server/modules/analysis/services/ValidationAgentService.ts`

```typescript
export interface ValidationAgentService {
  /**
   * 对指定章节的解析结果执行自检。
   * 在 Phase 3 持久化后、Phase 6 入口调用。
   */
  validateChapterResult(input: ChapterValidationInput): Promise<ValidationReport>;

  /**
   * 对全书解析结果执行整体自检。
   * 在 FULL_BOOK 任务完成后调用。
   */
  validateBookResult(bookId: string, jobId: string): Promise<ValidationReport>;

  /**
   * 应用自检建议中 confidence >= 0.9 的自动修正。
   * 返回实际执行的修正数量。
   */
  applyAutoFixes(reportId: string): Promise<number>;
}

interface ChapterValidationInput {
  bookId: string;
  chapterId: string;
  chapterNo: number;
  chapterContent: string;        // 原文
  jobId?: string;
  newPersonas: { id: string; name: string; confidence: number; nameType: string }[];
  newMentions: { personaId: string; rawText: string }[];
  newRelationships: { sourceId: string; targetId: string; type: string }[];
  existingProfiles: AnalysisProfileContext[];
}
```

### 4.4 自检 Prompt 设计

**文件**: `src/server/modules/analysis/services/prompts.ts` 中新增 `buildValidationPrompt`

```typescript
export function buildChapterValidationPrompt(input: {
  bookTitle: string;
  chapterNo: number;
  chapterTitle: string;
  chapterContent: string;          // 原文片段（截取关键段落，≤3000字）
  existingPersonas: Array<{
    id: string;
    name: string;
    aliases: string[];
    nameType: string;
    confidence: number;
  }>;
  newlyCreated: Array<{
    id: string;
    name: string;
    nameType: string;
    confidence: number;
  }>;
  chapterMentions: Array<{
    personaName: string;
    rawText: string;
  }>;
  chapterRelationships: Array<{
    sourceName: string;
    targetName: string;
    type: string;
  }>;
}): string {
  return [
    "## 角色",
    "你是一个文学文本实体解析的质量审核专家。你的任务是检查人物解析结果的准确性，发现并报告问题。",
    "",
    "## 核心原则",
    "1. **保守判断**: 只报告你确信存在的问题，不确定时宁可不报",
    "2. **证据导向**: 每个问题必须附带原文证据或数据矛盾点",
    "3. **不要过度修正**: 不要仅因为\"可能\"就建议合并或拆分",
    "4. **不要发明信息**: 不要推测原文中没有的信息",
    "",
    "## 检查维度",
    "1. **别名误识别**: 检查新建人物是否实际上是已知人物的别名/称号",
    "   - 重点: 新建的 TITLE_ONLY 人物是否与已知人物有明确关联",
    "   - 重点: 低置信度新建人物是否在原文中有上下文线索指向已知人物",
    "2. **错误合并**: 检查是否有不同人物被错误归到同一 persona",
    "   - 重点: 同一 persona 在本章中是否有矛盾行为/身份描述",
    "3. **漏掉映射**: 检查 TITLE_ONLY 人物是否有原文线索可确定真名",
    "4. **关系合理性**: 检查关系是否自洽（无自我关系、无明显矛盾）",
    "5. **同名异人**: 检查同名人物在不同上下文中是否表现一致",
    "",
    "## 书籍上下文",
    `书名: 《${input.bookTitle}》`,
    `章节: 第${input.chapterNo}回「${input.chapterTitle}」`,
    "",
    "## 已知人物档案",
    ...input.existingPersonas.map(p =>
      `- ${p.name} (${p.nameType}, 置信度:${p.confidence}) 别名:[${p.aliases.join(',')}]`
    ),
    "",
    "## 本章新建人物",
    ...input.newlyCreated.map(p =>
      `- ${p.name} (${p.nameType}, 置信度:${p.confidence})`
    ),
    "",
    "## 本章提及记录",
    ...input.chapterMentions.slice(0, 50).map(m =>
      `- ${m.personaName}: "${m.rawText.slice(0, 80)}"`
    ),
    "",
    "## 本章关系记录",
    ...input.chapterRelationships.map(r =>
      `- ${r.sourceName} → ${r.targetName}: ${r.type}`
    ),
    "",
    "## 原文片段（重点段落）",
    input.chapterContent.slice(0, 3000),
    "",
    "## 输出格式（仅输出 JSON，不加任何说明或 Markdown 代码块）",
    JSON.stringify({
      issues: [
        {
          type: "ALIAS_AS_NEW_PERSONA | WRONG_MERGE | MISSING_NAME_MAPPING | INVALID_RELATIONSHIP | SAME_NAME_DIFFERENT_PERSON | DUPLICATE_PERSONA",
          severity: "ERROR | WARNING | INFO",
          confidence: 0.85,
          description: "问题的具体描述",
          evidence: "原文证据或数据矛盾点",
          affectedPersonaIds: ["persona-id-1"],
          suggestion: {
            action: "MERGE | SPLIT | UPDATE_NAME | ADD_ALIAS | DELETE | ADD_MAPPING | MANUAL_REVIEW",
            targetPersonaId: "target-id (如适用)",
            sourcePersonaId: "source-id (如适用)",
            newName: "建议的新名称 (如适用)",
            newAlias: "建议添加的别名 (如适用)",
            reason: "修正理由"
          }
        }
      ]
    }, null, 2),
    "",
    "## 重要提醒",
    "- 如果检查结果没有发现任何问题，返回 {\"issues\": []}",
    "- confidence < 0.6 的问题不要报告",
    "- 每个问题的 evidence 必须来自原文或上述数据，不可编造"
  ].join("\n");
}
```

### 4.5 风险控制

1. **幻觉防御**: Prompt 中明确要求"只报告确信的问题"、"不确定时不报"、"confidence < 0.6 不报告"
2. **过度修正防御**: 自动应用修正的门槛设为 confidence ≥ 0.9，其余一律需人工审核
3. **输出校验**: 解析自检结果时验证 affectedPersonaIds 确实存在于数据库中
4. **成本控制**: 章节级自检可选开启（通过 `analysis_jobs.enableValidation` 字段控制）；全书自检默认开启
5. **自检不阻塞主流程**: 自检失败（AI 调用异常/解析异常）只记录日志，不影响主解析结果

### 4.6 接入流程

**设计决策**: 自检 Agent 在全书解析完成后统一执行（方案 A），不在每章循环中插入，避免影响章节解析速度。

```
runAnalysisJobById()
  └─ for each chapter:
       ├─ analyzeChapter()                ← 现有 Phase 1-3
       └─ (每5章) resolvePersonaTitles()  ← 增量溯源（新增）
  └─ after all chapters:
       ├─ markOrphanPersonas()            ← 现有 Phase 4
       ├─ resolvePersonaTitles()          ← 现有 Phase 5（全书终极溯源）
       └─ validateBookResult()            ← 新增 Phase 6：全书自检
            └─ applyAutoFixes()           ← 可选：自动修正高置信问题
```

---

## 五、需求 3 详细方案：性能优化

### 5.1 低风险高收益（优先实施）

#### A. 别名注册表内存缓存

**当前问题**: 每次 `PersonaResolver.resolve()` 都查 DB，同一章内相同名字重复查询。
**现有缓解**: `persistResult()` 内部有 `cache: Map<string, ResolveResult>`，但仅限单章事务内。

**优化方案**:
- 在 `runAnalysisJobById()` 开始时，一次性加载本书全部 personas + profiles + alias_mappings 到内存
- 构建 `BookPersonaCache` 对象，在章节循环中传递
- `PersonaResolver` 优先查缓存，miss 时再查 DB
- 每章解析后增量更新缓存（新建的 persona、新发现的 alias）

**预期收益**: 减少 50-70% 的 DB 查询
**准确率影响**: 无（缓存数据与 DB 一致，且只用于查询不用于写入判断）

```typescript
interface BookPersonaCache {
  personas: Map<string, { id: string; name: string; aliases: string[]; nameType: string }>;
  aliasIndex: Map<string, string>;     // alias → personaId（精确匹配索引）
  profileIndex: Map<string, string>;   // localName → personaId
  aliasRegistry: Map<string, AliasMappingResult[]>;  // alias → 按 confidence 降序排列的映射列表
  addPersona(persona: { id: string; name: string; aliases: string[] }): void;
  addAlias(alias: string, personaId: string): void;
}
```

#### B. Phase 2 分段并发度动态调整

**当前**: 固定 `AI_CONCURRENCY = 3`。
**优化方案**: 根据 AI Provider 的 RPM（Requests Per Minute）限制动态调整并发度。

```typescript
const AI_CONCURRENCY_MAP: Record<string, number> = {
  gemini:   5,   // Gemini RPM 较高
  deepseek: 3,
  qwen:     4,
  doubao:   3
};
```

**预期收益**: Gemini 可提升约 40% 速度
**准确率影响**: 无（各分段独立解析，并发不影响结果）

#### C. Phase 1 + Phase 2 Prompt 精简

**当前问题**: `buildEntityContextLines` 将所有已知人物（含 localSummary）注入 Prompt，书中期时人物可能 100+，消耗大量 token。

**优化方案**: 仅注入"活跃人物"上下文:
1. 统计每个 persona 最近 5 章的出场次数
2. 对 Phase 2 的每个 chunk，只注入在当前章节 Phase 1 名册中出现的人物 + 前 2 章活跃人物
3. 大幅减少 Known Entities 列表长度

**预期收益**: 减少 30-50% 的 token 消耗（后期章节尤其显著）
**准确率影响**: 极低风险（罕见人物不在上下文中，但 Phase 1 名册已覆盖本章出场人物）

### 5.2 中风险中收益（第二批次）

#### D. 章节级可选并行

**当前**: 章节严格串行。
**优化方案**: 将章节分为"独立批次"并行执行:
1. 第一遍: 所有章节并行执行 Phase 1（只做名册发现，不写入 DB）
2. 第二遍: 章节串行执行 Phase 2-3（利用第一遍的名册结果 + 累积的 persona 上下文）

**预期收益**: Phase 1 并行可节省约 30% 时间
**准确率风险**: Phase 1 并行无风险（只读）；Phase 2-3 必须串行（依赖前序章节的 persona 上下文）

#### E. 规则引擎前置过滤

**当前**: 所有称号/别名都经 AI 判断。
**优化方案**: 构建规则引擎，已知模式直接映射:
1. 历史人物称号库（太祖→朱元璋，etc.）— 从 `buildTitleResolutionPrompt` 的先验知识抽取
2. 姓+职位模式（"范举人"→姓范的已知人物）— 正则匹配 `^[\u4e00-\u9fa5]{1,2}(举人|进士|老爷|太太|先生)$`
3. 已确认的 AliasMapping 直接命中

**预期收益**: 减少 20-30% 的 AI 调用
**准确率风险**: 中等（规则过于激进可能误匹配；建议初期仅用于 confidence ≥ 0.95 的规则）

### 5.3 高风险需谨慎（后续迭代）

#### F. 快慢路径分流

**方案**: Phase 2 分段时，先用规则引擎判断该段是否包含"疑难文本"（如多个未知称号、新出场人物），简单段走快路径（简化 Prompt），复杂段走完整路径。

**风险**: 可能遗漏简单段中的隐含信息。建议暂不实施，待准确率基线稳定后再评估。

#### G. 模型降级策略

**方案**: Phase 1 使用较便宜的模型（如 Qwen），Phase 2 使用强模型（如 DeepSeek）。

**风险**: Phase 1 名册质量直接影响后续所有步骤，降级可能导致连锁错误。建议仅在成本压力大时考虑。

---

## 六、推荐实现优先级

### 第一步: 基础设施 + 别名数据结构

**原因**: 后续所有功能都依赖这些基础

**具体任务**:
1. 新增 `alias_mappings` 和 `validation_reports` Prisma 模型
2. 新增 `AliasType` 和 `AliasMappingStatus` 枚举
3. 执行 `prisma migrate`
4. 新增 `src/types/validation.ts` 类型定义
5. 扩展 `src/types/analysis.ts` 类型

### 第二步: 别名注册表 + PersonaResolver 增强

**原因**: 这是准确率提升的核心

**具体任务**:
1. 实现 `AliasRegistryService`
2. 在 `PersonaResolver` 中插入 Step 2.5（别名注册表查询）
3. 增强 Phase 1 Prompt（别名类型标注）
4. 增强 Phase 5 称号溯源（利用 AliasRegistry）
5. 编写单元测试

### 第三步: 自检 Agent

**原因**: 在别名系统稳定后再加自检，避免在不稳定基础上做校验

**具体任务**:
1. 实现 `ValidationAgentService`
2. 实现 `buildChapterValidationPrompt` 和 `buildBookValidationPrompt`
3. 在 `runAnalysisJob` 中接入自检流程
4. 实现自检报告的 API 端点
5. 编写单元测试

### 第四步: 前端 — 审核中心新增 Tab

**原因**: 后端 API 就绪后，尽快让审核人员可以使用别名审核和自检报告功能

**具体任务**:
1. 新增 `src/lib/services/alias-mappings.ts` 和 `src/lib/services/validation-reports.ts`
2. 扩展 `ReviewPanel` 新增 "别名映射" 和 "自检报告" 两个 Tab
3. 实现 `AliasReviewTab` 组件（别名审核卡片列表 + 确认/拒绝/手动指定）
4. 实现 `ValidationReportTab` 组件（报告列表 + issue 详情 + 应用修正）
5. 修改 review 页面服务端数据加载

### 第五步: 性能优化

**原因**: 功能正确后再优化速度

**具体任务**:
1. 实现 `BookPersonaCache`
2. 实现活跃人物上下文精简
3. 实现 Provider 维度的并发度动态调整
4. Phase 1 并行预处理（可选）

---

## 七、核心接口 / 类 / 数据结构清单

以下是进入编码前需要先定义的所有核心接口，按文件组织:

### 文件 1: `prisma/schema.prisma` 新增内容

```prisma
// === 新增枚举 ===
enum AliasType {
  TITLE
  POSITION
  KINSHIP
  NICKNAME
  COURTESY_NAME
}

enum AliasMappingStatus {
  PENDING
  CONFIRMED
  REJECTED
}

// === 新增模型 ===
model AliasMapping {
  id            String             @id @default(uuid()) @db.Uuid
  bookId        String             @db.Uuid
  personaId     String?            @db.Uuid
  alias         String
  resolvedName  String?
  aliasType     AliasType
  confidence    Float              @default(0)
  evidence      String?
  status        AliasMappingStatus @default(PENDING)
  chapterStart  Int?
  chapterEnd    Int?
  contextHash   String?
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  book    Book     @relation(fields: [bookId], references: [id])
  persona Persona? @relation(fields: [personaId], references: [id])

  @@index([bookId, alias])
  @@index([bookId, personaId])
  @@map("alias_mappings")
}

model ValidationReport {
  id         String       @id @default(uuid()) @db.Uuid
  bookId     String       @db.Uuid
  jobId      String?      @db.Uuid
  scope      String
  chapterId  String?      @db.Uuid
  status     String       @default("PENDING")
  issues     Json
  summary    Json
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  book    Book          @relation(fields: [bookId], references: [id])
  job     AnalysisJob?  @relation(fields: [jobId], references: [id])

  @@index([bookId], "validation_book_idx")
  @@index([jobId], "validation_job_idx")
  @@map("validation_reports")
}

// === 在现有 Book 模型中添加关系 ===
// aliasMappings      AliasMapping[]
// validationReports  ValidationReport[]

// === 在现有 Persona 模型中添加关系 ===
// aliasMappings  AliasMapping[]

// === 在现有 AnalysisJob 模型中添加关系 ===
// validationReports  ValidationReport[]
```

### 文件 2: `src/types/validation.ts` (新建)

```typescript
export type ValidationIssueType =
  | 'ALIAS_AS_NEW_PERSONA'
  | 'WRONG_MERGE'
  | 'MISSING_NAME_MAPPING'
  | 'INVALID_RELATIONSHIP'
  | 'SAME_NAME_DIFFERENT_PERSON'
  | 'DUPLICATE_PERSONA'
  | 'LOW_CONFIDENCE_ENTITY'
  | 'ORPHAN_MENTION';

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type ValidationSuggestionAction =
  | 'MERGE'
  | 'SPLIT'
  | 'UPDATE_NAME'
  | 'ADD_ALIAS'
  | 'DELETE'
  | 'ADD_MAPPING'
  | 'MANUAL_REVIEW';

export interface ValidationSuggestion {
  action: ValidationSuggestionAction;
  targetPersonaId?: string;
  sourcePersonaId?: string;
  newName?: string;
  newAlias?: string;
  reason: string;
}

export interface ValidationIssue {
  id: string;
  type: ValidationIssueType;
  severity: ValidationSeverity;
  confidence: number;
  description: string;
  evidence: string;
  affectedPersonaIds: string[];
  affectedChapterIds?: string[];
  suggestion: ValidationSuggestion;
}

export interface ValidationSummary {
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  autoFixable: number;
  needsReview: number;
}

export interface ValidationReportData {
  issues: ValidationIssue[];
  summary: ValidationSummary;
}
```

### 文件 3: `src/types/analysis.ts` 新增类型

```typescript
// 在现有文件末尾追加

export type AliasTypeValue = 'TITLE' | 'POSITION' | 'KINSHIP' | 'NICKNAME' | 'COURTESY_NAME';

export interface AliasContextHint {
  alias: string;
  aliasType: AliasTypeValue;
  coOccurringPersonas: string[];
  contextClue: string;
  suggestedRealName?: string;
  confidence: number;
}

export interface EnhancedChapterRosterEntry extends ChapterRosterEntry {
  aliasType?: AliasTypeValue;
  contextHint?: AliasContextHint;
}

export interface AliasMappingResult {
  alias: string;
  resolvedName: string | null;
  personaId: string | null;
  aliasType: AliasTypeValue;
  confidence: number;
  evidence: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  chapterScope?: { start: number; end?: number };
}

export interface RegisterAliasInput {
  bookId: string;
  personaId?: string;
  alias: string;
  resolvedName?: string;
  aliasType: AliasTypeValue;
  confidence: number;
  evidence?: string;
  chapterStart?: number;
  chapterEnd?: number;
}
```

### 文件 4: `src/server/modules/analysis/services/AliasRegistryService.ts` (新建)

```typescript
import type { PrismaClient } from "@/generated/prisma/client";
import type { AliasMappingResult, RegisterAliasInput } from "@/types/analysis";

export interface AliasRegistryService {
  lookupAlias(bookId: string, alias: string, chapterNo: number): Promise<AliasMappingResult | null>;
  registerAlias(input: RegisterAliasInput): Promise<void>;
  loadBookAliasCache(bookId: string): Promise<Map<string, AliasMappingResult[]>>;
  listPendingMappings(bookId: string): Promise<AliasMappingResult[]>;
}

export function createAliasRegistryService(prismaClient: PrismaClient): AliasRegistryService {
  // 实现...
}
```

### 文件 5: `src/server/modules/analysis/services/ValidationAgentService.ts` (新建)

```typescript
import type { PrismaClient } from "@/generated/prisma/client";
import type { AnalysisProfileContext } from "@/types/analysis";
import type { ValidationReportData } from "@/types/validation";

export interface ChapterValidationInput {
  bookId: string;
  chapterId: string;
  chapterNo: number;
  chapterContent: string;
  jobId?: string;
  newPersonas: Array<{ id: string; name: string; confidence: number; nameType: string }>;
  newMentions: Array<{ personaId: string; rawText: string }>;
  newRelationships: Array<{ sourceId: string; targetId: string; type: string }>;
  existingProfiles: AnalysisProfileContext[];
}

export interface ValidationAgentService {
  validateChapterResult(input: ChapterValidationInput): Promise<ValidationReportData>;
  validateBookResult(bookId: string, jobId: string): Promise<ValidationReportData>;
  applyAutoFixes(reportId: string): Promise<number>;
}

export function createValidationAgentService(prismaClient: PrismaClient): ValidationAgentService {
  // 实现...
}
```

### 文件 6: `src/server/modules/analysis/services/BookPersonaCache.ts` (新建)

```typescript
export interface BookPersonaCache {
  personas: Map<string, { id: string; name: string; aliases: string[]; nameType: string }>;
  aliasIndex: Map<string, string>;
  profileIndex: Map<string, string>;

  lookupByName(name: string): string | undefined;
  lookupByAlias(alias: string): string | undefined;
  addPersona(persona: { id: string; name: string; aliases: string[]; nameType: string }): void;
  addAlias(alias: string, personaId: string): void;
}

export function createBookPersonaCache(): BookPersonaCache {
  // 实现...
}

export async function loadBookPersonaCache(prismaClient: PrismaClient, bookId: string): Promise<BookPersonaCache> {
  // 从 DB 批量加载，构建缓存
}
```

### 文件 7: API 路由新增

```
src/app/api/books/[id]/alias-mappings/route.ts         // GET: 列出别名映射, POST: 手动创建
src/app/api/books/[id]/alias-mappings/[mappingId]/route.ts  // PATCH: 确认/拒绝
src/app/api/books/[id]/validation-reports/route.ts      // GET: 列出自检报告
src/app/api/books/[id]/validation-reports/[reportId]/route.ts  // GET: 报告详情, POST: 应用修正
```

---

## 八、Codex 执行步骤清单

> 以下步骤设计为 Codex 5.3 可一次性按顺序执行。每个步骤都是自包含的，包含明确的输入、操作和验证条件。

### Step 1: Schema 变更

**操作**: 修改 `prisma/schema.prisma`

1. 在枚举区域新增 `AliasType` 枚举（5个值: TITLE, POSITION, KINSHIP, NICKNAME, COURTESY_NAME）
2. 新增 `AliasMappingStatus` 枚举（3个值: PENDING, CONFIRMED, REJECTED）
3. 新增 `AliasMapping` 模型（字段如上方 Prisma 模型定义，包含 `@@index` 和 `@@map`）
4. 新增 `ValidationReport` 模型（字段如上方 Prisma 模型定义，包含 `@@index` 和 `@@map`）
5. 在现有 `Book` 模型中添加 `aliasMappings AliasMapping[]` 和 `validationReports ValidationReport[]` 关系
6. 在现有 `Persona` 模型中添加 `aliasMappings AliasMapping[]` 关系
7. 在现有 `AnalysisJob` 模型中添加 `validationReports ValidationReport[]` 关系

**验证**: `npx prisma validate` 通过

### Step 2: 生成 Migration

**操作**: 执行 `npx prisma migrate dev --name add-alias-mapping-and-validation`

**验证**: migration 文件生成且 `npx prisma generate` 成功

### Step 3: 新增类型定义

**操作**:

1. 创建 `src/types/validation.ts`，包含所有 Validation 相关类型（ValidationIssueType, ValidationSeverity, ValidationSuggestionAction, ValidationSuggestion, ValidationIssue, ValidationSummary, ValidationReportData）
2. 在 `src/types/analysis.ts` 末尾追加: AliasTypeValue, AliasContextHint, EnhancedChapterRosterEntry, AliasMappingResult, RegisterAliasInput

**验证**: `npx tsc --noEmit` 通过

### Step 4: 实现 AliasRegistryService

**操作**: 创建 `src/server/modules/analysis/services/AliasRegistryService.ts`

实现以下方法:

1. `lookupAlias(bookId, alias, chapterNo)`:
   - 查询 `alias_mappings` 表: `WHERE bookId = ? AND alias = ? AND status != 'REJECTED'`
   - 过滤 chapterScope: `chapterStart <= chapterNo AND (chapterEnd IS NULL OR chapterEnd >= chapterNo)`
   - 按 confidence 降序取第一条
   - 返回 `AliasMappingResult | null`

2. `registerAlias(input: RegisterAliasInput)`:
   - 检查是否已存在相同 `bookId + alias + chapterStart` 且 confidence 更高的映射
   - 如存在且更高，跳过
   - 否则 upsert

3. `loadBookAliasCache(bookId)`:
   - 一次性查询 `SELECT * FROM alias_mappings WHERE bookId = ? AND status != 'REJECTED'`
   - 按 alias 分组，每组内按 confidence 降序排列
   - 返回 `Map<string, AliasMappingResult[]>`

4. `listPendingMappings(bookId)`:
   - `SELECT * FROM alias_mappings WHERE bookId = ? AND status = 'PENDING' ORDER BY confidence DESC`

导出 `createAliasRegistryService` 工厂函数和单例实例。

**验证**: 编写 `src/server/modules/analysis/services/__tests__/AliasRegistryService.test.ts` 单元测试，覆盖:
- lookupAlias 返回匹配结果
- lookupAlias 章节范围过滤
- lookupAlias 无匹配返回 null
- registerAlias 去重逻辑
- loadBookAliasCache 分组排序

### Step 5: 实现 BookPersonaCache

**操作**: 创建 `src/server/modules/analysis/services/BookPersonaCache.ts`

实现:

1. `createBookPersonaCache()`: 返回空缓存实例
2. `loadBookPersonaCache(prismaClient, bookId)`:
   - 查询 `persona + profile WHERE profile.bookId = bookId AND persona.deletedAt IS NULL`
   - 构建 `personas` Map (id → persona)
   - 构建 `aliasIndex` Map (每个 alias → personaId)
   - 构建 `profileIndex` Map (localName → personaId)
3. `lookupByName(name)`: 先查 `personas`（精确匹配 name），再查 `aliasIndex`
4. `lookupByAlias(alias)`: 查 `aliasIndex` → `profileIndex`
5. `addPersona(persona)`: 更新 `personas` Map 和 `aliasIndex`
6. `addAlias(alias, personaId)`: 更新 `aliasIndex`

**验证**: 编写 `src/server/modules/analysis/services/__tests__/BookPersonaCache.test.ts` 单元测试

### Step 6: 增强 PersonaResolver

**操作**: 修改 `src/server/modules/analysis/services/PersonaResolver.ts`

1. `createPersonaResolver` 函数签名增加可选参数 `aliasRegistry?: AliasRegistryService`
2. `ResolveInput` 增加可选字段 `chapterNo?: number`
3. 在 `resolve()` 的 Step 2（rosterMap 快速路径）之后插入 **Step 2.5**:
   ```
   // Step 2.5: 别名注册表查询
   if (aliasRegistry && input.chapterNo !== undefined) {
     const aliasResult = await aliasRegistry.lookupAlias(input.bookId, extracted, input.chapterNo);
     if (aliasResult && aliasResult.confidence >= 0.7 && aliasResult.personaId) {
       // upsert profile + return resolved
     }
   }
   ```
4. 在 Step 5（创建新 Persona）中，如果检测到 `isTitleOnly` 或名字匹配职位/称号模式，调用 `aliasRegistry.registerAlias()` 注册待确认映射

**验证**: 现有 PersonaResolver 测试仍然通过 + 新增别名注册表查询的测试用例

### Step 7: 增强 Phase 1 Prompt

**操作**: 修改 `src/server/modules/analysis/services/prompts.ts` 的 `buildRosterDiscoveryPrompt`

1. 在输出规则第 9 条后新增:
   ```
   10. 若 surfaceForm 是别名/称号/封号/职位称呼类型，额外标注:
       - "aliasType": "TITLE"(封号/尊号) | "POSITION"(职位称呼) | "KINSHIP"(亲属代称) | "NICKNAME"(绰号) | "COURTESY_NAME"(字号)
       - "contextHint": 简述该称呼在本章上下文中的线索（≤100字），包括共现人物、相关事件
       - "suggestedRealName": 如果上下文能推断出对应的真实人名，填写；否则省略
       - "aliasConfidence": 对 suggestedRealName 的确信度（0-1）
   ```
2. 更新示例 JSON 数组，加入带 aliasType 的样例:
   ```json
   { "surfaceForm": "范老爷", "entityId": 1, "aliasType": "NICKNAME" },
   { "surfaceForm": "太祖皇帝", "isNew": true, "isTitleOnly": true, "aliasType": "TITLE", "contextHint": "文中提及明朝开国，与朱元璋事迹吻合", "suggestedRealName": "朱元璋", "aliasConfidence": 0.9 }
   ```

**验证**: Prompt 字符串能正确生成（编写 snapshot 测试）

### Step 8: 增强 Phase 1 解析函数

**操作**: 修改 `src/types/analysis.ts` 的 `parseChapterRosterResponse`

1. 扩展解析逻辑以支持新字段 `aliasType`, `contextHint`, `suggestedRealName`, `aliasConfidence`
2. 新增 `EnhancedChapterRosterEntry` 的解析函数 `parseEnhancedChapterRosterResponse`
3. 向后兼容：如果 AI 返回不含新字段，按原有逻辑处理

**验证**: 新增解析测试用例覆盖有/无新字段两种情况

### Step 9: ChapterAnalysisService 集成别名注册表

**操作**: 修改 `src/server/modules/analysis/services/ChapterAnalysisService.ts`

1. `createChapterAnalysisService` 增加可选参数 `aliasRegistry?: AliasRegistryService`
2. 在 `analyzeChapter()` 中:
   - Phase 1 名册发现后，遍历 roster 中带 `aliasType` 的条目
   - 对每个有 `suggestedRealName` 且 `aliasConfidence >= 0.7` 的条目，调用 `aliasRegistry.registerAlias()`
   - 对有 `suggestedRealName` 且 `aliasConfidence >= 0.85` 的条目，额外写入 rosterMap（实现自动归并）
3. 在 `persistResult()` 中:
   - `resolve()` 调用时传入 `chapterNo`
4. 在 `resolvePersonaTitles()` 中:
   - AI 溯源结果除了更新 persona.name 外，同时调用 `aliasRegistry.registerAlias()` 持久化映射

**验证**: 现有 ChapterAnalysisService 测试通过 + 新增集成测试

### Step 10: 实现 ValidationAgentService

**操作**: 创建 `src/server/modules/analysis/services/ValidationAgentService.ts`

实现:

1. `validateChapterResult(input: ChapterValidationInput)`:
   - 构建验证 Prompt（调用 `buildChapterValidationPrompt`）
   - 调用 AI Provider 获取 JSON 响应
   - 解析并验证响应（`parseValidationResponse`）
   - 过滤 confidence < 0.6 的 issues
   - 验证 affectedPersonaIds 存在于 DB
   - 构建 ValidationSummary
   - 持久化到 `validation_reports` 表
   - 返回 ValidationReportData

2. `validateBookResult(bookId, jobId)`:
   - 加载全书 personas, relationships, mentions 统计
   - 构建全书验证 Prompt（`buildBookValidationPrompt`）
   - 重点检查: 全书维度的同名异人、同人多名、关系矛盾
   - 解析、过滤、持久化、返回

3. `applyAutoFixes(reportId)`:
   - 读取 report 的 issues
   - 筛选 confidence >= 0.9 且 action 为 MERGE/ADD_ALIAS/UPDATE_NAME 的
   - 对每个 fix:
     - MERGE: 调用 `mergePersonas`
     - ADD_ALIAS: 更新 persona.aliases
     - UPDATE_NAME: 更新 persona.name + 保留旧名到 aliases
   - 更新 report.status = 'APPLIED'
   - 返回执行数量

**验证**: 编写 `src/server/modules/analysis/services/__tests__/ValidationAgentService.test.ts`

### Step 11: 新增验证 Prompt

**操作**: 在 `src/server/modules/analysis/services/prompts.ts` 中新增:

1. `buildChapterValidationPrompt(input)`: 如本文档第四节 4.4 中的设计
2. `buildBookValidationPrompt(input)`: 全书维度的验证 Prompt，关注:
   - 全书人物列表一致性
   - 别名覆盖率
   - 关系图自洽性
   - 低置信实体统计

新增解析函数:
3. `parseValidationResponse(raw: string)`: 解析 AI 返回的 JSON → `ValidationIssue[]`
   - 使用 `repairJson` 修复截断
   - 校验每个 issue 的必须字段
   - 过滤非法 type/severity/action 值

**验证**: Prompt snapshot 测试 + 解析函数单元测试

### Step 12: runAnalysisJob 集成自检 + 增量溯源

**操作**: 修改 `src/server/modules/analysis/jobs/runAnalysisJob.ts`

1. `ChapterAnalyzer` 类型增加 `validateBookResult?` 和 `applyAutoFixes?` 方法
2. 在章节循环中增加**增量溯源**（每 5 章执行一次）:
   ```typescript
   const INCREMENTAL_RESOLVE_INTERVAL = 5;
   for (const [index, chapter] of chapters.entries()) {
     // ... 现有章节解析 ...
     
     // 增量溯源: 每 5 章对新增 TITLE_ONLY Persona 执行一次称号真名溯源
     if ((index + 1) % INCREMENTAL_RESOLVE_INTERVAL === 0) {
       try {
         await chapterAnalyzer.resolvePersonaTitles(job.bookId);
       } catch (err) {
         console.warn("[analysis.runner] incremental.title.resolve.failed", ...);
       }
     }
   }
   ```
3. 在 FULL_BOOK 完成后（现有 `markOrphanPersonas` 和 `resolvePersonaTitles` 之后），**全书自检（不阻塞，失败只记日志）**:
   ```typescript
   // Phase 6: 全书自检（全书完成后统一执行，不影响章节解析速度）
   if (chapterAnalyzer.validateBookResult) {
     try {
       const report = await chapterAnalyzer.validateBookResult(job.bookId, job.id);
       if (report.summary.autoFixable > 0 && chapterAnalyzer.applyAutoFixes) {
         await chapterAnalyzer.applyAutoFixes(report.id);
       }
     } catch (validationError) {
       console.warn("[analysis.runner] book.validation.failed", ...);
     }
   }
   ```

**验证**: 现有 runAnalysisJob 测试通过 + 新增包含 mock validation 的测试

### Step 13: API 路由

**操作**: 新建以下 API 路由文件:

1. `src/app/api/books/[id]/alias-mappings/route.ts`:
   - GET: `listPendingMappings(bookId)` → 返回别名映射列表
   - POST: 手动创建别名映射（body: `{ alias, resolvedName, aliasType, personaId? }`）

2. `src/app/api/books/[id]/alias-mappings/[mappingId]/route.ts`:
   - PATCH: 更新映射状态（body: `{ status: 'CONFIRMED' | 'REJECTED' }`）

3. `src/app/api/books/[id]/validation-reports/route.ts`:
   - GET: 列出本书的自检报告

4. `src/app/api/books/[id]/validation-reports/[reportId]/route.ts`:
   - GET: 报告详情（含 issues 列表）
   - POST: 应用自动修正（调用 `applyAutoFixes`）

每个路由遵循现有项目模式:
- 使用 `readJsonBody` 解析请求体
- 使用 `apiResponse.success/error` 统一响应
- 使用 `withAuth` 中间件（如需要）
- 错误处理遵循 `route-utils.ts` 模式

**验证**: 每个路由的 happy path 手动测试或集成测试

### Step 14: 前端 — 服务层（API Client）

**操作**: 新增 `src/lib/services/alias-mappings.ts` 和 `src/lib/services/validation-reports.ts`

**文件 1: `src/lib/services/alias-mappings.ts`**:
```typescript
import { clientFetch, clientMutate } from "@/lib/client-api";

export interface AliasMappingItem {
  id          : string;
  bookId      : string;
  alias       : string;
  resolvedName: string | null;
  aliasType   : string;       // TITLE | POSITION | KINSHIP | NICKNAME | COURTESY_NAME
  personaId   : string | null;
  personaName : string | null; // 关联的 persona.name（join 查询）
  confidence  : number;
  evidence    : string | null;
  status      : string;       // PENDING | CONFIRMED | REJECTED
  chapterStart: number | null;
  chapterEnd  : number | null;
  createdAt   : string;
}

// 按书籍拉取别名映射列表（默认 PENDING，可选全部）
export async function fetchAliasMappings(
  bookId: string,
  status?: string
): Promise<AliasMappingItem[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  return clientFetch(`/api/books/${bookId}/alias-mappings?${params}`);
}

// 确认别名映射（PENDING → CONFIRMED）
export async function confirmAliasMapping(bookId: string, mappingId: string): Promise<void> {
  return clientMutate(`/api/books/${bookId}/alias-mappings/${mappingId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "CONFIRMED" })
  });
}

// 拒绝别名映射（PENDING → REJECTED）
export async function rejectAliasMapping(bookId: string, mappingId: string): Promise<void> {
  return clientMutate(`/api/books/${bookId}/alias-mappings/${mappingId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "REJECTED" })
  });
}

// 手动创建别名映射
export async function createAliasMapping(bookId: string, body: {
  alias: string;
  resolvedName: string;
  aliasType: string;
  personaId?: string;
}): Promise<void> {
  return clientMutate(`/api/books/${bookId}/alias-mappings`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}
```

**文件 2: `src/lib/services/validation-reports.ts`**:
```typescript
import { clientFetch, clientMutate } from "@/lib/client-api";
import type { ValidationIssue, ValidationSummary } from "@/types/validation";

export interface ValidationReportItem {
  id        : string;
  bookId    : string;
  jobId     : string | null;
  scope     : string;          // "CHAPTER" | "FULL_BOOK"
  status    : string;          // "PENDING" | "REVIEWED" | "APPLIED"
  summary   : ValidationSummary;
  createdAt : string;
}

export interface ValidationReportDetail extends ValidationReportItem {
  issues: ValidationIssue[];
}

// 列出本书自检报告
export async function fetchValidationReports(bookId: string): Promise<ValidationReportItem[]> {
  return clientFetch(`/api/books/${bookId}/validation-reports`);
}

// 报告详情
export async function fetchValidationReportDetail(
  bookId: string,
  reportId: string
): Promise<ValidationReportDetail> {
  return clientFetch(`/api/books/${bookId}/validation-reports/${reportId}`);
}

// 应用自动修正
export async function applyAutoFixes(
  bookId: string,
  reportId: string
): Promise<{ appliedCount: number }> {
  return clientMutate(`/api/books/${bookId}/validation-reports/${reportId}`, {
    method: "POST",
    body: JSON.stringify({ action: "apply-auto-fixes" })
  });
}
```

**验证**: TypeScript 编译通过

### Step 15: 前端 — ReviewPanel 新增 2 个 Tab

**操作**: 修改以下文件

#### 15.1 修改 `src/components/review/review-panel.tsx`

1. **扩展 Tab 类型**:
   ```typescript
   // 修改
   type ReviewTab = "personas" | "relationships" | "biography" | "merge" | "aliases" | "validation";
   ```

2. **TAB_CONFIG 新增 2 项**:
   ```typescript
   { id: "aliases",    label: "别名映射", icon: <Tags className="h-4 w-4" /> },
   { id: "validation", label: "自检报告", icon: <ShieldCheck className="h-4 w-4" /> },
   ```

3. **新增数据加载**:
   - 在现有 `useEffect` 加载逻辑中增加 `fetchAliasMappings(bookId)` 和 `fetchValidationReports(bookId)`
   - 新增 state: `aliasMappings`, `validationReports`

4. **Tab 内容区域新增**:
   - `{activeTab === "aliases" && <AliasReviewTab ... />}`
   - `{activeTab === "validation" && <ValidationReportTab ... />}`

5. **Tab badge 计数**:
   - aliases: 显示 PENDING 状态的别名映射数量
   - validation: 显示未处理的 issue 总数

#### 15.2 新建 `src/components/review/alias-review-tab.tsx`

**UI 设计**:
```
┌──────────────────────────────────────────────────────────┐
│ 筛选: [全部 ▼] [TITLE ▼] [置信度排序 ▼]                  │
├──────────────────────────────────────────────────────────┤
│ ☐ "太祖皇帝" → 朱元璋                                     │
│   类型: TITLE | 置信度: 95% | 章节: 1-56                   │
│   依据: 明朝开国皇帝，庙号太祖                              │
│   [✓ 确认] [✗ 拒绝] [✏ 编辑映射]                          │
├──────────────────────────────────────────────────────────┤
│ ☐ "丞相" → ？（待确认）                                    │
│   类型: POSITION | 置信度: 45% | 章节: 3-10                │
│   依据: 上下文未明确指示具体人物                            │
│   [✏ 手动指定人物] [✗ 拒绝]                                │
├──────────────────────────────────────────────────────────┤
│ + 手动添加别名映射                                         │
└──────────────────────────────────────────────────────────┘
```

**组件 Props**:
```typescript
interface AliasReviewTabProps {
  bookId: string;
  aliasMappings: AliasMappingItem[];
  onRefresh: () => void;
}
```

**核心功能**:
1. 卡片列表展示每条别名映射
2. 每卡片显示: 别名 → 真名、aliasType Badge、confidence 百分比、章节范围、推断依据
3. 操作按钮: 确认（调用 `confirmAliasMapping`）、拒绝（调用 `rejectAliasMapping`）
4. 未映射（resolvedName 为 null）的条目显示"手动指定人物"按钮，弹出 persona 选择器
5. "手动添加别名映射"按钮 → 弹出表单（alias, resolvedName, aliasType, personaId 选择）
6. 筛选: 按 status（全部/PENDING/CONFIRMED/REJECTED）、按 aliasType
7. 确认/拒绝后调用 `onRefresh()` 刷新列表

**复用的 UI 组件**: Card, Badge, Button, Select, Dialog, Input

#### 15.3 新建 `src/components/review/validation-report-tab.tsx`

**UI 设计**:
```
┌──────────────────────────────────────────────────────────┐
│ 📋 自检报告 #1  2026-03-31  全书检查                       │
│ 摘要: 12 问题 (3 ERROR, 7 WARNING, 2 INFO) | 5 可自动修正  │
│ [▶ 展开详情] [🔧 应用自动修正(5)]                          │
├──────────────────────────────────────────────────────────┤
│  ⚠ ALIAS_AS_NEW_PERSONA (置信度: 92%)                     │
│  "范老爷" 被创建为新人物，但可能是 "范进" 的别名             │
│  证据: 第3回原文"范老爷进了学..."                           │
│  建议: MERGE → 合并到 "范进"                               │
│  [✓ 接受建议] [✗ 忽略]                                    │
├──────────────────────────────────────────────────────────┤
│  🔴 WRONG_MERGE (置信度: 88%)                              │
│  "张静斋" 和 "张乡绅" 被合并，但可能是不同人物              │
│  建议: SPLIT → 拆分为独立人物                              │
│  [✓ 接受建议] [✗ 忽略]                                    │
└──────────────────────────────────────────────────────────┘
```

**组件 Props**:
```typescript
interface ValidationReportTabProps {
  bookId: string;
  reports: ValidationReportItem[];
  onRefresh: () => void;
}
```

**核心功能**:
1. 报告列表（按时间倒序），每条显示摘要信息（issue 统计、scope、状态）
2. 展开报告 → 加载详情（`fetchValidationReportDetail`），显示 issue 列表
3. 每个 issue 卡片:
   - severity icon（🔴 ERROR / ⚠ WARNING / ℹ INFO）
   - type Badge
   - confidence 百分比
   - description + evidence
   - suggestion 操作按钮
4. "应用自动修正"按钮 → 调用 `applyAutoFixes`，刷新后展示结果
5. 单条 issue "接受建议" → 根据 suggestion.action 执行对应操作:
   - MERGE: 调用 persona merge API
   - ADD_ALIAS: 调用 persona patch API 追加 alias
   - UPDATE_NAME: 调用 persona patch API 更新 name
   - MANUAL_REVIEW: 仅标记为已审阅

**复用的 UI 组件**: Card, Badge, Button, Collapsible, AlertDialog

#### 15.4 修改 `src/app/admin/review/[bookId]/page.tsx`

在服务端数据加载中新增:
```typescript
// 新增: 加载别名映射和自检报告
const [aliasMappings, validationReports] = await Promise.all([
  fetchAliasMappingsServer(bookId),
  fetchValidationReportsServer(bookId),
]);
```

将新数据作为 props 传入 `<ReviewPanel>` 组件。

**验证**: 页面正常渲染，两个新 Tab 可切换，数据正确展示

### Step 16: 前端 — 编写组件 barrel export

**操作**: 更新 `src/components/review/index.ts`

新增导出:
```typescript
export { AliasReviewTab } from "./alias-review-tab";
export { ValidationReportTab } from "./validation-report-tab";
```

**验证**: 其他文件可正常 import

### Step 17: 性能优化 — BookPersonaCache 集成

**操作**: 修改 `src/server/modules/analysis/jobs/runAnalysisJob.ts`

1. 在章节循环开始前:
   ```typescript
   const personaCache = await loadBookPersonaCache(prismaClient, job.bookId);
   ```
2. 将 `personaCache` 传入 `analyzeChapter(chapter.id, { personaCache })`
3. 修改 `ChapterAnalysisService.analyzeChapter` 接受可选 `personaCache` 参数
4. 在 `loadCandidates` 中优先使用 cache，cache miss 时回退 DB 查询
5. 在 `persistResult` 每次 `resolve` 创建新 persona 后，更新 cache

**验证**: 性能对比测试（可选）+ 现有功能测试通过

### Step 18: 性能优化 — 活跃人物上下文精简

**操作**: 修改 `src/server/modules/analysis/services/ChapterAnalysisService.ts`

1. 新增 `filterActiveProfiles(allProfiles, rosterEntries, recentChapterNos)`:
   - 保留: Phase 1 名册中出现的人物
   - 保留: 最近 2 章有 mention 记录的人物
   - 限制: 最多 60 个人物上下文
   - 按最近出场频率排序
2. 在 `buildChapterAnalysisPrompt` 调用前，用 `filterActiveProfiles` 过滤 profiles

**验证**: 现有测试通过 + 新增 `filterActiveProfiles` 单元测试

### Step 19: 性能优化 — Provider 维度并发度

**操作**: 修改 `src/server/modules/analysis/services/ChapterAnalysisService.ts`

1. 新增配置:
   ```typescript
   const PROVIDER_CONCURRENCY: Record<string, number> = {
     gemini: 5,
     deepseek: 3,
     qwen: 4,
     doubao: 3
   };
   ```
2. `analyzeChapter` 中根据实际使用的 provider 名称设置并发度
3. 回退到默认 `AI_CONCURRENCY = 3`

**验证**: 确认不同 provider 使用不同并发度

### Step 20: 编写集成测试

**操作**: 创建 `src/server/modules/analysis/services/__tests__/integration/` 目录

1. `aliasResolution.integration.test.ts`:
   - 模拟包含别名的章节文本
   - 验证别名被正确注册到 alias_mappings
   - 验证后续章节能通过 AliasRegistry 正确解析

2. `validationAgent.integration.test.ts`:
   - 模拟有问题的解析结果
   - 验证自检 Agent 能检出问题
   - 验证 applyAutoFixes 正确执行

**验证**: 所有集成测试通过

---

## 九、需求歧义说明与假设

1. **假设**: 自检 Agent 使用与主解析相同的 AI 模型（由书籍绑定模型决定），不单独配置模型
2. **假设**: 别名映射是书籍维度的（不跨书共享），因为同一称号在不同书中含义不同
3. **假设**: 自检 Agent 的章节级检查是可选的（通过配置控制），全书级检查默认开启
4. **假设**: 性能优化不改变现有 API 接口契约，只影响内部实现
5. **假设**: `alias_mappings` 的 CONFIRMED 状态可由自检 Agent 自动设置（confidence ≥ 0.9）或由人工确认
6. **歧义**: "在保证准确率前提下提升解析速度" — 本方案采用"准确率不降"的硬约束，所有可能降低准确率的优化标记为"高风险"，不在首批实施

---

## 十、验收标准

1. ✅ 别名/称号在解析时被标注类型，高置信映射自动归并
2. ✅ 低置信别名映射标记为 PENDING，可通过 API/UI 人工确认
3. ✅ 自检 Agent 能检出别名误识别、错误合并、漏映射等问题
4. ✅ 自检报告以结构化 JSON 存储，可通过 API 查询
5. ✅ 高置信自检修正可自动应用
6. ✅ 别名注册表缓存减少 DB 查询，不影响准确率
7. ✅ 审核中心新增"别名映射"Tab，支持确认/拒绝/手动指定
8. ✅ 审核中心新增"自检报告"Tab，支持查看 issue 详情和应用修正
9. ✅ 现有单元测试和集成测试全部通过
10. ✅ `npx prisma validate` 和 `npx tsc --noEmit` 通过
