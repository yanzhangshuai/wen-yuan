import type { GraphNode } from "@/types/graph";

export interface TreeLayoutEdgeRef {
  source: string;
  target: string;
}

export interface TreeLayoutPlanInput {
  nodes : Pick<GraphNode, "id" | "influence">[];
  edges : TreeLayoutEdgeRef[];
  width : number;
  height: number;
}

export interface TreeLayoutPosition {
  x: number;
  y: number;
}

export interface TreeLayoutLaneBounds {
  x     : number;
  y     : number;
  width : number;
  height: number;
}

export interface TreeLayoutPlan {
  positions         : Map<string, TreeLayoutPosition>;
  isolatedNodeIds   : Set<string>;
  isolatedLaneBounds: TreeLayoutLaneBounds | null;
}

interface NodeMeta {
  degree   : number;
  id       : string;
  influence: number;
}

interface WeightedComponentRef {
  nodeIds: string[];
  weight : number;
}

interface WeightedComponentRow {
  components : WeightedComponentRef[];
  maxWeight  : number;
  totalWeight: number;
}

interface ComponentFrame {
  nodeIds: string[];
  x      : number;
  y      : number;
  width  : number;
  height : number;
}

const MIN_OUTER_PADDING = 24;
const MAX_OUTER_PADDING = 56;
const DEFAULT_OUTER_PADDING_RATIO = 0.05;
const TREE_LANE_GAP = 18;
const TREE_LANE_HEIGHT_RATIO = 0.24;
const TREE_LANE_MAX_RATIO = 0.38;
const TREE_LANE_MIN_HEIGHT = 110;
const MIN_HIERARCHY_HEIGHT = 120;
const NODE_CELL_MIN_WIDTH = 110;
const COMPONENT_ROW_GAP = 18;
const COMPONENT_COLUMN_GAP = 14;
const DOMINANT_COMPONENT_WEIGHT_RATIO = 0.46;
const DOMINANT_COMPONENT_MIN_NODES = 10;
const ROW_VISUAL_WEIGHT_MAX_BONUS_RATIO = 0.8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function compareNodeMeta(left: NodeMeta, right: NodeMeta): number {
  if (right.influence !== left.influence) {
    return right.influence - left.influence;
  }
  if (right.degree !== left.degree) {
    return right.degree - left.degree;
  }

  return left.id.localeCompare(right.id);
}

function buildAdjacency(
  nodeIds: Set<string>,
  edges: TreeLayoutEdgeRef[]
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, new Set());
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    if (edge.source === edge.target) {
      continue;
    }

    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  return adjacency;
}

function buildNodeMeta(
  nodes: Pick<GraphNode, "id" | "influence">[],
  adjacency: Map<string, Set<string>>
): Map<string, NodeMeta> {
  const metaMap = new Map<string, NodeMeta>();
  for (const node of nodes) {
    const degree = adjacency.get(node.id)?.size ?? 0;
    metaMap.set(node.id, {
      id       : node.id,
      influence: node.influence,
      degree
    });
  }
  return metaMap;
}

function collectConnectedComponents(
  nodeIds: string[],
  adjacency: Map<string, Set<string>>
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const startId of nodeIds) {
    if (visited.has(startId)) {
      continue;
    }

    const queue: string[] = [startId];
    const component: string[] = [];
    visited.add(startId);

    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      component.push(currentId);
      const neighbors = adjacency.get(currentId);
      if (!neighbors) {
        continue;
      }

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) {
          continue;
        }
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    components.push(component);
  }

  return components;
}

function sortByNodePriority(nodeIds: string[], nodeMeta: Map<string, NodeMeta>): string[] {
  return [...nodeIds].sort((leftId, rightId) => {
    const leftMeta = nodeMeta.get(leftId);
    const rightMeta = nodeMeta.get(rightId);

    if (!leftMeta || !rightMeta) {
      return leftId.localeCompare(rightId);
    }

    return compareNodeMeta(leftMeta, rightMeta);
  });
}

function pickStableRoot(nodeIds: string[], nodeMeta: Map<string, NodeMeta>): string {
  const sorted = sortByNodePriority(nodeIds, nodeMeta);
  return sorted[0] ?? "";
}

