import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InstallApp from "./InstallApp";
import { STRINGS } from "@/lib/i18n";

afterEach(() => localStorage.clear());

describe("InstallApp", () => {
  it("calls the browser install prompt only after the user presses Install", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    render(<InstallApp t={STRINGS.en} />);
    const event = new Event("beforeinstallprompt");
    Object.assign(event, { prompt });
    fireEvent(window, event);
    await userEvent.click(screen.getByRole("button", { name: "Install app" }));
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("explains the iOS route when there is no native install prompt", () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "iPhone Safari" });
    render(<InstallApp t={STRINGS.en} />);
    expect(screen.getByText(/Share.*Add to Home Screen/i)).toBeInTheDocument();
  });

  it("does not render again after the user dismissed installation", () => {
    localStorage.setItem("sepsi.install.dismissed", "1");
    render(<InstallApp t={STRINGS.en} />);
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });
});
