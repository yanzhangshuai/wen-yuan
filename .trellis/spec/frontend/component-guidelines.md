---
stage: mvp
---

# 组件规范

> 本项目组件的编写方式。

---

## 概览

组件策略是“server-first，client-when-needed”：
- `src/app` 下的路由组件默认是 Server Components。
- 只有交互叶子组件才添加 `"use client"`。
- 可复用视觉基础组件统一放在 `src/components/ui`。

---

## 组件文件结构

`.tsx` 文件推荐顺序：
1. 按需添加客户端指令。
2. 外部依赖导入。
3. 内部模块导入（`@/...` 别名）。
4. `<ComponentName>Props` interface。
5. 常量定义。
6. 组件实现。

真实示例：
- 服务端路由组件：`src/app/page.tsx`
- 使用 hooks 的客户端组件：`src/components/ThemeToggle.tsx`
- 可复用基础组件：`src/components/ui/Button.tsx`

异步读取规则（强制）：
- 组件渲染阶段的异步调用统一使用 `use()`。
- 详细案例与边界约束见 `./react-guidelines.md`。

---

## Props 约定

- 所有返回 JSX 的组件都必须声明 `interface <ComponentName>Props`。
- 组件第一个参数必须使用该 interface 进行类型标注。
- props interface 与组件同文件 colocate。
- 包装型基础组件可按需扩展原生元素 props。

真实示例：
- 空 props interface 模式：`src/app/page.tsx` 中的 `HomePageProps`
- 原生 props 扩展：`src/components/ui/Button.tsx` 中的 `ButtonProps`
- 标准 props interface：`src/components/layout/Navbar.tsx` 中的 `NavbarProps`

校验入口：
- 通过 `pnpm lint` + 代码评审检查 props interface 约定是否满足

---

## 样式约定

- 默认使用 Tailwind utility classes。
- 根 DOM 元素 className 必须包含语义化 class token（领域导向 kebab-case）。
- 条件样式分支需保持可读，分支表达简短明确。
- 涉及颜色时必须同时覆盖 light/dark mode。

真实示例：
- 语义化根 class：`home-page`、`layout-navbar`、`ui-button`
- 导航条件样式：`src/components/layout/Navbar.tsx`
- 布局层 light/dark 配对：`src/app/layout.tsx`

校验入口：
- 通过 `pnpm lint` + 代码评审检查语义化根 className 约定是否满足

---

## 可访问性

- 图标交互控件必须提供 `aria-label`（或可见文本）。
- `button` 必须显式声明 `type`。
- 尽量使用语义化标签（`main`、`header`、`nav`、`section`、`table`），
  避免无语义容器滥用。

真实示例：
- `aria-label` + `title`：`src/components/ThemeToggle.tsx`
- 显式 `type="button"`：`src/components/ThemeToggle.tsx`
- 语义化结构：`src/app/page.tsx`、`src/components/layout/Navbar.tsx`

---

## 常见错误（避免）

- 路由文件没有真实 hooks/事件需求却添加 `"use client"`。
- 省略 `<ComponentName>Props` interface。
- 组件根节点缺少语义化 class，或使用 `container`、`wrapper` 等泛化命名。
- 在业务组件重复实现基础样式，而不是复用 `src/components/ui/*`。
- `any` / `!` / `@ts-ignore` 等类型违规——见 [shared/code-quality.md](../shared/code-quality.md)。

---

## 代码案例与原因

反例：
```tsx
export function AnalyzeButton(props: any) {
  return <button className="container">开始</button>;
}
```

正例：
```tsx
interface AnalyzeButtonProps {
  disabled?: boolean;
}

export function AnalyzeButton({ disabled = false }: AnalyzeButtonProps) {
  return (
    <button
      type="button"
      className="analyze-button ui-button rounded-md px-3 py-2"
      disabled={disabled}
    >
      开始
    </button>
  );
}
```

原因：
- 显式 props + 语义化 className 让 lint、review、重构都有稳定锚点。
- 统一组件骨架可降低 UI 行为漂移和样式重复实现。
