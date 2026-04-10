"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drag, type D3DragEvent } from "d3-drag";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Simulation
} from "d3-force";
import { select } from "d3-selection";
import { symbol, symbolCircle } from "d3-shape";
import "d3-transition";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from "d3-zoom";

import type {
  GraphEdge,
  GraphFilter,
  GraphLayoutMode,
  GraphNode,
  GraphSnapshot,
  SimulationEdge,
  SimulationNode
} from "@/types/graph";
import { getFactionColorsForTheme } from "@/theme";
import { buildTreeLayoutPlan } from "@/components/graph/tree-layout";
import { buildRadialHopPlan } from "@/components/graph/radial-layout";

/**
 * =============================================================================
 * 文件定位（图谱渲染核心）
 * -----------------------------------------------------------------------------
 * 文件角色：`components/graph` 子系统中的底层画布组件。
 * 组件类型：Client Component（通过 `"use client"` 声明）。
 *
 * 在 Next.js 应用中的职责：
 * 1) 接收上层已经准备好的图谱快照（节点+边）并进行可视化；
 * 2) 使用 D3 进行力导向布局、缩放拖拽、节点/边交互；
 * 3) 通过回调把用户行为回传给容器组件（不直接处理业务写操作）。
 *
 * 为什么必须放在客户端：
 * - 依赖浏览器 DOM 与 SVG 实时测量（ResizeObserver、鼠标事件、动画）；
 * - 依赖 D3 simulation 的持续 tick（只能在浏览器运行）；
 * - 高交互频率，不适合在服务端渲染中执行。
 *
 * 上下游关系：
 * - 上游：`GraphView` 负责提供 `snapshot/filter/layoutMode` 等状态；
 * - 下游：无业务子组件，直接操作 SVG；
 * - 输出：通过 `onNodeClick/onEdgeHover/...` 将交互信号交给上层业务流程。
 *
 * 维护约束：
 * - 该组件只负责“图形渲染与交互桥接”，不直接发请求、不直接改业务数据；
 * - 不要在这里引入书籍/鉴权等业务判断，避免把渲染层与领域层耦合。
 * =============================================================================
 */

/* ------------------------------------------------
   Constants
   ------------------------------------------------ */
/** 节点最小半径，避免低影响力人物不可见。 */
const MIN_NODE_RADIUS = 8;
/** 节点最大半径，避免高影响力人物过大遮挡其他节点。 */
const MAX_NODE_RADIUS = 32;
/** 边的默认透明度，平衡信息密度与视觉噪声。 */
const EDGE_OPACITY_BASE = 0.6;
/** 聚焦/高亮模式下非目标元素的降权透明度。 */
const FOCUS_DIM_OPACITY = 0.1;
/** 路径高亮边颜色（由主题 token 驱动，自动适配明暗主题）。 */
const PATH_EDGE_HIGHLIGHT_COLOR = "var(--color-graph-highlight)";
/** 关系方向箭头 marker（默认隐藏，仅在 hover/路径高亮显示）。 */
const EDGE_ARROW_MARKER_URL = "url(#arrowhead)";
/** 节点填充/光晕兜底色（当派系色不可用时使用）。 */
const NODE_FILL_FALLBACK_COLOR = "var(--color-graph-node)";
/** 节点高亮混合色（主题自适配）。 */
const NODE_HIGHLIGHT_MIX_COLOR = "var(--color-graph-node-hover)";
/** 节点高亮混色比例：提高可辨识度，同时保持与原色一致。 */
const NODE_HIGHLIGHT_BASE_WEIGHT = 82;
const NODE_HIGHLIGHT_ACCENT_WEIGHT = 18;
/** 交互态缩放：hover 轻微放大，active/focused 再略高一档。 */
const NODE_HOVER_SCALE = 1.1;
const NODE_ACTIVE_SCALE = 1.2;
/** tree 布局中“非树节点泳道”底色（主题自适配）。 */
const TREE_LANE_FILL_COLOR = "color-mix(in oklab, var(--color-graph-bg) 80%, var(--foreground) 20%)";
/** tree 布局中“非树节点泳道”边框色（主题自适配）。 */
const TREE_LANE_STROKE_COLOR = "color-mix(in oklab, var(--foreground) 55%, transparent 45%)";
/** 同心圆布局外圈半径占比（相对画布短边）。 */
const RADIAL_OUTER_RADIUS_RATIO = 0.44;
/** 同心圆布局最小外圈半径，避免小屏时圈层过度压缩。 */
const RADIAL_OUTER_RADIUS_MIN = 160;

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface ForceGraphProps {
  /**
   * 图谱快照（上游服务端或客户端请求得到的最终数据）。
   * 业务含义：这是当前章节切片下“可被渲染”的完整节点与边集合。
   */
  snapshot             : GraphSnapshot;
  /**
   * 当前主题名（来自主题系统），用于派系颜色映射。
   * 可为空：首次 hydration 前主题尚未解析时允许兜底。
   */
  theme                : string | undefined;
  /**
   * 章节上限（当前版本未直接在本组件使用，保留接口稳定性）。
   * 这是对外契约，不是技术限制；删除会影响上游调用一致性。
   */
  chapterCap?          : number;
  /**
   * 图谱筛选条件（关系类型、状态、关键词等）。
   * 若为空表示展示 snapshot 全量数据。
   */
  filter?              : GraphFilter;
  /**
   * 布局模式：
   * - `force`：经典力导向；
   * - `radial`：以选中节点为中心，按最短路径跳数分圈；
   * - `tree`：分量分层层级树。
   */
  layoutMode?          : GraphLayoutMode;
  /**
   * 当前聚焦节点 ID（用于“只突出目标及其邻居”）。
   * 为 `null/undefined` 表示不启用聚焦降噪。
   */
  focusedNodeId?       : string | null;
  /**
   * 当前激活节点 ID（通常来自单击选中）。
   * 与 `focusedNodeId` 的区别：仅强调该节点本身，不触发邻居降噪。
   */
  activeNodeId?        : string | null;
  /** 节点单击回调：用于打开人物详情等业务动作。 */
  onNodeClick?         : (node: GraphNode) => void;
  /** 节点双击回调：用于切换聚焦。 */
  onNodeDoubleClick?   : (node: GraphNode) => void;
  /** 节点右键回调：用于弹出上下文菜单，附带屏幕坐标。 */
  onNodeRightClick?    : (node: GraphNode, position: { x: number; y: number }) => void;
  /** 边 hover 回调：用于在外层显示关系信息浮层。 */
  onEdgeHover?         : (edge: GraphEdge | null) => void;
  /** 背景点击回调：用于关闭面板、重置临时状态。 */
  onBackgroundClick?   : () => void;
  /**
   * 最短路径高亮节点 ID 集合。
   * 传入时将覆盖普通显示优先级（用于“路径查找结果强调”）。
   */
  highlightPathIds?    : Set<string>;
  /**
   * 最短路径高亮边 ID 集合。
   * 优先使用边 ID 精确高亮，避免仅按“节点都在路径上”导致误高亮。
   */
  highlightPathEdgeIds?: Set<string>;
  /**
   * 路径查询成功后的自增版本号。
   * 用于触发“同一条路径重复查询”时的再次自动适配缩放。
   */
  pathAutoFitVersion?  : number;
  /**
   * 节点拖拽结束回调（FG-04 布局持久化）。
   * 接收当前所有可见节点的最新坐标，调用方负责防抖后保存到后端。
   */
  onNodeDragEnd?       : (positions: Array<{ id: string; x: number; y: number }>) => void;
  /**
   * 关系类型到颜色的映射表（由 GraphView 计算并传入）。
   * key = 边的 `type` 字段；value = 对应主题颜色字符串。
   * 未传入时退化到原有情感极性着色逻辑，保持向后兼容。
   */
  edgeTypeColorMap?    : ReadonlyMap<string, string>;
}

