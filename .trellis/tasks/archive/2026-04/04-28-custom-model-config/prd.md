# 模型配置完全自定义化（页面增删模型 + 协议化客户端）

## Goal

让管理员在 `/admin/model` 页面**完全自助管理 AI 模型配置**，无需改代码 / 改 seed / 改部署即可接入新模型版本（如 DeepSeek V4）、自建网关与第三方聚合网关。

## Requirements

### R1 模型 CRUD（核心能力）
- 管理员可在页面**新增**模型条目：填写 provider 名（自由字符串）、protocol（下拉选 `openai-compatible` | `gemini`）、name（显示名）、modelId、baseUrl、apiKey、可选 aliasKey
- 管理员可**编辑**已有模型（沿用既有 patch 流程）
- 管理员可**删除**模型，需通过引用保护校验（见 R6）
- 列表按 provider 分组展示，provider 名作为分组标题（接受拼写不一致可能产生多分组的代价）
- 移除 `provider` 的 TS 字面量联合 + Zod enum 校验，降级为非空 string

### R2 Protocol 字段（解锁自由 provider）
- Schema 新增列 `protocol` (text)：取值 `openai-compatible` | `gemini`
- Migration 为 ADD COLUMN with default，对存量数据无破坏
- `createAiProviderClient` 工厂改为 `switch (protocol)` 而非 `switch (provider)`
- DeepSeek/Qwen/Doubao/GLM 共用 `openaiCompatibleClient` 实现，复用既有客户端代码（不删除现有 5 个文件，但不再被 dispatch；后续清理可作为独立任务）

### R3 SSRF 防护改造（黑名单制）
- 移除 `connectivityHostAllowList` 按 provider 域名白名单
- 改为统一的"私有/危险地址黑名单"校验：拦截 `localhost` / `127.0.0.0/8` / `10.0.0.0/8` / `172.16.0.0/12` / `192.168.0.0/16` / `169.254.0.0/16` / IPv6 ULA (`fc00::/7`) / IPv6 link-local (`fe80::/10`) / `::1`
- 域名形态需先做 DNS 解析后再校验解析出的所有 IP（防 DNS rebinding 简单形态；本期不做 pin 解析）
- 任意公网 baseUrl 通过

### R4 Seed 移除
- 删除 `prisma/seed.ts` 中 `defaultAiModels` 与对应的 `aiModel.deleteMany + createMany`
- Seed 命令保留其他业务种子（书籍类型、命名模式、提示词模板等）不变
- 增加文档：`docs/model-config-bootstrap.md`（或更新 README）— 说明首次部署如何添加第一个模型

### R5 显示自定义（仅 name）
- 不新增 schema 字段
- 管理员可编辑 `name` — 在面板列表与策略选择器中即时生效
- 排序保持现状（按 createdAt / provider 分组内默认排序）

### R6 删除引用保护
- 不可删除 `isDefault = true` 的模型（必须先把默认指向其他启用模型）
- 不可删除被任何 `ModelStrategyConfig` 引用的模型（按 aliasKey 或 modelId 匹配）
- 校验失败返回明确错误码与提示信息（含引用书籍清单或"是默认模型"说明）

### R7 导入/导出
- `GET /api/admin/models/export` — 返回所有模型配置的 JSON（**API Key 字段脱敏不导出**）
- `POST /api/admin/models/import` — 接收 JSON，按 aliasKey 优先 + (provider,modelId,baseUrl) 次之做 upsert；apiKey 永远不被导入覆盖（保留现有值或留空）
- 文件上传与下载走管理员 UI 的明确按钮入口

### R8 唯一性 / 重复检测
- 同时存在的模型若 `(provider, modelId, baseUrl)` 完全相同 → 新增/导入时阻断并提示
- aliasKey 全局唯一（仅当填写时）

### R9 零模型引导
- 当 `aiModel` 表为空时，`/admin/model` 页面渲染"添加第一个模型"引导卡片，给出协议选择 + 预填示例（DeepSeek 官方 endpoint）
- 已有模型时不显示该卡片

