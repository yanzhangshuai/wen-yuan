# 文渊 (Wen Yuan) — 中国古文小说人物关系图谱系统

> 产品需求文档 (PRD) · 版本 1.0 · 2026-03-23

---

## 一、产品愿景

**文渊**将枯燥的长篇古文小说转化为可视化、可交互的人物命运图谱。
它不是阅读器，而是"文学考古实验室"——通过 AI 逻辑推理，从百万字非结构化文本中挖掘人物社会网络、命运轨迹与时空变迁。

### 目标用户

| 角色 | 核心需求 |
| --- | --- |
| 文学研究者 | 梳理《红楼梦》、《儒林外史》等复杂人物网与籍贯迁徙 |
| 学生 / 爱好者 | 通过可视化直观理解剧情走向与人物关系 |
| 内容创作者 | 以图谱作为创作素材或逻辑校验工具 |
| 管理员 | 审核 AI 解析结果、维护数据质量 |

---

## 二、核心技术栈（已确定）

| 层 | 技术 |
| --- | --- |
| 框架 | Next.js 16 (App Router) + React 19 |
| 样式 | Tailwind CSS v4 |
| 动画 | Framer Motion |
| 图谱渲染 | D3.js (force-directed graph) |
| 关系型数据库 | PostgreSQL + Prisma |
| 图数据库 | Neo4j |
| AI 提供方 | DeepSeek / 通义千问 (阿里) / 豆包 (字节) ，Gemini 作为备用 |
| 主题 | next-themes（亮色 / 暗色） |
| 校验 | Zod |
| 测试 | Vitest |

---

## 三、页面与功能详述

### 3.1 首页 / 书库（Library）

**路由：** `/`
**设计基调：** 仿真书架，现代博物馆感，第一眼"一亮"

#### 3.1.1 视觉呈现

- **仿真书籍卡片**：每本书以立体书脊样式展示（CSS 3D + Framer Motion），卡片包含：
  - 书名（竖排书脊文字）
  - 作者 / 朝代徽章
  - 封面图（AI 生成建议图 or 默认插图）
  - 解析状态 Badge：`待解析` / `解析中` / `已完成` / `解析失败`
  - 章节数 + 人物数（已完成状态显示）
- **网格布局**：书架木纹背景，书籍按"影响力"或"导入时间"排列
- **Hover 效果**：书籍抬起 + 阴影扩散动画（Framer Motion）
- **空状态**：引导用户导入第一本书的优雅插画 + CTA

#### 3.1.2 交互

- 点击**已完成**的书籍 → 进入人物图谱页
- 点击**任意状态**书籍右上角 `⋯` 菜单 → 查看详情 / 重新解析 / 删除
- 默认前台顶部导航保持精简，仅包含：`[文渊 Logo]` `[书库]` `[主题切换]`
- 管理员相关入口不在默认前台导航中常驻显示；进入 `/admin/*` 后由独立后台导航承载 `管理审核`、`模型设置` 等功能

#### 3.1.3 数据

- API：`GET /api/books` → 返回书籍列表（含状态、统计数量）
- 状态字段：`PENDING` / `PROCESSING` / `COMPLETED` / `ERROR`

---

### 3.2 书籍导入（Import Flow）

**入口：** 书库页右上角 `+ 导入书籍` 按钮
**实现方式：** 全屏 Modal 或侧边抽屉

#### 3.2.1 导入流程（4 步向导）

```
Step 1: 上传文件
Step 2: 基本信息填写
Step 3: 章节预览 & 切分确认
Step 4: 启动 AI 解析
```

**Step 1 — 文件上传**
- 支持格式：`.txt`（MVP 必须）、`.epub`（可选）
- 拖拽上传区域 + 点击选择
- 文件大小限制：50MB
- 上传后显示文件名 + 大小

**Step 2 — 基本信息**
- 字段：书名（必填）、作者（可选）、朝代（可选）、简介（可选）
- 文件上传后 AI 优先从文本前言识别书名、作者、朝代、简介；书名识别失败时回退使用文件名（去扩展名）
- 所有字段用户均可修改

**Step 3 — 智能章节切分预览**

- 系统自动识别章节标题：
  - 中式：`第X回`、`第X章`、`楔子`、`后记`
  - 英式：`Chapter X`
- 预览表格：`序号 | 章节类型 | 标题 | 字数`
- 用户可手动调整：合并章节、修改标题、标记楔子 / 正文 / 后记
- 切分逻辑分两级：
  - 自动（正则 + 模型辅助）
  - 手动修正

**Step 4 — 启动解析**

**模型选择（必须在此步骤选定）：**

| 模型 | 提供商 | 定位 | 适用场景 |
| --- | --- | --- | --- |
| DeepSeek V3 | DeepSeek | 逻辑推理强、古文理解佳 | 默认推荐，精准解析 |
| DeepSeek R1 | DeepSeek | 慢思考推理 | 复杂关系二次复核 |
| 通义千问 Max (qwen-max) | 阿里云 | 中文语义理解强 | 人物别名消歧 |
| 通义千问 Plus (qwen-plus) | 阿里云 | 速度与质量均衡 | 中等篇幅书籍 |
| 豆包 Pro (doubao-pro) | 字节跳动 | 国内大模型，性价比高 | 批量快速扫描 |
| Gemini Flash | Google | 速度极快 | 备用 / 海外场景 |

- UI 展示为**模型卡片选择**，每张卡片显示：模型名、提供商 Logo、速度评级（🐇/🐢）、古文能力评级（⭐~⭐⭐⭐）、大致费用等级
- 用户也可在**系统模型管理页**配置各模型的 API Key 和自定义 BaseURL（支持接入私有化部署的兼容接口）
- 解析粒度：`全书` / `选定章节`
- 点击"开始解析"后关闭导入窗口，书籍进入 `PROCESSING` 状态，解析时使用的模型名称记录在 `Book` 记录上供审计追溯

#### 3.2.2 解析进度展示

- 书库卡片实时显示进度条（轮询 `/api/books/:id/status`）
- 进度阶段：`文本清洗 → 章节切分 → 实体提取 → 关系建模 → 完成`
- 解析失败时，卡片显示错误摘要 + `重试` 按钮

#### 3.2.3 AI 解析内容（后端输出）

每章解析：

- **实体识别**：**书中出现的每一个人物必须全量提取，不得遗漏**，包括：
  - 有名有姓的人物（如"范进"、"周进"）
  - 仅有称号 / 官职 / 绰号而无名字的人物（如"那老翁"、"严监生的内侄"、"那钦差大人"），以称号作为标准名，标注 `nameType: TITLE_ONLY`
  - 匿名群体性人物（如"众邻居"、"几个秀才"）**忽略，不提取**
- **姓名、别名**（如"周进 = 周学道"）、性别、籍贯、官职
- **传记事件**：时间点、地点、事件、职位（四元组）
- **关系提取**：人物 A → 关系类型 → 人物 B + 原文证据片段
- **人物标签**：性格 / 社会角色标签（如"伪君子"、"真名士"、"市井小人"）
- **讽刺指数**：0–10 分，附 AI 点评

关系类型（20+）：
`父子` `母子` `兄弟` `夫妻` `姻亲` `师生` `同年` `荐举` `债主` `债务人` `友好` `敌对` `下属` `上司` `同僚` `欣赏` `嘲讽` `同盟` `竞争` `其他`

