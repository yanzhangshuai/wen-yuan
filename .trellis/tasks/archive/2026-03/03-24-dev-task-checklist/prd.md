# 文渊开发任务清单 v1.1

> 目标：把主 PRD v1.1 拆成一份可直接开工、可逐项勾选、可映射到代码目录的开发任务文档。  
> 来源文档：  
> - [主 PRD](/home/mwjz/code/wen-yuan/.trellis/tasks/03-23-wen-yuan-prd/prd.md)  
> - [PRD 与代码对齐分析](/home/mwjz/code/wen-yuan/.trellis/tasks/03-24-prd-code-alignment/prd.md)  
> 日期：2026-03-25

---

## 一、文档用途

这不是新的 PRD，也不是需求删减版。

这份文档只做 3 件事：

1. 把 PRD 翻译成开发可执行清单
2. 把任务落到真实代码目录与文件位置
3. 明确每一阶段的“完成定义”和阻塞关系

使用方式：

- 以本清单作为研发推进表
- 以主 PRD 作为产品定义来源
- 以“PRD 与代码对齐分析”作为当前实现差距参考

---

## 二、当前代码基线

当前仓库已存在的可复用基础：

- 页面壳层：`src/app/layout.tsx`、`src/app/page.tsx`
- 数据层：`prisma/schema.prisma`、`prisma/seed.ts`
- Auth 基础：`src/server/modules/auth/index.ts`、`src/server/modules/auth/password.ts`
- AI Provider：`src/server/providers/ai/*`
- 分章分析服务：`src/server/modules/analysis/services/ChapterAnalysisService.ts`
- API 响应规范：`src/server/http/api-response.ts`

当前仓库明显缺失的产品层：

- `/login`
- `/admin/*`
- `/books/:id/graph`
- 业务 API Route Handlers
- 书籍导入主链路
- 全书解析任务编排
- 审核页与原文阅读页能力
- `src/server/providers/storage/*` 统一静态资源抽象层

---

## 三、实施总原则

1. 先打通主闭环，再补视觉与高性能增强。
2. 不删除 3D、Neo4j、沉浸式图谱等正式需求，只调整实现顺序。
3. 页面、接口、数据、任务编排必须同步推进，避免只做 UI 壳或只做底层服务。
4. 任何涉及证据链、审核、原文跳转的能力，必须先定义数据锚点。
5. 所有管理员能力统一走 `/admin/*` 与 `requireAdmin(auth)` 口径。
6. 原始书籍文件、封面图与后续图片资源统一走 Storage Provider，不允许业务模块直接操作物理路径。

---

## 四、建议目录落位

建议本轮按下面的目录继续长：

```text
src/app/
  login/page.tsx
  admin/layout.tsx
  admin/page.tsx
  admin/review/page.tsx
  admin/review/[bookId]/page.tsx
  admin/model/page.tsx
  books/[id]/graph/page.tsx
  api/auth/login/route.ts
  api/auth/logout/route.ts
  api/books/route.ts
  api/books/[id]/route.ts
  api/books/[id]/status/route.ts
  api/books/[id]/analyze/route.ts
  api/books/[id]/graph/route.ts
  api/books/[id]/personas/route.ts
  api/books/[id]/relationships/route.ts
  api/books/[id]/chapters/[chapterId]/read/route.ts
  api/assets/[...key]/route.ts
  api/personas/[id]/route.ts
  api/personas/[id]/biography/route.ts
  api/personas/merge/route.ts
  api/relationships/[id]/route.ts
  api/biography/[id]/route.ts
  api/graph/path/route.ts
  api/admin/drafts/route.ts
  api/admin/bulk-verify/route.ts
  api/admin/bulk-reject/route.ts
  api/admin/models/route.ts
  api/admin/models/[id]/route.ts
  api/admin/models/[id]/test/route.ts
  api/admin/models/[id]/set-default/route.ts
  api/admin/merge-suggestions/route.ts
  api/admin/merge-suggestions/[id]/accept/route.ts
  api/admin/merge-suggestions/[id]/reject/route.ts

src/server/
  modules/books/
  modules/graph/
  modules/review/
  modules/models/
  modules/reader/
  modules/auth/
  modules/analysis/
  providers/storage/
```

说明：

