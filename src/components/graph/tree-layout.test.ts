import { describe, expect, it } from "vitest";

import { buildTreeLayoutPlan } from "@/components/graph/tree-layout";

describe("buildTreeLayoutPlan", () => {
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
});
