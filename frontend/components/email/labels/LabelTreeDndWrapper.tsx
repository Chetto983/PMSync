/**
 * Label Tree DnD Wrapper
 *
 * Wraps the label tree in its OWN DndContext (separate from EmailLayout's
 * DndContext to avoid collision). Provides drag-to-nest and drag-to-reorder.
 *
 * Pattern follows the official dnd-kit flattened tree example:
 * - Horizontal drag offset drives depth projection
 * - getProjection() calculates target parentId + depth
 * - useMoveLabel mutation persists the result
 *
 * @see https://github.com/clauderic/dnd-kit/tree/master/stories/3%20-%20Examples/Tree
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  DragOverlay,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { List, Box, alpha } from '@mui/material';
import {
  getProjection,
  getDescendantIds,
  MAX_DEPTH,
  type FlattenedItem,
  type TreeItem,
} from '@/lib/label-tree-utils';
import { useMoveLabel } from '@/hooks/queries';
import { LabelTreeItem } from './LabelTreeItem';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDENT_WIDTH = 16;

const measuring = {
  droppable: { strategy: MeasuringStrategy.Always },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabelTreeDndWrapperProps {
  flatItems: FlattenedItem[];
  tree: TreeItem[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  isLabelSelected: (id: string) => boolean;
  onLabelClick: (label: FlattenedItem) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>, label: FlattenedItem) => void;
}

// ---------------------------------------------------------------------------
// SortableLabelItem — wrapper that calls useSortable
// ---------------------------------------------------------------------------

interface SortableLabelItemProps {
  item: FlattenedItem;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onMenuClick: (event: React.MouseEvent<HTMLElement>) => void;
  projectedDepth: number | null;
  isActiveItem: boolean;
}

function SortableLabelItem({
  item,
  isSelected,
  onToggle,
  onClick,
  onContextMenu,
  onMenuClick,
  projectedDepth,
  isActiveItem,
}: SortableLabelItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { type: 'sortable-label', labelId: item.id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <LabelTreeItem
      ref={setNodeRef}
      label={item}
      depth={isActiveItem && projectedDepth !== null ? projectedDepth : item.depth}
      isCollapsed={item.collapsed}
      isSelected={isSelected}
      hasChildren={item.children.length > 0}
      aggregateCount={item.aggregateCount}
      onToggle={onToggle}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMenuClick={onMenuClick}
      style={style}
      dragProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
    />
  );
}

// ---------------------------------------------------------------------------
// LabelTreeDndWrapper
// ---------------------------------------------------------------------------

export function LabelTreeDndWrapper({
  flatItems,
  tree,
  expandedIds,
  onToggle,
  isLabelSelected,
  onLabelClick,
  onContextMenu,
}: LabelTreeDndWrapperProps) {
  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const moveLabel = useMoveLabel();

  // Track collapsed children when drag starts
  const collapsedOnDragRef = useRef<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortableIds = useMemo(
    () => flatItems.map((item) => item.id),
    [flatItems],
  );

  // Compute projection during drag
  const projected = useMemo(() => {
    if (!activeId || !overId) return null;
    return getProjection(flatItems, activeId, overId, offsetLeft, INDENT_WIDTH);
  }, [flatItems, activeId, overId, offsetLeft]);

  // Is projected depth exceeding max?
  const isOverMaxDepth = useMemo(() => {
    if (!projected || !activeId) return false;
    // Check if active item has descendants — we need space for them too
    const descendantIds = getDescendantIds(tree, activeId);
    const maxSubtreeDepth = descendantIds.length > 0
      ? Math.max(...flatItems
          .filter((fi) => descendantIds.includes(fi.id))
          .map((fi) => fi.depth - (flatItems.find((f) => f.id === activeId)?.depth ?? 0)))
      : 0;
    return projected.depth + maxSubtreeDepth >= MAX_DEPTH;
  }, [projected, activeId, tree, flatItems]);

  // Find the active item for overlay
  const activeItem = useMemo(
    () => flatItems.find((item) => item.id === activeId) ?? null,
    [flatItems, activeId],
  );

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      setActiveId(id);
      setOverId(id);

      // Collapse dragged item's children to simplify drag
      const descendantIds = getDescendantIds(tree, id);
      const expanded = descendantIds.filter((dId) => expandedIds.has(dId));
      collapsedOnDragRef.current = expanded;
      // Collapse active item itself if expanded
      if (expandedIds.has(id)) {
        onToggle(id);
      }
    },
    [tree, expandedIds, onToggle],
  );

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    setOffsetLeft(event.delta.x);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over?.id ? String(event.over.id) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && projected && !isOverMaxDepth) {
        // Compute orderIndex: position among future siblings
        const overIndex = flatItems.findIndex((fi) => fi.id === String(over.id));
        // Count siblings under projected parent that come before the drop target
        const siblings = flatItems.filter(
          (fi) =>
            fi.parentId === projected.parentId && fi.id !== String(active.id),
        );
        const siblingIndex = siblings.findIndex(
          (s) => flatItems.indexOf(s) >= overIndex,
        );
        const orderIndex = siblingIndex === -1 ? siblings.length : siblingIndex;

        moveLabel.mutate({
          labelId: String(active.id),
          parentId: projected.parentId,
          orderIndex,
        });
      }

      resetState();
    },
    [flatItems, projected, isOverMaxDepth, moveLabel],
  );

  const handleDragCancel = useCallback(() => {
    resetState();
  }, []);

  const resetState = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    collapsedOnDragRef.current = [];
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={measuring}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <List disablePadding>
          {flatItems.map((item) => (
            <SortableLabelItem
              key={item.id}
              item={item}
              isSelected={isLabelSelected(item.id)}
              onToggle={() => onToggle(item.id)}
              onClick={() => onLabelClick(item)}
              onContextMenu={(e) => onContextMenu(e, item)}
              onMenuClick={(e) => onContextMenu(e, item)}
              projectedDepth={projected?.depth ?? null}
              isActiveItem={activeId === item.id}
            />
          ))}
        </List>
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
        {activeItem ? (
          <Box
            sx={{
              opacity: 0.85,
              borderRadius: 1,
              bgcolor: (theme) =>
                isOverMaxDepth
                  ? alpha(theme.palette.error.main, 0.12)
                  : alpha(theme.palette.background.paper, 0.95),
              boxShadow: isOverMaxDepth
                ? '0 4px 12px rgba(211,47,47,0.3)'
                : '0 4px 12px rgba(0,0,0,0.15)',
              border: isOverMaxDepth ? '2px solid' : undefined,
              borderColor: isOverMaxDepth ? 'error.main' : undefined,
            }}
          >
            <LabelTreeItem
              label={activeItem}
              depth={projected?.depth ?? activeItem.depth}
              isCollapsed
              isSelected={false}
              hasChildren={activeItem.children.length > 0}
              aggregateCount={activeItem.aggregateCount}
              onToggle={() => {}}
              onClick={() => {}}
              onContextMenu={() => {}}
              onMenuClick={() => {}}
            />
          </Box>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default LabelTreeDndWrapper;