#### 3.2.4 AI 解析准确度要求

##### 目标：主要人物识别率 ≥ 95%，主要关系识别率 ≥ 95%

##### 准确率定义（可验收）

| 维度 | 定义 | 目标 |
| --- | --- | --- |
| 主要人物识别率 | 全书出场 ≥ 3 次的人物被正确提取的比例 | ≥ 95% |
| 别名消歧准确率 | 同一人物的多个称谓被正确归并的比例（如"周进 = 周学道"） | ≥ 90% |
| 主要关系识别率 | 全书明确出现的亲属 / 师生 / 同年等主要关系被正确提取的比例 | ≥ 95% |
| 关系误报率 | AI 提取的关系中，经人工核对为错误的比例 | ≤ 10% |
| 原文证据引用率 | 每条关系附带有效原文证据片段的比例 | ≥ 90% |

> 验收方式：以《儒林外史》前 20 回为基准测试集，人工标注后与 AI 输出对比计算。

##### 达到 95% 准确度的工程机制

1. **分章解析 + 全局上下文注入**
   - 每章解析时，Prompt 中携带"已识别人物列表"作为上下文，避免跨章节遗漏 / 重复识别
   - 每 10 章做一次全局汇总，AI 对人物别名进行跨章消歧

2. **结构化 Prompt + 强约束输出**
   - 要求 AI 以 JSON Schema 格式输出，字段缺失时必须填 `null` 而非省略
   - Prompt 中提供古文人名识别规则示例（Few-shot），降低模型幻觉

3. **置信度字段**
   - AI 为每个实体 / 关系打置信度分（0.0–1.0），低于 0.7 的结果自动标记为"待重点核对"
   - 图谱中低置信度节点 / 边额外显示警告图标 ⚠️

4. **指代消解二次扫描**
   - 全书解析完成后，自动扫描"名字相似度 > 80%"的 Persona，归入"合并建议"队列
   - 管理审核页优先展示合并建议，引导人工确认

5. **重解析机制**
   - 支持对单章或全书发起"重解析"，可切换更强模型（如 DeepSeek R1）对低置信度章节进行二次提取
   - 两次解析结果取并集，冲突时标记为"待仲裁"

6. **人工校对闭环**
   - DRAFT 数据经人工 VERIFY 后，优质样本可沉淀为该书的 Few-shot 示例，用于后续章节解析（持续提升）

---

### 3.3 人物图谱页（Graph Dashboard）

**路由：** `/books/:id/graph`
**设计基调：** 星空力导向图，沉浸感，博物馆级展示

#### 3.3.1 图谱主体（D3 Force-Directed Graph）

**节点设计**

| 属性 | 规则 |
| --- | --- |
| 形状 | 圆形节点（人物）/ 菱形（地点）/ 六边形（组织）|
| 颜色 | 按派系 / 家族自动着色（AI 聚类结果）|
| 大小 | 与"影响力权重"（关系数 × 讽刺指数）正相关 |
| 标签 | 节点旁显示姓名（可开关） |
| 状态样式 | `DRAFT` 节点半透明虚线边框；`VERIFIED` 实线发光边框 |

**边设计**

| 属性 | 规则 |
| --- | --- |
| 颜色 | 正向关系（亲属 / 友好）蓝绿色；负向关系（敌对 / 嘲讽）橙红色 |
| 粗细 | 与 `weight`（亲密度）正相关 |
| 标签 | 鼠标悬停边显示关系类型 |

**交互**

- **点击节点** → 右侧弹出**人物详情面板**（玻璃拟态 Glassmorphism 风格）
- **双击节点** → 聚焦模式：其余无直接关联节点半透明淡出
- **拖拽节点** → 调整布局（布局记忆到 `visual_config`）
- **滚轮** → 缩放图谱
- **空白拖拽** → 平移图谱
- **右键节点** → 上下文菜单（进入校对模式）

#### 3.3.2 人物详情面板

点击节点后，右侧弹出侧边栏：

- **头部**：姓名 + 书中称谓、性别、状态 Badge（DRAFT/VERIFIED）
- **基本信息**：别名列表、籍贯、生卒年（虚拟）
- **人物小传**：AI 生成的本书人物小传
- **标签云**：性格 / 社会标签 + 讽刺指数进度条
- **生平时间轴**：
  ```
  第1回  ·  出场 —— 范进寒窗苦读
  第3回  ·  落第 —— 再度失意
  第7回  ·  中举 —— 喜极而疯
  第10回 ·  授职 —— 升山东学道
  ```
  每条事件可点击 → 跳转原文高亮
- **关系列表**：该人物的直接关系（可按类型过滤）
- **底部操作**：`校对此人物` 按钮（跳转校对模式）

#### 3.3.3 章节时间轴（剧情演进）

- 图谱底部固定：`第1回 ———⊙——— 第56回`
- 拖动滑块 → 图谱动态呈现"截止到该回目"的人物关系（节点渐入动画）
- 当前回目的新增人物 / 新增关系高亮闪烁

#### 3.3.4 工具栏

左上角浮动工具栏：

| 按钮 | 功能 |
| --- | --- |
| 筛选 | 按关系类型、派系、状态过滤节点 |
| 搜索 | 高亮指定人物节点 |
| 路径查找 | 输入两人 → 高亮最短关系路径（Neo4j 图算法）|
| 布局 | 力导向 / 同心圆 / 层级树 切换 |
| 全屏 | 进入沉浸式全屏模式 |
| 导出 | 导出 PNG / SVG / JSON |

---

### 3.4 校对系统（Curating System）

**两个入口：**

1. **人物图谱页内联校对**（轻量，针对单个节点/关系）
2. **管理审核页**（批量，针对全书草稿数据）

#### 3.4.1 图谱内联校对

- 右键节点 → `校对此人物` → 右侧详情面板切换为编辑态
- 可编辑字段：姓名、别名、籍贯、性别、标签、人物小传、讽刺指数
- 状态操作：`确认` (DRAFT→VERIFIED) / `拒绝` (DRAFT→REJECTED)
- **实体合并**：在编辑态选择"合并到"→ 搜索已有 Persona → 合并后该节点所有关系重定向

- 右键边 → `校对此关系` → 弹窗编辑关系类型、权重、描述、状态

#### 3.4.2 管理审核页（Admin Review）

**路由：** `/admin/review`
**布局：** 复用 `/admin/*` 独立后台布局，页内为左侧书籍选择 + 右侧审核看板

**Tab 分区：**

| Tab | 内容 |
| --- | --- |
| 人物草稿 | 列表展示所有 DRAFT Persona，含 AI 提取原文证据 |
| 关系草稿 | 列表展示所有 DRAFT Relationship |
| 传记事件 | 列表展示所有 DRAFT BiographyRecord |
| 合并建议 | AI 识别的"可能是同一人"建议列表 |

**每条草稿操作：**
- `✓ 确认` → 状态改为 VERIFIED
- `✗ 拒绝` → 状态改为 REJECTED
- `✎ 编辑` → 内联编辑字段
- **批量操作**：全选 + 批量确认 / 拒绝

**原文对照模式：**
- 点击任意草稿 → 右侧打开原文面板，高亮 AI 引用的原文段落

