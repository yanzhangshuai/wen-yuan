---
stage: growth
---

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
- 不复用 `src/components/ui/*`，重复实现基础 UI 结构。
- 在客户端 UI 组件中直接导入仅服务端模块。

---

## 必须遵守

- props interface 命名必须明确（如 `NavbarProps`、`ThemeToggleProps`）。
- server/client 边界要明确且尽量小。
- 组件渲染期异步读取统一使用 `use()`（详见 `react-guidelines.md`）。
- 使用语义化根 className（`home-page`、`layout-navbar`、`ui-card`）。
- 图标按钮等无文本控件必须提供可访问性标签。
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
4. 覆盖率达到成熟团队基线：Line >= 80%，Branch >= 70%（高风险模块建议 >= 90%）。
5. 手工验证受影响 UI 在 light/dark 主题下都正常。
6. 至少验证 1 条成功路径与 1 条失败/边界路径。

说明：若当前模块缺少单测基础设施，需先补齐最小可用测试框架与 coverage 报告，再视为交付完成。

---

## 代码评审检查清单

- 客户端 hooks 是否只用于必要交互？
- 每个 JSX 组件是否声明并使用 `<ComponentName>Props`？
- 根 JSX 是否包含语义化 class 命名？
- 涉及视觉样式时是否完整覆盖 dark/light？
- 交互控件是否满足可访问性（`aria-label`、button type）？
- API payload 与 unknown 输入是否在使用前完成校验？
- 单元测试是否真实覆盖关键分支，而非仅堆叠无断言价值用例？
- 覆盖率是否达到基线，并附有可复核证据？
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
