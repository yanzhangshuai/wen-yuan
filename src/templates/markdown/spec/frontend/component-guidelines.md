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
- 共享 layout 中的 `max-width` / `padding` 约束必须对沉浸式页面（图谱、阅读器、全屏画布）提供显式逃生口；不要假设子页面写 `w-full` 就能突破父容器限制。
- 主题化场景视觉（如星空图谱、博物馆首页）必须挂在语义化页面 class 上做局部覆盖，不要为修单一路由而全局扭动整个主题 token。

### 壳层导航路由契约

- 必须区分“品牌 Logo 返回主站”和“后台概览入口”两个语义；即使都显示在后台头部，也不能默认共用同一个 href。
- 少量只服务于单个壳层组件的固定路由值，优先直接写在该组件内；不要为了 2 到 3 个字符串额外创建全局路由文件，也不要再包一层局部常量。
- `redirect` 登录回跳链接如果只在单个壳层用到 1 到 2 次，优先就近直接拼接；只有出现真实复用或复杂分支时，才考虑抽 helper。

反例（禁止）：
```tsx
// routes.ts
export const VIEWER_HOME_HREF = "/";
export const ADMIN_HOME_HREF = "/admin";
export const LOGIN_HREF = "/login";

// ViewerHeader.tsx
function buildLoginRedirectHref(targetPath: string) {
  return `/login?redirect=${encodeURIComponent(targetPath)}`;
}
```

正例（必须）：
```tsx
// AdminHeader.tsx
<Link href="/" aria-label="返回主站">文淵</Link>
router.push("/login");

// ViewerHeader.tsx
<Link href={isAdmin ? "/admin" : `/login?redirect=${encodeURIComponent("/admin")}`}>
  Admin
</Link>
```

原因：
- 导航错误往往不是组件内部逻辑问题，而是“壳层语义”和“路由实现”在不同文件里各自猜测的结果。
- 对这种只在单个壳层出现的少量固定路径，直接写死更接近产品语义，也更利于阅读时一眼确认真实去向。
- 过早抽成全局文件、局部常量或 helper，会增加跳转阅读成本，却不一定带来实际复用收益。
- 这类契约适合被组件测试直接锁定，避免“文案改了，目标路由却悄悄漂移”。

真实示例：
- 语义化根 class：`home-page`、`layout-navbar`、`ui-button`
- 导航条件样式：`src/components/layout/Navbar.tsx`
- 布局层 light/dark 配对：`src/app/layout.tsx`

校验入口：
- 通过 `pnpm lint` + 代码评审检查语义化根 className 约定是否满足

---

### 共享布局与沉浸式页面

场景：同一个路由组既承载常规内容页，也承载沉浸式大画布页。

反例（禁止）：
```tsx
// layout.tsx
<main className="mx-auto w-full max-w-[1440px]">{children}</main>

// graph page
<section className="w-full">{/* 这里的 w-full 无法突破父级 max-width */}</section>
```

正例（必须）：
```tsx
const isImmersiveRoute = /^\/books\/[^/]+\/graph\/?$/.test(currentPath);

<main
  className={
    isImmersiveRoute
      ? "viewer-layout-main w-full"
      : "viewer-layout-main mx-auto w-full max-w-[1440px]"
  }
>
  {children}
</main>
```

配套要求：
- 沉浸式页面自身必须补语义化根 class（如 `graph-page-immersive`、`graph-view-immersive`）。
- 主题样式优先挂在这些 class 上，避免把首页、登录页、图谱页的视觉需求混成同一组全局 token。

原因：
- 父级 `max-width` 是布局约束，子级 `w-full` 只能填满“被限制后的宽度”，不能反向突破。
- 在共享 layout 显式识别沉浸式路由，能从结构上避免“页面明明要求全宽，却一直像没生效”的反复排障。
- 语义化场景 class 能让主题覆盖保持局部、可审查、可回归验证。

---

## 可访问性

- 图标交互控件必须提供 `aria-label`（或可见文本）。
- `button` 必须显式声明 `type`。
- 尽量使用语义化标签（`main`、`header`、`nav`、`section`、`table`），
  避免无语义容器滥用。
- 禁止交互元素无效嵌套（例如 `<a><button /></a>`、`<button><a /></button>`），
  该模式会触发浏览器 DOM 重排并导致 React hydration 失配。

### Link 与 Button 组合规则（Hydration 安全）

场景：需要“跳转行为 + 按钮样式”时。

反例（禁止）：
```tsx
<Link href="/admin/books">
  <Button>进入书库</Button>
</Link>
```

正例（必须）：
```tsx
<Button asChild>
  <Link href="/admin/books">进入书库</Link>
</Button>
```

原因：
- `Link` 最终渲染为 `<a>`，直接包裹 `<button>` 属于无效 HTML 嵌套。
- 浏览器会在解析期修正 DOM，导致 SSR 输出与客户端首帧树不一致。
- 在 Next.js App Router 中，这类问题常表现为 hydration error，并把报错栈定位到后续兄弟节点（例如 layout 的 `<main>`），增加排障成本。

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
