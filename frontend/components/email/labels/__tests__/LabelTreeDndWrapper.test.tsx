/**
 * Regression test for BUG-004: resetState hoisting bug
 *
 * The original code had `const resetState = () => {...}` declared AFTER
 * it was used in handleDragEnd and handleDragCancel. Since `const` is
 * not hoisted, this caused a ReferenceError at runtime.
 *
 * Fix: Moved resetState declaration above its first usage and wrapped
 * in useCallback.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock all heavy dependencies to isolate the component
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  closestCenter: jest.fn(),
  KeyboardSensor: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: jest.fn(() => ({})),
  useSensors: jest.fn(() => []),
  MeasuringStrategy: { Always: 'always' },
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: jest.fn(),
  useSortable: jest.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: jest.fn(() => '') } },
}));

jest.mock('@/hooks/queries', () => ({
  useMoveLabel: jest.fn(() => ({ mutate: jest.fn() })),
}));

jest.mock('../LabelTreeItem', () => ({
  LabelTreeItem: React.forwardRef(function MockLabelTreeItem(
    props: { label: { name: string } },
    ref: React.Ref<HTMLDivElement>,
  ) {
    return <div ref={ref} data-testid={`label-${props.label.name}`}>{props.label.name}</div>;
  }),
}));

jest.mock('@/lib/label-tree-utils', () => ({
  getProjection: jest.fn(),
  getDescendantIds: jest.fn(() => []),
  MAX_DEPTH: 3,
}));

import { LabelTreeDndWrapper } from '../LabelTreeDndWrapper';
import type { FlattenedItem, TreeItem } from '@/lib/label-tree-utils';

const mockFlatItems = [
  {
    id: 'label-1',
    name: 'Work',
    color: { backgroundColor: '#ff0000', textColor: '#ffffff' },
    parentId: null,
    depth: 0,
    level: 0,
    index: 0,
    collapsed: false,
    children: [],
    aggregateCount: 5,
    orderIndex: 0,
    type: 'USER' as const,
  },
  {
    id: 'label-2',
    name: 'Personal',
    color: { backgroundColor: '#00ff00', textColor: '#ffffff' },
    parentId: null,
    depth: 0,
    level: 0,
    index: 1,
    collapsed: false,
    children: [],
    aggregateCount: 3,
    orderIndex: 1,
    type: 'USER' as const,
  },
] as FlattenedItem[];

const mockTree: TreeItem[] = [];

describe('LabelTreeDndWrapper', () => {
  it('renders without ReferenceError (BUG-004 regression)', () => {
    // If resetState is still declared after usage, this render will throw
    // ReferenceError: Cannot access 'resetState' before initialization
    expect(() => {
      render(
        <LabelTreeDndWrapper
          flatItems={mockFlatItems}
          tree={mockTree}
          expandedIds={new Set()}
          onToggle={jest.fn()}
          isLabelSelected={jest.fn(() => false)}
          onLabelClick={jest.fn()}
          onContextMenu={jest.fn()}
        />,
      );
    }).not.toThrow();
  });

  it('renders label items from flatItems', () => {
    render(
      <LabelTreeDndWrapper
        flatItems={mockFlatItems}
        tree={mockTree}
        expandedIds={new Set()}
        onToggle={jest.fn()}
        isLabelSelected={jest.fn(() => false)}
        onLabelClick={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );

    expect(screen.getByTestId('label-Work')).toBeDefined();
    expect(screen.getByTestId('label-Personal')).toBeDefined();
  });
});
