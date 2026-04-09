import { describe, expect, it } from "vitest";

import { buildRadialHopPlan } from "@/components/graph/radial-layout";

describe("buildRadialHopPlan", () => {
  it("computes shortest-hop rings from the anchor node", () => {
    const plan = buildRadialHopPlan({
      nodeIds: ["a", "b", "c", "d", "e"],
      edges  : [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "b", target: "d" },
        { source: "d", target: "e" }
      ],
      anchorNodeId: "a"
    });

    expect(plan.hopByNodeId.get("a")).toBe(0);
    expect(plan.hopByNodeId.get("b")).toBe(1);
    expect(plan.hopByNodeId.get("c")).toBe(2);
    expect(plan.hopByNodeId.get("d")).toBe(2);
    expect(plan.hopByNodeId.get("e")).toBe(3);
    expect(plan.maxHop).toBe(3);
  });

  it("puts disconnected nodes on an outer ring", () => {
    const plan = buildRadialHopPlan({
      nodeIds: ["a", "b", "c", "d", "x"],
      edges  : [
        { source: "a", target: "b" },
        { source: "c", target: "d" }
      ],
      anchorNodeId: "a"
    });

    expect(plan.hopByNodeId.get("a")).toBe(0);
    expect(plan.hopByNodeId.get("b")).toBe(1);
    // reachable max hop = 1, disconnected hop = 1 + 2 = 3
    expect(plan.hopByNodeId.get("c")).toBe(3);
    expect(plan.hopByNodeId.get("d")).toBe(3);
    expect(plan.hopByNodeId.get("x")).toBe(3);
    expect(plan.maxHop).toBe(3);
  });

  it("returns empty plan when anchor is missing", () => {
    const plan = buildRadialHopPlan({
      nodeIds     : ["a", "b"],
      edges       : [{ source: "a", target: "b" }],
      anchorNodeId: null
    });

    expect(plan.hopByNodeId.size).toBe(0);
    expect(plan.maxHop).toBe(0);
  });
});
