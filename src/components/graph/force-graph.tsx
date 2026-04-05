"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drag, type D3DragEvent } from "d3-drag";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type Simulation
} from "d3-force";
import { select } from "d3-selection";
import { symbol, symbolCircle } from "d3-shape";
import "d3-transition";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";

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
/** 元素显隐过渡时长（毫秒）。 */
const TRANSITION_DURATION = 400;

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface ForceGraphProps {
  /**
   * 图谱快照（上游服务端或客户端请求得到的最终数据）。
   * 业务含义：这是当前章节切片下“可被渲染”的完整节点与边集合。
   */
  snapshot          : GraphSnapshot;
  /**
   * 当前主题名（来自主题系统），用于派系颜色映射。
   * 可为空：首次 hydration 前主题尚未解析时允许兜底。
   */
  theme             : string | undefined;
  /**
   * 章节上限（当前版本未直接在本组件使用，保留接口稳定性）。
   * 这是对外契约，不是技术限制；删除会影响上游调用一致性。
   */
  chapterCap?       : number;
  /**
   * 图谱筛选条件（关系类型、状态、关键词等）。
   * 若为空表示展示 snapshot 全量数据。
   */
  filter?           : GraphFilter;
  /**
   * 布局模式：
   * - `force`：经典力导向；
   * - `radial`：同心径向；
   * - `tree`：当前暂未单独实现，保留枚举兼容。
   */
  layoutMode?       : GraphLayoutMode;
  /**
   * 当前聚焦节点 ID（用于“只突出目标及其邻居”）。
   * 为 `null/undefined` 表示不启用聚焦降噪。
   */
  focusedNodeId?    : string | null;
  /** 节点单击回调：用于打开人物详情等业务动作。 */
  onNodeClick?      : (node: GraphNode) => void;
  /** 节点双击回调：用于切换聚焦。 */
  onNodeDoubleClick?: (node: GraphNode) => void;
  /** 节点右键回调：用于弹出上下文菜单，附带屏幕坐标。 */
  onNodeRightClick? : (node: GraphNode, position: { x: number; y: number }) => void;
  /** 边 hover 回调：用于在外层显示关系信息浮层。 */
  onEdgeHover?      : (edge: GraphEdge | null) => void;
  /** 背景点击回调：用于关闭面板、重置临时状态。 */
  onBackgroundClick?: () => void;
  /**
   * 最短路径高亮节点 ID 集合。
   * 传入时将覆盖普通显示优先级（用于“路径查找结果强调”）。
   */
  highlightPathIds? : Set<string>;
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
 * 关系情感到边颜色的映射。
 * 业务价值：帮助审阅者快速分辨正负关系氛围。
 */
function edgeColor(sentiment: string): string {
  if (sentiment === "positive") return "var(--color-graph-edge-positive)";
  if (sentiment === "negative") return "var(--color-graph-edge-negative)";
  return "var(--muted-foreground)";
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
  onNodeClick,
  onNodeDoubleClick,
  onNodeRightClick,
  onEdgeHover,
  onBackgroundClick,
  highlightPathIds
}: ForceGraphProps) {
  /** SVG 根节点引用，用于 D3 接管。 */
  const svgRef = useRef<SVGSVGElement>(null);
  /** 容器节点引用，用于监听尺寸变化。 */
  const containerRef = useRef<HTMLDivElement>(null);
  /** 当前运行中的 D3 simulation（便于重绘前 stop）。 */
  const simulationRef = useRef<Simulation<SimulationNode, SimulationEdge> | null>(null);
  /** 画布尺寸状态；初始为 0，等待 ResizeObserver 首次回调。 */
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  /** 根据主题生成派系配色表，保证暗/亮主题下可读性。 */
  const factionColors = getFactionColorsForTheme(theme);

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

  // 先过滤节点，再基于可见节点过滤边，确保图数据闭合。
  const filteredNodes = snapshot.nodes.filter(n => shouldIncludeNode(n, filter));
  const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = snapshot.edges.filter(e => shouldIncludeEdge(e, filter, visibleNodeIds));

  // 最大影响力至少为 1，避免后续除法出现 0 分母。
  const maxInfluence = Math.max(1, ...filteredNodes.map(n => n.influence));

  /**
   * D3 主渲染流程。
   * 触发条件：尺寸变化、数据变化、布局变化、高亮/聚焦状态变化。
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

    // 已审核节点发光效果。
    const glowFilter = defs.append("filter").attr("id", "glow");
    glowFilter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    const merge = glowFilter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // 关系箭头定义（有向边视觉表达）。
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "var(--muted-foreground)");

    // 主分组：缩放/平移只作用于该组，不影响 SVG 自身尺寸。
    const g = sel.append("g").attr("class", "graph-main");

    // 缩放行为：限制 0.1~4 倍，避免过小不可读或过大丢失全局感知。
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
      });

    sel.call(zoomBehavior);

    // 背景点击用于“退出局部操作态”（选中、菜单等）。
    sel.on("click", (event: MouseEvent) => {
      if (event.target === svg) {
        onBackgroundClick?.();
      }
    });

    // simulation 节点：若无持久化坐标则随机散开，避免初始重叠成一点。
    const simNodes: SimulationNode[] = filteredNodes.map(n => ({
      ...n,
      x: n.x ?? width / 2 + (Math.random() - 0.5) * width * 0.6,
      y: n.y ?? height / 2 + (Math.random() - 0.5) * height * 0.6
    }));

    const nodeMap = new Map<string, SimulationNode>();
    for (const n of simNodes) nodeMap.set(n.id, n);

    // 仅保留两端节点都存在的边，防止异常数据导致渲染崩溃。
    const simEdges: SimulationEdge[] = filteredEdges
      .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map(e => ({
        ...e,
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!
      }));

    // 绘制关系边。
    const edgeGroup = g.append("g").attr("class", "edges");
    const edgeSelection = edgeGroup.selectAll<SVGLineElement, SimulationEdge>("line")
      .data(simEdges, (d) => d.id)
      .enter()
      .append("line")
      .attr("stroke", d => edgeColor(d.sentiment))
      .attr("stroke-width", d => Math.max(1, Math.min(d.weight * 1.5, 6)))
      .attr("stroke-opacity", EDGE_OPACITY_BASE)
      .attr("stroke-dasharray", d => d.status === "DRAFT" ? "4,4" : "none")
      .attr("marker-end", "url(#arrowhead)")
      .on("mouseenter", function (_event, d) {
        // 把 SimulationEdge 还原为 GraphEdge 形态回传给上层。
        onEdgeHover?.({
          id       : d.id,
          source   : d.source.id,
          target   : d.target.id,
          type     : d.type,
          weight   : d.weight,
          sentiment: d.sentiment,
          status   : d.status
        });
        // hover 加粗边，提升当前关系辨识度。
        select(this).attr("stroke-width", d.weight * 2 + 2);
      })
      .on("mouseleave", function (_event, d) {
        onEdgeHover?.(null);
        select(this).attr("stroke-width", Math.max(1, Math.min(d.weight * 1.5, 6)));
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
          // 拖拽结束后释放固定，让节点重新参与力学演化。
          d.fx = null;
          d.fy = null;
        })
      );

    // 节点主体形状。
    nodeSelection.append("path")
      .attr("d", d => {
        const r = nodeRadius(d.influence, maxInfluence);
        // 风险提示：当前 nameType 分支被固定为 PERSON；未来若要按类型绘制需同步产品规则。
        return nodePath(d.nameType === "TITLE_ONLY" ? "PERSON" : "PERSON", r);
      })
      .attr("fill", d => factionColors[d.factionIndex % factionColors.length])
      .attr("stroke", d => {
        if (d.status === "DRAFT") return "var(--color-graph-draft)";
        if (d.status === "VERIFIED") return "var(--color-graph-verified-glow)";
        return "transparent";
      })
      .attr("stroke-width", d => d.status === "DRAFT" ? 2 : 1.5)
      .attr("stroke-dasharray", d => d.status === "DRAFT" ? "3,3" : "none")
      .attr("filter", d => d.status === "VERIFIED" ? "url(#glow)" : "none")
      .attr("opacity", 0)
      .transition()
      .duration(TRANSITION_DURATION)
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
        onNodeClick?.(d);
      })
      .on("dblclick", (event: MouseEvent, d) => {
        event.stopPropagation();
        onNodeDoubleClick?.(d);
      })
      .on("contextmenu", (event: MouseEvent, d) => {
        event.preventDefault();
        event.stopPropagation();
        onNodeRightClick?.(d, { x: event.clientX, y: event.clientY });
      })
      .on("mouseenter", function () {
        // hover 统一加 glow，增强可发现性。
        select(this).select("path").attr("filter", "url(#glow)");
      })
      .on("mouseleave", function (_, d) {
        // 退出 hover 后仅保留“已审核”节点的发光。
        select(this).select("path")
          .attr("filter", d.status === "VERIFIED" ? "url(#glow)" : "none");
      });

    // 聚焦模式：仅保留“目标节点 + 一跳邻居”高亮。
    if (focusedNodeId) {
      const connectedIds = new Set<string>();
      connectedIds.add(focusedNodeId);

      for (const e of simEdges) {
        if (e.source.id === focusedNodeId) connectedIds.add(e.target.id);
        if (e.target.id === focusedNodeId) connectedIds.add(e.source.id);
      }

      nodeSelection.select("path")
        .attr("opacity", d => connectedIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      nodeSelection.select("text")
        .attr("opacity", d => connectedIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      edgeSelection
        .attr("stroke-opacity", d => (connectedIds.has(d.source.id) && connectedIds.has(d.target.id))
          ? EDGE_OPACITY_BASE
          : FOCUS_DIM_OPACITY * 0.5);
    }

    // 路径高亮：优先级高于普通显示，用于“最短路径查找结果”强调。
    if (highlightPathIds && highlightPathIds.size > 0) {
      nodeSelection.select("path")
        .attr("opacity", d => highlightPathIds.has(d.id) ? 1 : FOCUS_DIM_OPACITY);
      edgeSelection
        .attr("stroke-opacity", d =>
          highlightPathIds.has(d.source.id) && highlightPathIds.has(d.target.id)
            ? 1
            : FOCUS_DIM_OPACITY * 0.5
        )
        .attr("stroke-width", d =>
          highlightPathIds.has(d.source.id) && highlightPathIds.has(d.target.id)
            ? d.weight * 2 + 3
            : Math.max(1, d.weight * 1.5)
        );
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
      });

    simulationRef.current = simulation;

    // 径向布局：在保留力学稳定性的同时用半径表达层次。
    if (layoutMode === "radial") {
      simulation.force("center", null);
      simulation.force("radial", forceRadial<SimulationNode>(
        d => 120 + (1 - d.influence / maxInfluence) * 200,
        width / 2,
        height / 2
      ).strength(0.8));
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
    dimensions, filteredNodes, filteredEdges, factionColors, maxInfluence,
    focusedNodeId, highlightPathIds, layoutMode,
    onNodeClick, onNodeDoubleClick, onNodeRightClick, onEdgeHover, onBackgroundClick
  ]);

  // 当渲染依赖变化时重绘；卸载时停止 simulation，防止后台持续占用 CPU。
  useEffect(() => {
    renderGraph();
    return () => {
      simulationRef.current?.stop();
    };
  }, [renderGraph]);

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
