---
stage: mvp
---

# 前端性能规范

> 在保持可读性的前提下，控制渲染成本与交互延迟。

---

## 必须遵守

- 渲染期异步读取统一使用 `use()` + Suspense，避免 `useEffect` 首屏拉数。
- 列表渲染必须使用稳定 `key`，禁止索引 `key`（除静态不可变列表）。
- 避免在 render 中创建高成本对象/函数并传递给深层子组件。
- 全局状态读取优先 selector，避免读取整棵 store。
- D3/canvas 等命令式渲染必须区分“结构重建”和“样式更新”：
  - 结构重建仅由数据、尺寸、布局模式变化触发；
  - 聚焦/高亮/hover 等交互态仅更新现有实例样式，禁止整图 `remove + rebuild`。
- 作为 effect 依赖的派生数组/集合（如 `filteredNodes`、`filteredEdges`）必须 `useMemo` 稳定引用。
- 命令式库事件回调（D3 事件、第三方实例回调）必须通过 ref 同步，避免因回调 identity 变化触发重建。
- 高频交互（画布点击、hover 清空）禁止 no-op 状态写入：
  - `Set`/`Map`/对象状态在“语义未变化”时返回 `prev`；
  - 不得每次都 `new Set()`/`{ ...prev }` 导致整树重渲染。

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

## 案例 2：图谱交互防闪动（D3）

反例：
```tsx
useEffect(() => {
  const svg = select(svgRef.current!);
  svg.selectAll("*").remove();
  renderAllNodesAndEdges();
}, [filteredNodes, filteredEdges, focusedNodeId, highlightPathIds, onNodeClick]);
```

正例：
```tsx
const { filteredNodes, filteredEdges } = useMemo(() => {
  const nextNodes = snapshot.nodes.filter(matchFilter);
  const nextEdges = snapshot.edges.filter(matchEdgeFilter);
  return { filteredNodes: nextNodes, filteredEdges: nextEdges };
}, [snapshot, filter]);

useEffect(() => {
  renderGraphStructure(filteredNodes, filteredEdges);
}, [filteredNodes, filteredEdges, dimensions, layoutMode]);

useEffect(() => {
  applyGraphEmphasis({ focusedNodeId, highlightPathIds });
}, [focusedNodeId, highlightPathIds]);
```

原因：
- 把“结构层”与“交互层”解耦，可避免高频交互导致整图闪烁与重新布局。
- 稳定依赖引用可避免 effect 误触发，降低重建频率。

## 案例 3：避免 no-op Set 写入

反例：
```tsx
function handleBackgroundClick() {
  setHighlightPathIds(new Set());
}
```

正例：
```tsx
function handleBackgroundClick() {
  setHighlightPathIds(prev => prev.size === 0 ? prev : new Set());
}
```

原因：
- React 会按引用判断状态变化，no-op 写入会放大高频交互成本。
- 在图谱/画布场景中，这类额外 rerender 容易触发可见闪动。

---

## 原因

- 稳定 key 可避免不必要重建节点和状态错位。
- 渲染期异步统一 `use()` 可减少闪烁与竞态。
- selector 粒度订阅可降低无关 rerender。
- 命令式渲染（D3/canvas）若与 React 状态边界不清晰，会造成“状态小变化 -> 全量重绘”的性能雪崩。

---

## 验收清单

- [ ] 列表 key 是否稳定且可追踪
- [ ] 首屏数据是否用 `use()`/Suspense 处理
- [ ] 是否存在 render 内重复创建重对象
- [ ] store 读取是否为最小 selector 粒度
- [ ] D3/canvas 是否拆分“结构重建 effect”与“样式更新 effect”
- [ ] 结构重建依赖是否只包含数据/尺寸/布局，不包含 hover/聚焦/回调 identity
- [ ] 高频交互里是否避免 no-op 的 `Set`/对象状态写入
