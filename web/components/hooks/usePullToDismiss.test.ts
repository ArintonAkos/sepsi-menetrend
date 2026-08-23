import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePullToDismiss } from "./usePullToDismiss";

describe("usePullToDismiss", () => {
  it("starts without any transform style", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => usePullToDismiss(onDismiss));
    expect(result.current.style).toBeUndefined();
  });

  it("translates down when dragging down at top of sheet", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => usePullToDismiss(onDismiss));

    const mockTarget = { scrollTop: 0 } as HTMLElement;

    act(() => {
      result.current.handlers.onTouchStart({
        currentTarget: mockTarget,
        touches: [{ clientY: 100 }],
      } as any);
    });

    act(() => {
      result.current.handlers.onTouchMove({
        currentTarget: mockTarget,
        touches: [{ clientY: 150 }],
        cancelable: true,
        preventDefault: vi.fn(),
      } as any);
    });

    expect(result.current.style?.transform).toBe("translateY(50px)");
  });

  it("calls onDismiss when dragged down past threshold", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => usePullToDismiss(onDismiss));

    const mockTarget = { scrollTop: 0 } as HTMLElement;

    act(() => {
      result.current.handlers.onTouchStart({
        currentTarget: mockTarget,
        touches: [{ clientY: 100 }],
      } as any);
    });

    act(() => {
      result.current.handlers.onTouchMove({
        currentTarget: mockTarget,
        touches: [{ clientY: 200 }],
        cancelable: true,
        preventDefault: vi.fn(),
      } as any);
    });

    act(() => {
      result.current.handlers.onTouchEnd();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(result.current.style).toBeUndefined();
  });

  it("does not call onDismiss when drag distance is small", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => usePullToDismiss(onDismiss));

    const mockTarget = { scrollTop: 0 } as HTMLElement;

    act(() => {
      result.current.handlers.onTouchStart({
        currentTarget: mockTarget,
        touches: [{ clientY: 100 }],
      } as any);
    });

    act(() => {
      result.current.handlers.onTouchMove({
        currentTarget: mockTarget,
        touches: [{ clientY: 130 }],
        cancelable: true,
        preventDefault: vi.fn(),
      } as any);
    });

    act(() => {
      result.current.handlers.onTouchEnd();
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(result.current.style).toBeUndefined();
  });
});