**实体合并工具（Merge Tool）：**
- 选中两个人物 → 点击"合并" → 选择主记录
- 后端逻辑：将被合并 Persona 的所有 Relationship / BiographyRecord / Mention 重定向到主 Persona

**手动人物管理（完全不依赖 AI）：**

系统支持绕过 AI，由用户完整手动录入一本书的所有角色与关系。

- **新增人物**：填写姓名（或称号）、别名、性别、籍贯、官职、人物类型（`TITLE_ONLY` / 普通），状态直接为 `VERIFIED`
- **编辑人物**：修改任意字段，包括 AI 已提取的人物
- **删除人物**：软删除，级联标记该人物相关的所有关系 / 传记事件为 `REJECTED`；删除前弹窗提示影响范围（"将同时影响 X 条关系、Y 条事件"）
- **手动连线**：选择 Persona A + Persona B + 关系类型 + 所在章节，状态直接为 `VERIFIED`
- **删除关系**：软删除单条关系
- **手动录入传记事件**：为任意人物添加章节事件（类型 / 地点 / 描述）

> 手动录入的数据与 AI 数据在图谱上统一展示，通过 `recordSource` 字段区分（`AI` / `MANUAL`），审核页可按来源筛选。

---

### 3.5 模型设置页（Admin Model Settings）

**路由：** `/admin/model`
**入口：** 顶部导航 `[模型]`

模型设置页属于 `/admin/*` 独立后台模块的一部分，使用与审核页一致的后台布局与权限控制。

模型管理页是整个系统的运行前提，用户必须至少配置一个 AI 模型的 API Key 才能启动解析。

#### 3.5.1 AI 模型配置

MVP 采用“完整运营版”范围：覆盖模型可用性配置、基础诊断与主题联动，但不扩展到运营报表或高级监控。

每个模型一张配置卡，包含：

- **API Key**：输入框（密文显示），列表态只展示脱敏值，支持一键清除
- **BaseURL**（可选）：留空使用官方默认地址，填写后可接入私有化部署或代理
- **连通性测试**：点击"测试"按钮，发送一条最小 Prompt 验证 Key 是否有效，显示响应延迟
- **启用 / 禁用**开关：未配置 Key 的模型在导入向导中自动置灰

支持的模型配置项：

| 模型 | 默认 BaseURL | 环境变量 |
| --- | --- | --- |
| DeepSeek V3 / R1 | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `QWEN_API_KEY` |
| 豆包 | `https://ark.cn-beijing.volces.com/api/v3` | `DOUBAO_API_KEY` |
| Gemini Flash | `https://generativelanguage.googleapis.com` | `GEMINI_API_KEY` |

#### 3.5.2 默认模型

- 下拉选择"导入向导 Step 4"的默认选中模型
- 仅已配置且启用的模型出现在下拉列表中

#### 3.5.3 外观设置

- 主题：亮色 / 暗色 / 系统跟随（与顶部快捷切换联动）
- 语言：简体中文（MVP 只支持中文）

#### 3.5.4 当前阶段不包含

- 不展示模型调用统计、用量报表、余额或账单信息
- 不展示最近一次成功调用时间、历史测试记录、失败趋势图
- 不做多环境配置（如 dev / staging / prod）切换
- 不支持模型能力打分编辑、排序拖拽或复杂运营说明维护

---

### 3.6 主题系统

- 支持 **亮色（Light）/ 暗色（Dark）/ 系统跟随** 三档
- 使用 `next-themes`，CSS 变量控制色板
- 切换动画：淡入淡出过渡（300ms）
- 图谱节点 / 边颜色需在亮暗模式下分别调优，保证对比度和美观

**亮色调性：** 米白纸张感 + 墨水蓝 + 朱砂红（东方文化感）
**暗色调性：** 深宇宙黑 + 星光节点 + 氖光边（科技感）

---

### 3.7 登录系统（简版）

**路由：** `/login`
**默认状态：** 所有页面无需登录即可访问（viewer 模式）；触发管理员操作时才要求登录。

#### 角色权限表

| 功能 | admin | viewer（默认） |
| --- | --- | --- |
| 浏览书库、查看图谱 | ✅ | ✅ |
| 点击节点查看人物详情 | ✅ | ✅ |
| 导入书籍 / 触发 AI 解析 | ✅ | ❌ → 触发登录 |
| 图谱内联校对（编辑节点/关系） | ✅ | ❌ → 触发登录 |
| 管理审核页（确认/拒绝/合并） | ✅ | ❌ → 触发登录 |
| 手动新增 / 删除人物 | ✅ | ❌ → 触发登录 |
| 模型管理（API Key 配置） | ✅ | ❌ → 触发登录 |

#### 设计原则

- **默认 viewer**：未登录用户以只读模式访问全站，无需任何认证
- **管理员后台集中入口**：所有管理员页面统一收敛在 `/admin/*` 路由下，作为独立后台模块管理
- **按需登录**：点击管理员操作按钮，或直接访问 `/admin/*` 页面时，统一跳转 `/login?redirect=<当前路径>`
- **单一 admin 账号**，无注册、无找回密码
- 账号存储于 `users` 表；初始管理员通过 seed 从环境变量写入
- 实现简单，不引入第三方 Auth 库

#### 登录页 / 登录 Modal

- 居中卡片：邮箱或用户名 + 密码输入框 + 登录按钮
- 凭证错误时显示"账号或密码错误"，不区分具体原因
- 登录成功 → 写 `httpOnly` Cookie（JWT，7 天有效期）→ 跳回 `redirect` 参数页面
- `redirect` 必须完整保留原始路径与查询参数，并在跳转链路中做 URL 编码 / 解码处理

#### 鉴权机制

- **Next.js Middleware**：读取 JWT Cookie，有效则注入 `x-auth-role: admin`，无效或缺失则注入 `x-auth-role: viewer`
- **Admin Layout 守卫**：`/admin/*` 使用独立 layout，在服务端再次校验登录态与角色，避免仅依赖 Middleware
- **受保护页面**（所有 `/admin/*`）：Middleware 检测到 viewer 直接访问时，立即重定向 `/login?redirect=<目标路径>`
- **普通页面的管理员操作**：Route Handler 调用 `requireAdmin(auth)` 返回 `403`，前端拦截 → 跳转 `/login?redirect=<当前路径>`
- **Redirect 规范**：`redirect` 参数统一传递“当前 pathname + search”，写入 URL 前做编码，登录页消费后做解码并校验为站内路径
- JWT 仅包含 `{ role: "admin", iat, exp }`
- 环境变量：`ADMIN_USERNAME`、`ADMIN_EMAIL`、`ADMIN_NAME`（可选）、`ADMIN_PASSWORD`、`JWT_SECRET`、`APP_ENCRYPTION_KEY`
- 登出：清除 Cookie → 留在当前页（角色降级为 viewer）

#### 顶部导航

- **未登录**：右上角显示 `管理员登录` 按钮
- **已登录**：右上角显示"管理员" + `退出登录` 按钮

---

## 四、数据模型（已有 Schema，关键映射）

