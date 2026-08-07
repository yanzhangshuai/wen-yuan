# v5-identity 执行计划

> 从零建身份解析域。按依赖序推进，每步单测验证。**复用 AiCallExecutor**（analysis 模块），不重写 LLM 调用层。

## Step 1 · 登记表派生视图（registry.ts）

- [ ] `getRegistry(bookId)`：entities/aliases/mentions/entity_profiles 聚合查询 → `RegistryEntry[]`
- [ ] HIGH/MEDIUM/LOW 派生分类（design §2.1 规则）
- [ ] `getRegistryEntity(bookId, name)` 名字命中（canonical/alias 归一化）
- [ ] 书级缓存 + 失效（identityService 写后失效）

**验证**：`npx vitest run src/server/modules/identity/registry.test.ts`
**门禁**：用 seed 数据构造假 book+entities/aliases/mentions，断言分级正确

## Step 2 · 分布式冲突扫描（conflictScan.ts）

- [ ] 别名活跃章区（mentions 推导）比对候选实体活跃章区
- [ ] 重归属 / 正常共现判定（按章分布，非邻近）
- [ ] 候选级 + 全量终扫两种调用（同一代码路径）

**验证**：单测覆盖"同场共现不误报""真误归属能检出"
**门禁**：范老爷/范进同框不标记；章区分离的误归属标记

## Step 3 · 身份判定原语（primitive.ts + prompts.ts）

- [ ] `PrimitiveInput/Output` 类型 + `runPrimitive()`（复用 AiCallExecutor）
- [ ] HIGH 组合规则（四条件合取）
- [ ] 分层采样（≤15 窗口，按章取样）helper
- [ ] prompts.ts：极简 prompt（目标 + JSON Schema + 证据锚定判据）
- [ ] 单测（mock AiCallExecutor 返回 resolved/new/ambiguous）

**验证**：单测 mock 断言 HIGH 规则分支
**门禁**：四条件任一不满足 → 不 HIGH

## Step 4 · identityService 单一写路径

- [ ] `write(draftRegistry)`：四路回写（Tier1/Tier2/reconcile/跨模型）统一入口
- [ ] 写 entities + aliases + mentions + `agent_write_audits`（同一事务）
- [ ] 写后失效登记表缓存

**验证**：单测断言事务原子性 + 审计落全
**门禁**：回写后 getRegistry 反映新数据；审计有 before/after

## Step 5 · Tier1 全书一遍（tier1.ts）

- [ ] A/B 校准表读取（选单遍 or 分卷）
- [ ] 全书一遍调用（输出分片合并：人物/地点/组织）
- [ ] 分卷路径（相邻卷重叠 + 原语卷级合并）
- [ ] 落库走 identityService

**验证**：mock AiCallExecutor，断言草稿登记表合并正确
**门禁**：单遍/分卷路径分支都有测试

## Step 6 · Tier2 残余候选（tier2.ts）

- [ ] 残余候选收集（冲突标记 / 低置信 / 漏网高频 / 风险集中类）
- [ ] 每候选分层采样 → 原语 → 回写

**验证**：mock 原语，断言残余处理流程
**门禁**：ambiguous → 人审标记；HIGH → 登记表

## Step 7 · reconcile（reconcile.ts）

- [ ] "提及数≥N 不在登记表"表面形式扫描（确定性）
- [ ] 原语补判 → 回写（同模型二次看）
- [ ] 边界文档（只补覆盖，不补系统误判）

**验证**：单测断言漏网表面形式被扫描到并补判
**门禁**：reconcile 在 Pass1 后 Pass3 前的时序由 pipeline 强制（本任务只实现组件）

## Step 8 · 集成验证

- [ ] `npx vitest run src/server/modules/identity/`（全部单测）
- [ ] `grep -r "tool-loop\|load_skill\|submit_facts" src/server/modules/identity/` 零引用（无工具循环）
- [ ] 类型检查：`npx tsc --noEmit 2>&1 | grep identity` 零错误
- [ ] 行覆盖 ≥90%（identity 模块）

## 评审门禁

- Step 1-4（登记表/扫描/原语/写路径）是承重件，完成后过一次 review
- Step 5-7（Tier1/Tier2/reconcile）依赖 Step 1-4 就绪
- 全程复用 AiCallExecutor，不引入工具循环

## 回滚

- 每 Step 独立 commit，可单独回退
- identity 模块未接入管线前，不影响 books/graph 现有功能
