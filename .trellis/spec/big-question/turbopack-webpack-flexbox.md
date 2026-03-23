# Turbopack vs Webpack Flexbox 布局差异

> 严重等级：**Warning**（开发环境正常，生产环境布局崩溃）
> 来源：adapted from mindfold-ai marketplace-specs/big-question/turbopack-webpack-flexbox.md

## 问题现象

布局在开发模式（Turbopack）正常，生产构建（Webpack）中崩溃。

**典型表现：**
- 组件在开发时高度正常，生产环境中塌陷或溢出
- 可滚动区域在开发正常，生产失效
- 嵌套 flex 布局在两个环境中表现不一致

本项目的 3D 图谱看板（全屏布局 + 侧边面板 + 时间轴）特别容易触发此问题。

## 根因

Turbopack（Next.js 开发模式）和 Webpack（生产构建）在处理 CSS 时存在细微差异：

1. **Turbopack 对显式 flexbox 属性更严格**
2. **Webpack 可能自动推断某些 flex 子项行为**，Turbopack 不会
3. 差异来自 CSS 编译方式，而非 CSS 规范本身

核心：当 flex 容器为 `flex-direction: column`，子项需要撑满剩余空间时，若未显式设置 `items-stretch`，两个打包器的行为会有差异。

## 解决方案

### 方案一（推荐）：显式设置 `items-stretch`

```tsx
// 问题写法（行为不一致）
<div className="flex flex-col h-screen">
  <main className="flex-1 flex">
    {/* children */}
  </main>
</div>

// 正确写法（两个环境一致）
<div className="flex flex-col h-screen items-stretch">
  <main className="flex-1 flex items-stretch">
    {/* children */}
  </main>
</div>
```

### 方案二：可滚动 flex 子项必须设置 `min-h-0`

flex 子项默认 `min-height: auto`，会阻止 overflow 生效。

```tsx
<div className="flex flex-col h-full items-stretch">
  <div className="flex-shrink-0">固定头部</div>
  <div className="flex-1 min-h-0 overflow-auto">
    {/* 可滚动内容 */}
  </div>
</div>
```

### 完整示例：图谱看板布局

```tsx
// 全屏图谱看板，包含工具栏 + 画布 + 侧边面板
function GraphDashboard() {
  return (
    <div className="flex flex-col h-screen items-stretch">
      {/* 顶部工具栏，固定高度 */}
      <nav className="flex-shrink-0 h-14 border-b">
        <GraphToolbar />
      </nav>

      {/* 主区域：画布 + 侧边面板 */}
      <div className="flex-1 flex items-stretch min-h-0">
        {/* 3D 画布 */}
        <main className="flex-1 min-w-0 relative">
          <ForceGraph3D />
        </main>

        {/* 人物详情侧边面板（可滚动） */}
        <aside className="w-80 flex-shrink-0 border-l overflow-auto">
          <CharacterDetailPanel />
        </aside>
      </div>

      {/* 底部时间轴 */}
      <div className="flex-shrink-0 h-16 border-t">
        <TimelineSlider />
      </div>
    </div>
  );
}
```

### 布局职责分工

| 职责 | 谁负责 |
|------|--------|
| 定义 flex 容器（`flex`、`flex-col`） | 父元素 |
| 设置对齐（`items-stretch`） | 父元素 |
| 控制总体尺寸（`h-screen`、`w-full`） | 父元素 |
| 定义自身 flex 行为（`flex-1`、`flex-shrink-0`） | 子元素 |
| 处理内部溢出（`overflow-auto`、`overflow-hidden`） | 子元素 |
| 设置尺寸约束（`min-h-0`、`max-w-full`） | 子元素 |

## 关键结论

1. **始终在本地测试生产构建**：`pnpm build && pnpm start`
2. **显式写出 flexbox 属性**，不要依赖浏览器默认值或打包器行为
3. **`items-stretch` 要显式声明**，不要假设它是默认值
4. **可滚动的 flex 子项必须加 `min-h-0`**（以及 `min-w-0` 用于水平方向）
5. **按父/子职责分工**统一管理布局规则，避免混乱