/* ------------------------------------------------
   Helpers
   ------------------------------------------------ */
/**
 * 根据影响力计算节点半径。
 * 设计原因：把“关系密度/重要性”映射为视觉大小，帮助用户快速识别关键人物。
 */
function nodeRadius(influence: number, maxInfluence: number): number {
  // 防御：当列表为空或最大值异常时回落到最小半径，避免 NaN 导致 SVG 渲染失败。
  if (maxInfluence <= 0) return MIN_NODE_RADIUS;

  // 归一化到 [0,1] 再线性映射到半径区间，保证视觉比例稳定。
  const t = Math.min(influence / maxInfluence, 1);
  return MIN_NODE_RADIUS + t * (MAX_NODE_RADIUS - MIN_NODE_RADIUS);
}

/**
 * 根据节点类型生成 SVG path。
 * 业务意图：未来可以通过形状区分人物/地点/组织等实体类型。
 */
function nodePath(type: string, r: number): string {
  if (type === "LOCATION") {
    // 地点：菱形，强调“场所”不是“角色”。
    return `M0,${-r} L${r},0 L0,${r} L${-r},0 Z`;
  }

  if (type === "ORGANIZATION") {
    // 组织：六边形，避免与人物圆形混淆。
    const a = r;
    const pts = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      return `${a * Math.cos(angle)},${a * Math.sin(angle)}`;
    });
    return `M${pts.join("L")}Z`;
  }

  // 默认（人物）：圆形。
  return symbol().type(symbolCircle).size(Math.PI * r * r)() ?? "";
}

/**
 * 关系类型优先的边颜色解析。
 * 优先从 `edgeTypeColorMap` 按关系类型查找；类型未命中时按情感极性兜底，
 * 确保新类型出现时不会显示无样式边，也不破坏已定义类型的视觉一致性。
 *
 * @param type         - 边的关系类型字符串（如"父子"、"君臣"）
 * @param sentiment    - 边的情感极性（positive/negative/neutral）
 * @param typeColorMap - 类型到颜色的映射表（来自 ForceGraph prop，随主题变化）
 */
function resolveEdgeColor(
  type      : string,
  sentiment : string,
  typeColorMap: ReadonlyMap<string, string>
): string {
  const fromMap = typeColorMap.get(type);
  if (fromMap) return fromMap;
  // 情感极性兜底：无类型映射时使用主题自适配的语义颜色变量。
  if (sentiment === "positive") return "var(--color-graph-edge-positive)";
  if (sentiment === "negative") return "var(--color-graph-edge-negative)";
  return "var(--muted-foreground)";
}

/** 边基础线宽（常态）。 */
function edgeBaseWidth(weight: number): number {
  return Math.max(1, Math.min(weight * 1.5, 6));
}

/** 边强调线宽（路径高亮）。 */
function edgeEmphasisWidth(weight: number): number {
  return Math.max(3, Math.min(weight * 2 + 3, 11));
}

/** 节点常态描边色。 */
function nodeBaseStrokeColor(status: GraphNode["status"]): string {
  if (status === "DRAFT") return "var(--color-graph-draft)";
  if (status === "VERIFIED") return "var(--color-graph-verified-glow)";
  return "transparent";
}

/** 节点常态描边宽度。 */
function nodeBaseStrokeWidth(status: GraphNode["status"]): number {
  return status === "DRAFT" ? 2 : 1.5;
}

/** 节点常态描边虚线。 */
function nodeBaseStrokeDasharray(): string {
  // 去掉 DRAFT 虚线，避免在缩放/抗锯齿下出现“梯形碎影”。
  return "none";
}

/** 节点派系色：用于节点填充与光晕色的一致性。 */
function nodeFactionColor(
  node: Pick<GraphNode, "factionIndex">,
  factionColors: readonly string[]
): string | null {
  if (factionColors.length === 0) {
    return null;
  }
  const normalizedIndex = ((node.factionIndex % factionColors.length) + factionColors.length) % factionColors.length;
  return factionColors[normalizedIndex] ?? null;
}

/** 节点常态填充色。 */
function nodeBaseFillColor(
  node: Pick<GraphNode, "factionIndex">,
  factionColors: readonly string[]
): string {
  return nodeFactionColor(node, factionColors) ?? NODE_FILL_FALLBACK_COLOR;
}

/** 节点高亮填充色：在保留原色的前提下，轻微增强可辨识度。 */
function nodeHighlightFillColor(
  node: Pick<GraphNode, "factionIndex">,
  factionColors: readonly string[]
): string {
  const baseColor = nodeBaseFillColor(node, factionColors);
  return `color-mix(in oklab, ${baseColor} ${NODE_HIGHLIGHT_BASE_WEIGHT}%, ${NODE_HIGHLIGHT_MIX_COLOR} ${NODE_HIGHLIGHT_ACCENT_WEIGHT}%)`;
}

/** 节点缩放变换（交互高亮用）。 */
function nodeScaleTransform(scale: number): string {
  return `scale(${scale})`;
}

/**
 * 判断当前边是否属于“路径高亮边”。
 * 优先使用显式边集合；当未提供边集合时回退到旧策略（两端节点都在路径节点集合）。
 */
