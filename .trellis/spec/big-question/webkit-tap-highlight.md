# WebKit 移动端点击高亮与圆角丢失问题

> 严重等级：**Info**（视觉小问题，发现后容易修复）
> 来源：adapted from mindfold-ai marketplace-specs/big-question/webkit-tap-highlight.md

## 问题现象

在 iOS Safari / Chrome on iOS 上，按钮或可交互元素被点击时，`border-radius` 样式短暂消失，出现矩形高亮闪烁。

**表现：**
- 点击/触摸时按钮出现方角
- 蓝色或灰色矩形遮罩一闪而过
- 只在 WebKit 系移动端浏览器出现
- 桌面浏览器和 Android Chrome 不受影响

本项目的 3D 图谱看板中有大量圆角交互组件，需要特别注意。

## 根因

WebKit 浏览器对可交互元素默认应用点击高亮效果，该效果：

1. **忽略 `border-radius`**——以矩形遮罩层叠加
2. **使用系统默认颜色**——通常是半透明蓝色或灰色
3. **覆盖自定义样式**——叠在你的样式之上

## 解决方案

### 方案一（推荐）：禁用高亮 + 外层 overflow-hidden

最可靠的组合方案：

```tsx
function Button({ children, className, ...props }: ButtonProps) {
  return (
    <div className="rounded-lg overflow-hidden inline-block">
      <button
        className={cn("rounded-lg px-4 py-2", className)}
        style={{ WebkitTapHighlightColor: "transparent" }}
        {...props}
      >
        {children}
      </button>
    </div>
  );
}
```

原理：
1. `WebkitTapHighlightColor: "transparent"` 移除默认高亮
2. 外层 `div` 的 `overflow-hidden` 裁剪视觉残影
3. 两层元素保持相同的 `border-radius`

### 方案二：Tailwind 全局工具类

在 `globals.css` 中添加：

```css
@utility tap-highlight-none {
  -webkit-tap-highlight-color: transparent;
}
```

使用：

```tsx
<button className="tap-highlight-none rounded-lg px-4 py-2">
  点击
</button>
```

### 方案三：替换为自定义 active 状态

移除默认高亮后，添加自定义反馈保持可访问性：

```css
.interactive {
  -webkit-tap-highlight-color: transparent;
}

.interactive:active {
  opacity: 0.8;
  transform: scale(0.98);
  transition: transform 0.1s, opacity 0.1s;
}
```

## 浏览器支持说明

| 浏览器 | 需要处理 |
|--------|---------|
| iOS Safari | 是 |
| Chrome on iOS | 是（使用 WebKit） |
| Firefox on iOS | 是（使用 WebKit） |
| Android Chrome | 通常不需要 |
| 桌面浏览器 | 不需要 |

## 关键结论

1. **WebKit 点击高亮忽略 border-radius**——这是浏览器行为，不是 CSS bug
2. **圆角交互元素必须设置 `WebkitTapHighlightColor: "transparent"`**
3. **配合外层 `overflow-hidden` 包裹**更可靠
4. **建议在 UI 基础组件中统一处理**，而不是在业务组件中逐个添加
5. **在真机 iOS 设备上测试**——模拟器和浏览器开发工具可能无法复现
