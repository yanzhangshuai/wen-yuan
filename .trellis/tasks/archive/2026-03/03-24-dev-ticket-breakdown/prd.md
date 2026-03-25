# 文渊开发 Ticket 拆解 v1.1

> 目标：把“阶段任务清单”继续下钻为“逐条可开发、可单独提交、可一件件执行代码”的 ticket 列表。  
> 这不是删减版 PRD，而是执行版任务板。  
> 日期：2026-03-25
>
> 关联文档：
> - [主 PRD](/home/mwjz/code/wen-yuan/.trellis/tasks/03-23-wen-yuan-prd/prd.md)
> - [开发任务清单](/home/mwjz/code/wen-yuan/.trellis/tasks/03-24-dev-task-checklist/prd.md)
> - [PRD 与代码对齐分析](/home/mwjz/code/wen-yuan/.trellis/tasks/03-24-prd-code-alignment/prd.md)

---

## 一、使用方式

这份文档面向“开始写代码”。

每个 ticket 默认满足以下约束：

1. 一个 ticket 尽量对应一次独立开发提交
2. 一个 ticket 必须有明确的文件落点
3. 一个 ticket 必须有前置依赖
4. 一个 ticket 必须有可手测的验收结果
5. 不把 3D、Neo4j、原文阅读、合并建议、重解析等需求删除，只拆开发顺序

状态建议：

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成

优先级建议：

- `P0` 不做就无法形成主闭环
- `P1` 主闭环之后必须补齐
- `P2` 体验与性能增强

工作方式建议：

- 先做 `Wave A`，保证系统能登录、配置模型、导入书、发起解析
- 再做 `Wave B`，保证图谱、原文阅读、审核闭环跑通
- 再做 `Wave C`，补齐合并、手动管理、重解析
- 最后做 `Wave D`，补 3D、Canvas、Neo4j 等增强能力

MVP v1.1 默认冻结范围（执行时优先保证）：

- `.txt` 导入、元数据确认、章节切分预览、全书解析任务
- 书库列表、单书图谱浏览、管理员审核队列
- 原文阅读 / 高亮回跳
- 合并建议队列
- 重解析粒度（单章 / 整书 / 指定模型 / 覆盖策略 / 版本策略）
- 模型设置联通性测试与 API Key 脱敏展示
- 书库卡片数据来源说明

说明：

- 3D、Neo4j、沉浸式图谱仍是正式需求，不删除，按 Wave D 顺序落地

---

## 二、Wave A：先打通可运行主链路

### [ ] T001 / P0 / 数据模型对齐与迁移

**目标**

让 Prisma Schema 与 PRD v1.1 对齐，作为后续所有页面与 API 的稳定基础。

**主要改动**

- 核对并补齐 `User`、`AiModel`、`AnalysisJob`
- 核对并补齐 `Persona`、`Relationship`、`BiographyRecord`、`Mention` 的新增字段
- 核对软删除字段、唯一约束、索引
- 生成迁移文件

**目标文件**

- `prisma/schema.prisma`
- `prisma/migrations/*`

**前置依赖**

- 无

**不包含**

- seed 初始化
- 登录 API
- 页面开发

**验收**

- `schema.prisma` 与主 PRD 中“Schema 完整变更清单”一致
- 能执行 `prisma migrate dev`
- 本地数据库迁移成功

### [ ] T002 / P0 / Seed 初始化与默认模型入库

**目标**

把初始管理员、默认模型、基础演示数据的 seed 跑通。

**主要改动**

- 从环境变量写入管理员账号
- 预置 6 条模型记录
- 补基础演示书籍或最小测试数据

**目标文件**

- `prisma/seed.ts`

**前置依赖**

- `T001`

**不包含**

- 登录页
- 模型设置页

**验收**

- 能成功执行 seed
- `users` 表存在管理员账号
- `ai_models` 表存在默认模型记录

### [ ] T003 / P0 / Auth 服务契约补齐

**目标**

