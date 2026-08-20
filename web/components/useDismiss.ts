"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Close a popover when the next press lands outside it.
 *
 *  The press is caught as a `click`, in the capture phase, and then stopped
 *  there. Both halves matter:
 *
 *  - Capture, so nothing underneath ever sees it. A press that dismisses a
 *    panel must be spent on the dismissal; letting it through shut the settings
 *    sheet and pressed whatever was behind it in one gesture.
 *  - `click` rather than `pointerdown`, so a drag or a scroll that happens to
 *    start outside does not count, and so the swallowing needs no timer. An
 *    earlier version closed on pointerdown and then armed a 350ms trap for the
 *    click it expected next - which, if that click never came, was still lying
 *    there waiting to eat an unrelated one.
 *
 *  The press that opened the panel cannot close it: this effect is attached
 *  after that click has finished being dispatched.
 *
 *  Escape closes it too, because a panel you can only leave with the mouse is a
 *  trap for anyone using a keyboard.
 */
export function useDismiss(
  open: boolean,
  close: () => void,
  ...inside: Array<RefObject<HTMLElement | null>>
) {
  /* The refs go through a ref rather than the dependency array. Spreading a
     rest parameter into deps makes the array's length part of the call site,
     and React throws the moment a caller passes a different number - which it
     will, the next time a panel gains a second element to count as "inside". */
  const kept = useRef(inside);
  useEffect(() => { kept.current = inside; });   // after every commit, never during

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && kept.current.some((ref) => ref.current?.contains(target))) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("click", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);
}
