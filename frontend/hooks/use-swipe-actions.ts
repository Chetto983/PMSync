/**
 * useSwipeActions Hook
 *
 * Provides swipe gesture support for mobile email actions.
 * Implements 2025 best practices for touch interactions.
 *
 * Features:
 * - Swipe left to archive/delete
 * - Swipe right to mark as read/star
 * - Visual feedback during swipe
 * - Haptic feedback (if available)
 * - Threshold-based action triggering
 * - Velocity detection for quick swipes
 */
import { useState, useCallback, useRef } from 'react';

interface SwipeConfig {
  /** Minimum distance to trigger action (px) */
  threshold?: number;
  /** Maximum allowed vertical movement (px) */
  maxVertical?: number;
  /** Velocity threshold for quick swipes (px/ms) */
  velocityThreshold?: number;
  /** Enable left swipe */
  enableLeft?: boolean;
  /** Enable right swipe */
  enableRight?: boolean;
  /** Callback for left swipe action */
  onSwipeLeft?: () => void;
  /** Callback for right swipe action */
  onSwipeRight?: () => void;
  /** Enable haptic feedback */
  hapticFeedback?: boolean;
}

interface SwipeState {
  /** Current horizontal offset */
  offsetX: number;
  /** Whether the element is being swiped */
  isSwiping: boolean;
  /** Direction of swipe: 'left' | 'right' | null */
  direction: 'left' | 'right' | null;
  /** Progress of swipe (0-1) */
  progress: number;
  /** Whether threshold is reached */
  thresholdReached: boolean;
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

interface UseSwipeActionsReturn {
  state: SwipeState;
  handlers: SwipeHandlers;
  reset: () => void;
  style: React.CSSProperties;
}

const DEFAULT_CONFIG: Required<Omit<SwipeConfig, 'onSwipeLeft' | 'onSwipeRight'>> = {
  threshold: 80,
  maxVertical: 30,
  velocityThreshold: 0.5,
  enableLeft: true,
  enableRight: true,
  hapticFeedback: true,
};

/**
 * Trigger haptic feedback if available
 */
function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'medium') {
  if ('vibrate' in navigator) {
    const patterns = { light: 10, medium: 20, heavy: 40 };
    navigator.vibrate(patterns[type]);
  }
}

export function useSwipeActions(config: SwipeConfig = {}): UseSwipeActionsReturn {
  const {
    threshold = DEFAULT_CONFIG.threshold,
    maxVertical = DEFAULT_CONFIG.maxVertical,
    velocityThreshold = DEFAULT_CONFIG.velocityThreshold,
    enableLeft = DEFAULT_CONFIG.enableLeft,
    enableRight = DEFAULT_CONFIG.enableRight,
    hapticFeedback = DEFAULT_CONFIG.hapticFeedback,
    onSwipeLeft,
    onSwipeRight,
  } = config;

  const [state, setState] = useState<SwipeState>({
    offsetX: 0,
    isSwiping: false,
    direction: null,
    progress: 0,
    thresholdReached: false,
  });

  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const isValidSwipe = useRef(true);
  const hasTriggeredHaptic = useRef(false);
  const elementRef = useRef<HTMLElement | null>(null);

  const reset = useCallback(() => {
    setState({
      offsetX: 0,
      isSwiping: false,
      direction: null,
      progress: 0,
      thresholdReached: false,
    });
    hasTriggeredHaptic.current = false;
  }, []);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    startX.current = clientX;
    startY.current = clientY;
    startTime.current = Date.now();
    isValidSwipe.current = true;
    hasTriggeredHaptic.current = false;
    setState((prev) => ({ ...prev, isSwiping: true }));
  }, []);

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isValidSwipe.current) return;

      const deltaX = clientX - startX.current;
      const deltaY = clientY - startY.current;

      // Check if vertical movement exceeds threshold
      if (Math.abs(deltaY) > maxVertical && Math.abs(deltaX) < Math.abs(deltaY)) {
        isValidSwipe.current = false;
        reset();
        return;
      }

      // Determine direction and check if enabled
      const direction = deltaX > 0 ? 'right' : 'left';
      if ((direction === 'left' && !enableLeft) || (direction === 'right' && !enableRight)) {
        return;
      }

      // Calculate progress and apply resistance at edges
      const absOffset = Math.abs(deltaX);
      const resistance = absOffset > threshold ? 0.3 : 1;
      const resistedOffset = absOffset > threshold ? threshold + (absOffset - threshold) * resistance : absOffset;
      const finalOffset = direction === 'left' ? -resistedOffset : resistedOffset;

      const progress = Math.min(absOffset / threshold, 1);
      const thresholdReached = absOffset >= threshold;

      // Trigger haptic feedback when threshold is reached
      if (hapticFeedback && thresholdReached && !hasTriggeredHaptic.current) {
        triggerHaptic('medium');
        hasTriggeredHaptic.current = true;
      }

      setState({
        offsetX: finalOffset,
        isSwiping: true,
        direction,
        progress,
        thresholdReached,
      });
    },
    [threshold, maxVertical, enableLeft, enableRight, hapticFeedback, reset],
  );

  const handleEnd = useCallback(
    (clientX: number) => {
      if (!isValidSwipe.current) {
        reset();
        return;
      }

      const deltaX = clientX - startX.current;
      const duration = Date.now() - startTime.current;
      const velocity = Math.abs(deltaX) / duration;

      const absOffset = Math.abs(deltaX);
      const direction = deltaX > 0 ? 'right' : 'left';

      // Check if action should be triggered
      const shouldTrigger = absOffset >= threshold || velocity >= velocityThreshold;

      if (shouldTrigger) {
        if (hapticFeedback) {
          triggerHaptic('heavy');
        }

        if (direction === 'left' && onSwipeLeft) {
          onSwipeLeft();
        } else if (direction === 'right' && onSwipeRight) {
          onSwipeRight();
        }
      }

      // Reset with animation
      setState((prev) => ({ ...prev, isSwiping: false }));
      setTimeout(reset, 150);
    },
    [threshold, velocityThreshold, hapticFeedback, onSwipeLeft, onSwipeRight, reset],
  );

  // Touch handlers
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    },
    [handleStart],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    [handleMove],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.changedTouches[0];
      handleEnd(touch.clientX);
    },
    [handleEnd],
  );

  // Mouse handlers (for testing on desktop)
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only enable mouse swipe in development
      if (process.env.NODE_ENV !== 'development') return;
      handleStart(e.clientX, e.clientY);
      elementRef.current = e.currentTarget as HTMLElement;

      const onMouseMove = (moveEvent: MouseEvent) => {
        handleMove(moveEvent.clientX, moveEvent.clientY);
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        handleEnd(upEvent.clientX);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [handleStart, handleMove, handleEnd],
  );

  // Style for the swiped element
  const style: React.CSSProperties = {
    transform: state.offsetX !== 0 ? `translateX(${state.offsetX}px)` : undefined,
    transition: state.isSwiping ? 'none' : 'transform 0.15s ease-out',
    willChange: state.isSwiping ? 'transform' : undefined,
  };

  return {
    state,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onMouseDown,
    },
    reset,
    style,
  };
}

export default useSwipeActions;
