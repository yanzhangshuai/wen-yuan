/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForceGraph,
  forceGraphTesting,
  resolveRadialAnchorNodeId
} from "@/components/graph/force-graph";
import type {
  GraphEdge,
  GraphFilter,
  GraphNode,
  GraphSnapshot,
  SimulationEdge,
  SimulationNode
} from "@/types/graph";

const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 640;

class MockResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback([{
      target,
      contentRect: {
        width : GRAPH_WIDTH,
        height: GRAPH_HEIGHT
      }
    } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  disconnect() {}

  unobserve() {}
}

const originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, "getBBox");
const originalSvgWidth = Object.getOwnPropertyDescriptor(SVGSVGElement.prototype, "width");
const originalSvgHeight = Object.getOwnPropertyDescriptor(SVGSVGElement.prototype, "height");
const originalSvgViewBox = Object.getOwnPropertyDescriptor(SVGSVGElement.prototype, "viewBox");

function installMockSvgGetBBox(bounds = {
  x     : 20,
  y     : 16,
  width : 420,
  height: 280
}) {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value() {
      return bounds;
    }
  });
}

function restoreOriginalSvgGetBBox() {
  if (originalGetBBox) {
    Object.defineProperty(SVGElement.prototype, "getBBox", originalGetBBox);
    return;
  }

  Reflect.deleteProperty(SVGElement.prototype, "getBBox");
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(16);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});

  installMockSvgGetBBox();

  Object.defineProperties(SVGSVGElement.prototype, {
    width: {
      configurable: true,
      get() {
        return { baseVal: { value: GRAPH_WIDTH } };
      }
    },
    height: {
      configurable: true,
      get() {
        return { baseVal: { value: GRAPH_HEIGHT } };
      }
    },
    viewBox: {
      configurable: true,
      get() {
        return {
          baseVal: {
            x     : 0,
            y     : 0,
            width : GRAPH_WIDTH,
            height: GRAPH_HEIGHT
          }
        };
      }
    }
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  restoreOriginalSvgGetBBox();

  if (originalSvgWidth) {
    Object.defineProperty(SVGSVGElement.prototype, "width", originalSvgWidth);
  } else {
    Reflect.deleteProperty(SVGSVGElement.prototype, "width");
  }

  if (originalSvgHeight) {
    Object.defineProperty(SVGSVGElement.prototype, "height", originalSvgHeight);
  } else {
    Reflect.deleteProperty(SVGSVGElement.prototype, "height");
  }

  if (originalSvgViewBox) {
    Object.defineProperty(SVGSVGElement.prototype, "viewBox", originalSvgViewBox);
  } else {
    Reflect.deleteProperty(SVGSVGElement.prototype, "viewBox");
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

function buildNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id          : overrides.id ?? "hero",
    name        : overrides.name ?? "主角",
    nameType    : overrides.nameType ?? "NAMED",
    entityType  : overrides.entityType ?? "PERSON",
    status      : overrides.status ?? "VERIFIED",
    factionIndex: overrides.factionIndex ?? 0,
    influence   : overrides.influence ?? 10,
    x           : overrides.x ?? 120,
    y           : overrides.y ?? 120
  };
}

function buildSimulationNode(overrides: Partial<SimulationNode> = {}): SimulationNode {
  return {
    ...buildNode(overrides),
    x: overrides.x ?? 120,
    y: overrides.y ?? 120
  };
}

function buildEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id       : overrides.id ?? "edge-1",
    source   : overrides.source ?? "hero",
    target   : overrides.target ?? "ally",
    type     : overrides.type ?? "ALLY",
    weight   : overrides.weight ?? 2,
    sentiment: overrides.sentiment ?? "positive",
    status   : overrides.status ?? "VERIFIED"
  };
}

