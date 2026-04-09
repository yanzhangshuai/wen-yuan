import { describe, expect, it } from "vitest";

import { resolveRadialAnchorNodeId } from "@/components/graph/force-graph";

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
});
