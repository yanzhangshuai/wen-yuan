# 状态管理

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/frontend/state-management.md
> 镜像文档：.trellis/spec/frontend/state-management.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/state-management.md
> Mirror: .trellis/spec/frontend/state-management.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> 本项目中的状态管理方式。

---

## 概览

状态设计刻意保持轻量：
- 服务端状态在 Server Components 中解析。
- 本地 UI 状态在客户端组件中通过 React hooks 处理。
- 变更状态通过 `useActionState` 处理 Server Actions。
- 客户端全局状态的标准方案：确实需要全局 store 时使用 **Zustand**。

---

## 状态分类

### 本地 UI 状态

- `src/components/ThemeToggle.tsx` 中的 `mounted` 标记
- `src/app/(admin)/analyze/AnalyzeButton.tsx` 中来自 `useActionState` 的
  pending/反馈状态

### 服务端状态

- `src/app/(admin)/analyze/page.tsx` 中加载的章节列表
- `src/app/page.tsx` 中渲染的首页静态内容

### 主题状态

- 由 `src/providers/ThemeProvider.tsx` 全局提供
- 在 `src/components/ThemeToggle.tsx` 中通过 `useTheme` 消费

---

## 何时使用全局状态

仅当以下条件全部满足时，才引入专用全局状态：
1. 被多个相距较远的客户端组件共享。
2. 无法通过 props/context 干净地传递和管理。
3. 更新频率足够高，值得引入中心化 store 的复杂度。

若需要全局状态，默认使用 Zustand。

---

## Store 标准（Zustand）

### 为什么选 Zustand

- API 面小、模板代码少、对 React 团队可读性好。
- 细粒度 selector 订阅可避免不必要的重渲染。
- 在仅用于客户端全局 UI 状态时，与 Next.js App Router 配合良好。

### 依赖

- 首次引入 store 时安装：`pnpm add zustand`。
- 使用项目模板：`.trellis/spec/frontend/zustand-store-template.md`。

### 作用域规则

- Zustand store **仅用于客户端全局 UI/应用状态**。
- 不要用 Zustand 替代服务端数据获取或缓存职责。
- 服务端拥有的数据应优先留在 Server Components / Server Actions。

### Store 结构规则

- 优先使用按功能域拆分的 store，而不是一个巨型 app store。
- store 状态应保持扁平、显式；避免深层嵌套的可变结构。
- action 命名应体现领域意图（`setFilters`、`openPanel`、
  `resetSelection`），并保持副作用可预测。
- 导出类型化 selector/hooks，减少重渲染并提升可读性。

### 禁止模式

- 将原始服务端实体列表长期放在 Zustand 中当全局缓存。
- 在零散 UI handler 中直接触发网络/数据库副作用，缺少明确 action 边界。
- 组件读取整个 store 对象，而不是按需读取小 selector。

---

## 服务端状态规则

- 能在服务端路由/页面读取的，尽量在服务端读取。
- 变更通过 Server Actions 或 API routes 执行。
- 变更成功后重验证相关路径（`revalidatePath`）。

示例：
- `src/server/actions/analysis.ts` 中的 `startChapterAnalysis` 会调用
  `revalidatePath("/analyze")`。

---

## 常见错误（避免）

- 无必要地将服务端数据镜像到本地状态。
- 将全局 store 用于单页局部交互。
- 长时 action 状态缺少 loading/error 展示。
- 用单体大 store 承载互不相关的功能域。