function buildSnapshot(): GraphSnapshot {
  return {
    nodes: [
      buildNode({
        id        : "hero",
        name      : "主角",
        entityType: "PERSON",
        status    : "VERIFIED",
        influence : 12,
        x         : 140,
        y         : 120
      }),
      buildNode({
        id          : "ally",
        name        : "城南",
        entityType  : "LOCATION",
        status      : "DRAFT",
        factionIndex: 1,
        influence   : 7,
        x           : 320,
        y           : 180
      }),
      buildNode({
        id          : "guild",
        name        : "白鹿书院",
        entityType  : "ORGANIZATION",
        status      : "REJECTED",
        factionIndex: 2,
        influence   : 9,
        x           : 540,
        y           : 220
      }),
      buildNode({
        id          : "wanderer",
        name        : "散人",
        entityType  : "PERSON",
        status      : "VERIFIED",
        factionIndex: 3,
        influence   : 4,
        x           : 780,
        y           : 420
      })
    ],
    edges: [
      buildEdge({
        id       : "edge-ally",
        source   : "hero",
        target   : "ally",
        type     : "ALLY",
        weight   : 2,
        sentiment: "positive",
        status   : "VERIFIED"
      }),
      buildEdge({
        id       : "edge-enemy",
        source   : "ally",
        target   : "guild",
        type     : "RIVAL",
        weight   : 1,
        sentiment: "negative",
        status   : "DRAFT"
      }),
      buildEdge({
        id       : "edge-mentor",
        source   : "hero",
        target   : "guild",
        type     : "MENTOR",
        weight   : 3,
        sentiment: "neutral",
        status   : "VERIFIED"
      })
    ]
  };
}

function findNodeGroup(container: HTMLElement, label: string): SVGGElement {
  const textNode = screen.getByText(label);
  const nodeGroup = textNode.closest("g.graph-node");

  if (!nodeGroup) {
    throw new Error(`graph node "${label}" not found`);
  }

  return nodeGroup as SVGGElement;
}

function findNodePath(container: HTMLElement, label: string): SVGPathElement {
  const nodeGroup = findNodeGroup(container, label);
  const nodePath = nodeGroup.querySelector("path");

  if (!nodePath) {
    throw new Error(`graph node path "${label}" not found`);
  }

  return nodePath;
}

function edgeLines(container: HTMLElement): SVGLineElement[] {
  return Array.from(container.querySelectorAll<SVGLineElement>("g.edges line"));
}

async function waitForGraphReady() {
  await waitFor(() => {
    expect(screen.getByText("主角")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "人物关系图谱，包含 4 个人物和 3 条关系"
    );
  });
}