| UI 概念 | 数据模型 |
| --- | --- |
| 书籍 | `Book` |
| 章节 / 回目 | `Chapter` |
| 全局人物本体（跨书） | `Persona` |
| 人物在某书中的档案 | `Profile` |
| 传记事件 / 生平时间轴 | `BiographyRecord` |
| 原文出场记录 | `Mention` |
| 人物关系 | `Relationship` |
| 解析状态 | `ProcessingStatus`（DRAFT/VERIFIED/REJECTED） |

---

## 五、API 接口概览

### 书籍相关
```
GET    /api/books                     书籍列表
POST   /api/books                     创建书籍（上传文本）
GET    /api/books/:id                 书籍详情
GET    /api/books/:id/status          解析进度
POST   /api/books/:id/analyze         启动 AI 解析
DELETE /api/books/:id                 删除书籍
```

### 人物 & 图谱
```
GET    /api/books/:id/graph           图谱数据（节点+边，支持章节过滤）
GET    /api/books/:id/personas        人物列表
POST   /api/books/:id/personas        手动新增人物（recordSource: MANUAL）
GET    /api/personas/:id              人物详情（含时间轴）
PATCH  /api/personas/:id              更新人物（校对）
DELETE /api/personas/:id              删除人物（软删除，级联标记关联数据）
POST   /api/personas/merge            合并两个 Persona
```

### 传记事件
```
POST   /api/personas/:id/biography    手动新增传记事件
PATCH  /api/biography/:id             更新传记事件
DELETE /api/biography/:id             删除传记事件
```

### 关系
```
GET    /api/books/:id/relationships   关系列表（支持筛选）
POST   /api/books/:id/relationships   手动添加关系
PATCH  /api/relationships/:id         更新关系（校对）
DELETE /api/relationships/:id         删除关系
```

### 路径查找
```
POST   /api/graph/path                两人最短路径（Neo4j）
```

### 审核
```
GET    /api/admin/drafts              草稿汇总
POST   /api/admin/bulk-verify         批量确认
POST   /api/admin/bulk-reject         批量拒绝
```

### 认证

```
POST   /api/auth/login                登录（返回 JWT 写入 httpOnly Cookie）
POST   /api/auth/logout               登出（清除 Cookie）
```

---

## 六、页面路由结构

```
/login                      登录页（管理员操作触发跳转，支持 ?redirect= 参数）
/                           首页（书库）
/books/:id/graph            人物图谱页
/admin                      管理中心入口（独立后台模块，跳转到默认子页）
/admin/review               管理审核页
/admin/review/:bookId       指定书籍审核
/admin/model                模型设置页（AI 模型配置、默认模型、主题等）
```

---

## 七、MVP 范围界定

### ✅ MVP 必须包含

1. 书库页（仿真书籍卡片列表）
2. 书籍导入（.txt，章节切分，AI 解析触发）
3. 解析进度展示（书库卡片上）
4. 人物图谱页（D3 力导向图，节点+边基础渲染）
5. 人物详情面板（点击节点弹出）
6. 章节时间轴滑块
7. 管理审核页（DRAFT 数据的确认 / 拒绝 / 编辑）
8. 实体合并工具
9. 亮色 / 暗色主题切换
10. 图谱内联校对（单节点 / 单关系编辑）
11. 手动人物管理（新增 / 编辑 / 删除人物、关系、传记事件，完全不依赖 AI）
12. 登录系统（默认 viewer 免登录，管理员操作触发登录，JWT + httpOnly Cookie）
13. `/admin/*` 独立后台模块（独立布局、统一鉴权守卫、默认后台导航）
14. 模型设置页完整运营版 MVP（API Key 脱敏、BaseURL、启用禁用、默认模型、连通性测试、主题设置联动）

### 🔜 Post-MVP（后续迭代）

- 关系路径查找（"王冕到范进"最短路）
- 派系气泡背景（自动社区检测）
- .epub / .pdf 格式支持
- 模型对比解析（同一章节用两个模型同时跑，结果并排对比，人工择优）
- AI 纠错机制（时空逻辑检查）
- 跨书籍人物关联（同一 Persona 出现在多本书）
- 图谱导出（PNG/SVG）
- 讽刺指数雷达图

### ❌ 明确不做（当前阶段）

- 多用户 / 多租户 / 注册流程 / 找回密码（只有单一管理员账号）
- 移动端适配（PC 优先）
- 实时协作校对
- 付费功能

---

## 八、验收标准

### 书库

- [ ] 书籍以仿真书脊卡片展示，Hover 有抬起动画
- [ ] 解析状态 Badge 正确显示，PROCESSING 状态显示进度条
- [ ] 点击已完成书籍跳转图谱页

### 导入

- [ ] .txt 文件上传成功，自动切分章节（"第X回"识别率 > 90%）
- [ ] 用户可在预览表格手动调整章节
- [ ] 启动解析后书库卡片实时更新状态
- [ ] 解析失败显示错误信息 + 重试按钮

### 图谱

- [ ] 节点按大小/颜色区分影响力和派系
- [ ] DRAFT 节点视觉上有别于 VERIFIED
- [ ] 点击节点正确打开详情面板，显示时间轴
- [ ] 章节滑块拖动，图谱节点随之增减（动画流畅 > 30fps）
- [ ] 双击节点触发聚焦模式

### AI 解析覆盖率

- [ ] 有名有姓的人物全量提取，无遗漏
- [ ] 仅有称号的人物（如"那老翁"）被提取并标注 `nameType: TITLE_ONLY`
- [ ] 匿名群体（如"众邻居"）不被提取，不出现在图谱中
- [ ] 每条关系附带原文证据片段

### 校对 & 手动管理

- [ ] 右键节点可进入编辑态，字段保存后立即生效
- [ ] 实体合并后，被合并人物的关系线全部重定向
- [ ] 管理审核页批量确认 / 拒绝操作正常
- [ ] 原文对照模式：点击草稿高亮对应原文段落
- [ ] 可手动新增人物，状态直接为 VERIFIED，立即出现在图谱
- [ ] 删除人物时弹窗提示影响范围，确认后软删除并级联标记关联数据
- [ ] 可手动添加 / 删除关系，不依赖 AI
- [ ] 手动录入的数据在审核页可通过来源（MANUAL / AI）筛选

### Admin 模块与模型设置

- [ ] 未登录访问任意 `/admin/*` 页面时，统一跳转 `/login?redirect=<当前路径>`
- [ ] `/admin/*` 使用独立后台布局，不复用前台页面内容区结构
- [ ] 登录成功后可精确返回原始后台路径，并完整保留查询参数
- [ ] `/admin/model` 可配置 API Key、BaseURL、启用状态与默认模型
- [ ] 已保存的 API Key 在页面上以脱敏形式展示，不返回明文
- [ ] 点击“连通性测试”可返回成功/失败结果与基础延迟信息
- [ ] 模型设置页的主题切换与全局主题状态保持同步

### 主题

- [ ] 亮色 / 暗色切换有 300ms 淡入淡出过渡
- [ ] 图谱节点 / 边在两种主题下均清晰可读
- [ ] 主题偏好持久化（localStorage）

---

## 九、Definition of Done

- 单元测试覆盖核心业务逻辑（AI 解析 / 实体合并 / 图谱数据计算）
- TypeScript 编译 0 错误
- ESLint 0 警告
- 所有 API 返回符合 `api-response-standard.md` 格式
- 亮色 / 暗色主题下无文字对比度问题

---

## 十、技术注意事项

