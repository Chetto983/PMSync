/**
 * useHoverPopover — Delay-managed popover trigger for hover cards
 *
 * Prevents flicker by:
 * 1. Capturing currentTarget in closure BEFORE setTimeout (avoids null event target)
 * 2. Canceling close timer when mouse enters the popover content
 * 3. Using pointer-events: none on MUI Popover + pointer-events: auto on inner Box
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface HoverPopoverResult {
  anchorEl: HTMLElement | null;
  open: boolean;
  triggerProps: {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
  };
  popoverProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}

export function useHoverPopover(openDelay = 300, closeDelay = 200): HoverPopoverResult {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      // Capture currentTarget in closure BEFORE setTimeout fires
      const target = event.currentTarget;

      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }

      openTimer.current = setTimeout(() => {
        setAnchorEl(target);
      }, openDelay);
    },
    [openDelay],
  );

  const handleMouseLeave = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }

    closeTimer.current = setTimeout(() => {
      setAnchorEl(null);
    }, closeDelay);
  }, [closeDelay]);

  // Popover content mouse handlers — cancel close when entering popover
  const handlePopoverMouseEnter = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => {
      setAnchorEl(null);
    }, closeDelay);
  }, [closeDelay]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return {
    anchorEl,
    open: !!anchorEl,
    triggerProps: {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    },
    popoverProps: {
      onMouseEnter: handlePopoverMouseEnter,
      onMouseLeave: handlePopoverMouseLeave,
    },
  };
}