describe("forceGraphTesting helpers", () => {
  it("covers size, path, color and stroke helpers", () => {
    expect(forceGraphTesting.nodeRadius(5, 0)).toBe(8);
    expect(forceGraphTesting.nodeRadius(40, 10)).toBe(32);

    expect(forceGraphTesting.nodePath("LOCATION", 12)).toContain("L");
    expect(forceGraphTesting.nodePath("ORGANIZATION", 12).match(/L/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(forceGraphTesting.nodePath("PERSON", 12)).toContain("A");

    expect(forceGraphTesting.resolveEdgeColor("ALLY", "negative", new Map([["ALLY", "#246bce"]]))).toBe("#246bce");
    expect(forceGraphTesting.resolveEdgeColor("RIVAL", "positive", new Map())).toBe("var(--color-graph-edge-positive)");
    expect(forceGraphTesting.resolveEdgeColor("RIVAL", "negative", new Map())).toBe("var(--color-graph-edge-negative)");
    expect(forceGraphTesting.resolveEdgeColor("RIVAL", "neutral", new Map())).toBe("var(--muted-foreground)");

    expect(forceGraphTesting.edgeBaseWidth(0.2)).toBe(1);
    expect(forceGraphTesting.edgeBaseWidth(10)).toBe(6);
    expect(forceGraphTesting.edgeEmphasisWidth(0)).toBe(3);
    expect(forceGraphTesting.edgeEmphasisWidth(10)).toBe(11);

    expect(forceGraphTesting.nodeBaseStrokeColor("DRAFT")).toBe("var(--color-graph-draft)");
    expect(forceGraphTesting.nodeBaseStrokeColor("VERIFIED")).toBe("var(--color-graph-verified-glow)");
    expect(forceGraphTesting.nodeBaseStrokeColor("REJECTED")).toBe("transparent");
    expect(forceGraphTesting.nodeBaseStrokeWidth("DRAFT")).toBe(2);
    expect(forceGraphTesting.nodeBaseStrokeWidth("VERIFIED")).toBe(1.5);
    expect(forceGraphTesting.nodeBaseStrokeDasharray()).toBe("none");
    expect(forceGraphTesting.nodeScaleTransform(1.2)).toBe("scale(1.2)");
  });

  it("covers faction fill and path highlighting helpers", () => {
    const factionColors = ["#111111", "#222222", "#333333"];
    const pathEdge: SimulationEdge = {
      ...buildEdge({ id: "edge-path" }),
      source: buildSimulationNode({ id: "hero" }),
      target: buildSimulationNode({ id: "ally" })
    };

    expect(forceGraphTesting.nodeFactionColor({ factionIndex: 1 }, [])).toBeNull();
    expect(forceGraphTesting.nodeFactionColor({ factionIndex: -1 }, factionColors)).toBe("#333333");
    expect(forceGraphTesting.nodeBaseFillColor({ factionIndex: 4 }, factionColors)).toBe("#222222");
    expect(forceGraphTesting.nodeBaseFillColor({ factionIndex: 0 }, [])).toBe("var(--color-graph-node)");
    expect(forceGraphTesting.nodeHighlightFillColor({ factionIndex: 1 }, factionColors))
      .toContain("#222222 82%");

    expect(forceGraphTesting.isPathEdge(pathEdge, undefined, new Set(["edge-path"]))).toBe(true);
    expect(forceGraphTesting.isPathEdge(pathEdge, new Set(["hero", "ally"]), undefined)).toBe(true);
    expect(forceGraphTesting.isPathEdge(pathEdge, new Set(["hero", "ally"]), new Set(["other-edge"]))).toBe(false);
    expect(forceGraphTesting.isPathEdge(pathEdge, undefined, undefined)).toBe(false);
  });

  it("covers node and edge filtering helpers", () => {
    const unconstrainedFilter: GraphFilter = {
      relationTypes : [],
      statuses      : [],
      factionIndices: [],
      searchQuery   : ""
    };
    const strictFilter: GraphFilter = {
      relationTypes : ["ALLY"],
      statuses      : ["DRAFT"],
      factionIndices: [1],
      searchQuery   : "城"
    };

    expect(forceGraphTesting.shouldIncludeNode(buildNode({ status: "REJECTED" }), undefined)).toBe(true);
    expect(forceGraphTesting.shouldIncludeNode(buildNode({ status: "REJECTED", factionIndex: 9 }), unconstrainedFilter)).toBe(true);
    expect(forceGraphTesting.shouldIncludeNode(buildNode({
      name        : "城南",
      status      : "DRAFT",
      factionIndex: 1
    }), strictFilter)).toBe(true);
    expect(forceGraphTesting.shouldIncludeNode(buildNode({
      name        : "主角",
      status      : "VERIFIED",
      factionIndex: 0
    }), strictFilter)).toBe(false);

    expect(forceGraphTesting.shouldIncludeEdge(buildEdge(), undefined, new Set(["hero", "ally"]))).toBe(true);
    expect(forceGraphTesting.shouldIncludeEdge(buildEdge(), undefined, new Set(["hero"]))).toBe(false);
    expect(forceGraphTesting.shouldIncludeEdge(buildEdge({ type: "RIVAL" }), strictFilter, new Set(["hero", "ally"]))).toBe(false);
    expect(forceGraphTesting.shouldIncludeEdge(buildEdge({ type: "ALLY" }), strictFilter, new Set(["hero", "ally"]))).toBe(true);
  });

  it("covers individual rejection reasons and empty path-edge fallback", () => {
    expect(forceGraphTesting.shouldIncludeNode(buildNode({ status: "VERIFIED" }), {
      relationTypes : [],
      statuses      : ["DRAFT"],
      factionIndices: [],
      searchQuery   : ""
    })).toBe(false);

    expect(forceGraphTesting.shouldIncludeNode(buildNode({ factionIndex: 0 }), {
      relationTypes : [],
      statuses      : [],
      factionIndices: [2],
      searchQuery   : ""
    })).toBe(false);

    expect(forceGraphTesting.shouldIncludeNode(buildNode({ name: "主角" }), {
      relationTypes : [],
      statuses      : [],
      factionIndices: [],
      searchQuery   : "书院"
    })).toBe(false);

    const pathEdge: SimulationEdge = {
      ...buildEdge({ id: "edge-fallback" }),
      source: buildSimulationNode({ id: "hero" }),
      target: buildSimulationNode({ id: "ally" })
    };

    expect(forceGraphTesting.isPathEdge(pathEdge, new Set(["hero", "ally"]), new Set())).toBe(true);
    expect(forceGraphTesting.shouldIncludeEdge(
      buildEdge(),
      undefined,
      new Set(["ally"])
    )).toBe(false);
  });
});

describe("resolveRadialAnchorNodeId", () => {
  it("returns null when layout mode is not radial", () => {
    const anchorId = resolveRadialAnchorNodeId({
      layoutMode   : "force",
      nodes        : [{ id: "n1", influence: 1 }],
      focusedNodeId: null
    });
    expect(anchorId).toBeNull();
  });

  it("prefers focused node when it is visible", () => {
    const anchorId = resolveRadialAnchorNodeId({
      layoutMode: "radial",
      nodes     : [
        { id: "a", influence: 10 },
        { id: "b", influence: 100 }
      ],
      focusedNodeId: "a"
    });
    expect(anchorId).toBe("a");
  });

  it("falls back to highest influence node when focused node is missing", () => {
    const anchorId = resolveRadialAnchorNodeId({
      layoutMode: "radial",
      nodes     : [
        { id: "a", influence: 20 },
        { id: "b", influence: 50 },
        { id: "c", influence: 30 }
      ],
      focusedNodeId: "missing"
    });
    expect(anchorId).toBe("b");
  });

  it("uses lexicographic id as tie-breaker for stable fallback", () => {
    const anchorId = resolveRadialAnchorNodeId({
      layoutMode: "radial",
      nodes     : [
        { id: "z-node", influence: 40 },
        { id: "a-node", influence: 40 }
      ],
      focusedNodeId: null
    });
    expect(anchorId).toBe("a-node");
  });

  it("returns null when radial layout has no visible nodes", () => {
    expect(resolveRadialAnchorNodeId({
      layoutMode   : "radial",
      nodes        : [],
      focusedNodeId: "hero"
    })).toBeNull();
  });
});

describe("ForceGraph", () => {
  it("renders graph metadata, node shapes, and edge colors", async () => {
    const snapshot = buildSnapshot();
    const typeColorMap = new Map<string, string>([["ALLY", "#246bce"]]);
    const { container } = render(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
        edgeTypeColorMap={typeColorMap}
      />
    );

    await waitForGraphReady();

    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "人物关系图谱，包含 4 个人物和 3 条关系"
    );

    const heroPath = findNodePath(container, "主角");
    const locationPath = findNodePath(container, "城南");
    const organizationPath = findNodePath(container, "白鹿书院");

    expect(heroPath.getAttribute("d")).toContain("A");
    expect(locationPath.getAttribute("d")).toContain("L");
    expect(locationPath.getAttribute("d")).not.toContain("A");
    expect(organizationPath.getAttribute("d")?.match(/L/g)?.length ?? 0).toBeGreaterThanOrEqual(5);

    expect(findNodeGroup(container, "主角")).toHaveClass("graph-node-verified");
    expect(findNodeGroup(container, "城南")).toHaveClass("graph-node-draft");

    const [allyEdge, enemyEdge, mentorEdge] = edgeLines(container);
    expect(allyEdge).toHaveAttribute("stroke", "#246bce");
    expect(enemyEdge).toHaveAttribute("stroke", "var(--color-graph-edge-negative)");
    expect(mentorEdge).toHaveAttribute("stroke", "var(--muted-foreground)");
  });

  it("filters nodes and edges, including tree isolated lane rendering", async () => {
    const snapshot = buildSnapshot();
    const filter: GraphFilter = {
      relationTypes : ["MENTOR"],
      statuses      : ["VERIFIED", "REJECTED"],
      factionIndices: [0, 2, 3],
      searchQuery   : ""
    };

    render(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
        filter={filter}
        layoutMode="tree"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute(
        "aria-label",
        "人物关系图谱，包含 3 个人物和 1 条关系"
      );
    });

    expect(screen.getByText("非树节点")).toBeInTheDocument();
    expect(screen.queryByText("城南")).toBeNull();
  });

  it("updates filtered counts when search query narrows the graph", async () => {
    const snapshot = buildSnapshot();
    const { rerender } = render(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
      />
    );

    await waitForGraphReady();

    rerender(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
        filter={{
          relationTypes : [],
          statuses      : [],
          factionIndices: [],
          searchQuery   : "白鹿"
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute(
        "aria-label",
        "人物关系图谱，包含 1 个人物和 0 条关系"
      );
    });

    expect(screen.getByText("白鹿书院")).toBeInTheDocument();
    expect(screen.queryByText("主角")).toBeNull();
  });

  it("bridges background, node, and edge interactions to callbacks", async () => {
    const onNodeClick = vi.fn();
    const onNodeDoubleClick = vi.fn();
    const onNodeRightClick = vi.fn();
    const onEdgeHover = vi.fn();
    const onBackgroundClick = vi.fn();
    const { container } = render(
      <ForceGraph
        snapshot={buildSnapshot()}
        theme="danqing"
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeRightClick={onNodeRightClick}
        onEdgeHover={onEdgeHover}
        onBackgroundClick={onBackgroundClick}
      />
    );

    await waitForGraphReady();

    const heroNode = findNodeGroup(container, "主角");
    const [allyEdge] = edgeLines(container);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();

    fireEvent.click(svg!);
    fireEvent.click(heroNode);
    fireEvent.doubleClick(heroNode);
    fireEvent.contextMenu(heroNode, { clientX: 48, clientY: 72 });
    fireEvent.mouseEnter(allyEdge);
    fireEvent.mouseLeave(allyEdge);

    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: "hero" }));
    expect(onNodeDoubleClick).toHaveBeenCalledWith(expect.objectContaining({ id: "hero" }));
    expect(onNodeRightClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "hero" }),
      { x: 48, y: 72 }
    );
    expect(onEdgeHover).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id    : "edge-ally",
      source: "hero",
      target: "ally"
    }));
    expect(onEdgeHover).toHaveBeenNthCalledWith(2, null);
    expect(allyEdge).toHaveAttribute("marker-end", "none");
  });

  it("applies active, focused, and highlighted-path emphasis across rerenders", async () => {
    const snapshot = buildSnapshot();
    const { container, rerender } = render(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
        focusedNodeId="hero"
        activeNodeId="guild"
      />
    );

    await waitForGraphReady();

    const heroPath = findNodePath(container, "主角");
    const guildPath = findNodePath(container, "白鹿书院");
    const wandererPath = findNodePath(container, "散人");

    expect(heroPath).toHaveAttribute("transform", "scale(1.2)");
    expect(guildPath).toHaveAttribute("transform", "scale(1.2)");
    expect(wandererPath).toHaveAttribute("opacity", "0.1");

    rerender(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
        activeNodeId="hero"
        highlightPathIds={new Set(["hero", "guild"])}
        highlightPathEdgeIds={new Set(["edge-mentor"])}
        pathAutoFitVersion={1}
      />
    );

    await waitFor(() => {
      const [allyEdge, enemyEdge, mentorEdge] = edgeLines(container);
      expect(findNodePath(container, "主角")).toHaveAttribute("transform", "scale(1.2)");
      expect(findNodePath(container, "散人")).toHaveAttribute("opacity", "0.1");
      expect(mentorEdge).toHaveAttribute("stroke", "var(--color-graph-highlight)");
      expect(mentorEdge).toHaveAttribute("marker-end", "url(#arrowhead)");
      expect(allyEdge).toHaveAttribute("stroke-opacity", "0.6");
      expect(Number(enemyEdge.getAttribute("stroke-opacity"))).toBeCloseTo(0.04);
    });
  });

  it("keeps both incoming and outgoing neighbors visible for a focused middle node", async () => {
    const { container } = render(
      <ForceGraph
        snapshot={buildSnapshot()}
        theme="danqing"
        focusedNodeId="ally"
      />
    );

    await waitForGraphReady();

    const heroPath = findNodePath(container, "主角");
    const allyPath = findNodePath(container, "城南");
    const guildPath = findNodePath(container, "白鹿书院");
    const wandererPath = findNodePath(container, "散人");
    const [allyEdge, enemyEdge, mentorEdge] = edgeLines(container);

    expect(heroPath).toHaveAttribute("opacity", "1");
    expect(allyPath).toHaveAttribute("transform", "scale(1.2)");
    expect(guildPath).toHaveAttribute("opacity", "1");
    expect(wandererPath).toHaveAttribute("opacity", "0.1");
    expect(allyEdge).toHaveAttribute("stroke-opacity", "0.6");
    expect(enemyEdge).toHaveAttribute("stroke-opacity", "0.6");
    expect(mentorEdge).toHaveAttribute("stroke-opacity", "0.6");
  });

  it("dims unrelated nodes and indirect edges for active-only emphasis", async () => {
    const { container } = render(
      <ForceGraph
        snapshot={buildSnapshot()}
        theme="danqing"
        activeNodeId="ally"
      />
    );

    await waitForGraphReady();

    const heroPath = findNodePath(container, "主角");
    const allyPath = findNodePath(container, "城南");
    const guildPath = findNodePath(container, "白鹿书院");
    const wandererPath = findNodePath(container, "散人");
    const [allyEdge, enemyEdge, mentorEdge] = edgeLines(container);

    await waitFor(() => {
      expect(heroPath).toHaveAttribute("opacity", "1");
      expect(allyPath).toHaveAttribute("transform", "scale(1.2)");
      expect(guildPath).toHaveAttribute("opacity", "1");
      expect(wandererPath).toHaveAttribute("opacity", "0.1");
      expect(allyEdge).toHaveAttribute("stroke-opacity", "0.6");
      expect(enemyEdge).toHaveAttribute("stroke-opacity", "0.6");
      expect(Number(mentorEdge.getAttribute("stroke-opacity"))).toBeCloseTo(0.04);
    });
  });

  it("renders radial layout without losing the focused anchor node", async () => {
    const { container } = render(
      <ForceGraph
        snapshot={buildSnapshot()}
        theme="danqing"
        layoutMode="radial"
        focusedNodeId="hero"
      />
    );

    await waitForGraphReady();

    expect(findNodePath(container, "主角")).toHaveAttribute("transform", "scale(1.2)");
    expect(screen.queryByText("非树节点")).toBeNull();
  });

  it("restores node hover state differently for active and inactive nodes", async () => {
    const { container } = render(
      <ForceGraph
        snapshot={buildSnapshot()}
        theme="danqing"
        activeNodeId="hero"
      />
    );

    await waitForGraphReady();

    const heroNode = findNodeGroup(container, "主角");
    const heroPath = findNodePath(container, "主角");
    const wandererNode = findNodeGroup(container, "散人");
    const wandererPath = findNodePath(container, "散人");

    fireEvent.mouseEnter(heroNode);
    expect(heroPath).toHaveAttribute("transform", "scale(1.2)");
    fireEvent.mouseLeave(heroNode);
    expect(heroPath).toHaveAttribute("transform", "scale(1.2)");

    fireEvent.mouseEnter(wandererNode);
    expect(wandererPath).toHaveAttribute("transform", "scale(1.1)");
    fireEvent.mouseLeave(wandererNode);
    expect(wandererPath).toHaveAttribute("transform", "scale(1)");
  });

  it("keeps focused nodes highlighted after hover leaves", async () => {
    const { container } = render(
      <ForceGraph
        snapshot={buildSnapshot()}
        theme="danqing"
        focusedNodeId="hero"
      />
    );

    await waitForGraphReady();

    const heroNode = findNodeGroup(container, "主角");
    const heroPath = findNodePath(container, "主角");

    fireEvent.mouseEnter(heroNode);
    expect(heroPath).toHaveAttribute("transform", "scale(1.2)");
    fireEvent.mouseLeave(heroNode);
    expect(heroPath).toHaveAttribute("transform", "scale(1.2)");
  });

  it("restores edge styles on leave for highlighted and normal edges", async () => {
    const { container } = render(
      <ForceGraph
        snapshot={buildSnapshot()}
        theme="danqing"
        highlightPathIds={new Set(["hero", "guild"])}
        highlightPathEdgeIds={new Set(["edge-mentor"])}
      />
    );

    await waitForGraphReady();

    const [allyEdge, , mentorEdge] = edgeLines(container);

    fireEvent.mouseEnter(mentorEdge);
    expect(mentorEdge).toHaveAttribute("stroke-width", "8");
    expect(mentorEdge).toHaveAttribute("marker-end", "url(#arrowhead)");
    fireEvent.mouseLeave(mentorEdge);
    expect(mentorEdge).toHaveAttribute("stroke-width", "9");
    expect(mentorEdge).toHaveAttribute("marker-end", "url(#arrowhead)");

    fireEvent.mouseEnter(allyEdge);
    expect(allyEdge).toHaveAttribute("marker-end", "url(#arrowhead)");
    fireEvent.mouseLeave(allyEdge);
    expect(allyEdge).toHaveAttribute("stroke-width", "3");
    expect(allyEdge).toHaveAttribute("marker-end", "none");
  });

  it("highlights path edges via node fallback or explicit edge ids", async () => {
    const snapshot = buildSnapshot();
    const { container, rerender } = render(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
        highlightPathIds={new Set(["hero", "ally"])}
      />
    );

    await waitForGraphReady();

    await waitFor(() => {
      const [allyEdge, enemyEdge, mentorEdge] = edgeLines(container);
      expect(allyEdge).toHaveAttribute("stroke", "var(--color-graph-highlight)");
      expect(allyEdge).toHaveAttribute("marker-end", "url(#arrowhead)");
      expect(enemyEdge).toHaveAttribute("marker-end", "none");
      expect(mentorEdge).toHaveAttribute("marker-end", "none");
    });

    rerender(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
        highlightPathEdgeIds={new Set(["edge-enemy"])}
      />
    );

    await waitFor(() => {
      const [allyEdge, enemyEdge, mentorEdge] = edgeLines(container);
      expect(enemyEdge).toHaveAttribute("stroke", "var(--color-graph-highlight)");
      expect(enemyEdge).toHaveAttribute("marker-end", "url(#arrowhead)");
      expect(allyEdge).toHaveAttribute("marker-end", "none");
      expect(mentorEdge).toHaveAttribute("marker-end", "none");
    });
  });

  it("skips path auto-fit when the highlighted path set is empty or invisible", async () => {
    const snapshot = buildSnapshot();
    const { rerender } = render(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
        highlightPathIds={new Set()}
        pathAutoFitVersion={1}
      />
    );

    await waitForGraphReady();

    rerender(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
        highlightPathIds={new Set(["missing-node"])}
        pathAutoFitVersion={2}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute(
        "aria-label",
        "人物关系图谱，包含 4 个人物和 3 条关系"
      );
    });
  });

  it("skips initial auto-fit when the rendered graph bounds are empty", async () => {
    const zeroBounds = {
      x     : 0,
      y     : 0,
      width : 0,
      height: 0
    };

    installMockSvgGetBBox(zeroBounds);

    try {
      render(
        <ForceGraph
          snapshot={buildSnapshot()}
          theme="danqing"
        />
      );

      await waitForGraphReady();
    } finally {
      installMockSvgGetBBox();
    }
  });

  it("drops dangling rendered edges when source or target nodes are missing", async () => {
    const snapshot: GraphSnapshot = {
      nodes: [
        buildNode({ id: "hero", name: "主角" }),
        buildNode({ id: "ally", name: "同伴" })
      ],
      edges: [
        buildEdge({
          id    : "edge-dangling",
          source: "hero",
          target: "missing-node"
        })
      ]
    };
    const { container } = render(
      <ForceGraph
        snapshot={snapshot}
        theme="danqing"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("主角")).toBeInTheDocument();
      expect(screen.getByText("同伴")).toBeInTheDocument();
    });

    expect(edgeLines(container)).toHaveLength(0);
  });
});