### R10 行为兼容
- 现有 5 个内置 provider（被预设过的）章节分析流水线行为不变
- API Key 加密机制保留
- 默认模型唯一约束保留
- 连通性测试响应契约保留

## Acceptance Criteria

- [ ] 管理员可在不改代码前提下，新增 "DeepSeek V4 (deepseek-chat-v4)"、设置 baseUrl/apiKey、点击"测试连通性"通过、启用并设为默认
- [ ] 管理员尝试删除默认模型 → 被阻断并提示"请先切换默认模型"
- [ ] 管理员尝试删除被某书籍策略引用的模型 → 被阻断并提示引用方
- [ ] 添加 `(provider=DeepSeek, modelId=deepseek-chat, baseUrl=https://api.deepseek.com)` 重复条目 → 被阻断
- [ ] 重新执行 `pnpm prisma:seed` 不会清空管理员新增/编辑的模型
- [ ] SSRF：尝试用 `http://127.0.0.1:11434` 作为 baseUrl 测试 → 被拒绝
- [ ] 任意公网域名 baseUrl 测试可发起请求（不再被白名单拦截）
- [ ] 模型表为空时打开 `/admin/model` 显示引导卡片
- [ ] 导出 JSON 不含 apiKey 明文；导入 JSON 时 apiKey 不被覆盖
- [ ] 现有 9 条预置模型在升级后保留可用（先迁移再删 seed 重建逻辑）
- [ ] `pnpm lint && pnpm type-check && pnpm test` 全绿；新增功能的单测覆盖率不低于现有阈值（90% line）

## Definition of Done

- 单测：CRUD、protocol 工厂分发、SSRF 黑名单、引用保护、导入导出、唯一性
- 集成测试：route handler 层 happy path + 引用保护错误
- `pnpm lint && pnpm type-check && pnpm test` 全绿
- 手工验证：增 → 测连通 → 启用 → 设默认 → 编辑 name → 导出 → 导入 → 删除（被拦） → 切默认后删除 → 全链路通过
- 文档更新：`CLAUDE.md` 模型管理段落 + 新增 `docs/model-config-bootstrap.md`
- Migration 已生成且可回滚

## Technical Approach

### 数据模型变更
```prisma
model AiModel {
  // 既有字段保留 ...
  provider  String   // 不变，但移除应用层 enum 校验
  protocol  String   @default("openai-compatible") // 新增列
  // ...
  @@unique([provider, modelId, baseUrl], map: "ai_models_unique_endpoint")
  @@unique([aliasKey], map: "ai_models_alias_key_uniq")
}
```

### 工厂层重构
- `src/server/providers/ai/index.ts`：
  - 删除 `AiProviderName` 联合类型
  - `CreateAiProviderInput` 改为 `{ protocol: "openai-compatible" | "gemini"; apiKey; baseUrl?; modelName }`
  - `createAiProviderClient` 按 protocol 分发：`openai-compatible` → `openaiCompatibleClient`，`gemini` → `GeminiClient`
- `deepseekClient.ts` 暂保留为可选特化 — 但默认 protocol 路径不再使用；后续清理列入技术债

### Models 服务层
- `src/server/modules/models/index.ts`：
  - 新增 `createModel(input)` / `deleteModel(id)`
  - `updateModel` 支持改 name / aliasKey / protocol
  - 引用保护查询 `ModelStrategyConfig.where({ OR: [{ aliasKey }, { modelId }] })`
- `connectivity.ts`：替换为 `assertSafePublicHost(baseUrl)` 函数（IP 范围 + DNS 解析）

### API 路由
- `POST /api/admin/models` — 新增
- `DELETE /api/admin/models/[id]` — 删除
- `GET /api/admin/models/export` / `POST /api/admin/models/import`
- 既有 `GET / PATCH / [id]/test / [id]/default` 保留契约

