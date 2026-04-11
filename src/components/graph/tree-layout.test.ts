import { describe, expect, it } from "vitest";

import { buildTreeLayoutPlan, treeLayoutTesting } from "@/components/graph/tree-layout";

describe("buildTreeLayoutPlan", () => {
  it("returns an empty plan when there are no nodes or the viewport is invalid", () => {
    const emptyPlan = buildTreeLayoutPlan({
      nodes : [],
      edges : [],
      width : 900,
      height: 640
    });
    const zeroWidthPlan = buildTreeLayoutPlan({
      nodes : [{ id: "a", influence: 1 }],
      edges : [],
      width : 0,
      height: 640
    });
    const zeroHeightPlan = buildTreeLayoutPlan({
      nodes : [{ id: "a", influence: 1 }],
      edges : [],
      width : 900,
      height: 0
    });

    expect(emptyPlan.positions.size).toBe(0);
    expect(emptyPlan.isolatedLaneBounds).toBeNull();
    expect(zeroWidthPlan.positions.size).toBe(0);
    expect(zeroHeightPlan.positions.size).toBe(0);
  });

  it("picks the highest-degree node as root when influence ties", () => {
    const plan = buildTreeLayoutPlan({
      nodes: [
        { id: "a", influence: 1 },
        { id: "b", influence: 1 },
        { id: "c", influence: 1 }
      ],
      edges: [
        { source: "a", target: "c" },
        { source: "b", target: "c" }
      ],
      width : 900,
      height: 640
    });

    const a = plan.positions.get("a");
    const b = plan.positions.get("b");
    const c = plan.positions.get("c");

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();

    // degree(c)=2 > degree(a/b)=1，应该在最上层。
    expect(c!.y).toBeLessThan(a!.y);
    expect(c!.y).toBeLessThan(b!.y);
  });

  it("uses id ascending as final root tie-breaker", () => {
    const plan = buildTreeLayoutPlan({
      nodes: [
        { id: "b", influence: 1 },
        { id: "a", influence: 1 }
      ],
      edges : [{ source: "a", target: "b" }],
      width : 640,
      height: 480
    });

    const a = plan.positions.get("a");
    const b = plan.positions.get("b");

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.y).toBeLessThan(b!.y);
  });

  it("separates connected components and places isolated nodes in a dedicated lane", () => {
    const plan = buildTreeLayoutPlan({
      nodes: [
        { id: "a", influence: 3 },
        { id: "b", influence: 2 },
        { id: "c", influence: 4 },
        { id: "d", influence: 1 },
        { id: "e", influence: 1 }
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "c", target: "d" }
      ],
      width : 1200,
      height: 800
    });

    const a = plan.positions.get("a");
    const b = plan.positions.get("b");
    const c = plan.positions.get("c");
    const d = plan.positions.get("d");
    const e = plan.positions.get("e");

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    expect(d).toBeDefined();
    expect(e).toBeDefined();

    const lane = plan.isolatedLaneBounds;
    expect(lane).not.toBeNull();
    expect(plan.isolatedNodeIds.has("e")).toBe(true);
    expect(e!.y).toBeGreaterThanOrEqual(lane!.y);
    expect(e!.y).toBeLessThanOrEqual(lane!.y + lane!.height);

    const hierarchyLevels = new Set([a!.y, b!.y, c!.y, d!.y].map((value) => Math.round(value)));
    expect(hierarchyLevels.size).toBeGreaterThan(1);

    const componentOneCenterX = (a!.x + b!.x) / 2;
    const componentTwoCenterX = (c!.x + d!.x) / 2;
    expect(Math.abs(componentOneCenterX - componentTwoCenterX)).toBeGreaterThan(80);
  });

  it("allocates noticeably wider space to large components than tiny components", () => {
    const plan = buildTreeLayoutPlan({
      nodes: [
        { id: "a1", influence: 8 },
        { id: "a2", influence: 7 },
        { id: "a3", influence: 6 },
        { id: "a4", influence: 5 },
        { id: "a5", influence: 4 },
        { id: "a6", influence: 3 },
        { id: "a7", influence: 2 },
        { id: "a8", influence: 1 },
        { id: "b1", influence: 1 },
        { id: "b2", influence: 1 },
        { id: "b3", influence: 1 },
        { id: "c1", influence: 1 },
        { id: "c2", influence: 1 }
      ],
      edges: [
        { source: "a1", target: "a2" },
        { source: "a1", target: "a3" },
        { source: "a1", target: "a4" },
        { source: "a1", target: "a5" },
        { source: "a1", target: "a6" },
        { source: "a1", target: "a7" },
        { source: "a1", target: "a8" },
        { source: "b1", target: "b2" },
        { source: "b1", target: "b3" },
        { source: "c1", target: "c2" }
      ],
      width : 1400,
      height: 840
    });

    const componentAXs = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]
      .map((id) => plan.positions.get(id)!.x);
    const componentBXs = ["b1", "b2", "b3"].map((id) => plan.positions.get(id)!.x);

    const spreadA = Math.max(...componentAXs) - Math.min(...componentAXs);
    const spreadB = Math.max(...componentBXs) - Math.min(...componentBXs);
    expect(spreadA).toBeGreaterThan(spreadB * 1.4);

    const avgAY = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]
      .map((id) => plan.positions.get(id)!.y)
      .reduce((sum, value) => sum + value, 0) / 8;
    const avgBY = ["b1", "b2", "b3"]
      .map((id) => plan.positions.get(id)!.y)
      .reduce((sum, value) => sum + value, 0) / 3;
    expect(avgAY).toBeLessThan(avgBY);
  });

  it("gives dominant components a taller row to avoid dense clustering", () => {
    const largeNodes = Array.from({ length: 25 }, (_, index) => ({
      id       : `a${index + 1}`,
      influence: 1
    }));
    const largeEdges = Array.from({ length: 24 }, (_, index) => ({
      source: "a1",
      target: `a${index + 2}`
    }));

    const plan = buildTreeLayoutPlan({
      nodes: [
        ...largeNodes,
        { id: "b1", influence: 1 },
        { id: "b2", influence: 1 },
        { id: "c1", influence: 1 },
        { id: "c2", influence: 1 }
      ],
      edges: [
        ...largeEdges,
        { source: "b1", target: "b2" },
        { source: "c1", target: "c2" }
      ],
      width : 1400,
      height: 900
    });

    const largeSpreadY = (() => {
      const ys = largeNodes.map((node) => plan.positions.get(node.id)!.y);
      return Math.max(...ys) - Math.min(...ys);
    })();
    const tinySpreadY = (() => {
      const ys = ["b1", "b2"].map((id) => plan.positions.get(id)!.y);
      return Math.max(...ys) - Math.min(...ys);
    })();

    expect(largeSpreadY).toBeGreaterThan(tinySpreadY * 1.4);
  });

  it("uses only the isolated lane when the graph has no connected components", () => {
    const plan = buildTreeLayoutPlan({
      nodes: [
        { id: "a", influence: 3 },
        { id: "b", influence: 2 },
        { id: "c", influence: 1 }
      ],
      edges : [],
      width : 900,
      height: 520
    });

    expect(plan.isolatedLaneBounds).not.toBeNull();
    expect(plan.isolatedNodeIds).toEqual(new Set(["a", "b", "c"]));

    const lane = plan.isolatedLaneBounds!;
    for (const nodeId of ["a", "b", "c"]) {
      const position = plan.positions.get(nodeId);
      expect(position).toBeDefined();
      expect(position!.x).toBeGreaterThanOrEqual(lane.x);
      expect(position!.x).toBeLessThanOrEqual(lane.x + lane.width);
      expect(position!.y).toBeGreaterThanOrEqual(lane.y);
      expect(position!.y).toBeLessThanOrEqual(lane.y + lane.height);
    }
  });

  it("ignores self loops and edges that point to missing nodes", () => {
    const plan = buildTreeLayoutPlan({
      nodes: [
        { id: "a", influence: 4 },
        { id: "b", influence: 2 },
        { id: "c", influence: 1 }
      ],
      edges: [
        { source: "a", target: "a" },
        { source: "a", target: "missing" },
        { source: "missing", target: "b" }
      ],
      width : 960,
      height: 540
    });

    expect(plan.isolatedNodeIds).toEqual(new Set(["a", "b", "c"]));
    expect(plan.isolatedLaneBounds).not.toBeNull();
    expect(plan.positions.get("a")).toBeDefined();
    expect(plan.positions.get("b")).toBeDefined();
    expect(plan.positions.get("c")).toBeDefined();
  });

  it("omits the isolated lane when every node belongs to a connected component", () => {
    const plan = buildTreeLayoutPlan({
      nodes: [
        { id: "a", influence: 5 },
        { id: "b", influence: 4 },
        { id: "c", influence: 3 }
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" }
      ],
      width : 960,
      height: 540
    });

    expect(plan.isolatedNodeIds.size).toBe(0);
    expect(plan.isolatedLaneBounds).toBeNull();
    expect(plan.positions.get("a")!.y).toBeLessThan(plan.positions.get("b")!.y);
    expect(plan.positions.get("b")!.y).toBeLessThanOrEqual(plan.positions.get("c")!.y);
  });
});

