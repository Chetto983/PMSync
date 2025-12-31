'use no memo';
/**
 * Thread Virtualizer Hook
 *
 * Encapsulates TanStack Virtual logic for thread message virtualization.
 * Uses 'use no memo' directive at file level to opt-out of React Compiler
 * memoization - TanStack Virtual returns non-memoizable functions.
 *
 * @see https://tanstack.com/virtual/latest
 * @see https://github.com/TanStack/virtual/issues/736
 * @see https://react.dev/reference/eslint-plugin-react-hooks/lints/incompatible-library
 */

import { useCallback, RefObject } from 'react';
import { useVirtualizer, defaultRangeExtractor } from '@tanstack/react-virtual';

const COLLAPSED_HEIGHT = 72;
const EXPANDED_HEIGHT = 400;

interface UseThreadVirtualizerOptions {
  messages: { id: string }[];
  expandedIds: Set<string>;
  parentRef: RefObject<HTMLDivElement | null>;
}

/**
 * Custom hook for thread message virtualization
 * Uses TanStack Virtual for 60 FPS scrolling with 100+ messages
 *
 * Uses 'use no memo' directive to prevent React Compiler from incorrectly
 * caching virtualizer results, which would cause stale virtual items.
 *
 * @see https://github.com/TanStack/virtual/issues/736
 * @see https://react.dev/reference/eslint-plugin-react-hooks/lints/incompatible-library
 */
export function useThreadVirtualizer({
  messages,
  expandedIds,
  parentRef,
}: UseThreadVirtualizerOptions) {
  const estimateSize = useCallback(
    (index: number) => {
      const message = messages[index];
      return expandedIds.has(message.id) ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
    },
    [messages, expandedIds]
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5,
    rangeExtractor: useCallback(
      (range: Parameters<typeof defaultRangeExtractor>[0]) => {
        return defaultRangeExtractor(range);
      },
      []
    ),
  });

  // Spread to create new object reference - prevents stale memoization
  return { ...virtualizer };
}