### Admin UI
- `model-manager.tsx`：
  - 顶部新增"+ 新增模型"按钮 → 抽屉/对话框表单
  - 列表按 provider 分组渲染
  - 每张卡片新增"删除"按钮（带二次确认）
  - 列表为空时显示零模型引导卡片
  - 顶部右侧加"导出 / 导入" 按钮组

### Migration 与数据保留
- Migration 1：ADD COLUMN protocol (default 'openai-compatible')，UPDATE 已有 deepseek/qwen/doubao/glm 行 protocol='openai-compatible'，UPDATE gemini 行 protocol='gemini'
- Migration 2：唯一索引 (provider, modelId, baseUrl) + aliasKey 升级为 unique
- 预置模型保留：在 migration 中保留现有数据，仅修改 seed 文件（不再 deleteMany）

## Decision (ADR-lite)

**Context**：当前 5 个 provider 在代码层硬编码，DeepSeek V4 等新版本无法即时接入；seed 用 deleteMany 会覆盖管理员配置；SSRF 白名单与"自定义"冲突。

**Decision**：
1. `provider` 改为自由 string（取消 enum 锁），UI 按其分组显示
2. 新增 `protocol` 字段（`openai-compatible` | `gemini`），工厂按 protocol 分发客户端
3. SSRF 改为内网/私有地址黑名单
4. 移除 seed 重置逻辑，零模型时引导式新增；保留使用提示文档
5. 显示自定义本期仅开放 name 字段
6. 加引用保护 + 导入导出 + 唯一约束作为完整体验

**Consequences**：
- ✅ 完全自助、即时接入新模型版本与第三方网关
- ✅ Schema 变更克制（仅加 1 列 + 2 个唯一索引）
- ⚠️ Provider 名拼写不一致时面板出现多分组（用户已确认接受）
- ⚠️ 现有 deepseek/qwen/doubao/glm Client 进入"未被使用"状态，作为技术债，下次清理
- ⚠️ DNS rebinding 仅做基础防护（解析时点校验），不做 pin

## Out of Scope

- Provider 协议第三类（如 Anthropic 原生协议）— protocol 字段已为未来扩展预留
- 模型图标 / 徽章 / 颜色等视觉自定义
- 模型在面板的拖拽排序 / 显示开关 isVisible
- 自动从 name 生成 slug 给 aliasKey
- 模型版本"平滑升级"机制（aliasKey 重定向）
- 清理废弃的 deepseekClient / qwenClient / doubaoClient / glmClient（独立技术债任务）
- 国际化 / 多语言显示

## Technical Notes

关键修改点：
- `src/server/providers/ai/index.ts` — 工厂重构
- `src/server/modules/models/index.ts` — CRUD + 引用保护
- `src/server/modules/models/connectivity.ts` — SSRF 改造
- `src/server/modules/models/admin-adapters.ts` — 新增 create/delete/import/export 适配
- `src/app/api/admin/models/route.ts` — 加 POST
- `src/app/api/admin/models/[id]/route.ts` — 加 DELETE
- `src/app/api/admin/models/export/route.ts` — 新文件
- `src/app/api/admin/models/import/route.ts` — 新文件
- `src/app/admin/model/_components/model-manager.tsx` — 增/删 UI、分组渲染、零状态、导入导出按钮
- `prisma/schema.prisma` + 新 migration
- `prisma/seed.ts` — 移除模型 seed 段
- `docs/model-config-bootstrap.md` — 新文档

实施 PR 切分（小 PR 串联）：
- PR1：Schema migration + 移除 enum 校验 + protocol 字段 + 工厂重构 + 单测
- PR2：CRUD（create/delete）+ 引用保护 + 唯一约束 + 单测
- PR3：SSRF 黑名单改造 + 单测
- PR4：UI 新增/删除/分组/零状态
- PR5：导入导出（API + UI 按钮）
- PR6：移除 seed 模型段 + 文档 + 收尾验证