- `src/server/modules/auth/` 与 `src/server/modules/analysis/` 继续复用现有实现
- `src/server/providers/storage/` 参照 `src/server/providers/ai/` 的组织方式，先做 `local`，后续扩展 `oss`
- 本轮新增模块优先按“领域模块”组织，而不是把业务写进 Route Handler
- Route Handler 只负责参数校验、鉴权、调用模块、统一响应

---

## 五、总里程碑

### 5.1 M0 主闭环

`登录 -> 模型配置 -> 导入 txt -> 元数据确认 -> 章节切分预览 -> 发起全书解析 -> 书库状态更新 -> 图谱浏览 -> 原文回跳 -> 管理审核`

### 5.2 M1 增强能力

- 图谱内联校对
- 手动人物管理
- 重解析冲突仲裁与模型对比
- 阿里云 OSS Provider
- Neo4j 路径查找
- 3D 与沉浸式视觉精修
- Canvas / 语义缩放 / Worker

### 5.3 MVP v1.1 冻结范围（本轮默认）

以下能力按“必须交付”执行，除非另有明确变更指令：

1. `.txt` 导入
2. 元数据确认
3. 章节切分预览
4. 全书解析任务
5. 书库列表
6. 单书图谱浏览
7. 管理员审核队列
8. 原文阅读 / 高亮回跳
9. 合并建议队列
10. 重解析粒度（单章 / 整书 / 指定模型 / 覆盖策略 / 版本策略）
11. 模型设置联通性测试与 API Key 脱敏展示
12. 书库卡片数据来源说明

说明：

- 3D、Neo4j、沉浸式图谱仍是正式需求，不删除，只放在增强阶段按顺序交付

---

## 六、阶段任务清单

### 6.1 Phase 1：数据层与鉴权基础

**目标：** 让数据库、管理员登录、后台守卫先可用。

**数据任务**

- [ ] 审核 `prisma/schema.prisma`，确认与主 PRD v1.1 一致
- [ ] 补齐或核对以下模型 / 字段：
  - `User`
  - `AiModel`
  - `AnalysisJob`
  - `Book.sourceFileUrl`
  - `Book.sourceFileKey`
  - `Book.sourceFileName`
  - `Book.sourceFileMime`
  - `Book.sourceFileSize`
  - `Persona.nameType`
  - `Persona.recordSource`
  - `Persona.aliases`
  - `Persona.hometown`
  - `Persona.confidence`
  - `deleted_at` 系列软删除字段
  - `Relationship.evidence`
  - `Relationship.confidence`
- [ ] 确认 `Relationship` 去重约束存在
- [ ] 执行 `prisma migrate dev`
- [ ] 更新 `prisma/seed.ts`
  - 初始管理员 seed
  - 默认模型 seed
  - 基础演示数据 seed
- [ ] 新建 `src/server/providers/storage/`
  - `index.ts`
  - `storage.types.ts`
  - `localStorageProvider.ts`
  - `index.test.ts`
- [ ] 新建资源访问路由
  - `GET /api/assets/:key*` 通过 Storage Provider 返回文件流
  - 不暴露服务器绝对路径
- [ ] 约定环境变量
  - `STORAGE_PROVIDER`
  - `STORAGE_LOCAL_ROOT`
  - `STORAGE_PUBLIC_BASE_URL`

**鉴权任务**

- [ ] 复核 `src/server/modules/auth/index.ts` 的导出能力
- [ ] 补 `src/server/modules/auth/index.test.ts`
- [ ] 保持 `Argon2id` 为唯一密码哈希方案
- [ ] 新建 `middleware.ts`
  - 读取 JWT Cookie
  - 注入 `x-auth-role`
  - 拦截 `/admin/*`
- [ ] 新建 `src/app/api/auth/login/route.ts`
- [ ] 新建 `src/app/api/auth/logout/route.ts`
- [ ] 新建 `src/app/login/page.tsx`
- [ ] 新建 `src/app/admin/layout.tsx`
- [ ] 新建 `src/app/admin/page.tsx`
  - 默认重定向到后台默认子页

**前端壳层任务**

- [ ] 更新 `src/app/layout.tsx`
  - 顶部导航加入登录 / 登出态
  - 保留 viewer 默认只读逻辑
- [ ] 梳理主题 Provider 挂载点