function assignLevels(
  componentNodeIds: string[],
  adjacency: Map<string, Set<string>>,
  nodeMeta: Map<string, NodeMeta>
): Map<string, number> {
  const levels = new Map<string, number>();
  const componentSet = new Set(componentNodeIds);
  const rootId = pickStableRoot(componentNodeIds, nodeMeta);
  if (!rootId) {
    return levels;
  }

  const queue: string[] = [rootId];
  levels.set(rootId, 0);

  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index];
    const currentLevel = levels.get(currentId) ?? 0;
    const neighbors = adjacency.get(currentId);
    if (!neighbors) {
      continue;
    }

    const sortedNeighbors = sortByNodePriority(
      Array.from(neighbors).filter((nodeId) => componentSet.has(nodeId) && !levels.has(nodeId)),
      nodeMeta
    );

    for (const neighborId of sortedNeighbors) {
      levels.set(neighborId, currentLevel + 1);
      queue.push(neighborId);
    }
  }

  if (levels.size < componentNodeIds.length) {
    const currentMaxLevel = Math.max(...levels.values(), 0);
    const missingNodeIds = sortByNodePriority(
      componentNodeIds.filter((nodeId) => !levels.has(nodeId)),
      nodeMeta
    );
    for (const nodeId of missingNodeIds) {
      levels.set(nodeId, currentMaxLevel + 1);
    }
  }

  return levels;
}

function resolveHierarchyAndLaneHeights(
  contentHeight: number,
  hasIsolatedNodes: boolean,
  hasConnectedComponents: boolean
): { hierarchyHeight: number; laneHeight: number; laneGap: number } {
  if (!hasIsolatedNodes) {
    return {
      hierarchyHeight: contentHeight,
      laneHeight     : 0,
      laneGap        : 0
    };
  }

  if (!hasConnectedComponents) {
    return {
      hierarchyHeight: 0,
      laneHeight     : contentHeight,
      laneGap        : 0
    };
  }

  const laneMaxHeight = contentHeight * TREE_LANE_MAX_RATIO;
  let laneHeight = clamp(
    contentHeight * TREE_LANE_HEIGHT_RATIO,
    TREE_LANE_MIN_HEIGHT,
    Math.max(TREE_LANE_MIN_HEIGHT, laneMaxHeight)
  );

  let hierarchyHeight = contentHeight - laneHeight - TREE_LANE_GAP;
  if (hierarchyHeight < MIN_HIERARCHY_HEIGHT) {
    const reclaim = MIN_HIERARCHY_HEIGHT - hierarchyHeight;
    laneHeight = Math.max(TREE_LANE_MIN_HEIGHT * 0.7, laneHeight - reclaim);
    hierarchyHeight = contentHeight - laneHeight - TREE_LANE_GAP;
  }

  return {
    hierarchyHeight: Math.max(hierarchyHeight, MIN_HIERARCHY_HEIGHT),
    laneHeight     : Math.max(0, laneHeight),
    laneGap        : TREE_LANE_GAP
  };
}

function pickLightestRowIndex(rows: WeightedComponentRow[]): number {
  let rowIndex = 0;
  let minWeight = rows[0]?.totalWeight ?? 0;
  for (let index = 1; index < rows.length; index += 1) {
    const weight = rows[index]?.totalWeight ?? 0;
    if (weight < minWeight) {
      minWeight = weight;
      rowIndex = index;
    }
  }
  return rowIndex;
}

function appendComponentToRow(
  row: WeightedComponentRow,
  component: WeightedComponentRef
): void {
  row.components.push(component);
  row.totalWeight += component.weight;
  row.maxWeight = Math.max(row.maxWeight, component.weight);
}

function rowVisualWeight(row: WeightedComponentRow): number {
  return Math.max(1, row.totalWeight + row.maxWeight * ROW_VISUAL_WEIGHT_MAX_BONUS_RATIO);
}

function buildRowHeights(rows: WeightedComponentRow[], totalHeight: number): number[] {
  if (rows.length === 0) {
    return [];
  }

  const heights: number[] = [];
  let remainingHeight = totalHeight;
  let remainingWeight = rows.reduce((sum, row) => sum + rowVisualWeight(row), 0);

  rows.forEach((row, index) => {
    const isLast = index === rows.length - 1;
    if (isLast) {
      heights.push(Math.max(1, remainingHeight));
      return;
    }

    const weight = rowVisualWeight(row);
    const ratio = weight / Math.max(1, remainingWeight);
    const rowHeight = Math.max(1, remainingHeight * ratio);
    heights.push(rowHeight);
    remainingHeight -= rowHeight;
    remainingWeight -= weight;
  });

  return heights;
}

