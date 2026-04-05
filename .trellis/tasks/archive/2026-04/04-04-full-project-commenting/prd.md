# 全项目 Next.js 前后端超详细注释补全

## Goal
在不改变现有业务逻辑、输入输出、路由语义、Server/Client 组件属性的前提下，为仓库中的 Next.js 前后端核心代码补充超详细简体中文注释，使新接手开发者能够快速理解“做什么 + 为什么这样做 + 上下游关系 + 不可轻易修改点”。

## Requirements
- 先完成全项目代码分析，明确每个文件在 Next.js 架构中的定位和业务职责。
- 注释覆盖文件级、类型级、函数/组件/Hook 级、复杂分支和状态管理级。
- 对 Next.js 约定文件和框架特性进行专项语义注释（page/layout/route/loading/error/not-found/middleware/generateMetadata/params/searchParams 等）。
- 所有注释必须为简体中文，强调业务意图、设计原因、上下游协作。
- 不改逻辑、不改路由语义、不改 API contract、不改 Server/Client 边界。
- 发现潜在问题仅通过注释给出风险与建议，不直接重构。
- 采取“分析先行 + 分批重注释 + 每批质量校验”执行，避免一次性大改导致维护风险。

## Acceptance Criteria
- [ ] 输出全项目结构化分析：文件定位、业务目标、数据流、渲染链路、运行环境、边界与风险。
- [ ] 形成可执行的分批注释任务清单（按层次与模块拆分，包含先后顺序）。
- [ ] 每个批次输出完整“重注释后代码”，且仅注释与排版变更。
- [ ] 覆盖 Next.js 框架语义、React 状态/渲染语义、TypeScript 字段业务语义。
- [ ] 通过 lint/typecheck/test，且无行为回归。

## Technical Notes
- 项目采用 Next.js App Router + React + TypeScript，包含 viewer/admin 页面、API route handlers、server modules、providers、types 等层次。
- 该任务属于 fullstack 注释工程，应优先覆盖业务关键链路：鉴权、图谱展示、人物/关系/传记管理、AI 分析任务与模型策略。
- 需要保留 generated 代码与第三方模板文件的边界，避免无价值注释污染。