**完成定义**

- [ ] 未登录访问 `/admin/model` 会跳转 `/login?redirect=...`
- [ ] 登录成功后可准确跳回原路径
- [ ] 错误登录统一提示“账号或密码错误”
- [ ] 数据迁移与 seed 可在本地跑通

### 6.2 Phase 2：模型设置页

**目标：** 先让系统具备“可配置模型、可脱敏展示、可联通性测试”的运行前提。

**后端任务**

- [ ] 新建 `src/server/modules/models/`
- [ ] 实现模型查询服务
- [ ] 实现模型更新服务
- [ ] 实现 API Key 加解密服务
- [ ] 实现脱敏展示工具
- [ ] 实现默认模型切换逻辑
- [ ] 实现联通性测试逻辑
  - 最小 prompt
  - 超时控制
  - 错误分类
  - 延迟统计

**API 任务**

- [ ] `GET /api/admin/models`
- [ ] `PATCH /api/admin/models/:id`
- [ ] `POST /api/admin/models/:id/test`
- [ ] `POST /api/admin/models/:id/set-default`

**页面任务**

- [ ] 新建 `src/app/admin/model/page.tsx`
- [ ] 模型配置卡 UI
- [ ] API Key 输入与脱敏展示
- [ ] BaseURL 输入
- [ ] 启用 / 禁用开关
- [ ] 默认模型下拉
- [ ] 联通性测试按钮与结果回显
- [ ] 外观设置（主题联动）

**完成定义**

- [ ] 未配置 Key 的模型不可启用
- [ ] 页面不回显明文 Key
- [ ] 测试接口返回成功 / 失败 / 延迟
- [ ] 日志与错误中不泄露明文 Key

### 6.3 Phase 3：书库页与导入向导

**目标：** 把首页从 demo 页替换成真正的书库 + 导入入口。

**页面任务**

- [ ] 替换 `src/app/page.tsx`
- [ ] 新建书库页主布局
- [ ] 实现仿真书脊卡片基础版
- [ ] 实现空状态 + CTA
- [ ] 实现导入按钮
- [ ] 实现卡片菜单
- [ ] 实现卡片状态 Badge
- [ ] 实现进度条区域
- [ ] 实现卡片“数据来源说明”入口

**导入向导任务**

- [ ] Step 1：`.txt` 上传
- [ ] Step 2：元数据确认
- [ ] Step 3：章节切分预览
- [ ] Step 4：模型选择 + 启动解析
- [ ] 文件大小限制与错误提示

**后端任务**

- [ ] 新建 `src/server/modules/books/`
- [ ] 实现上传入库服务
  - 调用 Storage Provider 保存原始 `.txt`
  - 回填 `Book.sourceFileUrl`、`sourceFileKey`、`sourceFileName`、`sourceFileMime`、`sourceFileSize`
- [ ] 实现元数据识别服务
- [ ] 实现章节切分服务
  - 正则切分
  - 特殊章节类型识别
  - 手动修正结构
- [ ] 实现书籍列表查询服务
- [ ] 实现书籍详情查询服务
- [ ] 约定本地对象路径
  - `storage/books/<bookId>/source/...`
  - `storage/books/<bookId>/cover/...`
  - `storage/books/<bookId>/images/...`

**API 任务**

- [ ] `GET /api/books`
- [ ] `POST /api/books`
- [ ] `GET /api/books/:id`
- [ ] `DELETE /api/books/:id`

**完成定义**

- [ ] 首页能展示真实书库数据
- [ ] `.txt` 能上传并入库
- [ ] 原始 `.txt` 已写入统一存储位置，而不是只存在数据库
- [ ] 书名 AI 识别失败时回退文件名
- [ ] 用户能在预览表格中修正章节切分

### 6.4 Phase 4：全书解析任务编排

**目标：** 从“单章分析服务”升级到“整书任务闭环”。

**后端任务**

- [ ] 新建 `src/server/modules/analysis/services/BookAnalysisService.ts`
- [ ] 新建 `src/server/modules/analysis/services/AnalysisJobService.ts`
- [ ] 复用并封装 `ChapterAnalysisService.ts`
- [ ] 把单章 action 提升为整书任务编排
- [ ] 定义任务阶段：
  - 文本清洗
  - 章节切分
  - 实体提取
  - 关系建模
  - 完成
