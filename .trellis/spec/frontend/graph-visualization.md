# 图谱可视化规范

> D3 force simulation 组件约定，基于 `src/components/graph/` 目录的既有实践。

---

## 组件边界

```
GraphView（容器，处理数据加载与 layout 模式切换）
  └─ ForceGraph（底层画布，纯渲染，不处理业务写操作）
       ├─ tree-layout.ts     — 树形布局算法
       ├─ radial-layout.ts   — 径向布局算法
       ├─ GraphContextMenu   — 右键菜单
       ├─ PersonaDetailPanel — 人物详情侧面板
       └─ GraphToolbar       — 工具栏（缩放、布局切换、搜索）
```

**ForceGraph** 是纯展示组件，通过回调把用户行为（节点点击、边点击、布局完成）回传容器，**不直接发起 API 请求**。

---

## 结构重建 vs 样式更新（核心规则）

### 结构重建（重新创建 simulation 和 DOM 节点）

**触发条件**（仅这些情况下允许完整重建）：
- 数据源变化：节点集合或边集合有增删
- 布局模式切换：force / tree / radial
- 画布尺寸变化（ResizeObserver）

**严禁**：聚焦、hover、高亮等交互态触发 `remove + rebuild`。详见 `performance-guidelines.md`。

### 样式更新（只改现有 DOM 节点属性）

交互态更新只通过 `d3.select(node).attr(...).style(...)` 修改已有 DOM，不重建任何 simulation 节点：

```ts
// 正例：聚焦时只改样式
svgRef.current
  .selectAll<SVGCircleElement, SimulationNode>(".persona-node")
  .attr("opacity", d => focusedId === null || d.id === focusedId ? 1 : 0.2);

// 反例：聚焦时重跑整个 simulation
simulation.stop();
svg.selectAll("*").remove();
rebuildGraph(nodes, edges); // ← 禁止
```

---

## D3 Simulation 参数约定

力参数集中在 `force-graph.tsx` 内部，不分散到其他文件。当前项目使用的力：

| 力 | 用途 | 关键参数 |
|----|------|---------|
| `forceManyBody` | 节点间排斥 | `strength` 约 -300 |
| `forceLink` | 边约束 | `distance` 约 120，`iterations` 约 3 |
| `forceCollide` | 防重叠 | `radius` 约 40 |
| `forceCenter` | 居中吸引 | 画布中心 |
| `forceRadial`（径向模式） | 环形分布 | 依 hop 数设置半径 |

**禁止**：在每次 React 渲染时重新创建 simulation 实例。simulation 必须存储在 `useRef`，仅在数据变化时重启。

---

## 布局算法接口约定

布局算法（`tree-layout.ts`、`radial-layout.ts`）接收节点/边快照，返回位置计划（plan），不直接操作 DOM：

```ts
// tree-layout.ts
export function buildTreeLayoutPlan(
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootId: string
): LayoutPlan;  // { nodePositions: Map<string, {x, y}> }
```

ForceGraph 消费 plan 后通过 `simulation.nodes().forEach(d => { d.fx = ...; d.fy = ...; })` 固定坐标。

---

## 事件系统约定

| 事件 | 处理位置 | 说明 |
|------|---------|------|
| 节点单击 | ForceGraph → 回调 `onNodeClick` | 容器决定是否展示详情面板 |
| 节点右键 | ForceGraph → `GraphContextMenu` | 上下文菜单操作（如删除、合并导航） |
| 边单击 | ForceGraph → 回调 `onEdgeClick` | 关系详情 |
| 画布拖拽/缩放 | ForceGraph 内部，d3-zoom 处理 | 不透传到容器 |

**D3 事件回调必须通过 `ref` 同步最新闭包值**，避免因回调 identity 变化触发 simulation 重建：

```ts
// 正例：用 ref 读取最新 focusedId
const focusedIdRef = useRef(focusedId);
useEffect(() => { focusedIdRef.current = focusedId; }, [focusedId]);

// D3 事件内读 ref，不读 state
node.on("click", (event, d) => {
  onNodeClick(d.id, focusedIdRef.current);
});
```

---

## 颜色系统

节点颜色来自主题的 `factionColors`，边颜色来自 `edgeTypeColors`，通过 `getFactionColorsForTheme(theme)` 获取，**不允许硬编码色值**。

```ts
import { getFactionColorsForTheme } from "@/theme";

const colors = getFactionColorsForTheme(currentTheme);
node.attr("fill", d => colors[d.faction] ?? colors.default);
```

---

## 禁止模式

| 禁止 | 原因 |
|------|------|
| 在 ForceGraph 内部直接发 API 请求 | 该组件只负责渲染，业务操作通过回调由容器发起 |
| `useEffect` 依赖数组混放结构重建依赖与交互依赖 | 导致交互时触发不必要的 simulation 重建 |
| 每次 hover/click 都 `new Set()` 更新高亮状态 | 触发整树重渲染；用 `prev` 引用比较优先 |
| 硬编码颜色值（`"#ff0000"`）而不用主题 token | 主题切换时颜色不跟随变化 |
| 在布局算法文件内操作 D3 DOM | 布局算法只做坐标计算，DOM 操作必须在 ForceGraph 内部 |
