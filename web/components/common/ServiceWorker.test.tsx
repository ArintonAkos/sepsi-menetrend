import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import ServiceWorker from "./ServiceWorker";

afterEach(() => {
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
});

describe("ServiceWorker", () => {
  it("removes a stale worker while running the development server", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });

    render(<ServiceWorker />);

    await waitFor(() => expect(unregister).toHaveBeenCalledOnce());
  });
});