function buildWeightedRows(
  weightedComponents: WeightedComponentRef[],
  rowCount: number
): WeightedComponentRow[] {
  const rows: WeightedComponentRow[] = Array.from({ length: rowCount }, () => ({
    components : [],
    maxWeight  : 0,
    totalWeight: 0
  }));
  if (weightedComponents.length === 0) {
    return rows;
  }

  const totalWeight = weightedComponents.reduce((sum, component) => sum + component.weight, 0);
  const firstComponent = weightedComponents[0];
  const hasDominantComponent = rowCount > 1
    && !!firstComponent
    && firstComponent.nodeIds.length >= DOMINANT_COMPONENT_MIN_NODES
    && firstComponent.weight / Math.max(1, totalWeight) >= DOMINANT_COMPONENT_WEIGHT_RATIO;

  if (hasDominantComponent && firstComponent) {
    const firstRow = rows[0];
    if (!firstRow) {
      return rows;
    }
    appendComponentToRow(firstRow, firstComponent);
    const tailRows = rows.slice(1);
    for (const component of weightedComponents.slice(1)) {
      const tailRowIndex = pickLightestRowIndex(tailRows);
      const row = tailRows[tailRowIndex];
      if (!row) {
        continue;
      }
      appendComponentToRow(row, component);
    }
    return rows;
  }

  for (const component of weightedComponents) {
    const rowIndex = pickLightestRowIndex(rows);
    const row = rows[rowIndex];
    if (!row) {
      continue;
    }
    appendComponentToRow(row, component);
  }

  return rows;
}

function buildComponentFrames(
  components: string[][],
  bounds: { x: number; y: number; width: number; height: number }
): ComponentFrame[] {
  if (components.length === 0) {
    return [];
  }

  const rowCount = Math.max(1, Math.min(components.length, Math.round(Math.sqrt(components.length))));
  const weightedComponents: WeightedComponentRef[] = components.map((component) => ({
    nodeIds: component,
    // 用 sqrt 缩放，避免超大分量吞噬所有空间，同时让它明显获得更大版面。
    weight : Math.max(1, Math.sqrt(component.length))
  }));

  const rows = buildWeightedRows(weightedComponents, rowCount);
  const activeRows = rows
    .filter((row) => row.components.length > 0)
    .sort((left, right) => {
      const rightWeight = rowVisualWeight(right);
      const leftWeight = rowVisualWeight(left);
      if (rightWeight !== leftWeight) {
        return rightWeight - leftWeight;
      }
      return right.components.length - left.components.length;
    });
  if (activeRows.length === 0) {
    return [];
  }

  const totalRowGap = COMPONENT_ROW_GAP * Math.max(0, activeRows.length - 1);
  const allocatableHeight = Math.max(1, bounds.height - totalRowGap);
  const rowHeights = buildRowHeights(activeRows, allocatableHeight);
  let currentY = bounds.y;
  const frames: ComponentFrame[] = [];

  for (let rowIndex = 0; rowIndex < activeRows.length; rowIndex += 1) {
    const row = activeRows[rowIndex];
    if (!row) {
      continue;
    }
    const rowHeight = rowHeights[rowIndex] ?? Math.max(1, allocatableHeight / activeRows.length);
    const componentCount = row.components.length;
    const totalColumnGap = COMPONENT_COLUMN_GAP * Math.max(0, componentCount - 1);
    const usableRowWidth = Math.max(1, bounds.width - totalColumnGap);
    const rowWeight = row.totalWeight || componentCount;
    let currentX = bounds.x;

    row.components.forEach((component, index) => {
      const isLast = index === componentCount - 1;
      const widthShare = component.weight / rowWeight;
      const frameWidth = isLast
        ? Math.max(1, bounds.x + bounds.width - currentX)
        : Math.max(1, usableRowWidth * widthShare);

      frames.push({
        nodeIds: component.nodeIds,
        x      : currentX,
        y      : currentY,
        width  : frameWidth,
        height : rowHeight
      });

      currentX += frameWidth + COMPONENT_COLUMN_GAP;
    });

    currentY += rowHeight + COMPONENT_ROW_GAP;
  }

  return frames;
}

