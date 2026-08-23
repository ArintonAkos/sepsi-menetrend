"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Adds touch pull-down gesture to dismiss a mobile bottom sheet.
 *
 * Tracking starts only when pulling down while at the top (scrollTop <= 0),
 * so inner content can scroll normally when tall.
 */
export function usePullToDismiss(onDismiss: () => void) {
  const [offsetY, setOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const currentOffsetY = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      currentOffsetY.current = 0;
      setDragging(true);
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const target = e.currentTarget;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && target.scrollTop <= 0) {
      if (e.cancelable) e.preventDefault();
      currentOffsetY.current = dy;
      setOffsetY(dy);
    } else if (dy < 0 && offsetY > 0) {
      currentOffsetY.current = 0;
      setOffsetY(0);
    }
  }, [offsetY]);

  const onTouchEnd = useCallback(() => {
    if (startY.current === null) return;
    const dy = currentOffsetY.current;
    startY.current = null;
    setDragging(false);
    if (dy > 60) {
      onDismiss();
    }
    setOffsetY(0);
  }, [onDismiss]);

  return {
    style: offsetY > 0
      ? {
          transform: `translateY(${offsetY}px)`,
          transition: dragging ? "none" : "transform .2s cubic-bezier(.2, .8, .3, 1)",
        }
      : undefined,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
    },
  };
}