把现有 Auth 模块补到可直接服务登录 API 与 Middleware。

**主要改动**

- 核对 `getAuthContext`
- 核对 `requireAdmin`
- 核对 JWT 签发与校验
- 核对 `Argon2id` 密码校验路径
- 补单元测试

**目标文件**

- `src/server/modules/auth/index.ts`
- `src/server/modules/auth/password.ts`
- `src/server/modules/auth/index.test.ts`

**前置依赖**

- `T001`
- `T002`

**验收**

- 支持用户名或邮箱登录校验
- JWT 仅包含最小字段
- Auth 单测通过

### [ ] T004 / P0 / 登录与登出 API

**目标**

交付管理员登录、登出接口，完成 cookie 写入与清理。

**主要改动**

- `POST /api/auth/login`
- `POST /api/auth/logout`
- 统一错误响应
- 处理 `redirect` 回跳参数

**目标文件**

- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/server/http/api-response.ts`

**前置依赖**

- `T003`

**验收**

- 正确账号可登录
- 错误账号统一返回“账号或密码错误”
- 登出后 cookie 被清除

### [ ] T005 / P0 / Middleware 与 Admin Layout 守卫

**目标**

让 `/admin/*` 真正受保护，viewer 默认跳转登录。

**主要改动**

- 实现 `middleware.ts`
- 注入 `x-auth-role`
- 拦截 `/admin/*`
- Admin Layout 服务端二次校验

**目标文件**

- `middleware.ts`
- `src/app/admin/layout.tsx`
- `src/app/admin/page.tsx`

**前置依赖**

- `T003`
- `T004`

**验收**

- 未登录访问 `/admin/model` 跳转 `/login?redirect=...`
- 登录后准确回跳原始路径和查询参数
- Admin Layout 不只依赖 Middleware

### [ ] T006 / P0 / 登录页与全局导航登录态

**目标**

交付 `/login` 页面，并在前台顶部导航展示管理员登录 / 退出入口。

**主要改动**

- 登录表单
- 错误态展示
- 成功后回跳
- Layout 顶部导航登录态

**目标文件**

- `src/app/login/page.tsx`
- `src/app/layout.tsx`

**前置依赖**

- `T004`
- `T005`

**验收**

- 登录页能完成登录
- 顶部导航区分 viewer / admin
- 登出后留在当前页并降级为 viewer

### [ ] T007 / P0 / 模型管理后端服务

**目标**

先把模型设置页需要的服务端能力建出来。

**主要改动**

- 模型列表查询
- 模型配置更新
- API Key 加密解密
- API Key 脱敏展示
- 默认模型切换
- 联通性测试

**目标文件**

- `src/server/modules/models/index.ts`
- `src/server/modules/models/services/*`
- `src/server/modules/models/utils/*`

**前置依赖**

- `T001`
- `T002`
- `T003`

**验收**

- 服务端可返回模型列表与脱敏字段
- 未配置 Key 的模型不可启用
- 联通性测试返回成功、失败、延迟

### [ ] T008 / P0 / 模型管理 API

**目标**

把模型管理能力以 `/admin/*` API 暴露出来。

**主要改动**

- `GET /api/admin/models`
- `PATCH /api/admin/models/:id`
- `POST /api/admin/models/:id/test`
- `POST /api/admin/models/:id/set-default`

**目标文件**

- `src/app/api/admin/models/route.ts`
- `src/app/api/admin/models/[id]/route.ts`
- `src/app/api/admin/models/[id]/test/route.ts`
- `src/app/api/admin/models/[id]/set-default/route.ts`

**前置依赖**

- `T007`

**验收**

- 所有接口都要求 `requireAdmin(auth)`
- 接口不返回明文 Key
- 设置默认模型后只能有一个默认模型

### [ ] T009 / P0 / 模型设置页

**目标**

交付 `/admin/model`，让系统真正可配置模型。

**主要改动**

- 模型配置卡 UI
- API Key 输入和脱敏显示
- BaseURL 配置
- 启用 / 禁用开关
- 默认模型切换
- 联通性测试结果展示
- 主题设置联动

**目标文件**

- `src/app/admin/model/page.tsx`

**前置依赖**

- `T008`

**验收**

- 页面可查看和更新模型配置
- 测试按钮能展示延迟与结果
- 主题设置与全局主题联动

### [ ] T010 / P0 / 书库查询服务与 `GET /api/books`

**目标**

把首页从 demo 内容切到真实书库数据。

**主要改动**

- 实现书籍列表查询服务
- 统一书籍卡片统计口径
- 暴露 `GET /api/books`

**目标文件**

- `src/server/modules/books/index.ts`
- `src/server/modules/books/services/list-books.ts`
- `src/app/api/books/route.ts`

**前置依赖**

- `T001`

**验收**

- 返回状态、章节数、人物数、最近解析时间、当前模型、失败摘要
- 统计口径与主 PRD 的“数据来源说明”一致

### [ ] T011 / P0 / 书库首页基础版

**目标**

先交付可用的书库页，不等 3D 精修。

**主要改动**

- 替换首页
- 书籍卡片列表
- 空状态
- 导入按钮
- 状态 Badge
- 进度条占位
- 数据来源说明入口

**目标文件**

- `src/app/page.tsx`

**前置依赖**

- `T010`

**验收**

- 首页展示真实书库数据
- 空状态能引导导入
- 已完成图书可点击进入图谱页

### [ ] T041 / P0 / 静态资源存储 Provider 抽象与本地实现

**目标**

在真正接上传流程前，先落一层统一的静态资源存储抽象，默认支持本地文件系统，后续可平滑扩展阿里云 OSS。

**主要改动**

- 新建 `src/server/providers/storage/`
- 定义统一存储接口
- 实现 `local` Provider
- 统一环境变量读取
- 约定对象 key 与本地目录结构
- 增加统一资源访问路由（建议 `/api/assets/[...key]`）
- 补本地 Provider 单元测试

**目标文件**

- `src/server/providers/storage/index.ts`
- `src/server/providers/storage/storage.types.ts`
- `src/server/providers/storage/localStorageProvider.ts`
- `src/server/providers/storage/index.test.ts`
- `src/app/api/assets/[...key]/route.ts`

**前置依赖**

- `T001`

**不包含**

- 阿里云 OSS SDK 接入
- 独立资源管理页
- 业务上传流程接线

**验收**

- 业务代码可通过统一入口拿到 storage client
- `local` Provider 能写入、删除并返回 URL / key
- 本地存储对象可通过站内链接访问，不暴露服务器绝对路径
- 路径约定与主 PRD 一致
- 不暴露服务器物理路径给前端调用方

### [ ] T012 / P0 / 导入流程 Step 1-2：上传与元数据确认

**目标**

完成导入向导前半段：上传 `.txt` 与元数据编辑。

**主要改动**

- 上传 `.txt`
- 文件大小校验
- 通过 Storage Provider 保存原始文件
- 提取原始文本
- AI 识别书名 / 作者 / 朝代 / 简介
- 识别失败时回退文件名
- 创建书籍记录
- 回填 `sourceFileUrl`、`sourceFileKey`、`sourceFileName`、`sourceFileMime`、`sourceFileSize`

**目标文件**

- `src/server/modules/books/services/create-book.ts`
- `src/server/modules/books/services/extract-book-metadata.ts`
- `src/app/api/books/route.ts`
- 首页导入向导组件文件

**前置依赖**

- `T010`
- `T011`
- `T041`

**验收**

- `.txt` 可上传入库
- 原始 `.txt` 已保存到统一存储位置
- 书名识别失败回退文件名
- 用户可修改元数据后继续下一步

### [ ] T013 / P0 / 导入流程 Step 3：章节切分预览

**目标**

完成导入向导中最关键的章节切分预览与手动修正。

**主要改动**

- 正则切分章节
- 特殊章节类型识别
- 章节预览结构
- 支持修改标题
- 支持合并章节
- 支持标记楔子 / 正文 / 后记

**目标文件**

- `src/server/modules/books/services/split-chapters.ts`
- 导入向导章节预览组件

**前置依赖**

- `T012`

**验收**

- 《儒林外史》前 20 回章节识别率达到 PRD 口径
- 用户可以手动修正切分结果

### [ ] T014 / P0 / 导入流程 Step 4：启动全书解析任务

**目标**

让导入向导的“开始解析”按钮真正发起整书任务。

**主要改动**

- 选择模型
- 选择解析范围
- 创建 `AnalysisJob`
- 写入书籍当前状态

**目标文件**

- `src/app/api/books/[id]/analyze/route.ts`
- 导入向导 Step 4 组件

**前置依赖**

- `T007`
- `T012`
- `T013`

**验收**

- 点击开始解析后书进入 `PROCESSING`
- 本次任务模型可被记录

### [ ] T015 / P0 / 全书解析编排服务

**目标**

把现有单章分析能力升级成整书任务闭环。

**主要改动**

- 新建 `BookAnalysisService`
- 新建 `AnalysisJobService`
- 复用 `ChapterAnalysisService`
- 分阶段更新进度
- 持久化任务结果
- 失败摘要与重试基础

**目标文件**

- `src/server/modules/analysis/services/BookAnalysisService.ts`
- `src/server/modules/analysis/services/AnalysisJobService.ts`
- `src/server/modules/analysis/services/ChapterAnalysisService.ts`

**前置依赖**

- `T001`
- `T014`

**验收**

- 可按章节完成整书解析
- 进度可写入 `Book`
- 失败任务有错误摘要

### [ ] T016 / P0 / 解析状态查询与书库进度联动

**目标**

把后端任务状态反馈到书库卡片。

**主要改动**

- `GET /api/books/:id/status`
- 首页轮询
- 阶段文本展示
- 失败提示与重试按钮占位

**目标文件**

- `src/app/api/books/[id]/status/route.ts`
- 首页书库卡片组件

**前置依赖**

- `T015`

**验收**

- 书库实时显示 `parseProgress` 和 `parseStage`
- 失败时显示错误摘要

---

## 三、Wave B：图谱、原文阅读、审核闭环

### [ ] T017 / P0 / 图谱数据聚合服务

**目标**

提供单书图谱页所需的节点、边、详情、时间轴数据。

**主要改动**

- 节点查询
- 边查询
- 按章节过滤
- 人物详情组装
- 时间轴事件组装

**目标文件**

- `src/server/modules/graph/index.ts`
- `src/server/modules/graph/services/get-book-graph.ts`
- `src/server/modules/graph/services/get-persona-detail.ts`

**前置依赖**

- `T015`

**验收**

- 可返回某本书的节点与边
- 支持截止某章节过滤

### [ ] T018 / P0 / 图谱相关 API

**目标**

暴露图谱页所需的读取接口。

**主要改动**

- `GET /api/books/:id/graph`
- `GET /api/personas/:id`

**目标文件**

- `src/app/api/books/[id]/graph/route.ts`
- `src/app/api/personas/[id]/route.ts`

**前置依赖**

- `T017`

**验收**

- 图谱接口能按章节返回数据
- 人物详情接口能返回时间轴和关系列表

### [ ] T019 / P0 / 图谱页基础版

**目标**

先交付可浏览、可点开的图谱页基础版。

**主要改动**

- 图谱区域
- 人物详情侧栏
- 工具栏骨架
- 章节时间轴滑块骨架

**目标文件**

- `src/app/books/[id]/graph/page.tsx`

**前置依赖**

- `T018`

**验收**

- 已完成书籍可以进入图谱页
- 点击节点可打开人物详情
- 时间轴滑块能驱动章节过滤

### [ ] T020 / P0 / 原文阅读服务与高亮回跳 API

**目标**

补齐证据链依赖的“原文阅读 / 高亮回跳”能力。

**主要改动**

- 按章节读取原文
- 按段落组织内容
- 支持 `paraIndex`
- 支持 `evidenceText`
- 返回高亮定位数据

**目标文件**

- `src/server/modules/reader/index.ts`
- `src/server/modules/reader/services/read-chapter.ts`
- `src/app/api/books/[id]/chapters/[chapterId]/read/route.ts`

**前置依赖**

- `T015`

**验收**

- 能按章节读取原文
- 能按证据锚点返回高亮定位结果

### [ ] T021 / P0 / 图谱页接入原文阅读面板

**目标**

让图谱中的证据、事件、关系都能真正回跳原文。

**主要改动**

- 图谱页原文抽屉或双栏面板
- 点击事件打开原文
- 点击关系证据打开原文
- 自动滚动到目标段落
- 高亮目标文本

**目标文件**

- `src/app/books/[id]/graph/page.tsx`

**前置依赖**

- `T019`
- `T020`

**验收**

- 详情面板中的事件和证据可触发原文回跳
- 原文能高亮到目标内容

### [ ] T022 / P0 / 审核后台查询服务

**目标**

先把 DRAFT 审核页的数据读写能力建好。

**主要改动**

- 草稿汇总查询
- 单书草稿过滤
- 来源筛选
- 批量确认
- 批量拒绝

**目标文件**

- `src/server/modules/review/index.ts`
- `src/server/modules/review/services/get-drafts.ts`
- `src/server/modules/review/services/bulk-verify.ts`
- `src/server/modules/review/services/bulk-reject.ts`

**前置依赖**

- `T015`

**验收**

- 能按书、按类型读取草稿
- 批量确认 / 拒绝可更新状态

### [ ] T023 / P0 / 审核后台 API

**目标**

把审核能力暴露到 `/admin/*` 路由。

**主要改动**

- `GET /api/admin/drafts`
- `POST /api/admin/bulk-verify`
- `POST /api/admin/bulk-reject`

**目标文件**

- `src/app/api/admin/drafts/route.ts`
- `src/app/api/admin/bulk-verify/route.ts`
- `src/app/api/admin/bulk-reject/route.ts`

**前置依赖**

- `T022`

**验收**

- 所有审核 API 仅 admin 可调用
- 响应结构符合统一 API 规范

### [ ] T024 / P0 / 审核后台页面基础版

**目标**

交付管理员审核页的第一版可用页面。

**主要改动**

- `/admin/review`
- `/admin/review/[bookId]`
- 左侧书籍列表
- 右侧审核看板
- Tab：人物 / 关系 / 传记事件 / 合并建议占位
- 原文对照区域

**目标文件**

- `src/app/admin/review/page.tsx`
- `src/app/admin/review/[bookId]/page.tsx`

**前置依赖**

- `T023`
- `T020`

**验收**

- 能查看某本书的草稿
- 点击草稿可联动原文证据
- 可批量确认与拒绝

---

## 四、Wave C：质量闭环与人工维护能力

### [ ] T025 / P1 / 合并建议数据模型与生成服务

**目标**

把“别名消歧”从隐含逻辑变成明确功能。

**主要改动**

- 新增 `MergeSuggestion` 模型或等价结构
- 生成候选建议
- 保存建议理由、置信度、证据

**目标文件**

- `prisma/schema.prisma`
- `src/server/modules/review/services/generate-merge-suggestions.ts`

**前置依赖**

- `T001`
- `T015`

**验收**

- 解析完成后可生成待处理合并建议
- 建议具备候选双方和理由

### [ ] T026 / P1 / 合并建议 API 与审核页接入

**目标**

让管理员可以处理合并建议队列。

**主要改动**

- `GET /api/admin/merge-suggestions`
- `POST /api/admin/merge-suggestions/:id/accept`
- `POST /api/admin/merge-suggestions/:id/reject`

**目标文件**

- `src/app/api/admin/merge-suggestions/route.ts`
- `src/app/api/admin/merge-suggestions/[id]/accept/route.ts`
- `src/app/api/admin/merge-suggestions/[id]/reject/route.ts`
- 审核页相关组件

**前置依赖**

- `T025`
- `T024`

**验收**

- 审核页可展示合并建议列表
- 可接受 / 拒绝建议

### [ ] T027 / P1 / 人物实体合并服务

**目标**

实现真正的数据级实体合并，而不只是“标记建议已处理”。

**主要改动**

- 合并 Persona
- 重定向 Relationship
- 重定向 BiographyRecord
- 重定向 Mention
- 处理被合并记录状态

**目标文件**

- `src/server/modules/review/services/merge-personas.ts`
- `src/app/api/personas/merge/route.ts`

**前置依赖**

- `T026`

**验收**

- 接受合并后关联数据全部重定向
- 图谱页中被合并节点不再重复出现

### [ ] T028 / P1 / 手动人物管理 API

**目标**

让系统在 AI 不完美时也能人工补录人物。

**主要改动**

- `POST /api/books/:id/personas`
- `PATCH /api/personas/:id`
- `DELETE /api/personas/:id`

**目标文件**

- `src/app/api/books/[id]/personas/route.ts`
- `src/app/api/personas/[id]/route.ts`
- `src/server/modules/review/services/manage-persona.ts`

**前置依赖**

- `T024`

**验收**

- 可新增、编辑、软删除人物
- 手动新增人物默认为 `VERIFIED`

### [ ] T029 / P1 / 手动关系与传记事件 API

**目标**

补齐手动关系、手动事件维护能力。

**主要改动**

- `POST /api/books/:id/relationships`
- `PATCH /api/relationships/:id`
- `DELETE /api/relationships/:id`
- `POST /api/personas/:id/biography`
- `PATCH /api/biography/:id`
- `DELETE /api/biography/:id`

**目标文件**

- `src/app/api/books/[id]/relationships/route.ts`
- `src/app/api/relationships/[id]/route.ts`
- `src/app/api/personas/[id]/biography/route.ts`
- `src/app/api/biography/[id]/route.ts`

**前置依赖**

- `T028`

**验收**

- 可手动新增、编辑、删除关系
- 可手动新增、编辑、删除传记事件

### [ ] T030 / P1 / 图谱内联校对

**目标**

让图谱页内支持轻量校对，不必每次跳到后台列表。

**主要改动**

- 节点右键编辑
- 边右键编辑
- 编辑后即时刷新
- 节点状态确认 / 拒绝

**目标文件**

- `src/app/books/[id]/graph/page.tsx`
- 图谱侧栏 / 弹窗组件

**前置依赖**

- `T019`
- `T028`
- `T029`

**验收**

- 节点和边可进入编辑态
- 保存后图谱实时更新

### [ ] T031 / P1 / 重解析任务模型与 API

**目标**

把 PRD 中“重解析粒度”正式做成系统能力。

**主要改动**

- 定义单章 / 整书重跑参数
- 定义默认模型 / 指定模型
- 定义覆盖策略
- 定义版本策略
- 创建重解析任务 API

**目标文件**

- `src/server/modules/analysis/services/reanalyze-book.ts`
- `src/app/api/books/[id]/analyze/route.ts`

**前置依赖**

- `T015`
- `T024`

**验收**

- 支持整书重跑
- 支持单章重跑
- 支持指定模型重跑

### [ ] T032 / P1 / 重解析入口接入书库、图谱、审核页

**目标**

把重解析能力挂到真实操作入口上。

**主要改动**

- 书库卡片菜单重解析入口
- 审核页重解析入口
- 图谱页管理重解析入口
- 确认弹窗

**目标文件**

- `src/app/page.tsx`
- `src/app/books/[id]/graph/page.tsx`
- `src/app/admin/review/[bookId]/page.tsx`

**前置依赖**

- `T031`

**验收**

- 三处入口都可触发重解析
- 已 `VERIFIED` 数据不会被自动覆盖

---

## 五、Wave D：视觉、性能、图算法增强

### [ ] T033 / P2 / 书库 3D 视觉精修

**目标**

把首页从“可用”提升到“第一眼一亮”。

**主要改动**

- 木纹书架背景
- 3D 书脊厚度
- Hover 抬起
- 阴影扩散
- 空状态插画

**目标文件**

- `src/app/page.tsx`
- 首页相关组件与样式

**前置依赖**

- `T011`

**验收**

- 书库符合 PRD 中 3D 书脊设定
- 视觉上具备博物馆式氛围

### [ ] T034 / P2 / 图谱渲染性能升级

**目标**

解决大图谱性能问题，为 400+ 节点以上场景做准备。

**主要改动**

- 切换 Canvas 渲染
- 语义缩放
- 视口裁剪
- Top N 控制
- Web Worker 布局计算

**目标文件**

- `src/app/books/[id]/graph/page.tsx`
- 图谱渲染相关组件
- Worker 文件

**前置依赖**

- `T019`

**验收**

- 中大图谱浏览更流畅
- 滑块和缩放不明显卡顿

### [ ] T035 / P2 / Neo4j 路径查找服务与 API

**目标**

把 PRD 中保留的 Neo4j 路径查找正式落地。

**主要改动**

- 接入 Neo4j 查询服务
- `POST /api/graph/path`
- 输入两人返回最短路径

**目标文件**

- `src/server/modules/graph/services/find-path.ts`
- `src/app/api/graph/path/route.ts`

**前置依赖**

- `T017`

**验收**

- 输入两个人物能返回最短路径数据
- 接口失败时有清晰错误分类

### [ ] T036 / P2 / 图谱页路径查找交互

**目标**

让路径查找在图谱页真正可用。

**主要改动**

- 工具栏“路径查找”
- 输入人物 A / B
- 高亮最短路径
- 清除高亮

**目标文件**

- `src/app/books/[id]/graph/page.tsx`

**前置依赖**

- `T035`

**验收**

- 图谱页可直接触发路径查找
- 返回路径后高亮正确

### [ ] T037 / P2 / `.epub` 导入扩展

**目标**

保留 PRD 中的非 txt 导入能力扩展。

**主要改动**

- `.epub` 文件解析
- 导入流程兼容
- 元数据识别复用

**目标文件**

- `src/server/modules/books/services/import-epub.ts`
- 导入向导相关组件

**前置依赖**

- `T012`
- `T013`

**验收**

- `.epub` 可完成导入并进入后续流程

---

## 六、跨票公共补强

### [ ] T038 / P0 / API 契约统一与 Zod 校验补齐

**目标**

避免开发到后期出现字段名漂移、响应结构不一致。

**主要改动**

- 为核心接口补 Zod 入参 / 出参
- 核对 Prisma 字段名与 API 字段名映射
- 全部接入统一 API 响应封装

**目标文件**

- `src/server/http/api-response.ts`
- 各模块 schema / validator 文件

**前置依赖**

- 无，可穿插执行

**验收**

- 关键接口入参都做校验
- 响应结构保持统一

### [ ] T039 / P0 / 核心测试集与回归测试

**目标**

让主闭环具备最低可维护性。

**主要改动**

- Auth 测试
- 模型加解密测试
- 章节切分测试
- 分析任务编排测试
- 实体合并测试
- 图谱数据组装测试

**目标文件**

- `src/**/*.test.ts`

**前置依赖**

- 跟随对应 ticket 穿插补齐

**验收**

- 核心业务路径均有测试覆盖
- 改动后能做基础回归

### [ ] T040 / P1 / 主题与全局状态一致性

**目标**

把主题、Toast、加载态、错误态收敛为统一体验。

**主要改动**

- 主题 Provider 收口
- Loading / Empty / Error 组件收口
- Toast 风格统一

**目标文件**

- `src/app/layout.tsx`
- 全局 UI 组件目录

**前置依赖**

- `T006`
- `T009`

**验收**

- 模型页、书库页、图谱页、审核页体验一致

### [ ] T042 / P1 / 阿里云 OSS Provider

**目标**

在不改业务模块契约的前提下，为统一存储抽象补上阿里云 OSS 实现。

**主要改动**

- 新增 `oss` Provider
- 接入 OSS 配置读取
- 对齐 `putObject` / `deleteObject` / `getObjectUrl`
- 验证与 `local` Provider 的切换兼容性

**目标文件**

- `src/server/providers/storage/ossStorageProvider.ts`
- `src/server/providers/storage/index.ts`
- `src/server/providers/storage/index.test.ts`

**前置依赖**

- `T041`

**不包含**

- 历史对象批量迁移脚本
- CDN、签名 URL、高级桶策略

**验收**

- 切换 `STORAGE_PROVIDER=oss` 后，上传链路无需改业务代码
- 返回字段与 `local` Provider 保持一致
- 配置错误时有可读的失败提示，不泄露敏感信息

---

## 七、建议执行顺序

如果我们按“一件件执行代码”的方式推进，建议严格按下面顺序做：

1. `T001` 数据模型对齐与迁移
2. `T002` Seed 初始化与默认模型入库
3. `T003` Auth 服务契约补齐
4. `T004` 登录与登出 API
5. `T005` Middleware 与 Admin Layout 守卫
6. `T006` 登录页与全局导航登录态
7. `T007` 模型管理后端服务
8. `T008` 模型管理 API
9. `T009` 模型设置页
10. `T010` 书库查询服务与 `GET /api/books`
11. `T011` 书库首页基础版
12. `T041` 静态资源存储 Provider 抽象与本地实现
13. `T012` 导入流程 Step 1-2
14. `T013` 导入流程 Step 3
15. `T014` 导入流程 Step 4
16. `T015` 全书解析编排服务
17. `T016` 解析状态查询与书库联动
18. `T017` ~ `T024` 图谱、原文、审核闭环
19. `T025` ~ `T032` 合并、手动管理、重解析
20. `T033` ~ `T037` 视觉、性能、Neo4j、格式扩展
21. `T038` ~ `T040` 契约、测试、全局体验补强
22. `T042` 阿里云 OSS Provider

---

## 八、可中断续跑执行规则（跨天继续）

为适配“可能随时中断、次日继续”的开发方式，每个 ticket 执行时统一遵循：

1. 任一 ticket 若连续推进超过 90 分钟，先写检查点再继续
2. 检查点最少包含：
   - 当前状态（`[ ]` / `[~]` / `[x]`）
   - 已改文件列表
   - 已完成验收项
   - 未完成验收项
   - 下一步第一条动作
3. 恢复执行时先读检查点，不重复已验收步骤
4. 涉及迁移 / seed 时必须记录“当前数据库位点”

推荐用“每次 5 票”节奏推进，方便中断恢复与风险控制：

- Run 1：`T001`-`T005`
- Run 2：`T006`-`T010`
- Run 3：`T011`-`T015`
- Run 4：`T016`-`T020`
- Run 5：`T021`-`T025`
- Run 6：`T026`-`T030`
- Run 7：`T031`-`T035`
- Run 8：`T036`-`T040`
- Run 9：`T041`-`T042` + 回归补票

---

## 九、首批可以直接开写的 9 张票

如果现在立刻开始进入代码阶段，建议从这 9 张开始：

1. `T001` 数据模型对齐与迁移
2. `T002` Seed 初始化与默认模型入库
3. `T003` Auth 服务契约补齐
4. `T004` 登录与登出 API
5. `T005` Middleware 与 Admin Layout 守卫
6. `T006` 登录页与全局导航登录态
7. `T007` 模型管理后端服务
8. `T008` 模型管理 API
9. `T041` 静态资源存储 Provider 抽象与本地实现

这批票完成后，系统就拥有“管理员可登录 + 后台可守卫 + 模型可配置 + 上传存储底座”的真实开发基础。
