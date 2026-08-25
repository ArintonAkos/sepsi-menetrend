import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InstallApp from "./InstallApp";
import { STRINGS } from "@/lib/i18n";

describe("InstallApp", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the browser install offer when it arrives before settings is opened", () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt");
    Object.defineProperty(event, "prompt", { value: prompt });
    fireEvent(window, event);

    render(<InstallApp t={STRINGS.hu} />);

    expect(screen.getByRole("button", { name: "Alkalmazás telepítése" })).toBeInTheDocument();
  });
});