- [ ] 记录任务状态、进度、失败摘要
- [ ] 支持失败重试
- [ ] 支持任务审计字段

**契约修正任务**

- [ ] 统一 Prompt 输出与 TypeScript 类型
  - `traitNote` / `ironyNote`
  - `relationship.evidence`
  - `relationship.confidence`
  - 原文锚点字段
- [ ] 把别名与标签语义拆开
  - `aliases`
  - `globalTags`
  - `localTags`
- [ ] 补 `TITLE_ONLY` 的解析闭环

**API 任务**

- [ ] `POST /api/books/:id/analyze`
- [ ] `GET /api/books/:id/status`

**前端任务**

- [ ] 书库卡片轮询进度
- [ ] 显示 `parseProgress`
- [ ] 显示 `parseStage`
- [ ] 显示错误摘要
- [ ] 重试按钮

**完成定义**

- [ ] 能对一本书发起全书解析任务
- [ ] 书库实时看到阶段变化
- [ ] 失败后能看到错误摘要并重试

### 6.5 Phase 5：图谱页与原文回跳

**目标：** 交付单书图谱浏览与证据回跳主场景。

**页面任务**

- [ ] 新建 `src/app/books/[id]/graph/page.tsx`
- [ ] 图谱主体区域
- [ ] 右侧人物详情面板
- [ ] 底部章节时间轴
- [ ] 左上工具栏骨架
- [ ] 原文阅读抽屉 / 双栏面板

**图谱数据任务**

- [ ] 新建 `src/server/modules/graph/`
- [ ] 实现图谱节点聚合查询
- [ ] 实现图谱边聚合查询
- [ ] 实现按章节过滤
- [ ] 实现人物详情数据组装
- [ ] 实现时间轴事件组装

**原文阅读任务**

- [ ] 新建 `src/server/modules/reader/`
- [ ] 按章节读取原文
- [ ] 组织分段数据
- [ ] 支持 `paraIndex` / `evidenceText` 定位
- [ ] 支持高亮片段返回

**API 任务**

- [ ] `GET /api/books/:id/graph`
- [ ] `GET /api/personas/:id`
- [ ] `GET /api/books/:id/chapters/:chapterId/read`

**交互任务**

- [ ] 点击节点打开详情面板
- [ ] 点击事件 / 关系证据打开原文
- [ ] 原文自动滚动到目标段落
- [ ] 高亮证据文本
- [ ] 上一处 / 下一处证据

**完成定义**

- [ ] 图谱页可浏览真实人物关系
- [ ] 详情面板能展示时间轴和关系列表
- [ ] 原文回跳能定位到对应章节和段落

### 6.6 Phase 6：审核后台

**目标：** 形成 DRAFT -> VERIFIED / REJECTED 的人工审核闭环。

**页面任务**

- [ ] 新建 `src/app/admin/review/page.tsx`
- [ ] 新建 `src/app/admin/review/[bookId]/page.tsx`
- [ ] 左侧书籍选择区
- [ ] 右侧审核看板
- [ ] Tab：人物 / 关系 / 传记事件 / 合并建议
- [ ] 原文对照区域

**后端任务**

- [ ] 新建 `src/server/modules/review/`
- [ ] 实现草稿汇总查询
- [ ] 实现单条确认 / 拒绝 / 编辑
- [ ] 实现批量确认
- [ ] 实现批量拒绝
- [ ] 实现来源筛选（AI / MANUAL）

**API 任务**

- [ ] `GET /api/admin/drafts`
- [ ] `POST /api/admin/bulk-verify`
- [ ] `POST /api/admin/bulk-reject`

**完成定义**

- [ ] 审核页能按书查看草稿
- [ ] 能做批量确认 / 拒绝
- [ ] 草稿与原文证据可联动查看

### 6.7 Phase 7：合并建议与实体合并

**目标：** 把“别名消歧”从算法描述变成产品能力。

**数据任务**

- [ ] 新增 `MergeSuggestion` 模型或等价实现
- [ ] 定义建议状态字段
- [ ] 定义证据引用结构

**后端任务**

- [ ] 生成合并建议服务
- [ ] 接受建议服务
- [ ] 拒绝建议服务
- [ ] 人物实体合并服务
  - Relationship 重定向
  - BiographyRecord 重定向
  - Mention 重定向

