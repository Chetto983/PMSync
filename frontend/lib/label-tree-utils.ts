/**
 * Label Tree Utilities
 *
 * Pure functions for building, flattening, and projecting a nested label tree.
 * Follows the official dnd-kit tree example pattern.
 *
 * @see https://github.com/clauderic/dnd-kit/tree/master/stories/3%20-%20Examples/Tree
 */

import type { Label } from '@/lib/api/labels';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum allowed nesting depth (0-indexed: 0..4) */
export const MAX_DEPTH = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeItem {
  id: string;
  name: string;
  parentId: string | null;
  children: TreeItem[];
  collapsed: boolean;
  depth: number;
  level: number;
  orderIndex: number;
  color: Label['color'];
  type: 'SYSTEM' | 'USER';
  _count?: { emailLabels: number };
  /** Sum of own + all descendant emailLabels counts */
  aggregateCount: number;
}

export interface FlattenedItem extends TreeItem {
  index: number;
}

// ---------------------------------------------------------------------------
// buildTree
// ---------------------------------------------------------------------------

/**
 * Build a nested tree from a flat API response.
 * Children are sorted by orderIndex. Aggregate counts are computed recursively.
 */
export function buildTree(
  flatLabels: Label[],
  collapsedIds: Set<string>,
): TreeItem[] {
  const map = new Map<string, TreeItem>();
  const roots: TreeItem[] = [];

  // First pass: create TreeItem for each label
  for (const label of flatLabels) {
    map.set(label.id, {
      id: label.id,
      name: label.name,
      parentId: label.parentId,
      children: [],
      collapsed: !collapsedIds.has(label.id), // expanded = in set
      depth: label.level,
      level: label.level,
      orderIndex: label.orderIndex,
      color: label.color,
      type: label.type,
      _count: label._count,
      aggregateCount: label._count?.emailLabels ?? 0,
    });
  }

  // Second pass: wire parent-child relationships
  for (const label of flatLabels) {
    const node = map.get(label.id)!;
    if (label.parentId && map.has(label.parentId)) {
      map.get(label.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by orderIndex and compute aggregate counts
  const sortAndAggregate = (items: TreeItem[]): number => {
    items.sort((a, b) => a.orderIndex - b.orderIndex);
    for (const item of items) {
      const childTotal = sortAndAggregate(item.children);
      item.aggregateCount = (item._count?.emailLabels ?? 0) + childTotal;
    }
    return items.reduce((sum, i) => sum + i.aggregateCount, 0);
  };
  sortAndAggregate(roots);

  return roots;
}

// ---------------------------------------------------------------------------
// flattenTree
// ---------------------------------------------------------------------------

/**
 * Flatten a nested tree into display-order array.
 * Skips children of collapsed nodes.
 */
export function flattenTree(
  items: TreeItem[],
  parentId: string | null = null,
  depth: number = 0,
): FlattenedItem[] {
  return items.reduce<FlattenedItem[]>((acc, item, index) => {
    const flat: FlattenedItem = { ...item, parentId, depth, index };
    acc.push(flat);
    if (!item.collapsed && item.children.length > 0) {
      acc.push(...flattenTree(item.children, item.id, depth + 1));
    }
    return acc;
  }, []);
}

// ---------------------------------------------------------------------------
// getProjection
// ---------------------------------------------------------------------------

/**
 * Calculate projected drop position during drag.
 * Returns { depth, parentId } based on horizontal offset.
 */
export function getProjection(
  items: FlattenedItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentationWidth: number,
): { depth: number; parentId: string | null } {
  const overItemIndex = items.findIndex(({ id }) => id === overId);
  const activeItemIndex = items.findIndex(({ id }) => id === activeId);
  const activeItem = items[activeItemIndex];
  if (!activeItem) return { depth: 0, parentId: null };

  // Simulate move
  const newItems = [...items];
  const [removed] = newItems.splice(activeItemIndex, 1);
  newItems.splice(overItemIndex, 0, removed);

  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];

  const projectedDepth =
    activeItem.depth + Math.round(dragOffset / indentationWidth);

  const maxDepth = previousItem
    ? Math.min(previousItem.depth + 1, MAX_DEPTH - 1)
    : 0;
  const minDepth = nextItem ? nextItem.depth : 0;

  const depth = Math.min(Math.max(projectedDepth, minDepth), maxDepth);

  // Find parentId for the projected depth
  const getParentId = (): string | null => {
    if (depth === 0) return null;
    const closestParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth - 1);
    return closestParent?.id ?? null;
  };

  return { depth, parentId: getParentId() };
}

// ---------------------------------------------------------------------------
// getDescendantIds
// ---------------------------------------------------------------------------

/** Return all descendant IDs of a given parent recursively. */
export function getDescendantIds(
  items: TreeItem[],
  parentId: string,
): string[] {
  const result: string[] = [];

  const collect = (nodes: TreeItem[]) => {
    for (const node of nodes) {
      if (node.id === parentId) {
        collectChildren(node.children);
      } else {
        collect(node.children);
      }
    }
  };

  const collectChildren = (nodes: TreeItem[]) => {
    for (const node of nodes) {
      result.push(node.id);
      collectChildren(node.children);
    }
  };

  collect(items);
  return result;
}

// ---------------------------------------------------------------------------
// getDescendantIdsFlat
// ---------------------------------------------------------------------------

/** Return all descendant IDs from a flat labels array (walking parentId). */
export function getDescendantIdsFlat(
  flatLabels: Label[],
  parentId: string,
): string[] {
  const result: string[] = [];
  const queue = [parentId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const label of flatLabels) {
      if (label.parentId === currentId) {
        result.push(label.id);
        queue.push(label.id);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// getAncestorIds
// ---------------------------------------------------------------------------

/** Walk up parentId chain from a target label, returning ancestor IDs. */
export function getAncestorIds(
  flatLabels: Label[],
  targetId: string,
): string[] {
  const result: string[] = [];
  const map = new Map(flatLabels.map((l) => [l.id, l]));

  let current = map.get(targetId);
  while (current?.parentId) {
    result.push(current.parentId);
    current = map.get(current.parentId);
  }

  return result;
}