- **双数据库策略**：Prisma（PostgreSQL）存储结构化数据（书籍 / 章节 / 人物档案）；Neo4j 存储图关系用于路径查找和社区检测。MVP 可先只用 PostgreSQL + 前端 D3 计算布局，Neo4j 在 Post-MVP 阶段启用。
- **AI 解析并发**：大型书籍（50+ 章节）需要按章节并行调用 AI，各模型有速率限制，需实现队列机制。
- **`status` 字段**：Book 的 status 用 `String` 而非 enum（已在 Schema 中），便于扩展。
- **`visual_config`**：Profile 上的 JSON 字段用于缓存前端节点坐标，避免每次重新计算力导向布局。

- **Schema 完整变更清单（需执行 `prisma migrate dev`）：**

  **新增枚举**

  ```prisma
  enum NameType {
    NAMED       // 有名有姓的人物（默认）
    TITLE_ONLY  // 仅有称号/官职/绰号，无名字
    @@map("name_type")
  }

  enum RecordSource {
    AI      // AI 解析产出（默认）
    MANUAL  // 用户手动录入
    @@map("record_source")
  }
  ```

  **新建 `users` 表**

  | 字段 | 类型 | 约束 | 说明 |
  | --- | --- | --- | --- |
  | `id` | `UUID` | PK | — |
  | `username` | `String` | UNIQUE | 用户名，可作为登录凭证 |
  | `email` | `String` | UNIQUE | 管理员邮箱，可作为登录凭证 |
  | `name` | `String` | NOT NULL | 用户显示名 |
  | `password` | `String` | NOT NULL | 密码哈希，不存明文 |
  | `role` | `AppRole` | default `VIEWER` | `ADMIN` \| `VIEWER` |
  | `is_active` | `Boolean` | default `true` | 账号启用状态（禁用后不可登录） |
  | `last_login_at` | `Timestamptz?` | — | 最近一次登录时间（审计） |
  | `created_at` | `Timestamptz` | — | — |
  | `updated_at` | `Timestamptz` | — | — |

> 初始管理员账号通过 `prisma db seed` 从环境变量 `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` 写入；其中 `ADMIN_PASSWORD` 仅用于 seed 初始化，并在写入前使用 `Argon2id` 哈希。登录 API 支持按 `email` 或 `username` 查库校验 + `Argon2id` 比对。

  **新建 `ai_models` 表**

  | 字段 | 类型 | 约束 | 说明 |
  | --- | --- | --- | --- |
  | `id` | `UUID` | PK | — |
  | `provider` | `String` | NOT NULL | 模型提供方标识（推荐：`deepseek` \| `qwen` \| `doubao` \| `gemini`） |
  | `name` | `String` | NOT NULL | 显示名称（如"DeepSeek V3"） |
  | `model_id` | `String` | NOT NULL | API 调用时的模型标识（如 `"deepseek-chat"`） |
  | `base_url` | `String` | NOT NULL | API 地址，可自定义（私有部署） |
  | `api_key` | `String?` | — | API Key（存库，前端只显示脱敏版） |
  | `is_enabled` | `Boolean` | default `false` | 是否启用（Key 配置后才可启用） |
  | `is_default` | `Boolean` | default `false` | 是否为导入向导默认选中模型 |
  | `created_at` | `Timestamptz` | — | — |
  | `updated_at` | `Timestamptz` | — | — |

  > 表内预置 6 条默认模型记录（通过 `prisma db seed` 写入），用户在模型管理页只需填 Key 即可启用。

  **`Book` 表变更**

  | 字段 | 类型 | 默认值 | 说明 |
  | --- | --- | --- | --- |
  | `ai_model_id` | `UUID?` | — | **FK → `ai_models.id`**（替换原 `ai_model String?`） |
  | `parse_progress` | `Int` | `0` | 解析进度 0–100（百分比） |
  | `parse_stage` | `String?` | — | 当前阶段文本（如"实体提取"） |
  | `raw_content` | `Text?` | — | 原始上传文本（章节切分前保留，用于重新切分） |

  **`Persona` 表新增字段**

  | 字段 | 类型 | 默认值 | 说明 |
  | --- | --- | --- | --- |
  | `name_type` | `NameType` | `NAMED` | 人名类型（有名 / 仅称号） |
  | `record_source` | `RecordSource` | `AI` | 数据来源（AI / 手动），Prisma 字段名 `recordSource` |
  | `aliases` | `String[]` | `[]` | 别名列表（如 `["周学道","周大人"]`） |
  | `hometown` | `String?` | — | 籍贯（全局静态属性） |
  | `confidence` | `Float` | `1.0` | AI 置信度（0.0–1.0），低于 0.7 标记待核对 |
  | `deleted_at` | `Timestamptz?` | — | 软删除时间（空表示有效） |

  **`Profile` 表新增字段**

  | 字段 | 类型 | 默认值 | 说明 |
  | --- | --- | --- | --- |
  | `official_title` | `String?` | — | 书中官职（书内特有，随剧情变化，最终职位） |
  | `local_tags` | `String[]` | `[]` | 性格/社会角色标签（如 `["伪君子","官僚"]`） |
  | `deleted_at` | `Timestamptz?` | — | 软删除时间（空表示有效） |

  **`Relationship` 表新增字段**

  | 字段 | 类型 | 默认值 | 说明 |
  | --- | --- | --- | --- |
  | `record_source` | `RecordSource` | `AI` | 数据来源，Prisma 字段名 `recordSource` |
  | `confidence` | `Float` | `1.0` | AI 置信度 |
  | `evidence` | `Text?` | — | 原文证据片段（`description` 保留为关系背景描述） |
  | `deleted_at` | `Timestamptz?` | — | 软删除时间（空表示有效） |
  | 约束 | — | UNIQUE | `chapter_id + source_id + target_id + type + record_source` 去重 |

  **`BiographyRecord` 表新增字段**

  | 字段 | 类型 | 默认值 | 说明 |
  | --- | --- | --- | --- |
  | `record_source` | `RecordSource` | `AI` | 数据来源，Prisma 字段名 `recordSource` |
  | `deleted_at` | `Timestamptz?` | — | 软删除时间（空表示有效） |

  **`Mention` 表新增字段**

  | 字段 | 类型 | 默认值 | 说明 |
  | --- | --- | --- | --- |
  | `deleted_at` | `Timestamptz?` | — | 软删除时间（空表示有效） |

  **新建 `analysis_jobs` 表**

  | 字段 | 类型 | 约束 | 说明 |
  | --- | --- | --- | --- |
  | `id` | `UUID` | PK | — |
  | `book_id` | `UUID` | FK → `books.id` | 所属书籍 |
  | `ai_model_id` | `UUID?` | FK → `ai_models.id` | 本次任务使用模型 |
  | `status` | `AnalysisJobStatus` | default `QUEUED` | `QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED` |
  | `scope` | `String` | default `FULL_BOOK` | FULL_BOOK / CHAPTER_RANGE |
  | `chapter_start` | `Int?` | — | 章节范围起点 |
  | `chapter_end` | `Int?` | — | 章节范围终点 |
  | `attempt` | `Int` | default `1` | 重试次数 |
  | `error_log` | `Text?` | — | 失败日志摘要 |
  | `started_at` | `Timestamptz?` | — | 开始时间 |
  | `finished_at` | `Timestamptz?` | — | 完成时间 |
  | `created_at` | `Timestamptz` | — | — |
  | `updated_at` | `Timestamptz` | — | — |