export function buildTreeLayoutPlan(input: TreeLayoutPlanInput): TreeLayoutPlan {
  const positions = new Map<string, TreeLayoutPosition>();
  if (input.nodes.length === 0 || input.width <= 0 || input.height <= 0) {
    return {
      positions,
      isolatedNodeIds   : new Set(),
      isolatedLaneBounds: null
    };
  }

  const nodeIds = new Set(input.nodes.map((node) => node.id));
  const adjacency = buildAdjacency(nodeIds, input.edges);
  const nodeMeta = buildNodeMeta(input.nodes, adjacency);

  const isolatedNodeIds = new Set<string>();
  const connectedNodeIds: string[] = [];
  for (const node of input.nodes) {
    const degree = nodeMeta.get(node.id)?.degree ?? 0;
    if (degree <= 0) {
      isolatedNodeIds.add(node.id);
    } else {
      connectedNodeIds.push(node.id);
    }
  }

  const components = collectConnectedComponents(connectedNodeIds, adjacency);
  components.sort((leftComponent, rightComponent) => {
    if (rightComponent.length !== leftComponent.length) {
      return rightComponent.length - leftComponent.length;
    }
    const leftRoot = pickStableRoot(leftComponent, nodeMeta);
    const rightRoot = pickStableRoot(rightComponent, nodeMeta);
    const leftMeta = nodeMeta.get(leftRoot);
    const rightMeta = nodeMeta.get(rightRoot);
    if (!leftMeta || !rightMeta) {
      return leftRoot.localeCompare(rightRoot);
    }
    return compareNodeMeta(leftMeta, rightMeta);
  });

  const outerPadding = clamp(
    Math.min(input.width, input.height) * DEFAULT_OUTER_PADDING_RATIO,
    MIN_OUTER_PADDING,
    MAX_OUTER_PADDING
  );
  const contentWidth = Math.max(1, input.width - outerPadding * 2);
  const contentHeight = Math.max(1, input.height - outerPadding * 2);
  const hasConnectedComponents = components.length > 0;
  const { hierarchyHeight, laneHeight, laneGap } = resolveHierarchyAndLaneHeights(
    contentHeight,
    isolatedNodeIds.size > 0,
    hasConnectedComponents
  );

  if (components.length > 0) {
    const componentFrames = buildComponentFrames(components, {
      x     : outerPadding,
      y     : outerPadding,
      width : contentWidth,
      height: Math.max(1, hierarchyHeight)
    });

    for (const componentFrame of componentFrames) {
      const componentNodeIds = componentFrame.nodeIds;
      const insetX = Math.min(28, componentFrame.width * 0.1);
      const insetY = Math.min(20, componentFrame.height * 0.12);
      const cellX = componentFrame.x + insetX;
      const cellY = componentFrame.y + insetY;
      const usableCellWidth = Math.max(40, componentFrame.width - insetX * 2);
      const usableCellHeight = Math.max(40, componentFrame.height - insetY * 2);

      const levels = assignLevels(componentNodeIds, adjacency, nodeMeta);
      const grouped = new Map<number, string[]>();
      for (const nodeId of componentNodeIds) {
        const level = levels.get(nodeId) ?? 0;
        if (!grouped.has(level)) {
          grouped.set(level, []);
        }
        grouped.get(level)?.push(nodeId);
      }

      const sortedLevels = Array.from(grouped.keys()).sort((left, right) => left - right);
      const levelCount = Math.max(sortedLevels.length, 1);
      const levelStep = usableCellHeight / (levelCount + 1);

      sortedLevels.forEach((level, levelIndex) => {
        const nodesInLevel = sortByNodePriority(grouped.get(level) ?? [], nodeMeta);
        const nodeStep = usableCellWidth / (nodesInLevel.length + 1);
        nodesInLevel.forEach((nodeId, nodeIndex) => {
          positions.set(nodeId, {
            x: cellX + nodeStep * (nodeIndex + 1),
            y: cellY + levelStep * (levelIndex + 1)
          });
        });
      });
    }
  }

  let isolatedLaneBounds: TreeLayoutLaneBounds | null = null;
  if (isolatedNodeIds.size > 0 && laneHeight > 0) {
    const laneY = outerPadding + (components.length > 0 ? hierarchyHeight + laneGap : 0);
    isolatedLaneBounds = {
      x     : outerPadding,
      y     : laneY,
      width : contentWidth,
      height: laneHeight
    };

    const sortedIsolatedNodeIds = sortByNodePriority(Array.from(isolatedNodeIds), nodeMeta);
    const laneColumns = Math.max(
      1,
      Math.min(
        sortedIsolatedNodeIds.length,
        Math.max(1, Math.floor(contentWidth / NODE_CELL_MIN_WIDTH))
      )
    );
    const laneRows = Math.ceil(sortedIsolatedNodeIds.length / laneColumns);
    const laneCellWidth = contentWidth / laneColumns;
    const laneCellHeight = laneHeight / laneRows;

    sortedIsolatedNodeIds.forEach((nodeId, index) => {
      const column = index % laneColumns;
      const row = Math.floor(index / laneColumns);
      positions.set(nodeId, {
        x: outerPadding + laneCellWidth * (column + 0.5),
        y: laneY + laneCellHeight * (row + 0.5)
      });
    });
  }

  for (const node of input.nodes) {
    if (positions.has(node.id)) {
      continue;
    }

    positions.set(node.id, {
      x: input.width / 2,
      y: input.height / 2
    });
  }

  return {
    positions,
    isolatedNodeIds,
    isolatedLaneBounds
  };
}

/**
 * 仅供单元测试使用：暴露纯布局帮助函数，便于覆盖边界分支。
 * 业务代码禁止依赖该对象。
 */
export const treeLayoutTesting = {
  clamp,
  compareNodeMeta,
  buildAdjacency,
  collectConnectedComponents,
  sortByNodePriority,
  pickStableRoot,
  assignLevels,
  resolveHierarchyAndLaneHeights,
  pickLightestRowIndex,
  buildRowHeights,
  buildWeightedRows,
  buildComponentFrames
};
