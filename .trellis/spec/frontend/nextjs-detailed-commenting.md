---
stage: mvp
---

# Next.js 超详细中文注释规范

> 适用目的：当任务目标是“全量注释补全 / 注释收尾巡检 / 新人可快速接手”时，必须使用本规范。  
> 与 `../guides/comment-guidelines.md` 的关系：该文档是**任务态强化规范**，在注释专项任务中优先级更高。

---

## 1. 适用范围与触发条件

满足任一条件即触发本规范：

- 用户明确要求“超详细注释”“全项目注释”“注释收尾巡检”
- 任务目标是交接可读性，而不是功能开发
- 评审标准强调“为什么这样做、上下游关系、误改风险”

适用文件：

- `src/app/**`（`page.tsx`、`layout.tsx`、`template.tsx`、`loading.tsx`、`error.tsx`、`not-found.tsx`、`route.ts`、`middleware.ts`、Server Action）
- `src/components/**`（Client/Server 组件）
- `src/hooks/**`、`src/lib/**`、`src/server/**`、`src/types/**`

不纳入人工改造：

- 自动生成文件（如 `next-env.d.ts`、`src/generated/**`）

---

## 2. 不可变更边界（硬约束）

注释任务中默认禁止：

- 改变业务逻辑
- 改变输入输出契约
- 改变路由语义
- 改变 Server/Client 组件属性（`"use client"` 边界）
- 引入新库、重构架构、顺手优化行为

允许操作：

- 仅补充/重写注释（中文）
- 轻微整理空行与注释排版
- 补充 JSDoc/TSDoc（不改变类型与行为）

如果发现问题：

- 只能在注释中写“风险 + 建议”，不得直接改逻辑（除非任务另有授权）

---

## 3. 输出流程（执行顺序）

必须按顺序执行：

1. 先分析文件在 Next.js 应用中的定位与职责
2. 输出可执行任务拆解（该文件要补哪些层次注释）
3. 再输出完整重注释代码（不省略）

禁止跳过分析直接写注释。

---

## 4. 注释覆盖清单（必须覆盖）

### 4.1 文件级注释

文件顶部必须说明：

- 文件定位（路由层 / 组件层 / 服务层 / 工具层）
- 核心职责与业务场景
- 上下游依赖（输入来源、输出去向）
- 执行时机、渲染方式、运行环境（浏览器 / Node.js / Edge）
- 容易误改点与维护边界

### 4.2 Next.js 语义专项

若出现以下能力，必须解释“框架行为 + 业务意义”：

- 路由约定：`app/`、`page.tsx`、`layout.tsx`、`template.tsx`、`loading.tsx`、`error.tsx`、`not-found.tsx`、`route.ts`、`middleware.ts`
- 组件边界：`"use client"`、Server Component、Client Component
- 数据获取：`fetch`、`cache`、`revalidate`、`dynamic`、`generateMetadata`、`generateStaticParams`、Server Action
- 导航参数：`params`、`searchParams`、`useRouter`、`usePathname`、`useSearchParams`、`redirect`、`notFound`
- 会话安全：Cookie、Session、Token、鉴权拦截

### 4.3 TypeScript 类型语义

对每个 `type/interface/enum/Props/State/DTO/VO/Request/Response`：

- 每个字段都要写业务含义
- 标注字段来源（后端/路由参数/用户输入/本地计算）
- 说明必填/可选原因
- 说明空值语义、默认值目的、联动关系

### 4.4 函数 / 组件 / Hook

对每个导出函数、复杂私有函数、组件、Hook、事件函数说明：

- 业务作用与链路位置
- 触发时机
- 参数来源、返回值用途
- 副作用与依赖（React 生命周期/渲染机制）
- 风险与注意事项

### 4.5 函数内部步骤注释

复杂逻辑需按“业务步骤”拆注释：

- 初始化状态
- 参数归一化
- 鉴权校验
- 发起请求
- 结果映射
- `loading/error/empty/success` 分支控制
- 跳转/刷新/回写状态

每个条件分支都要解释“为什么存在、对应哪类业务场景”。

---

## 5. 注释写作标准

所有注释必须：

- 使用简体中文
- 解释业务意图、设计原因、上下游关系
- 明确区分“业务规则”与“技术限制”
- 解释默认值、判空、异常处理的防御目的
- 对绕的写法明确说明存在理由

禁止低价值注释：

- “定义变量”“调用接口”“返回结果”这类语法复述
- 与代码字面重复、无增量信息的注释

---

## 6. 分场景强化要求

### `page.tsx`

- 解释路由对应关系、数据获取时机、渲染策略（SSR/SSG/ISR/CSR/RSC）
- 解释参数来源与空态/异常态/加载态

### `layout.tsx`

- 解释布局作用域、包裹子树、共用职责

### `route.ts`

- 解释路由路径与 HTTP 方法语义
- 解释请求参数来源、响应结构、错误处理策略

### Client Component

- 必须解释为什么需要 `"use client"`
- 哪些逻辑依赖浏览器能力
- 哪些状态驱动 UI 更新

### Server Component

- 必须解释为什么放服务端执行
- 对 SEO、首屏性能、数据安全的收益

### `generateMetadata`

- 必须解释 SEO 字段来源与动态策略

### `middleware.ts`

- 必须解释拦截链路、放行/拦截规则与安全边界

---

## 7. 批次执行与收尾巡检（推荐流程）

当任务是全项目注释时，推荐：

1. 先生成非测试源码清单（排除自动生成文件）
2. 批次执行注释补全（可按固定批次大小）
3. 每批后做语法/类型校验
4. 收尾阶段做“低注释密度文件抽检 + 关键高风险文件复核”
5. 最终执行：
   - `pnpm run lint`
   - `pnpm run type-check`
   - `pnpm test`

---

## 8. 验收标准（Definition of Done）

达到以下标准才算完成：

- 新接手开发者可快速理解“做什么 + 为什么 + 不能轻改哪里”
- Next.js 角色语义清晰（路由、渲染、缓存、参数、鉴权）
- React 状态与交互链路清晰
- 类型字段业务含义完整
- 逻辑不变、行为不变、契约不变

