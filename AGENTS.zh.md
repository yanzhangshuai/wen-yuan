<!-- TRELLIS:START -->
# Trellis 使用说明

以下说明面向在本项目中工作的 AI 助手。

每次开启新会话时，请使用 `/trellis:start` 来：
- 初始化开发者身份
- 理解当前项目上下文
- 读取相关规范

使用 `@/.trellis/` 了解：
- 开发工作流（`workflow.md`）
- 项目结构与规范（`spec/`）
- 开发者工作区（`workspace/`）

请保留该受管区块，便于后续通过 `trellis update` 自动刷新说明。

<!-- TRELLIS:END -->

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：AGENTS.md
> 镜像文档：AGENTS.zh.md
> 最后同步：2026-03-03
> 同步人：codex

## 项目规则（Codex & Gemini）

### 必须遵循的流程

1. 开发前必须先执行 `/trellis:start`。
2. 非 trivial 任务采用双策略模型：
   - 严格策略（证明完整）：`/speckit.specify` -> `/speckit.clarify` -> `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement`。
   - 速度策略（速度优先）：`/trellis:start` -> `ff-fast+n|ff-fast=c` -> `bash .trellis/scripts/flow_feature_fast_init.sh "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]` -> `python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8` -> `/speckit.implement` -> `$finish-work`。
3. 升级规则（强制）：一旦出现需求歧义、跨层契约变化（API/Action/DB 签名/载荷/env）或交付风险升高，必须从速度策略切回严格策略。
4. 在实现之前，必须执行任务确认关卡：
   `python3 ./.trellis/scripts/task.py flow-confirm`，并等待明确确认。
5. 对 `flow-feature`，在 finish/archive 前必须通过文档门禁：
   `python3 ./.trellis/scripts/task.py flow-guard`。
6. 速度策略交付前仅做必要检查：
   - 一条成功路径验证
   - 一条失败路径验证（错误稳定且可读）
   - 一条边界/极端情况验证
7. 在 `spec.md` / `plan.md` / `tasks.md` 中必须显式包含以下约束：
   前端复用性/可读性/性能、props 类型、命名一致性、详细注释。
8. Spec-Kit 任务是可迭代的：若实现中途需求/范围变化，必须先暂停编码，更新 `spec.md` / `clarify.md` / `plan.md` / `tasks.md`，再继续实现。
9. 开启 flow-feature 简写：
   - `ff+n: <requirement>` = flow-feature（新分支）
   - `ff=c: <requirement>` = flow-feature（当前分支）
   - `ff: <requirement>`（或 `flow-feature: <requirement>`）= 先明确分支选择再继续
   - `ff-fast: <requirement>` = 强制速度策略（速度优先，仅必要检查）
   - `ff-full: <requirement>` = 强制严格策略（证明完整 + 全量检查）
   - `ff-fast+n: <requirement>` = 速度策略 + 新分支
   - `ff-fast=c: <requirement>` = 速度策略 + 当前分支
   - `ff-full+n: <requirement>` = 严格策略 + 新分支
   - `ff-full=c: <requirement>` = 严格策略 + 当前分支
   - 当 `ff-fast` / `ff-full` 与 `ff` 同时可用时，前两者优先级更高。
10. flow-lite / flow-bug 使用同样的分支选择规则：
   - `fl+n` / `fl=c` / `fl`
   - `fb+n` / `fb=c` / `fb`
   - 无后缀时必须先确认分支选择。
11. 实现与检查完成后，助手必须明确询问是否执行 `$record-session`，禁止静默跳过。
12. 默认交互方式为“对话确认”：
   - 任务拆解后先列出任务清单，等待用户输入（`执行` / `修改...`）
   - 只有收到明确确认后才能继续实现。
13. 任务清单修改输入必须支持双模式：
   - 自然语言：`修改：...`（默认、灵活）
   - 结构化编辑：`+` 新增 / `-` 删除 / `~` 改写 / `>` 重排 / `!` 重新打开
   - 结构化编辑命令：
     `python3 ./.trellis/scripts/task.py flow-edit-tasks "<ops>"`
14. 对 `ff+n`（新分支），若 Spec-Kit 自动生成短分支名为空或非法，应优先回退为确定性合法短名（如 `feature-<hash>`），仅在必要时再让用户指定。
   推荐辅助命令：
   `bash .trellis/scripts/flow_feature_create.sh "<requirement>" [short-name]`

### 后端契约规则

1. API Route / Server Action 响应必须使用统一结构：
   `success`, `code`, `message`, `data|error`, `meta`。
2. 必须复用共享契约/工具：
   - `src/types/api.ts`
   - `src/server/http/api-response.ts`
3. 错误响应必须提供稳定、可机读的 `code`，不能只依赖 message 文本。
4. 多实体数据库写入必须使用 Prisma transaction。

### 代码风格规则

1. 后端/服务导出声明建议使用中文 JSDoc 模板：
   `功能 / 输入 / 输出 / 异常 / 副作用`。
2. 保持严格 TypeScript 边界；业务逻辑中避免 `any`。
3. 禁止手动编辑 `src/generated/prisma/**` 下的生成文件。

### 前端组件规则

1. React 组件必须优先保证高复用、高可读、实用性能。
2. 不要过度拆分组件；仅在存在明确领域边界、复用价值或明显可读性/可测性收益时拆分。
3. 所有组件 props 必须先定义类型，并使用 `<ComponentName>Props` 命名。
4. 默认使用 Server Components；仅在真实交互/浏览器 API 场景使用 Client Components。
5. JSX 中尽量避免三元表达式，优先使用：
   - early return
   - 语义清晰的布尔变量
   - 辅助渲染函数
6. 若三元不可避免，只允许单层且保持简短。
7. 禁止嵌套三元。
8. 大列表渲染要保证稳定 key，优先分页/虚拟化而非整表全量渲染。

### 状态与复杂度规则

1. 区分 UI 本地状态、服务端数据状态、表单/动作状态，不要混用单一状态模型承载全部职责。
2. 需要全局客户端状态时，默认使用 Zustand；服务端数据优先放在 Server Components/Actions，而非长期驻留客户端缓存。
3. Zustand store 应按 feature 作用域拆分并提供类型化 selector，避免单体大 store。
4. 高复杂度函数（例如函数体过长、嵌套过深）必须拆分为具名 helper，以提升可读性与可维护性。

### 测试基线规则

1. 变更至少覆盖：一条 success 路径、一条 failure 路径、一条 boundary/edge 校验（测试或等价的显式验证）。

### 命名规则（前端 + 后端）

1. 命名应简洁且可读：
   - 非必要不使用超长名称
   - 业务逻辑中避免无意义短名（`a`, `tmp`, `val`）
2. 优先使用“领域术语 + 角色后缀”，例如 `chapterStats`、`analysisState`、`parseResult`。
3. 同一概念在 UI、action、API、service、DB 映射层保持命名一致。

### 注释与可复现性规则

1. 生成代码时需补充足够注释，覆盖：
   - 业务意图
   - 关键输入/输出约束
   - 错误与边界处理
   - 副作用（DB 写入、网络请求、缓存失效等）
2. 公共函数/类建议使用结构化 JSDoc。
3. 非平凡逻辑必须提供足够上下文，确保其他工程师可快速复现与排障。