describe("treeLayoutTesting helpers", () => {
  it("clamps values and compares node priority deterministically", () => {
    expect(treeLayoutTesting.clamp(-4, 1, 9)).toBe(1);
    expect(treeLayoutTesting.clamp(12, 1, 9)).toBe(9);
    expect(treeLayoutTesting.clamp(4, 1, 9)).toBe(4);

    expect(treeLayoutTesting.compareNodeMeta(
      { id: "a", influence: 1, degree: 1 },
      { id: "b", influence: 3, degree: 1 }
    )).toBeGreaterThan(0);
    expect(treeLayoutTesting.compareNodeMeta(
      { id: "a", influence: 3, degree: 1 },
      { id: "b", influence: 3, degree: 2 }
    )).toBeGreaterThan(0);
    expect(treeLayoutTesting.compareNodeMeta(
      { id: "b", influence: 3, degree: 2 },
      { id: "a", influence: 3, degree: 2 }
    )).toBeGreaterThan(0);
  });

  it("builds adjacency and components while ignoring invalid edges", () => {
    const adjacency = treeLayoutTesting.buildAdjacency(new Set(["a", "b", "c"]), [
      { source: "a", target: "b" },
      { source: "a", target: "a" },
      { source: "a", target: "missing" }
    ]);

    expect(adjacency.get("a")).toEqual(new Set(["b"]));
    expect(adjacency.get("b")).toEqual(new Set(["a"]));
    expect(adjacency.get("c")).toEqual(new Set());

    expect(treeLayoutTesting.collectConnectedComponents(["a", "b", "c"], adjacency)).toEqual([
      ["a", "b"],
      ["c"]
    ]);
    expect(treeLayoutTesting.sortByNodePriority(["b", "a"], new Map())).toEqual(["a", "b"]);
    expect(treeLayoutTesting.pickStableRoot([], new Map())).toBe("");
  });

  it("handles missing adjacency/meta entries and empty component roots gracefully", () => {
    expect(treeLayoutTesting.collectConnectedComponents(["c", "a", "b"], new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["a"])]
    ]))).toEqual([
      ["c"],
      ["a", "b"]
    ]);

    expect(treeLayoutTesting.sortByNodePriority(["b", "a"], new Map([
      ["a", { id: "a", influence: 3, degree: 2 }]
    ]))).toEqual(["a", "b"]);

    expect(treeLayoutTesting.assignLevels([], new Map(), new Map())).toEqual(new Map());
  });

  it("assigns disconnected leftovers to trailing levels when adjacency is incomplete", () => {
    const nodeMeta = new Map([
      ["a", { id: "a", influence: 5, degree: 1 }],
      ["b", { id: "b", influence: 4, degree: 1 }],
      ["c", { id: "c", influence: 1, degree: 0 }]
    ]);
    const adjacency = new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["a"])]
    ]);

    const levels = treeLayoutTesting.assignLevels(["a", "b", "c"], adjacency, nodeMeta);

    expect(levels.get("a")).toBe(0);
    expect(levels.get("b")).toBe(1);
    expect(levels.get("c")).toBe(2);
  });

  it("resolves hierarchy and lane heights across isolated-only and mixed layouts", () => {
    expect(treeLayoutTesting.resolveHierarchyAndLaneHeights(420, false, true)).toEqual({
      hierarchyHeight: 420,
      laneHeight     : 0,
      laneGap        : 0
    });
    expect(treeLayoutTesting.resolveHierarchyAndLaneHeights(420, true, false)).toEqual({
      hierarchyHeight: 0,
      laneHeight     : 420,
      laneGap        : 0
    });

    expect(treeLayoutTesting.resolveHierarchyAndLaneHeights(180, true, true)).toEqual({
      hierarchyHeight: 120,
      laneHeight     : 77,
      laneGap        : 18
    });
  });

  it("balances weighted rows and component frames for dominant and empty inputs", () => {
    expect(treeLayoutTesting.pickLightestRowIndex([
      { components: [], maxWeight: 0, totalWeight: 5 },
      { components: [], maxWeight: 0, totalWeight: 3 },
      { components: [], maxWeight: 0, totalWeight: 3 }
    ])).toBe(1);

    expect(treeLayoutTesting.buildRowHeights([], 100)).toEqual([]);
    const rowHeights = treeLayoutTesting.buildRowHeights([
      {
        components : [{ nodeIds: ["a"], weight: 4 }],
        maxWeight  : 4,
        totalWeight: 4
      },
      {
        components : [{ nodeIds: ["b"], weight: 1 }],
        maxWeight  : 1,
        totalWeight: 1
      }
    ], 100);
    expect(rowHeights).toHaveLength(2);
    expect(rowHeights[0] + rowHeights[1]).toBeCloseTo(100, 5);
    expect(rowHeights[0]).toBeGreaterThan(rowHeights[1]);

    expect(treeLayoutTesting.buildWeightedRows([], 2)).toEqual([
      { components: [], maxWeight: 0, totalWeight: 0 },
      { components: [], maxWeight: 0, totalWeight: 0 }
    ]);

    const dominantRows = treeLayoutTesting.buildWeightedRows([
      { nodeIds: Array.from({ length: 10 }, (_, index) => `a${index}`), weight: 10 },
      { nodeIds: ["b1", "b2"], weight: 2 },
      { nodeIds: ["c1"], weight: 1 }
    ], 2);
    expect(dominantRows[0]?.components).toHaveLength(1);
    expect(dominantRows[1]?.components).toHaveLength(2);

    const balancedRows = treeLayoutTesting.buildWeightedRows([
      { nodeIds: ["a1", "a2", "a3"], weight: 3 },
      { nodeIds: ["b1", "b2"], weight: 2 },
      { nodeIds: ["c1"], weight: 1 }
    ], 2);
    expect(balancedRows[0]?.totalWeight).toBe(3);
    expect(balancedRows[1]?.totalWeight).toBe(3);

    expect(treeLayoutTesting.buildComponentFrames([], {
      x     : 0,
      y     : 0,
      width : 400,
      height: 200
    })).toEqual([]);

    const frames = treeLayoutTesting.buildComponentFrames([
      Array.from({ length: 16 }, (_, index) => `big-${index}`),
      ["mid-1", "mid-2", "mid-3"],
      ["small-1", "small-2"]
    ], {
      x     : 0,
      y     : 0,
      width : 900,
      height: 360
    });

    expect(frames).toHaveLength(3);
    expect(frames[0].nodeIds).toHaveLength(16);
    expect(frames[0].width).toBeGreaterThan(frames[2].width);
    expect(frames[0].height).toBeGreaterThan(0);
  });

  it("handles sparse row arrays and zero-row allocations defensively", () => {
    const sparseRows: Array<{ components: []; maxWeight: number; totalWeight: number } | undefined> = [];
    sparseRows[2] = { components: [], maxWeight: 0, totalWeight: 5 };

    expect(treeLayoutTesting.pickLightestRowIndex(sparseRows as never)).toBe(0);
    expect(treeLayoutTesting.buildWeightedRows([
      { nodeIds: ["a"], weight: 1 }
    ], 0)).toEqual([]);
  });

  it("keeps duplicate node ids stable through the final fallback positioning pass", () => {
    const plan = buildTreeLayoutPlan({
      nodes: [
        { id: "dup", influence: 3 },
        { id: "dup", influence: 1 },
        { id: "leaf", influence: 1 }
      ],
      edges: [
        { source: "dup", target: "leaf" }
      ],
      width : 480,
      height: 320
    });

    expect(plan.positions.has("dup")).toBe(true);
    expect(plan.positions.has("leaf")).toBe(true);
    expect(plan.positions.size).toBe(2);
  });
});
