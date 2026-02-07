import { useState, useRef, useCallback, useEffect } from 'react';

interface UseChatScrollOptions {
  /** Dependencies that trigger scroll check (e.g., messages.length) */
  deps?: unknown[];
}

interface UseChatScrollReturn {
  /** Ref to attach to end-of-messages anchor */
  endRef: React.RefObject<HTMLDivElement | null>;
  /** Whether user is currently at bottom (endRef is visible) */
  isAtBottom: boolean;
  /** Scroll to bottom (smooth) */
  scrollToBottom: () => void;
}

/**
 * Smart scroll behavior for chat messages.
 *
 * Uses IntersectionObserver to detect if user has scrolled up (endRef not visible).
 * Only auto-scrolls when user is at bottom, preventing disruption while reading.
 * Works with any scrollable ancestor (doesn't need direct access to scroll container).
 */
export function useChatScroll(options: UseChatScrollOptions = {}): UseChatScrollReturn {
  const { deps = [] } = options;

  const endRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Use IntersectionObserver to detect if endRef is visible
  // This works with any scrollable ancestor, no need for containerRef
  useEffect(() => {
    const element = endRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting);
      },
      {
        // rootMargin allows detecting "near bottom" - 100px buffer
        rootMargin: '100px',
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Auto-scroll ONLY if user is at bottom
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    endRef,
    isAtBottom,
    scrollToBottom,
  };
}