function isPathEdge(
  edge: SimulationEdge,
  highlightPathNodeIds: Set<string> | undefined,
  highlightPathEdgeIds: Set<string> | undefined
): boolean {
  if (highlightPathEdgeIds && highlightPathEdgeIds.size > 0) {
    return highlightPathEdgeIds.has(edge.id);
  }

  if (highlightPathNodeIds && highlightPathNodeIds.size > 0) {
    return highlightPathNodeIds.has(edge.source.id) && highlightPathNodeIds.has(edge.target.id);
  }

  return false;
}

/**
 * 节点筛选逻辑。
 * 说明：这里仅做“可见性过滤”，不会改动原始 snapshot 数据。
 */
function shouldIncludeNode(node: GraphNode, filter?: GraphFilter): boolean {
  if (!filter) return true;

  // 仅当筛选器显式指定状态集合时才生效；空数组表示“不限制状态”。
  if (filter.statuses.length > 0 && !filter.statuses.includes(node.status)) return false;

  // factionIndices 当前在工具栏尚未开放选择，但保留筛选能力以兼容后续版本。
  if (filter.factionIndices.length > 0 && !filter.factionIndices.includes(node.factionIndex)) return false;

  if (filter.searchQuery) {
    // 关键词匹配采用不区分大小写包含匹配，提升检索容错。
    const q = filter.searchQuery.toLowerCase();
    if (!node.name.toLowerCase().includes(q)) return false;
  }

  return true;
}

/**
 * 边筛选逻辑。
 * 说明：边除了自身筛选条件，还要受“节点是否可见”约束。
 */
function shouldIncludeEdge(edge: GraphEdge, filter?: GraphFilter, visibleNodeIds?: Set<string>): boolean {
  // 当 source/target 任一节点被过滤掉时，这条边必须隐藏，否则会出现悬空连线。
  if (visibleNodeIds && (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target))) return false;

  if (!filter) return true;

  // 空 relationTypes 表示不过滤关系类型。
  if (filter.relationTypes.length > 0 && !filter.relationTypes.includes(edge.type)) return false;

  return true;
}

/**
 * 计算 radial 布局中心节点（锚点）。
 *
 * 设计约束：
 * - 仅允许“会改变布局语义”的状态参与（如 focusedNodeId）；
 * - 不让 active/hover 这类视觉态驱动锚点变化，避免点击节点时触发整图重建与视口回跳。
 */
