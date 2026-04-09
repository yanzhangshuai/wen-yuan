export interface RadialLayoutEdgeRef {
  source: string;
  target: string;
}

export interface RadialHopPlanInput {
  nodeIds     : string[];
  edges       : RadialLayoutEdgeRef[];
  anchorNodeId: string | null;
}

export interface RadialHopPlan {
  hopByNodeId: Map<string, number>;
  maxHop     : number;
}

const DISCONNECTED_HOP_OFFSET = 2;

export function buildRadialHopPlan(input: RadialHopPlanInput): RadialHopPlan {
  const hopByNodeId = new Map<string, number>();
  if (input.nodeIds.length === 0 || !input.anchorNodeId) {
    return {
      hopByNodeId,
      maxHop: 0
    };
  }

  const nodeIdSet = new Set(input.nodeIds);
  if (!nodeIdSet.has(input.anchorNodeId)) {
    return {
      hopByNodeId,
      maxHop: 0
    };
  }

  const adjacency = new Map<string, Set<string>>();
  for (const nodeId of input.nodeIds) {
    adjacency.set(nodeId, new Set());
  }

  for (const edge of input.edges) {
    if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target) || edge.source === edge.target) {
      continue;
    }
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const queue: string[] = [input.anchorNodeId];
  hopByNodeId.set(input.anchorNodeId, 0);
  for (let index = 0; index < queue.length; index += 1) {
    const currentNodeId = queue[index];
    const currentHop = hopByNodeId.get(currentNodeId) ?? 0;
    const neighbors = adjacency.get(currentNodeId);
    if (!neighbors) {
      continue;
    }
    for (const neighborNodeId of neighbors) {
      if (hopByNodeId.has(neighborNodeId)) {
        continue;
      }
      hopByNodeId.set(neighborNodeId, currentHop + 1);
      queue.push(neighborNodeId);
    }
  }

  const reachableMaxHop = Math.max(...hopByNodeId.values(), 0);
  const disconnectedHop = reachableMaxHop + DISCONNECTED_HOP_OFFSET;
  for (const nodeId of input.nodeIds) {
    if (hopByNodeId.has(nodeId)) {
      continue;
    }
    hopByNodeId.set(nodeId, disconnectedHop);
  }

  const maxHop = Math.max(...hopByNodeId.values(), 0);
  return {
    hopByNodeId,
    maxHop
  };
}
