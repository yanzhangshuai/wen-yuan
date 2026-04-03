# brainstorm: debugger script naming and vscode debug

## Goal

分析当前项目的命名方式，并给出一个可执行的调试入口方案（脚本命名或 VSCode 调试配置），让开发者可以稳定启动 debugger 进行排查。

## What I already know

* 用户希望“分析命名”并“创建一个可以 debugger 的脚本命名或者 VSCode 调试”。
* 本任务处于 brainstorm 阶段，需要先澄清需求再进入实现。
* 项目是 `Next.js`（`package.json` 中 `dev` 为 `next dev`）。
* 根目录存在 `pnpm-lock.yaml`，团队命令文档大量使用 `pnpm ...`。
* 当前仓库没有 `.vscode/launch.json` 和 `.vscode/tasks.json`。
* 当前脚本命名风格以两类为主：`<verb>`（如 `dev`）与 `<namespace>:<verb>`（如 `lint:fix`、`test:watch`、`prisma:migrate`）。

## Assumptions (temporary)

* 调试入口将基于现有 `dev`（`next dev`）进行扩展，而不是替换既有启动命令。
* 用户希望优先获得低摩擦、团队可读性高的命名方案。

## Open Questions

* 无（已收敛）

## Requirements

* 产出一套清晰的 debugger 命名建议。
* 交付双模式调试入口：`package.json` 调试脚本 + `.vscode/launch.json`。
* 命名需与仓库现有风格兼容（优先 `namespace:verb` 扩展）。
* MVP 仅覆盖开发服务调试（`next dev`），不包含测试调试。
* 脚本命名最终选择为 `dev:debug`。

## Acceptance Criteria

* [x] 给出 2-3 个可行命名方案，并标注推荐项
* [x] 脚本调试入口可运行（`timeout 8 pnpm dev:debug` 已验证可启动）
* [x] VSCode 调试入口可运行（`launch.json` 含 launch + attach）
* [x] 文档中明确“如何启动 + 如何附加断点”
* [x] `pnpm dev` 既有行为保持不变

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 重构业务代码逻辑
* 引入新的调试框架（除非现有方案不可行）
* 调整非调试相关 npm scripts 命名
* `vitest` / 其他测试流程的 debugger 集成

## Technical Approach

在不影响 `pnpm dev` 的前提下新增 `dev:debug` 作为开发态调试变体；同时新增 VSCode `launch` 与 `attach` 配置，形成 CLI + IDE 双入口。附加端口按实测 Next.js 日志使用 `9230`。

## Technical Notes

* 已检查文件：
* `package.json`
* `.trellis/workflow.md`
* `scripts/*`
* 运行时约束：
* 项目使用 `type: module`
* 主要开发入口为 `next dev`

## Research Notes

### What similar tools do

* Node/Next 项目常见两条路径：`npm scripts` 增加 `dev:debug`，或在 VSCode `launch.json` 中直接启动/附加 Node inspector。
* 团队协作里，脚本命名通常用 `dev:*` 表示开发态扩展命令，便于发现和记忆。
* VSCode 调试通常分 `launch`（直接启动）和 `attach`（附加到已运行进程）两种工作流。

### Constraints from our repo/project

* 现有命名已经有 `namespace:verb` 先例，新增 `dev:debug` 风格可保持一致。
* 当前无 `.vscode` 调试配置，若只靠 VSCode 需新增基础配置文件。
* 用户明确提出“脚本命名或者 VSCode 调试”，说明两条路径都可接受。

### Feasible approaches here

**Approach A: Script-first**

* How it works: 新增 `package.json` 脚本（如 `dev:debug`），通过 Node inspector 启动开发服务。
* Pros: 跨编辑器可用；命名可沉淀到团队命令体系；CI/终端文档好复用。
* Cons: VSCode 断点体验需要手动附加或额外配置。

**Approach B: VSCode-first**

* How it works: 新增 `.vscode/launch.json`，直接在 VSCode 中一键启动或附加 Next.js 进程。
* Pros: 本地断点体验最直接。
* Cons: 对非 VSCode 用户价值较低；命令行复用性弱。

**Approach C: Dual-mode (Recommended)**

* How it works: 同时提供 `dev:debug` 脚本 + `.vscode/launch.json`（attach/launch 至少一项）。
* Pros: 终端与 IDE 都可用；团队协作成本最低；后续扩展测试调试（如 `test:debug`）也顺滑。
* Cons: 配置面稍多，需要明确文档入口。

## Decision (ADR-lite)

**Context**: 需要在“命名一致性、可执行性、团队协作成本”之间平衡 debugger 入口方案。  
**Decision**: 选择 `Approach C: Dual-mode`，即同时提供脚本与 VSCode 调试配置。  
**Consequences**: 需要维护两处入口配置，但可覆盖 CLI 与 IDE 两类工作流；本轮先做 `next dev` 最小闭环，测试调试后续再扩展。