**API 任务**

- [ ] `GET /api/admin/merge-suggestions`
- [ ] `POST /api/admin/merge-suggestions/:id/accept`
- [ ] `POST /api/admin/merge-suggestions/:id/reject`
- [ ] `POST /api/personas/merge`

**页面任务**

- [ ] 合并建议列表
- [ ] 展示候选 A / B
- [ ] 展示理由、置信度、原文证据入口
- [ ] 接受 / 拒绝 / 稍后处理

**完成定义**

- [ ] 合并建议能被查看与处理
- [ ] 接受合并后关联数据被正确重定向

### 6.8 Phase 8：手动管理与内联校对

**目标：** 让系统在 AI 不完美时仍能靠人工完成全量维护。

**人物任务**

- [ ] 手动新增人物
- [ ] 编辑人物
- [ ] 删除人物（软删除 + 影响范围提示）

**关系任务**

- [ ] 手动新增关系
- [ ] 编辑关系
- [ ] 删除关系

**事件任务**

- [ ] 手动新增传记事件
- [ ] 编辑传记事件
- [ ] 删除传记事件

**图谱内联校对任务**

- [ ] 节点右键进入编辑态
- [ ] 边右键进入编辑态
- [ ] 保存后图谱即时刷新

**API 任务**

- [ ] `POST /api/books/:id/personas`
- [ ] `PATCH /api/personas/:id`
- [ ] `DELETE /api/personas/:id`
- [ ] `POST /api/books/:id/relationships`
- [ ] `PATCH /api/relationships/:id`
- [ ] `DELETE /api/relationships/:id`
- [ ] `POST /api/personas/:id/biography`
- [ ] `PATCH /api/biography/:id`
- [ ] `DELETE /api/biography/:id`

**完成定义**

- [ ] 不依赖 AI 也能手动维护一本书的人物关系
- [ ] 图谱中修改后能立即反映

### 6.9 Phase 9：重解析机制

**目标：** 把低置信度与错误解析纳入可控返工流程。

**后端任务**

- [ ] 定义重解析请求参数
  - 整书 / 单章
  - 默认模型 / 指定模型
  - 覆盖策略
  - 版本策略
- [ ] 实现重解析任务创建
- [ ] 实现“已 VERIFIED 不自动覆盖”规则
- [ ] 实现旧草稿归档或软删除策略
- [ ] 实现冲突标记“待仲裁”

**页面任务**

- [ ] 书库卡片菜单增加重解析入口
- [ ] 审核页增加重解析入口
- [ ] 图谱页增加管理级重解析入口
- [ ] 重解析确认弹窗

**完成定义**

- [ ] 支持单章重跑
- [ ] 支持整书重跑
- [ ] 支持指定模型重跑
- [ ] 支持覆盖 / 版本策略

### 6.10 Phase 10：视觉与性能增强

**目标：** 落地“第一眼一亮”和大图谱性能策略。

**视觉任务**

- [ ] 书架木纹背景
- [ ] 3D 书脊细节
- [ ] Hover 抬起与阴影扩散动画
- [ ] 图谱节点发光效果
- [ ] Glassmorphism 详情面板
- [ ] 主题切换 300ms 过渡

**性能任务**

- [ ] 切换到 Canvas 图谱渲染
- [ ] 语义缩放
- [ ] 视口裁剪
- [ ] Top N 控制
- [ ] Web Worker 布局计算

**图算法任务**

- [ ] 接入 Neo4j 路径查找
- [ ] `POST /api/graph/path`
- [ ] 图谱页高亮最短路径

**格式扩展任务**

- [ ] `.epub` 导入支持
- [ ] `.pdf` 是否纳入后续迭代评估

**完成定义**

- [ ] 大图谱浏览流畅度明显提升
- [ ] 路径查找正式可用
- [ ] 3D 与图谱沉浸视觉达到产品审美目标

---

## 七、跨阶段公共任务

### 7.1 类型与契约统一

- [ ] 统一 Zod schema 与 Prisma schema 字段命名
- [ ] 统一 AI 输出类型定义
- [ ] 统一 API 响应结构，全部走 `src/server/http/api-response.ts`

### 7.2 测试