- **大体量图谱渲染方案（性能 + 显示量兼顾）：**

  采用 **D3 Canvas 渲染 + 语义缩放（Semantic Zoom）+ 视口裁剪** 三层策略：

  | 缩放层级 | 显示内容 | 渲染方式 |
  | --- | --- | --- |
  | 缩小（鸟瞰） | 派系气泡聚类，不显示单个节点 | Canvas 圆形聚合 |
  | 中等缩放 | 影响力 Top N（默认 Top 80）节点 + 关系 | Canvas 节点+边 |
  | 放大（局部） | 当前视口内全量节点，视口外节点不渲染 | Canvas + 视口裁剪 |

  - SVG 渲染上限约 200 节点；**Canvas 渲染可流畅承载 1000+ 节点**
  - "Top N"阈值在图谱工具栏可调节（50 / 80 / 150 / 全量）
  - 节点坐标计算在 Web Worker 中进行，不阻塞主线程
  - 首次打开图谱：展示 Top 80 + 动画渐入；用户可点击"加载全部"切换到全量

- **登录鉴权实现**：使用 Next.js Middleware（`middleware.ts`）拦截全站请求，校验 `token` Cookie 中的 JWT；签发与校验用 Node.js 内置 `crypto`（HMAC-SHA256），不引入额外依赖。环境变量：`ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_NAME`（可选）/ `ADMIN_PASSWORD`（仅用于 seed 初始化）/ `JWT_SECRET`（JWT 签发与校验）/ `APP_ENCRYPTION_KEY`（AI Key 等敏感字段加解密）。Middleware 校验通过后将角色写入 `x-auth-role` 请求头，Route Handler 调用 `getAuthContext(request)` 读取，管理员操作追加 `requireAdmin(auth)` 守卫。
- **Admin 页面组织**：`/admin/*` 视为独立后台模块，可拥有独立布局、导航、面包屑和页头，不与前台页面强耦合；权限校验由 Middleware + `src/app/admin/layout.tsx` 双重守卫承担。
- **Auth 模块**：`rbac.ts`（遗留）已删除，替换为 `src/server/modules/auth/index.ts`，角色简化为 `admin | viewer`，导出 `getAuthContext` / `requireAdmin` / `AuthError`。
- **密码哈希标准**：统一采用 `Argon2id`；参数基线为 `memoryCost=19456`、`timeCost=2`、`parallelism=1`。禁止回退 `bcrypt`，也禁止使用“密码 + secret 再 hash”这类自定义伪方案，避免多算法并存造成登录与迁移复杂度上升。
- **AI Key 安全规范（M0）**：
  - `api_key` 必须密文存储；前端与普通 API 仅返回脱敏值；
  - 加密/解密仅在服务端执行，日志与错误信息禁止输出明文 Key；
  - 预留密钥轮换方案（支持新密钥重加密历史密文）；
  - 数据导出接口默认剔除 `api_key` 原值。
- **M0 非功能基线（验收门槛）**：
  - `POST /api/auth/login`：p95 < 300ms（本地基准环境）；
  - 书库到图谱首屏可交互：p95 < 2.5s（前 20 回数据集）；
  - 前 20 回解析总耗时：p95 < 10 分钟（默认模型，单次任务）。
- **数据生命周期**：
  - 业务删除一律先软删除（写入 `deleted_at`）；
  - 软删除记录保留 30 天支持恢复；
  - 超过保留期后进入离线物理清理任务（按批次执行，保留审计日志）。

- **现有代码参考**：
  - AI 客户端：`src/server/providers/ai/`（Gemini + DeepSeek 已实现）
  - 章节解析 Service：`src/server/modules/analysis/services/ChapterAnalysisService.ts`
  - Auth 模块：`src/server/modules/auth/index.ts`
  - API 响应规范：`src/server/http/api-response.ts`

---

## 十一、实施阶段计划

> 各阶段独立可测，按顺序执行，每阶段完成后进行验收再进入下一阶段。

---

### Phase 1 — 基础层（Foundation）

**目标：** 数据库就绪、鉴权可用、项目可运行

**任务清单：**

- [ ] **DB Schema 迁移**（详见"技术注意事项 → Schema 完整变更清单"）
  - 新增枚举：`NameType`（NAMED / TITLE_ONLY）、`RecordSource`（AI / MANUAL）
  - 新建 `users` 表（username / email / name / password / role）
  - 新建 `ai_models` 表（provider / name / modelId / baseUrl / apiKey / isEnabled / isDefault）
  - `Book`：+ `aiModelId`（FK → ai_models）、`parseProgress`、`parseStage`、`rawContent`
  - `Persona`：+ `nameType`、`recordSource`、`aliases`、`hometown`、`confidence`
  - `Profile`：+ `officialTitle`、`localTags`
  - `Relationship`：+ `recordSource`、`confidence`、`evidence`
  - `BiographyRecord`：+ `recordSource`
  - 运行 `prisma migrate dev` 生成并应用迁移文件
- [ ] **Auth 模块**（已完成 `src/server/modules/auth/index.ts`，确认测试通过）
  - 补全 `src/server/modules/auth/index.test.ts`
  - 删除遗留文件 `src/server/modules/auth/rbac.ts` 及 `rbac.test.ts`
- [ ] **登录 API**
  - `POST /api/auth/login`：支持邮箱或用户名登录，查库校验账号后签发 JWT 写入 `httpOnly` Cookie
  - `POST /api/auth/logout`：清除 Cookie
- [ ] **Next.js Middleware**（`middleware.ts`）
  - 校验 `token` Cookie 中的 JWT（`crypto` HMAC-SHA256，不引入第三方库）
  - 有效 → 注入 `x-auth-role: admin`；无效/缺失 → 注入 `x-auth-role: viewer`
  - 所有 `/admin/*` 路径：viewer 访问直接重定向 `/login?redirect=<路径>`
- [ ] **Admin 路由组服务端鉴权布局**（`src/app/admin/layout.tsx`）
  - `/admin/*` 作为独立后台模块，拥有独立布局骨架（侧边导航 / 页头 / 内容区）
  - 在 layout 读取当前请求路径与登录态
  - 非 admin 统一跳转 `/login?redirect=<当前 admin 路径>`
- [ ] **登录页** `/login`
  - 居中卡片：邮箱或用户名 + 密码 + 登录按钮
  - 错误提示："账号或密码错误"
  - 登录成功跳回 `?redirect` 参数页面，无参数则跳 `/`
  - `redirect` 完整保留原始路径与查询参数，并完成编码 / 解码处理
- [ ] **顶部导航骨架**
  - 未登录：右上角"管理员登录"按钮
  - 已登录：显示"管理员" + "退出登录"按钮

**验收：**

- 直接访问 `/admin/model` 时跳转 `/login`
- 正确账号登录后跳回原页面，错误账号显示错误提示
- `prisma migrate status` 显示迁移已应用

---

### Phase 2 — 书籍导入 + AI 解析

**目标：** 能完整导入一本 `.txt` 书籍并触发 AI 解析

**任务清单：**