export function resolveRadialAnchorNodeId({
  layoutMode,
  nodes,
  focusedNodeId
}: {
  layoutMode   : GraphLayoutMode;
  nodes        : Array<Pick<GraphNode, "id" | "influence">>;
  focusedNodeId: string | null | undefined;
}): string | null {
  if (layoutMode !== "radial" || nodes.length === 0) {
    return null;
  }

  const visibleNodeIds = new Set(nodes.map(node => node.id));
  if (focusedNodeId && visibleNodeIds.has(focusedNodeId)) {
    return focusedNodeId;
  }

  const [firstNode, ...restNodes] = nodes;
  if (!firstNode) {
    return null;
  }

  const fallbackNode = restNodes.reduce((best, current) => {
    if (current.influence !== best.influence) {
      return current.influence > best.influence ? current : best;
    }
    // 同影响力时使用字典序，确保中心选择可复现（避免“同数据不同渲染”）。
    return current.id.localeCompare(best.id) < 0 ? current : best;
  }, firstNode);
  return fallbackNode.id;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function ForceGraph({
  snapshot,
  theme,
  chapterCap: _chapterCap,
  filter,
  layoutMode = "force",
  focusedNodeId,
  activeNodeId,
  onNodeClick,
  onNodeDoubleClick,
  onNodeRightClick,
  onEdgeHover,
  onBackgroundClick,
  highlightPathIds,
  highlightPathEdgeIds,
  pathAutoFitVersion = 0,
  onNodeDragEnd,
  edgeTypeColorMap
}: ForceGraphProps) {
  /** SVG 根节点引用，用于 D3 接管。 */
  const svgRef = useRef<SVGSVGElement>(null);
  /** 容器节点引用，用于监听尺寸变化。 */
  const containerRef = useRef<HTMLDivElement>(null);
  /** 当前运行中的 D3 simulation（便于重绘前 stop）。 */
  const simulationRef = useRef<Simulation<SimulationNode, SimulationEdge> | null>(null);
  /** 缩放行为引用：供“路径查询完成后自动适配视口”复用。 */
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  /** 已处理的路径自动适配版本号（保证每次查询成功只触发一次视口动画）。 */
  const pathAutoFitHandledVersionRef = useRef(0);
  /** 画布尺寸状态；初始为 0，等待 ResizeObserver 首次回调。 */
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  /** 节点坐标缓存：重绘时复用位置，避免随机初始点位导致“闪跳”。 */
  const nodePositionCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  /** 事件回调 refs：避免父组件函数 identity 变化触发整图重建。 */
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick);
  const onNodeRightClickRef = useRef(onNodeRightClick);
  const onEdgeHoverRef = useRef(onEdgeHover);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  /** 拖拽结束回调 ref（FG-04 布局持久化）：避免 renderGraph 闭包过期。 */
  const onNodeDragEndRef = useRef(onNodeDragEnd);
  /** 交互高亮态 refs：用于命令式渲染逻辑读取，避免依赖抖动触发重建。 */
  const focusedNodeIdRef = useRef(focusedNodeId);
  const activeNodeIdRef = useRef(activeNodeId);
  const highlightPathIdsRef = useRef(highlightPathIds);
  const highlightPathEdgeIdsRef = useRef(highlightPathEdgeIds);
  /**
   * 边类型颜色映射 ref：让 applyGraphEmphasis 能在不加入 dep 的情况下读取最新颜色表。
   * renderGraph 通过 useCallback dep 直接闭包最新值；applyGraphEmphasis 通过此 ref 读取。
   */
  const edgeTypeColorMapRef = useRef<ReadonlyMap<string, string> | undefined>(edgeTypeColorMap);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onNodeDoubleClickRef.current = onNodeDoubleClick;
    onNodeRightClickRef.current = onNodeRightClick;
    onEdgeHoverRef.current = onEdgeHover;
    onBackgroundClickRef.current = onBackgroundClick;
    onNodeDragEndRef.current = onNodeDragEnd;
    focusedNodeIdRef.current = focusedNodeId;
    activeNodeIdRef.current = activeNodeId;
    highlightPathIdsRef.current = highlightPathIds;
    highlightPathEdgeIdsRef.current = highlightPathEdgeIds;
    edgeTypeColorMapRef.current = edgeTypeColorMap;
  }, [
    onNodeClick,
    onNodeDoubleClick,
    onNodeRightClick,
    onEdgeHover,
    onBackgroundClick,
    onNodeDragEnd,
    focusedNodeId,
    activeNodeId,
    highlightPathIds,
    highlightPathEdgeIds,
    edgeTypeColorMap
  ]);

  /** 根据主题生成派系配色表，保证暗/亮主题下可读性。 */
  const factionColors = useMemo(() => getFactionColorsForTheme(theme), [theme]);

  // 监听容器尺寸变化。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    ro.observe(el);

    // 卸载时断开观察，避免内存泄漏。
    return () => ro.disconnect();
  }, []);

  // 过滤结果按数据变化 memo，避免父组件轻量 rerender 时重新触发整图渲染。
  const { filteredNodes, filteredEdges, maxInfluence } = useMemo(() => {
    const nextFilteredNodes = snapshot.nodes.filter(n => shouldIncludeNode(n, filter));
    const visibleNodeIds = new Set(nextFilteredNodes.map(n => n.id));
    const nextFilteredEdges = snapshot.edges.filter(e => shouldIncludeEdge(e, filter, visibleNodeIds));

    return {
      filteredNodes: nextFilteredNodes,
      filteredEdges: nextFilteredEdges,
      // 最大影响力至少为 1，避免后续除法出现 0 分母。
      maxInfluence : Math.max(1, ...nextFilteredNodes.map(n => n.influence))
    };
  }, [snapshot, filter]);

  /**
   * 计算 radial 布局中心节点（锚点）。
   * 优先级约定：
   * 1) 当前聚焦节点（双击触发，属于“布局语义变更”）；
   * 2) 数据侧兜底：选择影响力最高节点（同分时按 ID 稳定排序）。
   *
   * 注意：这里故意不使用 activeNodeId。
   * 单击节点仅用于详情/高亮，不应触发布局重建，否则会造成“点击即整图刷新”的跳变体验。
   */
  const radialAnchorNodeId = useMemo(() => {
    return resolveRadialAnchorNodeId({
      layoutMode,
      nodes: filteredNodes,
      focusedNodeId
    });
  }, [layoutMode, filteredNodes, focusedNodeId]);

  /**
   * D3 主渲染流程。
   * 触发条件：尺寸变化、数据变化、布局变化。
   */
  const renderGraph = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || dimensions.width === 0) return;

    const { width, height } = dimensions;
    const sel = select(svg);

    // 每次重绘都清空旧图层并停止旧 simulation，避免事件/动画叠加。
    sel.selectAll("*").remove();
    simulationRef.current?.stop();

    // 定义 SVG 特效资源（发光、箭头等）。
    const defs = sel.append("defs");

    // 关系箭头定义（有向边视觉表达，仅在 hover/路径高亮时显示）。
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -2.5 6 5")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 4)
      .attr("markerHeight", 4)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-2.2L6,0L0,2.2")
      // 使用 context-stroke 让箭头颜色自动跟随边色/路径高亮色。
      .attr("fill", "context-stroke");

    // 主分组：缩放/平移只作用于该组，不影响 SVG 自身尺寸。
    const g = sel.append("g").attr("class", "graph-main");

    // 缩放行为：限制 0.1~4 倍，避免过小不可读或过大丢失全局感知。
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
      });
    zoomBehaviorRef.current = zoomBehavior;

    sel.call(zoomBehavior);

    // 背景点击用于“退出局部操作态”（选中、菜单等）。
    sel.on("click", (event: MouseEvent) => {
      if (event.target === svg) {
        onBackgroundClickRef.current?.();
      }
    });

    // simulation 节点：优先复用上次收敛后的坐标，避免状态变化时节点随机跳闪。
    const simNodes: SimulationNode[] = filteredNodes.map(n => ({
      ...n,
      x: nodePositionCacheRef.current.get(n.id)?.x ?? n.x ?? width / 2 + (Math.random() - 0.5) * width * 0.6,
      y: nodePositionCacheRef.current.get(n.id)?.y ?? n.y ?? height / 2 + (Math.random() - 0.5) * height * 0.6
    }));

    const nodeMap = new Map<string, SimulationNode>();
    for (const n of simNodes) nodeMap.set(n.id, n);

    // 仅保留两端节点都存在的边，防止异常数据导致渲染崩溃。
    // 这里不用 `!` 非空断言，是为了把“脏边”当作数据问题显式吞掉，
    // 避免把异常传播到 D3 simulation（出现 NaN 坐标、tick 报错或整图卡死）。
    const simEdges: SimulationEdge[] = [];
    for (const edge of filteredEdges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) {
        continue;
      }
      simEdges.push({
        ...edge,
        source: sourceNode,
        target: targetNode
      });
    }

    // 所有布局计划都基于“已过滤 + 已校验连边”的图，避免布局阶段再处理脏数据。
    const treeLayoutPlan = layoutMode === "tree"
      ? buildTreeLayoutPlan({
        nodes: simNodes.map((node) => ({ id: node.id, influence: node.influence })),
        edges: simEdges.map((edge) => ({ source: edge.source.id, target: edge.target.id })),
        width,
        height
      })
      : null;
    const radialHopPlan = layoutMode === "radial"
      ? buildRadialHopPlan({
        nodeIds     : simNodes.map((node) => node.id),
        edges       : simEdges.map((edge) => ({ source: edge.source.id, target: edge.target.id })),
        anchorNodeId: radialAnchorNodeId
      })
      : null;

    if (treeLayoutPlan) {
      // 先写入目标坐标，减少 tree 模式首帧抖动。
      for (const node of simNodes) {
        const targetPosition = treeLayoutPlan.positions.get(node.id);
        if (!targetPosition) {
          continue;
        }
        node.x = targetPosition.x;
        node.y = targetPosition.y;
      }

      if (treeLayoutPlan.isolatedLaneBounds) {
        const laneGroup = g.append("g")
          .attr("class", "tree-isolated-lane")
          .attr("pointer-events", "none");
        laneGroup.append("rect")
          .attr("x", treeLayoutPlan.isolatedLaneBounds.x)
          .attr("y", treeLayoutPlan.isolatedLaneBounds.y)
          .attr("width", treeLayoutPlan.isolatedLaneBounds.width)
          .attr("height", treeLayoutPlan.isolatedLaneBounds.height)
          .attr("rx", 14)
          .attr("ry", 14)
          .attr("fill", TREE_LANE_FILL_COLOR)
          .attr("fill-opacity", 0.22)
          .attr("stroke", TREE_LANE_STROKE_COLOR)
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "5,4");
        laneGroup.append("text")
          .attr("x", treeLayoutPlan.isolatedLaneBounds.x + 12)
          .attr("y", treeLayoutPlan.isolatedLaneBounds.y + 18)
          .attr("font-size", "11px")
          .attr("font-weight", 600)
          .attr("fill", "var(--muted-foreground)")
          .text("非树节点");
      }
    }

    if (layoutMode === "radial" && radialAnchorNodeId) {
      const anchorNode = nodeMap.get(radialAnchorNodeId);
      if (anchorNode) {
        // 选中节点作为圈层中心，首帧直接放到画布中心避免漂移感。
        anchorNode.x = width / 2;
        anchorNode.y = height / 2;
      }
    }

    // 绘制关系边。
    const edgeGroup = g.append("g").attr("class", "edges");
    const edgeSelection = edgeGroup.selectAll<SVGLineElement, SimulationEdge>("line")
      .data(simEdges, (d) => d.id)
      .enter()
      .append("line")
      .attr("stroke", d => resolveEdgeColor(d.type, d.sentiment, edgeTypeColorMap ?? new Map()))
      .attr("stroke-width", d => edgeBaseWidth(d.weight))
      .attr("stroke-opacity", EDGE_OPACITY_BASE)
      .attr("stroke-dasharray", d => d.status === "DRAFT" ? "4,4" : "none")
      // 常态隐藏箭头，降低视觉噪声；仅在 hover / 路径高亮显示方向。
      .attr("marker-end", "none")
      .on("mouseenter", function (_event, d) {
        // 把 SimulationEdge 还原为 GraphEdge 形态回传给上层。
        onEdgeHoverRef.current?.({
          id       : d.id,
          source   : d.source.id,
          target   : d.target.id,
          type     : d.type,
          weight   : d.weight,
          sentiment: d.sentiment,
          status   : d.status
        });
        // hover 加粗边，提升当前关系辨识度。
        select(this)
          .attr("stroke-width", d.weight * 2 + 2)
          .attr("marker-end", EDGE_ARROW_MARKER_URL);
      })
      .on("mouseleave", function (_event, d) {
        onEdgeHoverRef.current?.(null);
        const currentHighlightPathIds = highlightPathIdsRef.current;
        const currentHighlightPathEdgeIds = highlightPathEdgeIdsRef.current;
        const isHighlightedPathEdge = isPathEdge(d, currentHighlightPathIds, currentHighlightPathEdgeIds);
        select(this)
          .attr(
            "stroke-width",
            isHighlightedPathEdge
              ? edgeEmphasisWidth(d.weight)
              : edgeBaseWidth(d.weight)
          )
          .attr("marker-end", isHighlightedPathEdge ? EDGE_ARROW_MARKER_URL : "none");
      });

    // 边标签（默认透明，可由样式控制何时显示）。
    const edgeLabelGroup = g.append("g").attr("class", "edge-labels");
    const edgeLabelSelection = edgeLabelGroup.selectAll<SVGTextElement, SimulationEdge>("text")
      .data(simEdges, d => d.id)
      .enter()
      .append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "var(--muted-foreground)")
      .attr("opacity", 0)
      .text(d => d.type);

    // 绘制节点容器组（一个节点 = path + text）。
    const nodeGroup = g.append("g").attr("class", "nodes");
    const nodeSelection = nodeGroup.selectAll<SVGGElement, SimulationNode>("g")
      .data(simNodes, d => d.id)
      .enter()
      .append("g")
      .attr("class", d => {
        if (d.status === "VERIFIED") return "graph-node graph-node-verified";
        if (d.status === "DRAFT") return "graph-node graph-node-draft";
        return "graph-node";
      })
      .attr("cursor", "pointer")
      .call(drag<SVGGElement, SimulationNode>()
        .on("start", (_event, d) => {
          if (simulationRef.current) {
            // 拖拽开始时提高 alpha，促使布局快速重新收敛。
            simulationRef.current.alphaTarget(0.3).restart();
          }
          // 固定当前节点位置，避免拖拽中被力场拉走。
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event: D3DragEvent<SVGGElement, SimulationNode, SimulationNode>, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (_event, d) => {
          if (simulationRef.current) {
            simulationRef.current.alphaTarget(0);
          }
          // FG-04: 拖拽结束后保留固定位置，确保刷新前用户手动排布的节点不会漂移。
          // 通知外层容器（GraphView）保存全量坐标至后端（调用方负责防抖）。
          d.fx = d.x;
          d.fy = d.y;
          if (onNodeDragEndRef.current && simNodes.length > 0) {
            onNodeDragEndRef.current(
              simNodes.map(n => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 }))
            );
          }
        })
      );

    // 节点主体形状。
    nodeSelection.append("path")
      .attr("d", d => {
        const r = nodeRadius(d.influence, maxInfluence);
        // FG-03: 根据实体类型选择形状：LOCATION=菱形，ORGANIZATION=六边形，默认（PERSON）=圆形。
        return nodePath(d.entityType, r);
      })
      .attr("transform", nodeScaleTransform(1))
      .attr("fill", d => nodeBaseFillColor(d, factionColors))
      // 节点级光晕变量：verified 动画优先读取它，实现“光晕跟随节点颜色”。
      .style("--graph-node-halo-color", d => nodeBaseFillColor(d, factionColors))
      .attr("stroke", d => nodeBaseStrokeColor(d.status))
      .attr("stroke-width", d => nodeBaseStrokeWidth(d.status))
      .attr("stroke-dasharray", () => nodeBaseStrokeDasharray())
      .attr("opacity", 1);

    // 节点标签：影响力高的节点字体稍大，优先强调关键人物。
    nodeSelection.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", d => nodeRadius(d.influence, maxInfluence) + 14)
      .attr("font-size", d => d.influence > maxInfluence * 0.5 ? "12px" : "10px")
      .attr("fill", "var(--foreground)")
      .attr("pointer-events", "none")
      .text(d => d.name);

    // 节点交互事件桥接。
    nodeSelection
      .on("click", (event: MouseEvent, d) => {
        event.stopPropagation();
        onNodeClickRef.current?.(d);
      })
      .on("dblclick", (event: MouseEvent, d) => {
        event.stopPropagation();
        onNodeDoubleClickRef.current?.(d);
      })
      .on("contextmenu", (event: MouseEvent, d) => {
        event.preventDefault();
        event.stopPropagation();
        onNodeRightClickRef.current?.(d, { x: event.clientX, y: event.clientY });
      })
      .on("mouseenter", function (_event, d) {
        // hover 仅做轻微放大，不改节点视觉语言（颜色/描边规则保持不变）。
        const highlightedScale = (
          activeNodeIdRef.current === d.id || focusedNodeIdRef.current === d.id
        ) ? NODE_ACTIVE_SCALE : NODE_HOVER_SCALE;
        select(this).select("path")
          .attr("transform", nodeScaleTransform(highlightedScale))
          .attr("fill", nodeHighlightFillColor(d, factionColors));
      })
      .on("mouseleave", function (_, d) {
        const shouldKeepActiveHighlight = (
          activeNodeIdRef.current === d.id
          || focusedNodeIdRef.current === d.id
        );
        if (shouldKeepActiveHighlight) {
          // 激活/聚焦节点在鼠标离开后仍保持轻微放大。
          select(this).select("path")
            .attr("transform", nodeScaleTransform(NODE_ACTIVE_SCALE))
            .attr("fill", nodeHighlightFillColor(d, factionColors));
          return;
        }
        // 退出 hover 后恢复到常态尺寸。
        select(this).select("path")
          .attr("transform", nodeScaleTransform(1))
          .attr("fill", nodeBaseFillColor(d, factionColors));
      });

    // 结构重绘后立即应用一次交互强调，避免“焦点存在但视觉样式丢失”。
    const currentFocusedNodeId = focusedNodeIdRef.current;
    const currentActiveNodeId = activeNodeIdRef.current;
    const currentHighlightPathIds = highlightPathIdsRef.current;
    const currentHighlightPathEdgeIds = highlightPathEdgeIdsRef.current;

    if (currentFocusedNodeId) {
      const connectedIds = new Set<string>();
      connectedIds.add(currentFocusedNodeId);

      for (const edge of edgeSelection.data()) {
        if (edge.source.id === currentFocusedNodeId) connectedIds.add(edge.target.id);
        if (edge.target.id === currentFocusedNodeId) connectedIds.add(edge.source.id);
      }

      nodeSelection.select<SVGPathElement>("path")
        .attr("opacity", d => connectedIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      nodeSelection.select<SVGTextElement>("text")
        .attr("opacity", d => connectedIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      edgeSelection.attr("stroke-opacity", d => (
        connectedIds.has(d.source.id) && connectedIds.has(d.target.id)
      ) ? EDGE_OPACITY_BASE : FOCUS_DIM_OPACITY * 0.5);

      const focusedNodeSelection = nodeSelection.filter(d => d.id === currentFocusedNodeId);
      focusedNodeSelection.select<SVGPathElement>("path")
        .attr("transform", nodeScaleTransform(NODE_ACTIVE_SCALE))
        .attr("fill", d => nodeHighlightFillColor(d, factionColors))
        .attr("opacity", 1);
      focusedNodeSelection.select<SVGTextElement>("text").attr("opacity", 1);
    }

    if (
      (currentHighlightPathIds && currentHighlightPathIds.size > 0)
      || (currentHighlightPathEdgeIds && currentHighlightPathEdgeIds.size > 0)
    ) {
      if (currentHighlightPathIds && currentHighlightPathIds.size > 0) {
        nodeSelection.select<SVGPathElement>("path")
          .attr("opacity", d => currentHighlightPathIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      }

      edgeSelection
        .attr("stroke", d => (
          isPathEdge(d, currentHighlightPathIds, currentHighlightPathEdgeIds)
            ? PATH_EDGE_HIGHLIGHT_COLOR
            : resolveEdgeColor(d.type, d.sentiment, edgeTypeColorMapRef.current ?? new Map())
        ))
        .attr("stroke-opacity", d => (
          isPathEdge(d, currentHighlightPathIds, currentHighlightPathEdgeIds)
            ? 1
            : FOCUS_DIM_OPACITY * 0.5
        ))
        .attr("stroke-width", d => (
          isPathEdge(d, currentHighlightPathIds, currentHighlightPathEdgeIds)
            ? edgeEmphasisWidth(d.weight)
            : edgeBaseWidth(d.weight)
        ))
        .attr("marker-end", d => (
          isPathEdge(d, currentHighlightPathIds, currentHighlightPathEdgeIds)
            ? EDGE_ARROW_MARKER_URL
            : "none"
        ));
    }

    // 单击激活节点：仅高亮该节点，不影响全图降噪策略。
    if (currentActiveNodeId) {
      const activeNodeSelection = nodeSelection.filter(d => d.id === currentActiveNodeId);
      activeNodeSelection.select<SVGPathElement>("path")
        .attr("transform", nodeScaleTransform(NODE_ACTIVE_SCALE))
        .attr("fill", d => nodeHighlightFillColor(d, factionColors))
        .attr("opacity", 1);
      activeNodeSelection.select<SVGTextElement>("text").attr("opacity", 1);
    }

    // 力导向 simulation：连边约束 + 电荷斥力 + 居中 + 防重叠。
    const simulation = forceSimulation<SimulationNode>(simNodes)
      .force("link", forceLink<SimulationNode, SimulationEdge>(simEdges)
        .id(d => d.id)
        // 权重越大，距离越短，体现“关系更紧密”。
        .distance(d => 80 / Math.max(d.weight, 0.5))
        .strength(d => Math.min(d.weight * 0.3, 1))
      )
      .force("charge", forceManyBody()
        // 影响力高的节点斥力略强，帮助它们分布更清晰。
        .strength(d => -60 - (d as SimulationNode).influence * 2)
      )
      .force("center", forceCenter(width / 2, height / 2))
      .force("collision", forceCollide<SimulationNode>()
        .radius(d => nodeRadius(d.influence, maxInfluence) + 4)
      )
      .on("tick", () => {
        // tick 中同步更新边、标签、节点位置。
        edgeSelection
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);

        edgeLabelSelection
          .attr("x", d => (d.source.x + d.target.x) / 2)
          .attr("y", d => (d.source.y + d.target.y) / 2);

        nodeSelection.attr("transform", d => `translate(${d.x},${d.y})`);

        // 持续缓存坐标，供后续局部重绘复用，降低“重算后全图跳位”感知。
        for (const node of simNodes) {
          nodePositionCacheRef.current.set(node.id, { x: node.x, y: node.y });
        }
      });

    simulationRef.current = simulation;

    // 径向布局：以选中节点为中心，按最短路径 hop 分圈。
    if (layoutMode === "radial") {
      simulation.force("center", null);
      const maxHop = Math.max(1, radialHopPlan?.maxHop ?? 0);
      const outerRadius = Math.max(
        RADIAL_OUTER_RADIUS_MIN,
        Math.min(width, height) * RADIAL_OUTER_RADIUS_RATIO
      );
      simulation.force("radial", forceRadial<SimulationNode>(
        (node) => {
          const hop = radialHopPlan?.hopByNodeId.get(node.id) ?? maxHop;
          if (hop <= 0) {
            return 0;
          }
          return outerRadius * (hop / maxHop);
        },
        width / 2,
        height / 2
      ).strength(0.95));

      if (radialAnchorNodeId) {
        // 单独增强中心节点的回归力，确保“选中人物在圆心”稳定可见。
        simulation.force("radial-anchor-x", forceX<SimulationNode>(width / 2)
          .strength((node) => (node.id === radialAnchorNodeId ? 1 : 0)));
        simulation.force("radial-anchor-y", forceY<SimulationNode>(height / 2)
          .strength((node) => (node.id === radialAnchorNodeId ? 1 : 0)));
      } else {
        simulation.force("radial-anchor-x", null);
        simulation.force("radial-anchor-y", null);
      }
      simulation.alpha(0.9);
    }

    // FG-02: 层级树布局（分量分层）：按连通分量独立分层，并把非树节点放入独立泳道。
    if (layoutMode === "tree" && treeLayoutPlan) {
      simulation.force("center", null);
      // tree 模式以“规划坐标”优先，弱化 link/charge 对层级结构的拉扯。
      simulation.force("link", null);
      simulation.force("charge", null);
      simulation.force("x", forceX<SimulationNode>((node) => {
        const targetPosition = treeLayoutPlan.positions.get(node.id);
        return targetPosition?.x ?? width / 2;
      }).strength(1));
      simulation.force("y", forceY<SimulationNode>((node) => {
        const targetPosition = treeLayoutPlan.positions.get(node.id);
        return targetPosition?.y ?? height / 2;
      }).strength(1));
      simulation.alpha(0.9);
    }

    // 初始自适应缩放：让图形尽可能“首屏可见”。
    requestAnimationFrame(() => {
      const bounds = (g.node() as SVGGElement)?.getBBox();
      if (bounds && bounds.width > 0) {
        const scale = Math.min(
          width / (bounds.width + 100),
          height / (bounds.height + 100),
          1.5
        );
        const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
        const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;
        sel.transition().duration(500).call(transition => {
          zoomBehavior.transform(transition, zoomIdentity.translate(tx, ty).scale(scale));
        });
      }
    });
  }, [
    dimensions,
    filteredNodes,
    filteredEdges,
    factionColors,
    maxInfluence,
    layoutMode,
    radialAnchorNodeId,
    edgeTypeColorMap
  ]);

  /**
   * 交互态高亮（聚焦/最短路径）单独更新：
   * 避免每次右侧面板状态变化都触发整图 remove + rebuild。
   */
  const applyGraphEmphasis = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const graphRoot = select(svg).select<SVGGElement>("g.graph-main");
    if (graphRoot.empty()) return;

    const nodeSelection = graphRoot
      .select<SVGGElement>("g.nodes")
      .selectAll<SVGGElement, SimulationNode>("g.graph-node");
    const edgeSelection = graphRoot
      .select<SVGGElement>("g.edges")
      .selectAll<SVGLineElement, SimulationEdge>("line");

    // 先重置到基础视觉态，再叠加聚焦/路径高亮。
    nodeSelection.select<SVGPathElement>("path")
      .attr("opacity", 1)
      .attr("transform", nodeScaleTransform(1))
      .attr("fill", d => nodeBaseFillColor(d, factionColors))
      .attr("stroke", d => nodeBaseStrokeColor(d.status))
      .attr("stroke-width", d => nodeBaseStrokeWidth(d.status))
      .attr("stroke-opacity", 1)
      .attr("stroke-dasharray", nodeBaseStrokeDasharray());
    nodeSelection.select<SVGTextElement>("text").attr("opacity", 1);
    edgeSelection
      .attr("stroke", d => resolveEdgeColor(d.type, d.sentiment, edgeTypeColorMapRef.current ?? new Map()))
      .attr("stroke-opacity", EDGE_OPACITY_BASE)
      .attr("stroke-width", d => edgeBaseWidth(d.weight))
      .attr("marker-end", "none");

    const currentFocusedNodeId = focusedNodeIdRef.current;
    const currentActiveNodeId = activeNodeIdRef.current;
    const currentHighlightPathIds = highlightPathIdsRef.current;
    const currentHighlightPathEdgeIds = highlightPathEdgeIdsRef.current;

    // 聚焦模式：仅保留“目标节点 + 一跳邻居”高亮。
    if (currentFocusedNodeId) {
      const connectedIds = new Set<string>();
      connectedIds.add(currentFocusedNodeId);

      for (const edge of edgeSelection.data()) {
        if (edge.source.id === currentFocusedNodeId) connectedIds.add(edge.target.id);
        if (edge.target.id === currentFocusedNodeId) connectedIds.add(edge.source.id);
      }

      nodeSelection.select<SVGPathElement>("path")
        .attr("opacity", d => connectedIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      nodeSelection.select<SVGTextElement>("text")
        .attr("opacity", d => connectedIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      edgeSelection.attr("stroke-opacity", d => (
        connectedIds.has(d.source.id) && connectedIds.has(d.target.id)
      ) ? EDGE_OPACITY_BASE : FOCUS_DIM_OPACITY * 0.5);

      const focusedNodeSelection = nodeSelection.filter(d => d.id === currentFocusedNodeId);
      focusedNodeSelection.select<SVGPathElement>("path")
        .attr("transform", nodeScaleTransform(NODE_ACTIVE_SCALE))
        .attr("fill", d => nodeHighlightFillColor(d, factionColors))
        .attr("opacity", 1);
      focusedNodeSelection.select<SVGTextElement>("text").attr("opacity", 1);
    }

    // 路径高亮优先级更高，覆盖聚焦态。
    if (
      (currentHighlightPathIds && currentHighlightPathIds.size > 0)
      || (currentHighlightPathEdgeIds && currentHighlightPathEdgeIds.size > 0)
    ) {
      if (currentHighlightPathIds && currentHighlightPathIds.size > 0) {
        nodeSelection.select<SVGPathElement>("path")
          .attr("opacity", d => currentHighlightPathIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      }

      edgeSelection
        .attr("stroke", d => (
          isPathEdge(d, currentHighlightPathIds, currentHighlightPathEdgeIds)
            ? PATH_EDGE_HIGHLIGHT_COLOR
            : resolveEdgeColor(d.type, d.sentiment, edgeTypeColorMapRef.current ?? new Map())
        ))
        .attr("stroke-opacity", d => (
          isPathEdge(d, currentHighlightPathIds, currentHighlightPathEdgeIds)
            ? 1
            : FOCUS_DIM_OPACITY * 0.5
        ))
        .attr("stroke-width", d => (
          isPathEdge(d, currentHighlightPathIds, currentHighlightPathEdgeIds)
            ? edgeEmphasisWidth(d.weight)
            : edgeBaseWidth(d.weight)
        ))
        .attr("marker-end", d => (
          isPathEdge(d, currentHighlightPathIds, currentHighlightPathEdgeIds)
            ? EDGE_ARROW_MARKER_URL
            : "none"
        ));
    }

    // 单击激活节点：同时暗淡无关节点/边，高亮该节点及其直接关系线。
    // 与 focusedNodeId（双击）不同的是，单击不切换布局，不改变 simulation；
    // 但视觉上同样需要强调选中人物的关系网络，降低背景噪声。
    if (currentActiveNodeId && !currentFocusedNodeId) {
      // 收集与激活节点直接相连的节点 ID（一跳邻居）。
      const activeConnectedIds = new Set<string>();
      activeConnectedIds.add(currentActiveNodeId);
      for (const edge of edgeSelection.data()) {
        if (edge.source.id === currentActiveNodeId) activeConnectedIds.add(edge.target.id);
        if (edge.target.id === currentActiveNodeId) activeConnectedIds.add(edge.source.id);
      }

      // 暗淡非邻居节点。
      nodeSelection.select<SVGPathElement>("path")
        .attr("opacity", d => activeConnectedIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      nodeSelection.select<SVGTextElement>("text")
        .attr("opacity", d => activeConnectedIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);

      // 激活节点的直接关系边保持正常不变，其余边暗淡降噪。
      edgeSelection
        .attr("stroke-opacity", d => (
          d.source.id === currentActiveNodeId || d.target.id === currentActiveNodeId
            ? EDGE_OPACITY_BASE
            : FOCUS_DIM_OPACITY * 0.4
        ))
        .attr("stroke-width", d => edgeBaseWidth(d.weight));

      // 激活节点本身放大 + 填色高亮。
      const activeNodeSelection = nodeSelection.filter(d => d.id === currentActiveNodeId);
      activeNodeSelection.select<SVGPathElement>("path")
        .attr("transform", nodeScaleTransform(NODE_ACTIVE_SCALE))
        .attr("fill", d => nodeHighlightFillColor(d, factionColors))
        .attr("opacity", 1);
      activeNodeSelection.select<SVGTextElement>("text").attr("opacity", 1);
    } else if (currentActiveNodeId && currentFocusedNodeId) {
      // 聚焦模式已经处理了整体暗淡；这里只叠加激活节点的放大 + 填色效果。
      const activeNodeSelection = nodeSelection.filter(d => d.id === currentActiveNodeId);
      activeNodeSelection.select<SVGPathElement>("path")
        .attr("transform", nodeScaleTransform(NODE_ACTIVE_SCALE))
        .attr("fill", d => nodeHighlightFillColor(d, factionColors))
        .attr("opacity", 1);
      activeNodeSelection.select<SVGTextElement>("text").attr("opacity", 1);
    }
  }, [factionColors]);

  // 当渲染依赖变化时重绘；卸载时停止 simulation，防止后台持续占用 CPU。
  useEffect(() => {
    renderGraph();
    return () => {
      simulationRef.current?.stop();
    };
  }, [renderGraph]);

  // 聚焦与路径高亮变更时只更新视觉样式，不重建 simulation。
  // 说明：依赖项显式包含交互态，确保路径查询成功后能立即触发高亮重绘。
  useEffect(() => {
    applyGraphEmphasis();
  }, [applyGraphEmphasis, focusedNodeId, activeNodeId, highlightPathIds, highlightPathEdgeIds]);

  // 路径查询成功后自动适配视口到“路径节点包围盒”。
  // 使用 version 触发，确保同一路径重复查询也会再次执行缩放。
  useEffect(() => {
    // 这些前置条件任何一个不满足，都应直接跳过，避免“重复动画”或“空路径缩放”。
    if (
      pathAutoFitVersion <= 0
      || pathAutoFitVersion === pathAutoFitHandledVersionRef.current
      || dimensions.width <= 0
      || dimensions.height <= 0
    ) {
      return;
    }

    const svg = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    const currentHighlightPathIds = highlightPathIdsRef.current;
    if (!svg || !zoomBehavior || !currentHighlightPathIds || currentHighlightPathIds.size === 0) {
      return;
    }

    const graphRoot = select(svg).select<SVGGElement>("g.graph-main");
    if (graphRoot.empty()) {
      return;
    }

    // 直接从当前渲染节点数据中提取路径节点，保证与画布上的实际可见集合一致。
    const visiblePathNodes = graphRoot
      .select<SVGGElement>("g.nodes")
      .selectAll<SVGGElement, SimulationNode>("g.graph-node")
      .data()
      .filter(node => currentHighlightPathIds.has(node.id));

    if (visiblePathNodes.length === 0) {
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const node of visiblePathNodes) {
      const radius = nodeRadius(node.influence, maxInfluence);
      const nodeX = node.x ?? dimensions.width / 2;
      const nodeY = node.y ?? dimensions.height / 2;
      minX = Math.min(minX, nodeX - radius);
      maxX = Math.max(maxX, nodeX + radius);
      minY = Math.min(minY, nodeY - radius);
      // 标签在节点下方，额外预留空间避免裁切。
      maxY = Math.max(maxY, nodeY + radius + 16);
    }

    const boundsWidth = Math.max(maxX - minX, 1);
    const boundsHeight = Math.max(maxY - minY, 1);
    // padding + scale 上下限是为了兼顾大屏与小屏：
    // - 防止路径节点贴边裁切；
    // - 防止极短路径被放得过大导致用户失去全局语境。
    const padding = Math.max(60, Math.min(dimensions.width, dimensions.height) * 0.16);
    const scaleX = (dimensions.width - padding * 2) / boundsWidth;
    const scaleY = (dimensions.height - padding * 2) / boundsHeight;
    const scale = Math.max(0.25, Math.min(scaleX, scaleY, 2.5));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const tx = dimensions.width / 2 - centerX * scale;
    const ty = dimensions.height / 2 - centerY * scale;

    const sel = select(svg);
    sel
      .transition()
      .duration(500)
      .call(transition => {
        zoomBehavior.transform(transition, zoomIdentity.translate(tx, ty).scale(scale));
      });
    // 记录“本次版本已处理”，防止同一次响应触发重复缩放动画。
    pathAutoFitHandledVersionRef.current = pathAutoFitVersion;
  }, [pathAutoFitVersion, dimensions, maxInfluence]);

  return (
    <div
      ref={containerRef}
      className="force-graph relative h-full w-full overflow-hidden"
      style={{ backgroundColor: "var(--color-graph-bg)" }}
      role="img"
      aria-label={`人物关系图谱，包含 ${filteredNodes.length} 个人物和 ${filteredEdges.length} 条关系`}
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0"
        aria-hidden="true"
      />
    </div>
  );
}