- [ ] Auth 单元测试
- [ ] 模型加解密与脱敏测试
- [ ] 章节切分测试
- [ ] 分析任务编排测试
- [ ] 实体合并测试
- [ ] 图谱数据组装测试
- [ ] 重解析策略测试

### 7.3 UX 与状态管理

- [ ] Loading / Empty / Error 状态统一
- [ ] Toast 风格统一
- [ ] 表单错误提示统一
- [ ] 主题状态持久化

### 7.4 安全

- [ ] 所有管理员 API 强制 `requireAdmin(auth)`
- [ ] API Key 全链路脱敏
- [ ] JWT 只包含最小字段
- [ ] `redirect` 参数校验为站内路径
- [ ] 资源接口与日志不暴露服务器物理路径
- [ ] 存储主键以 `sourceFileKey` 为准，URL 视为可派生字段

---

## 八、关键阻塞关系

1. 没有 Phase 1，就无法安全推进 `/admin/*`、模型设置和审核页。
2. 没有 Phase 2，就无法让导入流程真正可运行。
3. 没有 Phase 3，就没有稳定的书籍入库基础，也没有统一静态资源存储落点。
4. 没有 Phase 4，就无法形成“整书解析任务 + 书库状态联动”闭环。
5. 没有 Phase 5，就无法支撑原文阅读 / 高亮回跳 / 审核证据链。
6. 没有 Phase 6 和 7，AI 质量无法形成可维护闭环。
7. 没有统一类型契约，后面页面与服务会反复返工。

---

## 九、建议执行顺序

建议实际按下面顺序推进：

1. Phase 1：数据层与鉴权基础
2. Phase 2：模型设置页
3. Phase 3：书库页与导入向导
4. Phase 4：全书解析任务编排
5. Phase 5：图谱页与原文回跳
6. Phase 6：审核后台
7. Phase 7：合并建议与实体合并
8. Phase 8：手动管理与内联校对
9. Phase 9：重解析机制
10. Phase 10：视觉与性能增强

---

## 十、中断续跑机制（支持跨天继续）

为了适配“随时可能因 token 限额或时间中断”的开发节奏，执行时统一遵循：

1. 一个 ticket 最多连续推进 90 分钟；超时就先做检查点并暂停
2. 每次暂停前必须更新 ticket 状态：`[ ]` / `[~]` / `[x]`
3. 每次暂停前必须写 4 条检查点：
   - 已改文件
   - 已完成验收项
   - 未完成验收项
   - 下一步第一条命令或第一步动作
4. 恢复时先读上次检查点，再继续，不重做已验证内容
5. 涉及迁移或数据脚本时，检查点必须补“当前数据库状态”（已迁移到哪一步、是否已 seed）

建议固定使用 5 票一组的批次节奏：

- Batch A：`T001`-`T005`
- Batch B：`T006`-`T010`
- Batch C：`T011`-`T015`
- Batch D：`T016`-`T020`
- Batch E：`T021`-`T025`
- Batch F：`T026`-`T030`
- Batch G：`T031`-`T035`
- Batch H：`T036`-`T040`
- Batch I：`T041`-`T042` + 回归补票

---

## 十一、首批开工包（建议本周）

如果要立刻开始开发，建议先开这 11 个子任务：

1. `prisma/schema.prisma` 与 `prisma/seed.ts` 对齐 PRD
2. `middleware.ts` + `/login` + `/api/auth/login`
3. `/admin/layout.tsx` + `/admin/page.tsx`
4. `/admin/model` 页面与模型 API
5. 首页书库列表替换 `src/app/page.tsx`
6. `src/server/providers/storage/*` 与本地文件系统 Provider
7. `POST /api/books` 与 `.txt` 导入
8. 章节切分预览服务
9. `POST /api/books/:id/analyze` 全书任务编排
10. `/books/[id]/graph` 页面骨架 + `/api/books/:id/graph`
11. `/admin/review` 页面骨架 + `/api/admin/drafts`

---

## 十二、完成标记规则

任务勾选规则建议统一为：

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成并通过本阶段验收

说明：

- 只有“代码 + 页面 / API + 基本测试 + 手动验收”都完成后，才允许改成 `[x]`
- 单纯建了文件壳、写了假数据页面，不算完成
