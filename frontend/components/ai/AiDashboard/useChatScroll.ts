import { useState, useRef, useCallback, useEffect } from 'react';

interface UseChatScrollOptions {
  /** Threshold in pixels from bottom to consider "at bottom" */
  threshold?: number;
  /** Dependencies that trigger scroll check (e.g., messages.length) */
  deps?: unknown[];
}

interface UseChatScrollReturn {
  /** Ref to attach to scrollable container */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to attach to end-of-messages anchor */
  endRef: React.RefObject<HTMLDivElement | null>;
  /** Whether user is currently at bottom */
  isAtBottom: boolean;
  /** Scroll to bottom (smooth) */
  scrollToBottom: () => void;
  /** Handler to attach to container's onScroll */
  handleScroll: () => void;
}

export function useChatScroll(options: UseChatScrollOptions = {}): UseChatScrollReturn {
  const { threshold = 100, deps = [] } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsAtBottom(distanceFromBottom < threshold);
  }, [threshold]);

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
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    handleScroll,
  };
}
