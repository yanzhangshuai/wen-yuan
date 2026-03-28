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

/* ------------------------------------------------
   Constants
   ------------------------------------------------ */
const MIN_NODE_RADIUS = 8;
const MAX_NODE_RADIUS = 32;
const EDGE_OPACITY_BASE = 0.6;
const FOCUS_DIM_OPACITY = 0.1;
const TRANSITION_DURATION = 400;

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface ForceGraphProps {
  snapshot          : GraphSnapshot;
  theme             : string | undefined;
  chapterCap?       : number;
  filter?           : GraphFilter;
  layoutMode?       : GraphLayoutMode;
  focusedNodeId?    : string | null;
  onNodeClick?      : (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onNodeRightClick? : (node: GraphNode, position: { x: number; y: number }) => void;
  onEdgeHover?      : (edge: GraphEdge | null) => void;
  onBackgroundClick?: () => void;
  highlightPathIds? : Set<string>;
}

/* ------------------------------------------------
   Helpers
   ------------------------------------------------ */
function nodeRadius(influence: number, maxInfluence: number): number {
  if (maxInfluence <= 0) return MIN_NODE_RADIUS;
  const t = Math.min(influence / maxInfluence, 1);
  return MIN_NODE_RADIUS + t * (MAX_NODE_RADIUS - MIN_NODE_RADIUS);
}

function nodePath(type: string, r: number): string {
  if (type === "LOCATION") {
    // Diamond
    return `M0,${-r} L${r},0 L0,${r} L${-r},0 Z`;
  }
  if (type === "ORGANIZATION") {
    // Hexagon
    const a = r;
    const pts = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      return `${a * Math.cos(angle)},${a * Math.sin(angle)}`;
    });
    return `M${pts.join("L")}Z`;
  }
  // Circle (PERSON default)
  return symbol().type(symbolCircle).size(Math.PI * r * r)() ?? "";
}

function edgeColor(sentiment: string): string {
  if (sentiment === "positive") return "var(--color-graph-edge-positive)";
  if (sentiment === "negative") return "var(--color-graph-edge-negative)";
  return "var(--color-muted-fg)";
}

function shouldIncludeNode(node: GraphNode, filter?: GraphFilter): boolean {
  if (!filter) return true;
  if (filter.statuses.length > 0 && !filter.statuses.includes(node.status)) return false;
  if (filter.factionIndices.length > 0 && !filter.factionIndices.includes(node.factionIndex)) return false;
  if (filter.searchQuery) {
    const q = filter.searchQuery.toLowerCase();
    if (!node.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

function shouldIncludeEdge(edge: GraphEdge, filter?: GraphFilter, visibleNodeIds?: Set<string>): boolean {
  if (visibleNodeIds && (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target))) return false;
  if (!filter) return true;
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
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<Simulation<SimulationNode, SimulationEdge> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const factionColors = getFactionColorsForTheme(theme);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Filter data
  const filteredNodes = snapshot.nodes.filter(n => shouldIncludeNode(n, filter));
  const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = snapshot.edges.filter(e => shouldIncludeEdge(e, filter, visibleNodeIds));

  const maxInfluence = Math.max(1, ...filteredNodes.map(n => n.influence));

  // Main D3 render effect
  const renderGraph = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || dimensions.width === 0) return;

    const { width, height } = dimensions;
    const sel = select(svg);

    // Clean up previous
    sel.selectAll("*").remove();
    simulationRef.current?.stop();

    // Defs for filters
    const defs = sel.append("defs");

    // Glow filter for verified nodes
    const glowFilter = defs.append("filter").attr("id", "glow");
    glowFilter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    const merge = glowFilter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // Arrow markers for directed edges
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
      .attr("fill", "var(--color-muted-fg)");

    // Main group (for zoom/pan)
    const g = sel.append("g").attr("class", "graph-main");

    // Zoom behavior
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
      });

    sel.call(zoomBehavior);
    sel.on("click", (event: MouseEvent) => {
      if (event.target === svg) {
        onBackgroundClick?.();
      }
    });

    // Prepare simulation data
    const simNodes: SimulationNode[] = filteredNodes.map(n => ({
      ...n,
      x: n.x ?? width / 2 + (Math.random() - 0.5) * width * 0.6,
      y: n.y ?? height / 2 + (Math.random() - 0.5) * height * 0.6
    }));

    const nodeMap = new Map<string, SimulationNode>();
    for (const n of simNodes) nodeMap.set(n.id, n);

    const simEdges: SimulationEdge[] = filteredEdges
      .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map(e => ({
        ...e,
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!
      }));

    // Draw edges
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
        onEdgeHover?.({
          id       : d.id,
          source   : d.source.id,
          target   : d.target.id,
          type     : d.type,
          weight   : d.weight,
          sentiment: d.sentiment,
          status   : d.status
        });
        select(this).attr("stroke-width", d.weight * 2 + 2);
      })
      .on("mouseleave", function (_event, d) {
        onEdgeHover?.(null);
        select(this).attr("stroke-width", Math.max(1, Math.min(d.weight * 1.5, 6)));
      });

    // Edge labels (shown on hover via CSS)
    const edgeLabelGroup = g.append("g").attr("class", "edge-labels");
    const edgeLabelSelection = edgeLabelGroup.selectAll<SVGTextElement, SimulationEdge>("text")
      .data(simEdges, d => d.id)
      .enter()
      .append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "var(--color-muted-fg)")
      .attr("opacity", 0)
      .text(d => d.type);

    // Draw nodes
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
            simulationRef.current.alphaTarget(0.3).restart();
          }
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
          d.fx = null;
          d.fy = null;
        })
      );

    // Node shape
    nodeSelection.append("path")
      .attr("d", d => {
        const r = nodeRadius(d.influence, maxInfluence);
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

    // Node label
    nodeSelection.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", d => nodeRadius(d.influence, maxInfluence) + 14)
      .attr("font-size", d => d.influence > maxInfluence * 0.5 ? "12px" : "10px")
      .attr("fill", "var(--color-fg)")
      .attr("pointer-events", "none")
      .text(d => d.name);

    // Node interactions
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
        select(this).select("path").attr("filter", "url(#glow)");
      })
      .on("mouseleave", function (_, d) {
        select(this).select("path")
          .attr("filter", d.status === "VERIFIED" ? "url(#glow)" : "none");
      });

    // Focus dim (double-click isolation)
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

    // Highlight path
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

    // Force simulation
    const simulation = forceSimulation<SimulationNode>(simNodes)
      .force("link", forceLink<SimulationNode, SimulationEdge>(simEdges)
        .id(d => d.id)
        .distance(d => 80 / Math.max(d.weight, 0.5))
        .strength(d => Math.min(d.weight * 0.3, 1))
      )
      .force("charge", forceManyBody()
        .strength(d => -60 - (d as SimulationNode).influence * 2)
      )
      .force("center", forceCenter(width / 2, height / 2))
      .force("collision", forceCollide<SimulationNode>()
        .radius(d => nodeRadius(d.influence, maxInfluence) + 4)
      )
      .on("tick", () => {
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

    // Radial layout override
    if (layoutMode === "radial") {
      simulation.force("center", null);
      simulation.force("radial", forceRadial<SimulationNode>(
        d => 120 + (1 - d.influence / maxInfluence) * 200,
        width / 2,
        height / 2
      ).strength(0.8));
    }

    // Initial zoom to fit
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
