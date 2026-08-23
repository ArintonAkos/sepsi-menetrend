"use client";

import { useCallback, useRef, useState } from "react";

/** A bottom sheet you can pull up and down, with three resting heights.
 *
 *  Reading an itinerary is two jobs at once - following the map and following
 *  the steps - and which one matters changes as you go. A fixed split has to
 *  guess; a drawer lets the reader decide, which is why every map app that
 *  shows a route has one.
 *
 *  Heights are fractions of the viewport: a peek that leaves the map dominant,
 *  a half, and nearly full for reading the whole thing.
 */
export const SNAPS = [0.42, 0.72, 0.94] as const;

export function useDrawer(initial = 1, onDismiss?: () => void) {
  const [snap, setSnap] = useState(initial);
  const [live, setLive] = useState<number | null>(null);   // while dragging
  const start = useRef<{ y: number; height: number } | null>(null);

  const viewport = () => (typeof window === "undefined" ? 800 : window.innerHeight);
  const height = live ?? SNAPS[snap] * viewport();

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { y: event.clientY, height: SNAPS[snap] * viewport() };
  }, [snap]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!start.current) return;
    const moved = start.current.y - event.clientY;      // up is taller
    const lowest = SNAPS[0] * viewport(), highest = SNAPS[SNAPS.length - 1] * viewport();
    setLive(Math.max(onDismiss ? 0 : lowest - 60, Math.min(highest, start.current.height + moved)));
  }, [onDismiss]);

  const onPointerUp = useCallback(() => {
    if (!start.current) return;
    const settled = live ?? start.current.height;
    start.current = null;
    if (onDismiss && settled < (SNAPS[0] - 0.12) * viewport()) {
      setLive(null);
      onDismiss();
      return;
    }
    // snap to whichever resting height the drawer ended up nearest
    let nearest = 0, best = Infinity;
    SNAPS.forEach((fraction, i) => {
      const gap = Math.abs(fraction * viewport() - settled);
      if (gap < best) { best = gap; nearest = i; }
    });
    setSnap(nearest);
    setLive(null);
  }, [live, onDismiss]);

  return {
    height, dragging: live !== null, snap, setSnap,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
