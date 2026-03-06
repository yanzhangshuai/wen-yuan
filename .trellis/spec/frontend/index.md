# 前端开发规范

> 本仓库的前端开发实践规则。

---

## 概览

当前前端基于 Next.js App Router、React 19 和 Tailwind CSS v4。
已实现的页面范围较小（布局、导航、主题切换、UI 基础组件），因此规范重点是
一致性和可读性，而不是过度抽象。

新增或修改前端代码时，请把本目录文档当作可执行规范使用。

---

## 规范索引

| 指南 | 说明 | 状态 |
|-------|-------------|--------|
| [目录结构](./directory-structure.md) | 模块组织与文件布局 | 已就绪 |
| [React 规范](./react-guidelines.md) | 组件异步调用 `use()` 统一规范 | 已就绪 |
| [组件规范](./component-guidelines.md) | 组件模式、props、组合方式 | 已就绪 |
| [Hook 规范](./hook-guidelines.md) | 自定义 hooks 与数据交互模式 | 已就绪 |
| [状态管理](./state-management.md) | 本地状态、context 状态、服务端状态 | 已就绪 |
| [Zustand Store 模板](./zustand-store-template.md) | Zustand store 目录、命名、selector、action 模板 | 已就绪 |
| [性能规范](./performance-guidelines.md) | 渲染成本、列表性能、状态订阅规范 | 已就绪 |
| [质量规范](./quality-guidelines.md) | 代码标准与禁用模式 | 已就绪 |
| [类型安全](./type-safety.md) | 类型模式与校验规则 | 已就绪 |

---

## 适用范围

- 路由层与路由样式：`src/app`
- 可复用组件与基础组件：`src/components`
- 全局客户端 providers：`src/providers`
- 前端可安全复用的共享类型：`src/types`

仅服务端实现规范见 `.trellis/spec/backend`。

---

## 规范质量要求

所有前端规范文档需满足“具体规则 + 代码示例 + 原因说明”。
统一标准见：`../meta/spec-quality-standard.md`。

代码示例：
```tsx
// 反例：渲染期异步读取 + useEffect 拉数
useEffect(() => {
  fetch("/api/user").then(...);
}, []);

// 正例：渲染期异步统一使用 use()
const user = use(userPromise);
```

原因：
- 索引层先给统一示例，可让读者在进入细分文档前先对齐核心风格。

---

**语言约定**：说明性内容使用中文；技术名词与代码标识保持英文。