- [ ] **模型管理页** `/admin/model`
  - AI 模型配置卡（DeepSeek / 通义千问 / 豆包 / Gemini）
  - 每张卡：API Key 输入与脱敏展示、BaseURL 输入、连通性测试按钮、启用开关
  - 默认模型下拉选择
  - 外观设置（主题联动）
  - 当前阶段不实现模型调用统计、历史测试记录与账单类信息
- [ ] **书库页** `/`
  - 书籍卡片列表（仿真书脊，CSS 3D + Framer Motion）
  - Hover 抬起动画
  - 解析状态 Badge（`待解析` / `解析中` / `已完成` / `解析失败`）
  - 空状态插画 + CTA
  - `GET /api/books` 接口
- [ ] **导入向导 Modal**（4 步）
  - Step 1：文件上传（`.txt`，50MB 限制，拖拽 + 点击）
  - Step 2：AI 预填书名/作者/朝代/简介，书名识别失败回退文件名
  - Step 3：章节切分预览表格，支持手动合并/修改
  - Step 4：模型卡片选择 + 解析粒度选择 + 启动解析
- [ ] **AI 解析 Pipeline**（后端）
  - `POST /api/books/:id/analyze`：按章节并行调用选定模型
  - 解析进度写入 `Book.status` + 进度阶段字段
  - 全量人物提取（有名人物 + `TITLE_ONLY`，忽略匿名群体）
  - 分章解析 + 全局上下文注入（已识别人物列表随 Prompt 传入）
  - 每 10 章做一次跨章别名消歧
  - 置信度字段（0.0–1.0），低于 0.7 自动标记"待重点核对"
- [ ] **解析进度轮询**
  - `GET /api/books/:id/status`
  - 书库卡片实时进度条（轮询间隔 2s）
  - 进度阶段：`文本清洗 → 章节切分 → 实体提取 → 关系建模 → 完成`
  - 失败时显示错误摘要 + 重试按钮

**验收：**

- 上传《儒林外史》前 20 回 txt，章节自动切分正确率 > 90%
- 解析完成后书库卡片显示"已完成"+ 章节数 + 人物数
- 书名优先 AI 识别，识别失败时回退文件名

---

### Phase 3 — 人物图谱页

**目标：** 可视化展示解析结果，图谱流畅可交互

**任务清单：**

- [ ] **图谱数据接口**
  - `GET /api/books/:id/graph?chapter=<n>`：返回截止到第 n 章的节点+边
- [ ] **D3 Canvas 渲染**
  - 切换 SVG → Canvas 渲染（支持 1000+ 节点流畅运行）
  - 力导向布局计算移至 Web Worker
  - 节点：圆形（人物）/ 按派系着色 / 大小与影响力正相关 / DRAFT 虚线边框
  - 边：正向蓝绿 / 负向橙红 / 粗细与权重正相关
- [ ] **语义缩放（Semantic Zoom）**
  - 缩小：派系气泡聚类，不显示单节点
  - 中等：Top 80 节点
  - 放大：视口内全量节点（视口裁剪）
  - 工具栏"Top N"可调（50 / 80 / 150 / 全量）
- [ ] **图谱交互**
  - 点击节点 → 右侧人物详情面板（Glassmorphism 风格）
  - 双击节点 → 聚焦模式（无直接关联节点淡出）
  - 拖拽节点 → 坐标保存至 `visual_config`
  - 滚轮缩放 / 空白拖拽平移
  - 右键节点 → 上下文菜单（进入校对）
- [ ] **人物详情面板**
  - 姓名 / 别名 / 性别 / 状态 Badge
  - 人物小传 / 标签云 / 讽刺指数进度条
  - 生平时间轴（可点击事件跳转原文高亮）
  - 直接关系列表（可按类型过滤）
- [ ] **章节时间轴滑块**
  - 图谱底部固定，拖动 → 图谱动态增减节点（动画渐入）
  - 当前章节新增节点/边高亮闪烁
- [ ] **工具栏**
  - 筛选（关系类型 / 派系 / 状态）
  - 人物搜索高亮
  - 布局切换（力导向 / 同心圆 / 层级树）
  - 全屏模式

**验收：**

- 400 节点图谱帧率 > 30fps
- 章节滑块拖动动画流畅
- 人物详情面板数据正确

---

### Phase 4 — 校对 & 手动管理

**目标：** 完整的数据质量管控闭环

**任务清单：**

- [ ] **图谱内联校对**
  - 右键节点 → 详情面板切换编辑态
  - 可编辑：姓名、别名、籍贯、性别、标签、小传、讽刺指数
  - 状态操作：确认（DRAFT→VERIFIED）/ 拒绝（DRAFT→REJECTED）
  - 实体合并：搜索已有 Persona → 合并，关系全部重定向
  - 右键边 → 弹窗编辑关系类型 / 权重 / 描述 / 状态
- [ ] **管理审核页** `/admin/review`
  - 左侧书籍选择
  - Tab：人物草稿 / 关系草稿 / 传记事件 / 合并建议
  - 每条：确认 / 拒绝 / 编辑
  - 批量操作（全选 + 批量确认/拒绝）
  - 原文对照模式（点击草稿高亮对应原文段落）
  - 来源筛选（AI / MANUAL）
- [ ] **实体合并工具**
  - 选中两人物 → 合并 → 选主记录
  - 被合并 Persona 的 Relationship / BiographyRecord / Mention 全部重定向
- [ ] **手动人物管理**
  - 新增人物（`recordSource: MANUAL`，状态直接 VERIFIED）
  - 编辑人物任意字段
  - 删除人物（软删除，级联标记关联数据为 REJECTED，弹窗提示影响范围）
  - 手动连线（Persona A + B + 关系类型 + 章节）
  - 删除关系（软删除）
  - 手动录入传记事件
- [ ] **重解析机制**
  - 单章 / 全书重解析，可切换更强模型
  - 两次解析结果取并集，冲突标记"待仲裁"

**验收：**

- 内联校对保存后图谱立即更新
- 合并后被合并节点消失，关系线全部重定向
- 手动新增人物立即出现在图谱
- 删除人物弹窗正确提示影响范围

---

### Phase 5 — 视觉打磨

**目标：** 第一眼"一亮"，现代化、美观、有文化质感

**任务清单：**

- [ ] **书库页视觉**
  - 书脊 CSS 3D 效果完善（书脊厚度、封底阴影）
  - 书架木纹背景
  - Hover 抬起 + 阴影扩散动画精调
  - 空状态优雅插画
- [ ] **主题色板精调**
  - 亮色：米白纸张感 + 墨水蓝 + 朱砂红
  - 暗色：深宇宙黑 + 星光节点 + 氖光边
  - 切换动画 300ms 淡入淡出
  - 图谱节点/边在两种主题下对比度验收
- [ ] **图谱视觉**
  - 节点发光效果（VERIFIED 实线发光边框）
  - 边的流动动画（可选）
  - 详情面板 Glassmorphism 效果
- [ ] **全局细节**
  - 加载骨架屏（Skeleton）
  - 页面切换过渡动画
  - Toast / 通知组件统一风格
  - 响应式断点（PC 1280px+ 为主，1024px 可用）

**验收：**

