# 质量规范

> 本项目前端代码质量标准。

---

## 概览

前端质量主要通过以下机制保证：
- ESLint（`pnpm lint`）+ 代码评审检查清单；
- TypeScript 严格模式；
- 对改动 UI 流程进行手工场景验证；
- 测试有效性优先（关键逻辑必须有可读、可定位问题的单元测试），覆盖率作为门禁。

---

## 禁用模式

- 组件文件缺少 `<ComponentName>Props` interface。
- JSX 根 DOM 元素缺少语义化 className。
- 在整棵路由树上滥用 `"use client"`，但无真实交互需求。
- 在组件渲染期用 `useEffect + setState` 进行异步首屏拉数。
- 同一组件渲染期混用 `await` 与 `use()` 读取异步数据。
- `params` / `searchParams` 类型声明为非 Promise 形式（如 `{ id: string }` 而非 `Promise<{ id: string }>`）。
- 在 Server Component 中同步调用 `cookies()` 或 `headers()`（未 `await`）。
- 不复用 `src/components/ui/*`，重复实现基础 UI 结构。
- 在客户端 UI 组件中直接导入仅服务端模块。
- 使用 `Link` 包裹 `Button`（或 `Button` 包裹 `Link` 但未 `asChild`），产生交互元素无效嵌套。
- 直接使用浏览器本地状态（如主题、`localStorage`、`matchMedia`）渲染首帧关键属性，导致 SSR/CSR 属性不一致。

---

## 必须遵守

- props interface 命名必须明确（如 `NavbarProps`、`ThemeToggleProps`）。
- server/client 边界要明确且尽量小。
- 组件渲染期异步读取统一使用 `use()`（详见 `react-guidelines.md`）。
- Next.js 异步 API（`params`、`searchParams`、`cookies()`、`headers()`）必须 `await` 后使用；类型声明必须为 `Promise<...>`；Client 组件中改用 `use()`（详见 `nextjs-best-practices.md` 第三节）。
- 使用语义化根 className（`home-page`、`layout-navbar`、`ui-card`）。
- 图标按钮等无文本控件必须提供可访问性标签。
- 跳转型按钮统一使用 `Button asChild + Link` 组合，禁止输出 `<a><button /></a>` 结构。
- 浏览器本地状态影响 `className`、`aria-*`、`data-*` 时，必须先做 mounted 门控或提供服务端快照。
- 图谱/画布类组件中，`active`/`hover` 等纯视觉交互不得触发布局重建（remove + rebuild）或自动 `fit`；布局重排只能由数据变化、布局模式切换或显式重排操作触发。
- 会改变面板/弹层可见性的异步交互，必须等待业务结果后再收起；禁止“点击即关闭”导致失败后无上下文可重试。
- 用户可触发的失败路径（未命中、空结果、异常）必须提供可见反馈（toast 或 inline error），禁止静默失败。
- API 边界与解析边界必须有类型与校验。
- 内部导入统一使用 `@/*` 路径别名。
- 单元测试默认与源码同目录，命名使用 `*.test.ts` / `*.test.tsx`。
- 复杂业务逻辑与关键分支必须补充结构化注释，详见 `../guides/comment-guidelines.md`。
- 单元测试注释必须能说明场景目标与关键断言含义，复杂用例需标注 Arrange/Act/Assert。
- 新增或修改的前端代码、测试代码，如未按注释规范补齐，视为未完成，不得交付。

---

## 校验与测试基线

前端改动交付前至少完成：
1. 运行 `pnpm lint`。
2. 对关键改动运行 `pnpm build`（需要额外类型信心时）。
3. 为新增/变更业务逻辑补齐单元测试（同目录 `*.test.ts(x)`），覆盖 success/failure/boundary 关键分支。
4. 覆盖率硬性门禁：每次执行单元测试与 coverage 校验时，必须同时满足 Statements >= 90%、Branches >= 90%、Functions >= 90%、Lines >= 90%；任一未达标即任务未完成，不得交付（高风险模块建议 >= 95%）。
   业务组件必须纳入全局 coverage 门禁，禁止以“画布复杂”“测试夹具未完善”等理由把真实前端交互模块移出统计；排除项只能用于生成代码、测试文件、配置文件与无业务决策的基础设施层。
