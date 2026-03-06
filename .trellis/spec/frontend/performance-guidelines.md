# 前端性能规范

> 在保持可读性的前提下，控制渲染成本与交互延迟。

---

## 必须遵守

- 渲染期异步读取统一使用 `use()` + Suspense，避免 `useEffect` 首屏拉数。
- 列表渲染必须使用稳定 `key`，禁止索引 `key`（除静态不可变列表）。
- 避免在 render 中创建高成本对象/函数并传递给深层子组件。
- 全局状态读取优先 selector，避免读取整棵 store。

---

## 代码案例

反例：
```tsx
"use client";

export function List({ items }: { items: Array<{ id: string; name: string }> }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item.name}</li>
      ))}
    </ul>
  );
}
```

正例：
```tsx
"use client";

export function List({ items }: { items: Array<{ id: string; name: string }> }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

---

## 原因

- 稳定 key 可避免不必要重建节点和状态错位。
- 渲染期异步统一 `use()` 可减少闪烁与竞态。
- selector 粒度订阅可降低无关 rerender。

---

## 验收清单

- [ ] 列表 key 是否稳定且可追踪
- [ ] 首屏数据是否用 `use()`/Suspense 处理
- [ ] 是否存在 render 内重复创建重对象
- [ ] store 读取是否为最小 selector 粒度