- 主题切换 300ms 过渡无闪烁
- 亮/暗主题下所有文字对比度符合 WCAG AA
- 主题偏好持久化（localStorage）
- 书架书脊卡片视觉达标（截图主观评审）

---

## 十二、Brainstorm 评审结论（2026-03-23）

### 12.1 PRD 合理性结论

当前 PRD 的方向正确、信息密度高，已覆盖产品目标、核心流程、数据模型与阶段计划，适合继续推进。
下列 4 个一致性问题已完成收敛并形成统一实现口径：

1. **登录方案前后冲突（必须先定）**
   - 3.7 节写的是“单账号 + 环境变量，不入库”。
   - 10 节又新增 `users` 表并改成“查库 + Argon2id”。
   - 两种方案只能二选一，否则 API、seed、测试都会反复重写。

2. **AI Key 存储策略冲突（必须先定）**
   - 3.5 节强调环境变量配置；
   - 10 节又在 `ai_models.api_key` 落库。
   - 若选择落库，必须补充“加密/脱敏/轮换/导出限制”约束。

3. **MVP 范围偏大（建议分层）**
   - 当前 MVP 同时包含复杂图形渲染、审核系统、手动管理、登录、模型配置、动画打磨。
   - 建议拆为 M0（可用）与 M1（增强），避免首个迭代过重导致延期。

4. **准确率目标可验收性不足（建议改里程碑）**
   - “主要人物/关系 ≥95%”是方向正确，但对首版工程落地偏激进。
   - 建议先设 M0 质量门槛 + M1 提升目标，并绑定可复现评测脚本。

### 12.2 数据表设计结论

当前 schema 基础合理（Book/Chapter/Persona/Profile/Mention/Relationship/BiographyRecord 分层清晰），
能支撑图谱主流程；以下 6 项优化已落地：

1. **补齐软删除能力（高优，已完成）**
   - 已为 `Persona/Profile/Relationship/BiographyRecord/Mention` 增加 `deleted_at`（可选），统一软删除语义。

2. **关系去重约束（高优，已完成）**
   - 已为 `Relationship` 增加业务去重键：`chapterId + sourceId + targetId + type + recordSource`。

3. **默认值与 PRD 对齐（高优，已完成）**
   - 已补齐 `Persona.aliases` 的 `@default([])`，并统一 `globalTags/localTags` 默认空数组。

4. **高频分类字段约束（中优，已完成）**
   - 已将 `User.role` 枚举化；`AiModel.provider` 保持 `String` 以便后续扩展；
   - `Relationship.type` 继续保留 `String`，由应用层白名单约束，保持业务扩展性。

5. **审核查询索引（中优，已完成）**
   - 已补审核相关组合索引，覆盖 `status/recordSource/chapter` 维度及关联查询场景。

6. **解析任务追踪表（中优，部分完成）**
   - 已新增 `analysis_jobs` 表承载任务状态、重试与错误日志；
   - `chapter_analysis_runs` 作为后续可选增强项，按 M1 实际需要再引入。

### 12.3 建议优先决策（进入实现前必须确定）

1. 认证方案：`users` 表方案（已确认）
2. API Key：加密后可落库（已确认）
3. MVP 切分：拆分为 `M0（先可用）` / `M1（增强）`（已确认）

### 12.4 决策记录（ADR-lite）

**决策 1：认证采用 `users` 表方案（已确认）**

- Context：
  - 当前产品虽是单管理员起步，但已存在“viewer/admin 权限边界 + 中后台操作审计”需求；
  - PRD 中“env-only”与“users 查库”存在冲突，需要收敛唯一实现路径。
- Decision：
  - 采用 `users` 表 + `password(Argon2id)` 的登录校验方案；
  - 初始管理员通过 seed 写入，后续可在不改认证模型前提下扩展账号策略。
- Consequences：
  - 需要补齐：`/api/auth/login` 查库校验、seed 初始化、最小账号管理约束；
  - 中长期扩展（多管理员、密码轮换、审计）成本更低；
  - 相比 env-only，首版实现复杂度略有提升，但一致性更好。

**决策 2：API Key 采用“入库 + 加密存储”方案（已确认）**

- Context：
  - 模型管理页需要支持多模型 Key 在线维护、启用禁用、连通性测试；
  - 若仅依赖环境变量，将无法满足页面化管理与按模型配置的产品目标。
- Decision：
  - `ai_models.api_key` 允许存储密文，不存明文；
  - 应用层使用服务端加密密钥（如 `APP_ENCRYPTION_KEY`）进行加密/解密；
  - 前端与普通查询接口只返回脱敏值与配置状态，不返回明文。
- Consequences：
  - 需要新增安全约束：
    - 加密算法与密钥轮换策略（至少支持“新密钥重加密”流程）；
    - 日志与错误中禁止输出明文 Key；
    - 数据导出/调试接口禁止返回 `api_key` 原值；
    - “连通性测试”仅在服务端解密后调用，不回传明文。
  - 相比 env-only，开发复杂度提高，但与模型管理页能力一致。

**决策 3：交付采用 M0/M1 分层（已确认）**

- Context：
  - 当前“单一 MVP”同时覆盖数据层、鉴权、AI 解析、图谱高性能渲染、审核系统与视觉精修，风险集中；
  - 需要先交付“端到端可用”版本，再做高复杂度增强。
- Decision：
  - `M0` 目标：可完成“导入 -> 解析 -> 查看基础图谱 -> 管理员审核/修订”的主闭环；
  - `M1` 目标：在 M0 稳定后，再引入高复杂度性能与体验增强能力。
- Consequences：
  - 研发节奏更稳，验证周期更短；
  - 首版可以更快产出可测系统，降低延期风险；
  - 部分视觉/性能高级能力延后，不影响核心业务价值验证。

---

## 十三、M0 / M1 范围拆分（已确认）

### 13.1 M0（先可用，首发目标）

**必须包含：**

1. 数据层与认证基础
   - `users` 表登录体系（Argon2id + JWT + httpOnly Cookie）
   - `ai_models` 配置表与 API Key 加密存储
   - 与手动管理/审核直接相关的核心 schema 变更
2. 书籍导入与解析主流程
   - `.txt` 上传、章节切分（自动 + 手动修正）
   - 触发解析、进度展示、失败重试
3. 基础图谱展示与详情
   - 节点/边基础渲染（可先用 SVG 或简化 Canvas）
   - 节点点击详情面板、基础筛选与搜索
4. 审核与手动管理闭环
   - DRAFT 数据确认/拒绝/编辑
   - 手动新增/编辑/删除人物与关系、手动录入事件
5. 质量底线
   - 关键路径单元测试 + lint/typecheck 通过
   - API 响应结构统一

**明确不在 M0：**

- 语义缩放 + Top N + Web Worker 力导向计算
- 路径查找（Neo4j 图算法）
- 高级视觉动效与博物馆级打磨
- 模型对比解析、复杂重解析仲裁策略

### 13.2 M1（增强迭代）

1. 图谱性能增强
   - Canvas 渲染、语义缩放、视口裁剪、Worker 计算
2. 高级分析能力
   - 路径查找、跨章/跨书高级关联、重解析冲突仲裁
3. 体验与视觉增强
   - 书库 3D 细节、图谱高级动效、全局过渡与主题精修
4. 可观测与审计增强
   - 解析任务细粒度 run 追踪、更完整运维视图