5. 手工验证受影响 UI 在 light/dark 主题下都正常。
6. 至少验证 1 条成功路径与 1 条失败/边界路径。
7. 对涉及 `Link` 与 `Button` 改动的页面，运行：
   `rg -n -U "<Link[^>]*>\\s*\\n\\s*<Button" src`
   确认无无效嵌套。
8. 对涉及 `next-themes` / `localStorage` 的页面，确认首帧不依赖浏览器本地值计算关键属性（必要时使用 mounted）。
9. 对涉及视口单位（`vh` / `dvh`）替换的页面，区分使用场景：
   - `min-height` 场景（可滚动布局）→ 使用 `dvh` 安全；
   - `height` / `calc(100vh - Xpx)` 场景（固定高度画布、沉浸式全屏布局）→ 保持 `vh`，不替换为 `dvh`。
   - 图谱页面 `(graph)/` 下的布局和页面属于后者，必须使用 `vh`。

说明：若当前模块缺少单测基础设施，需先补齐最小可用测试框架与 coverage 报告，再视为交付完成。

---

## 代码评审检查清单

- 客户端 hooks 是否只用于必要交互？
- 每个 JSX 组件是否声明并使用 `<ComponentName>Props`？
- 根 JSX 是否包含语义化 class 命名？
- 涉及视觉样式时是否完整覆盖 dark/light？
- 交互控件是否满足可访问性（`aria-label`、button type）？
- 是否存在 `Link > Button` / `button > a` 等交互元素嵌套导致的 hydration 风险？
- 是否有浏览器本地状态直接参与 SSR 首帧属性计算（`aria`/`className`/`data-*`）？
- 点击/悬停等轻交互是否仅更新高亮样式，而不会触发整图重建与视口跳变？
- 会改变 UI 可见性的异步操作，是否基于业务结果（而非点击事件）再推进状态？
- 失败分支是否有用户可见反馈，并保留可继续操作的输入上下文？
- API payload 与 unknown 输入是否在使用前完成校验？
- 单元测试是否真实覆盖关键分支，而非仅堆叠无断言价值用例？
- 覆盖率四项门禁（Statements/Branches/Functions/Lines）是否全部 >= 90%，并附有可复核证据？
- `vitest.config.ts` 中是否存在把真实前端业务组件移出 coverage 的策略漂移。
- 复杂实现与复杂测试是否都有足够注释支持维护和排障？

---

## 真实参考

- ESLint 配置入口：`eslint.config.mjs`
- 注释规范：`../guides/comment-guidelines.md`
- UI 示例：
  `src/components/layout/Navbar.tsx`、
  `src/components/ThemeToggle.tsx`、
  `src/components/ui/Button.tsx`

---

## 代码案例与原因

反例：
```tsx
"use client";

import { useEffect, useState } from "react";

export function UserWidget() {
  const [name, setName] = useState("");

  useEffect(() => {
    fetch("/api/user")
      .then((res) => res.json())
      .then((data) => setName(data.name));
  }, []);

  return <div className="container">{name}</div>;
}
```

正例：
```tsx
"use client";

import { use } from "react";

interface UserWidgetProps {
  userPromise: Promise<{ name: string }>;
}

export function UserWidget({ userPromise }: UserWidgetProps) {
  const user = use(userPromise);
  return <section className="user-widget">{user.name}</section>;
}
```

原因：
- 同时满足 props 类型、语义化 className、渲染期异步 `use()` 三条核心质量线。
- 统一约束后可减少 review 争议，提升跨人协作一致性。
